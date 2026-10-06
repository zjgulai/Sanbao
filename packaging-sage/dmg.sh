#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
usage: bash packaging-sage/dmg.sh --app <staging/Sage.app> <--plan|--execute> [--replace]

--plan records the intended UDZO, verify, mount, copy, and seal-check flow.
--execute requires a valid app seal plus Sage.app.signing-receipt.json and creates the internal DMG.
EOF
}

app=''
mode=''
replace=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      [[ $# -ge 2 ]] || die '--app requires a path'
      app="$2"
      shift 2
      ;;
    --plan)
      [[ -z "$mode" ]] || die 'choose exactly one of --plan or --execute'
      mode='plan'
      shift
      ;;
    --execute)
      [[ -z "$mode" ]] || die 'choose exactly one of --plan or --execute'
      mode='execute'
      shift
      ;;
    --replace)
      replace=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown argument: $1"
      ;;
  esac
done

[[ -n "$app" ]] || die '--app is required'
[[ -n "$mode" ]] || die 'choose exactly one of --plan or --execute'
prepare_output_roots
[[ -d "$app" ]] || die "Sage.app is missing: $app"
app="$(canonical_existing_path "$app")"
assert_descendant_path "$app" "$STAGING_ROOT"
[[ "$(basename "$app")" == 'Sage.app' ]] || die 'DMG source must be named Sage.app'
node "$PACKAGING_SAGE_ROOT/scripts/verify-bundle.mjs" "$app"

