#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cli_arguments=("$@")

usage() {
  cat <<'EOF'
usage: bash packaging-sage/assemble.sh \
  --app-runtime <production-runtime-dir> \
  --profile-template <materialized-sage-root> \
  [--electron-app <Electron.app>] [--output <staging/Sage.app>] [--replace]

This command assembles an unsigned Sage.app. It never creates a certificate,
signs code, or creates a DMG.
EOF
}

app_runtime=''
profile_template=''
electron_app=''
output=''
replace=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-runtime)
      [[ $# -ge 2 ]] || die '--app-runtime requires a directory'
      app_runtime="$2"
      shift 2
      ;;
    --profile-template)
      [[ $# -ge 2 ]] || die '--profile-template requires a directory'
      profile_template="$2"
      shift 2
      ;;
    --electron-app)
      [[ $# -ge 2 ]] || die '--electron-app requires an app bundle'
      electron_app="$2"
      shift 2
      ;;
    --output)
      [[ $# -ge 2 ]] || die '--output requires a path'
      output="$2"
      shift 2
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

[[ -n "$app_runtime" ]] || die '--app-runtime is required; a development checkout is not an implicit release input'
[[ -n "$profile_template" ]] || die '--profile-template is required; the current user profile is not an implicit release input'

require_macos_packaging_tools
prepare_output_roots
require_packaging_input_lock assembler bash "$SCRIPT_DIR/assemble.sh" ${cli_arguments[@]+"${cli_arguments[@]}"}

PRODUCT_NAME="$(config_value productName)"
BUNDLE_ID="$(config_value bundleId)"
VERSION="$(config_value version)"
BUILD="$(config_value build)"
ARCH="$(config_value arch)"
ELECTRON_VERSION="$(config_value electronVersion)"
ICON_RELATIVE="$(config_value icon)"

electron_app="${electron_app:-$REPO_ROOT/apps/sage-shell/node_modules/electron/dist/Electron.app}"
output="${output:-$STAGING_ROOT/Sage.app}"

[[ "$(basename "$output")" == 'Sage.app' ]] || die 'assembled output must be named Sage.app'
assert_descendant_path "$output" "$STAGING_ROOT"
mkdir -p "$(dirname "$output")"

[[ -d "$app_runtime" ]] || die "app runtime is missing: $app_runtime"
[[ -d "$profile_template" ]] || die "profile template is missing: $profile_template"
[[ -d "$electron_app" ]] || die "Electron.app is missing: $electron_app"

app_runtime="$(canonical_existing_path "$app_runtime")"
profile_template="$(canonical_existing_path "$profile_template")"
electron_app="$(canonical_existing_path "$electron_app")"
icon="$REPO_ROOT/$ICON_RELATIVE"
[[ -f "$icon" ]] || die "Sage icon is missing: $ICON_RELATIVE"

node "$PACKAGING_SAGE_ROOT/scripts/validate-inputs.mjs" runtime "$app_runtime"
node "$PACKAGING_SAGE_ROOT/scripts/validate-inputs.mjs" profile "$profile_template"
node "$PACKAGING_SAGE_ROOT/scripts/validate-mach-o.mjs" "$app_runtime" app-runtime
node "$PACKAGING_SAGE_ROOT/scripts/validate-mach-o.mjs" "$profile_template" profile-template
node "$PACKAGING_SAGE_ROOT/scripts/validate-mach-o.mjs" "$electron_app" electron-app

electron_plist="$electron_app/Contents/Info.plist"
electron_binary="$electron_app/Contents/MacOS/Electron"
electron_framework="$electron_app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
[[ -f "$electron_plist" ]] || die 'Electron.app has no Contents/Info.plist'
observed_electron_version="$(plutil -extract CFBundleShortVersionString raw -o - "$electron_plist")"
[[ "$observed_electron_version" == "$ELECTRON_VERSION" ]] \
  || die "expected Electron $ELECTRON_VERSION, observed $observed_electron_version"
assert_arm64_macho "$electron_binary"
assert_arm64_macho "$electron_framework"

for helper in 'Electron Helper' 'Electron Helper (Renderer)' 'Electron Helper (GPU)' 'Electron Helper (Plugin)'; do
  helper_root="$electron_app/Contents/Frameworks/$helper.app"
  [[ -f "$helper_root/Contents/Info.plist" ]] || die "Electron helper plist is missing: $helper"
  assert_arm64_macho "$helper_root/Contents/MacOS/$helper"
done

[[ ! -L "$output" ]] || die "assembled output must not be a symlink: $output"
if [[ -e "$output" && "$replace" -ne 1 ]]; then
  die "output already exists; pass --replace for this exact owned path: $output"
fi
for sidecar in "$output.manifest.json" "$output.signing-plan.tsv" "$output.dmg-plan.txt" "$output.signing-receipt.json"; do
  [[ ! -L "$sidecar" ]] || die "output sidecar must not be a symlink: $sidecar"
  if [[ -e "$sidecar" && "$replace" -ne 1 ]]; then
    die "output sidecar already exists; pass --replace: $sidecar"
  fi
done

work="$(mktemp -d "$STAGING_ROOT/.assemble.XXXXXX")"
stage_app="$work/Sage.app"
candidate_manifest="$work/Sage.app.manifest.json"
previous_app="$work/previous-Sage.app"
previous_sidecars="$work/previous-sidecars"
transaction_started=0
transaction_committed=0
previous_app_saved=0
new_app_installed=0
new_manifest_installed=0
previous_sidecar_names=()
cleanup() {
  local status=$?
  local rollback_failed=0
  local retain_work=0
  trap - EXIT INT TERM
  if [[ "$transaction_started" -eq 1 && "$transaction_committed" -eq 0 ]]; then
    if [[ "$new_manifest_installed" -eq 1 && ( -e "$output.manifest.json" || -L "$output.manifest.json" ) ]]; then
      if ! remove_owned_path "$output.manifest.json" "$STAGING_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$new_app_installed" -eq 1 && ( -e "$output" || -L "$output" ) ]]; then
      if ! remove_owned_path "$output" "$STAGING_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$previous_app_saved" -eq 1 && ( -e "$previous_app" || -L "$previous_app" ) ]]; then
      if [[ -e "$output" || -L "$output" ]] || ! mv "$previous_app" "$output"; then rollback_failed=1; fi
    fi
    for sidecar_name in ${previous_sidecar_names[@]+"${previous_sidecar_names[@]}"}; do
      previous_sidecar="$previous_sidecars/$sidecar_name"
      destination="$(dirname "$output")/$sidecar_name"
      if [[ -e "$previous_sidecar" || -L "$previous_sidecar" ]]; then
        if [[ -e "$destination" || -L "$destination" ]] || ! mv "$previous_sidecar" "$destination"; then
          rollback_failed=1
        fi
      else
        rollback_failed=1
      fi
    done
    if [[ "$rollback_failed" -eq 1 ]]; then
      printf '[sage-packaging] ERROR: assembly rollback was incomplete; retained %s for recovery\n' "$work" >&2
      status=1
      retain_work=1
    fi
  fi
  if [[ "$retain_work" -eq 0 && -d "$work" ]]; then
    if ! remove_owned_path "$work" "$STAGING_ROOT"; then status=1; fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

say "copying Electron $ELECTRON_VERSION arm64 into an isolated Sage staging bundle"
ditto "$electron_app" "$stage_app"

mv "$stage_app/Contents/MacOS/Electron" "$stage_app/Contents/MacOS/Sage"

rename_helper() {
  local old_name="$1"
  local new_name="$2"
  local identifier="$3"
  local old_root="$stage_app/Contents/Frameworks/$old_name.app"
  local new_root="$stage_app/Contents/Frameworks/$new_name.app"
  [[ -d "$old_root" ]] || die "staged helper is missing: $old_name"
  mv "$old_root" "$new_root"
  mv "$new_root/Contents/MacOS/$old_name" "$new_root/Contents/MacOS/$new_name"
  local plist="$new_root/Contents/Info.plist"
  plist_set_string "$plist" CFBundleName "$new_name"
  plist_set_string "$plist" CFBundleDisplayName "$new_name"
  plist_set_string "$plist" CFBundleExecutable "$new_name"
  plist_set_string "$plist" CFBundleIdentifier "$identifier"
  plist_set_string "$plist" CFBundleShortVersionString "$VERSION"
  plist_set_string "$plist" CFBundleVersion "$BUILD"
}

rename_helper 'Electron Helper' 'Sage Helper' "$BUNDLE_ID.helper"
rename_helper 'Electron Helper (Renderer)' 'Sage Helper (Renderer)' "$BUNDLE_ID.helper.renderer"
rename_helper 'Electron Helper (GPU)' 'Sage Helper (GPU)' "$BUNDLE_ID.helper.gpu"
rename_helper 'Electron Helper (Plugin)' 'Sage Helper (Plugin)' "$BUNDLE_ID.helper.plugin"

outer_plist="$stage_app/Contents/Info.plist"
plist_set_string "$outer_plist" CFBundleName "$PRODUCT_NAME"
plist_set_string "$outer_plist" CFBundleDisplayName "$PRODUCT_NAME"
plist_set_string "$outer_plist" CFBundleExecutable "$PRODUCT_NAME"
plist_set_string "$outer_plist" CFBundleIdentifier "$BUNDLE_ID"
plist_set_string "$outer_plist" CFBundleIconFile 'Sage.icns'
plist_set_string "$outer_plist" CFBundleShortVersionString "$VERSION"
plist_set_string "$outer_plist" CFBundleVersion "$BUILD"
plist_set_string "$outer_plist" LSApplicationCategoryType 'public.app-category.productivity'

for key in \
  NSAppTransportSecurity \
  NSCameraUsageDescription \
  NSMicrophoneUsageDescription \
  NSAudioCaptureUsageDescription \
  NSBluetoothAlwaysUsageDescription \
  NSBluetoothPeripheralUsageDescription \
  ElectronAsarIntegrity; do
  plist_remove_if_present "$outer_plist" "$key"
done

resources="$stage_app/Contents/Resources"
rm -f -- "$resources/electron.icns" "$resources/default_app.asar"
ditto "$icon" "$resources/Sage.icns"
ditto "$app_runtime" "$resources/app"
ditto "$profile_template" "$resources/sage-profile-template"

# Validate the copied profile tree, not only the source argument. The verifier recomputes the
# runtime artifact attestation from the bytes now embedded in Sage.app.
node "$PACKAGING_SAGE_ROOT/scripts/validate-inputs.mjs" profile "$resources/sage-profile-template"
node "$PACKAGING_SAGE_ROOT/scripts/validate-mach-o.mjs" "$resources/sage-profile-template" embedded-profile-template

source_commit="$(git -C "$REPO_ROOT" rev-parse HEAD)"
node "$PACKAGING_SAGE_ROOT/scripts/write-build-metadata.mjs" \
  "$resources/sage-build.json" "$app_runtime" "$profile_template" "$electron_app" "$source_commit"

node "$PACKAGING_SAGE_ROOT/scripts/assert-relocatable.mjs" "$stage_app" \
  --forbid "$REPO_ROOT" \
  --forbid "$app_runtime" \
  --forbid "$profile_template" \
  --forbid "$electron_app"

node "$PACKAGING_SAGE_ROOT/scripts/verify-bundle.mjs" "$stage_app"
node "$PACKAGING_SAGE_ROOT/scripts/write-manifest.mjs" "$stage_app" "$candidate_manifest" assembled

mkdir -p "$previous_sidecars"
# These are same-filesystem renames. Ignore asynchronous termination only across the bounded swap
# so cleanup cannot run between a successful rename and its ownership bookkeeping.
trap '' INT TERM
transaction_started=1
if [[ -e "$output" ]]; then mv "$output" "$previous_app"; previous_app_saved=1; fi
for sidecar in "$output.manifest.json" "$output.signing-plan.tsv" "$output.dmg-plan.txt" "$output.signing-receipt.json"; do
  if [[ -e "$sidecar" ]]; then
    sidecar_name="$(basename "$sidecar")"
    mv "$sidecar" "$previous_sidecars/$sidecar_name"
    previous_sidecar_names+=("$sidecar_name")
  fi
done
mv "$stage_app" "$output"
new_app_installed=1
mv "$candidate_manifest" "$output.manifest.json"
new_manifest_installed=1
transaction_committed=1
trap 'exit 130' INT
trap 'exit 143' TERM

say "assembled unsigned $PRODUCT_NAME $VERSION ($BUILD) $ARCH at ${output#$REPO_ROOT/}"
say "next step is an explicit signing plan: bash packaging-sage/sign.sh --app ${output#$REPO_ROOT/} --plan"