FORMAT="$(config_value dmg.format)"
VOLUME_NAME="$(config_value dmg.volumeName)"
DMG_FILE="$(config_value dmg.fileName)"
[[ "$DMG_FILE" == "$(basename "$DMG_FILE")" && "$DMG_FILE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.dmg$ ]] \
  || die 'configured DMG filename must be a safe .dmg basename'
[[ "$VOLUME_NAME" != *$'\n'* && "$VOLUME_NAME" != *$'\r'* ]] || die 'configured DMG volume name must be a single line'
dmg="$RELEASE_ROOT/$DMG_FILE"
manifest="$dmg.manifest.json"
plan="$app.dmg-plan.txt"
signing_receipt="$app.signing-receipt.json"
installed_root="$STAGING_ROOT/installed-copy"
[[ ! -L "$plan" ]] || die "DMG plan output must not be a symlink: $plan"
assert_descendant_path "$plan" "$STAGING_ROOT"
assert_descendant_path "$signing_receipt" "$STAGING_ROOT"
assert_descendant_path "$dmg" "$RELEASE_ROOT"
assert_descendant_path "$manifest" "$RELEASE_ROOT"
assert_descendant_path "$installed_root" "$STAGING_ROOT"

temporary_plan="$(mktemp "$STAGING_ROOT/.dmg-plan.XXXXXX")"
cleanup_initial_plan() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -e "$temporary_plan" || -L "$temporary_plan" ]]; then
    remove_owned_path "$temporary_plan" "$STAGING_ROOT"
  fi
  exit "$status"
}
trap cleanup_initial_plan EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cat > "$temporary_plan" <<EOF
schemaVersion=1
product=Sage
source=${app#$REPO_ROOT/}
output=packaging-sage/release/$DMG_FILE
format=$FORMAT
volumeName=$VOLUME_NAME
steps=signing-receipt-verify,codesign-verify,ditto,Applications-symlink,hdiutil-create,hdiutil-verify,readonly-mount,exact-volume-inventory,ditto-installed-copy,bundle-verify,codesign-verify,signer-verify,relocatable-verify,tree-digest,exact-device-detach,receipt,transactional-replace
notarized=false
EOF
mv -f "$temporary_plan" "$plan"
trap - EXIT INT TERM

if [[ "$mode" == 'plan' ]]; then
  say "DMG plan written without signing or creating an image: ${plan#$REPO_ROOT/}"
  exit 0
fi

require_command codesign
require_command hdiutil
require_command ditto
require_command diskutil
require_command plutil
[[ -f "$signing_receipt" && ! -L "$signing_receipt" ]] \
  || die 'Sage.app.signing-receipt.json is required; run the explicit signing step first'
node "$PACKAGING_SAGE_ROOT/scripts/verify-signing-receipt.mjs" "$app" "$signing_receipt"
codesign --verify --deep --strict "$app" || die 'Sage.app seal is invalid; run the explicit signing step first'

if [[ -e "$dmg" || -L "$dmg" || -e "$manifest" || -L "$manifest" \
  || -e "$installed_root" || -L "$installed_root" ]]; then
  [[ "$replace" -eq 1 ]] \
    || die 'DMG or installed-copy output exists; pass --replace to transactionally replace the exact owned outputs'
fi

work="$(mktemp -d "$STAGING_ROOT/.dmg.XXXXXX")"
chmod 700 "$work"
payload="$work/payload"
mountpoint="$work/mount"
attach_plist="$work/hdiutil-attach.plist"
temporary_dmg="$work/$DMG_FILE"
temporary_manifest="$work/$DMG_FILE.manifest.json"
source_manifest="$work/source-app.manifest.json"
volume_inventory="$work/volume-inventory.json"
candidate_installed_root="$work/installed-copy"
installed_copy="$candidate_installed_root/Sage.app"
installed_manifest="$candidate_installed_root/Sage.app.manifest.json"
installed_signing_receipt="$candidate_installed_root/Sage.app.signing-receipt.json"
installed_volume_inventory="$candidate_installed_root/volume-inventory.json"
previous_dmg="$work/previous-$DMG_FILE"
previous_manifest="$work/previous-$DMG_FILE.manifest.json"
previous_installed_root="$work/previous-installed-copy"
mounted=0
mounted_device=''
transaction_started=0
transaction_committed=0
previous_dmg_saved=0
previous_manifest_saved=0
previous_installed_saved=0
new_dmg_installed=0
new_manifest_installed=0
new_installed_root_installed=0
cleanup() {
  local status=$?
  local detach_target=''
  local retain_work=0
  local rollback_failed=0
  trap - EXIT INT TERM
  if [[ "$mounted" -eq 1 ]]; then
    detach_target="${mounted_device:-$mountpoint}"
    if hdiutil detach "$detach_target" >/dev/null; then
      mounted=0
    else
      printf '[sage-packaging] ERROR: failed to detach mounted DMG at %s; retained %s for diagnosis\n' \
        "$detach_target" "$work" >&2
      status=1
      retain_work=1
    fi
  fi
  if [[ "$transaction_started" -eq 1 && "$transaction_committed" -eq 0 ]]; then
    if [[ "$new_manifest_installed" -eq 1 && ( -e "$manifest" || -L "$manifest" ) ]]; then
      if ! remove_owned_path "$manifest" "$RELEASE_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$new_dmg_installed" -eq 1 && ( -e "$dmg" || -L "$dmg" ) ]]; then
      if ! remove_owned_path "$dmg" "$RELEASE_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$new_installed_root_installed" -eq 1 && ( -e "$installed_root" || -L "$installed_root" ) ]]; then
      if ! remove_owned_path "$installed_root" "$STAGING_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$previous_dmg_saved" -eq 1 && ( -e "$previous_dmg" || -L "$previous_dmg" ) ]]; then
      if [[ -e "$dmg" || -L "$dmg" ]] || ! mv "$previous_dmg" "$dmg"; then rollback_failed=1; fi
    fi
    if [[ "$previous_manifest_saved" -eq 1 && ( -e "$previous_manifest" || -L "$previous_manifest" ) ]]; then
      if [[ -e "$manifest" || -L "$manifest" ]] || ! mv "$previous_manifest" "$manifest"; then rollback_failed=1; fi
    fi
    if [[ "$previous_installed_saved" -eq 1 \
      && ( -e "$previous_installed_root" || -L "$previous_installed_root" ) ]]; then
      if [[ -e "$installed_root" || -L "$installed_root" ]] \
        || ! mv "$previous_installed_root" "$installed_root"; then rollback_failed=1; fi
    fi
    if [[ "$rollback_failed" -eq 1 ]]; then
      printf '[sage-packaging] ERROR: transactional rollback was incomplete; retained %s for recovery\n' \
        "$work" >&2
      status=1
      retain_work=1
    fi
  fi
  if [[ "$mounted" -eq 0 && "$retain_work" -eq 0 && -d "$work" ]]; then
    if ! remove_owned_path "$work" "$STAGING_ROOT"; then
      printf '[sage-packaging] ERROR: failed to remove private DMG staging directory: %s\n' "$work" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$payload" "$mountpoint" "$candidate_installed_root"
ditto "$app" "$payload/Sage.app"
ln -s /Applications "$payload/Applications"
hdiutil create -srcfolder "$payload" -volname "$VOLUME_NAME" -format "$FORMAT" -ov "$temporary_dmg"
hdiutil verify "$temporary_dmg"
mounted=1
hdiutil attach "$temporary_dmg" -readonly -nobrowse -noautoopen -mountpoint "$mountpoint" -plist > "$attach_plist"
mounted_device="$(node "$PACKAGING_SAGE_ROOT/scripts/verify-dmg-volume.mjs" \
  "$mountpoint" "$attach_plist" "$volume_inventory")"
[[ "$mounted_device" =~ ^/dev/disk[0-9]+(s[0-9]+)?$ ]] \
  || die 'mounted DMG verifier did not return one exact device identifier'

ditto "$mountpoint/Sage.app" "$installed_copy"
node "$PACKAGING_SAGE_ROOT/scripts/verify-bundle.mjs" "$installed_copy"
codesign --verify --deep --strict "$installed_copy"
ditto "$signing_receipt" "$installed_signing_receipt"
node "$PACKAGING_SAGE_ROOT/scripts/verify-signing-receipt.mjs" \
  "$installed_copy" "$installed_signing_receipt"
node "$PACKAGING_SAGE_ROOT/scripts/assert-relocatable.mjs" "$installed_copy" --forbid "$REPO_ROOT"
node "$PACKAGING_SAGE_ROOT/scripts/write-manifest.mjs" "$app" "$source_manifest" signed
node "$PACKAGING_SAGE_ROOT/scripts/write-manifest.mjs" "$installed_copy" "$installed_manifest" installed-copy
ditto "$volume_inventory" "$installed_volume_inventory"

hdiutil detach "$mounted_device"
mounted=0
node "$PACKAGING_SAGE_ROOT/scripts/write-dmg-receipt.mjs" \
  "$temporary_dmg" \
  "$source_manifest" \
  "$installed_manifest" \
  "$installed_signing_receipt" \
  "$installed_volume_inventory" \
  "$temporary_manifest"

transaction_started=1
if [[ -e "$dmg" || -L "$dmg" ]]; then previous_dmg_saved=1; mv "$dmg" "$previous_dmg"; fi
if [[ -e "$manifest" || -L "$manifest" ]]; then previous_manifest_saved=1; mv "$manifest" "$previous_manifest"; fi
if [[ -e "$installed_root" || -L "$installed_root" ]]; then
  previous_installed_saved=1
  mv "$installed_root" "$previous_installed_root"
fi
new_installed_root_installed=1
mv "$candidate_installed_root" "$installed_root"
new_dmg_installed=1
mv "$temporary_dmg" "$dmg"
new_manifest_installed=1
mv "$temporary_manifest" "$manifest"
transaction_committed=1
say "created and verified internal DMG: ${dmg#$REPO_ROOT/}"
say 'packaged empty-root launch/restart remains a separate DMG-06 acceptance gate'
