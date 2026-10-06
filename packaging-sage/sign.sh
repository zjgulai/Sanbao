#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
usage: bash packaging-sage/sign.sh --app <staging/Sage.app> <--plan|--execute> \
  [--identity-sha256 <64-hex-certificate-fingerprint>] [--keychain <path>]

--plan writes the deterministic leaf-to-root signing list and does not invoke codesign.
--execute requires the exact Sage local identity plus its certificate SHA-256 and modifies the staged app.
--execute for local-self-signed signing requires one explicit regular non-symlink keychain.
--keychain restricts signer identity lookup to that keychain and is valid only with --execute.
EOF
}

app=''
mode=''
identity_sha256=''
keychain=''
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
    --identity-sha256)
      [[ $# -ge 2 ]] || die '--identity-sha256 requires a certificate fingerprint'
      identity_sha256="$2"
      shift 2
      ;;
    --keychain)
      [[ $# -ge 2 ]] || die '--keychain requires a path'
      keychain="$2"
      shift 2
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
if [[ "$mode" == 'execute' ]]; then
  [[ "$identity_sha256" =~ ^[A-Fa-f0-9]{64}$ ]] || die '--identity-sha256 must be exactly 64 hexadecimal characters'
  [[ -n "$keychain" ]] || die '--keychain is required with --execute for local-self-signed signing'
  [[ -f "$keychain" && ! -L "$keychain" ]] || die 'explicit signing keychain must be a regular non-symlink file'
fi
prepare_output_roots
[[ -d "$app" ]] || die "Sage.app is missing: $app"
app="$(canonical_existing_path "$app")"
assert_descendant_path "$app" "$STAGING_ROOT"
[[ "$(basename "$app")" == 'Sage.app' ]] || die 'signing target must be named Sage.app'

node "$PACKAGING_SAGE_ROOT/scripts/verify-bundle.mjs" "$app"
node "$PACKAGING_SAGE_ROOT/scripts/validate-mach-o.mjs" "$app" signing-target
plan="$app.signing-plan.tsv"
assert_descendant_path "$plan" "$STAGING_ROOT"
for sidecar in "$app.manifest.json" "$app.signing-receipt.json" "$plan"; do
  [[ ! -L "$sidecar" ]] || die "signing sidecar must not be a symlink: $sidecar"
done

IDENTITY="$(config_value signing.identityCommonName)"
if [[ "$mode" == 'plan' ]]; then
  [[ -z "$keychain" ]] || die '--keychain is valid only with --execute'
  [[ ! -L "$plan" ]] || die 'signing plan output must not be a symlink'
  temporary_plan="$(mktemp "$STAGING_ROOT/.signing-plan.XXXXXX")"
  cleanup_plan() {
    local status=$?
    trap - EXIT INT TERM
    if [[ -e "$temporary_plan" || -L "$temporary_plan" ]]; then
      remove_owned_path "$temporary_plan" "$STAGING_ROOT"
    fi
    exit "$status"
  }
  trap cleanup_plan EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  node "$PACKAGING_SAGE_ROOT/scripts/signing-plan.mjs" "$app" > "$temporary_plan"
  node "$PACKAGING_SAGE_ROOT/scripts/validate-signing-plan.mjs" "$app" "$temporary_plan"
  mv -f "$temporary_plan" "$plan"
  say "signing plan written without modifying the app: ${plan#$REPO_ROOT/}"
  say "required identity: $IDENTITY"
  say 'execution also requires the selected certificate SHA-256 fingerprint'
  exit 0
fi

require_command codesign
require_command security
require_command ditto
require_command cmp
keychain="$(canonical_existing_path "$keychain")"
identity_sha1="$(node "$PACKAGING_SAGE_ROOT/scripts/resolve-signing-identity.mjs" "$IDENTITY" "$identity_sha256" "$keychain")"
codesign_keychain_args=(--keychain "$keychain")

work="$(mktemp -d "$STAGING_ROOT/.sign.XXXXXX")"
chmod 700 "$work"
candidate_app="$work/Sage.app"
candidate_receipt="$work/Sage.app.signing-receipt.json"
candidate_manifest="$work/Sage.app.manifest.json"
candidate_plan="$work/Sage.app.signing-plan.tsv"
post_sign_plan="$work/Sage.app.post-signing-plan.tsv"
previous_app="$work/previous-Sage.app"
previous_manifest="$work/previous-manifest.json"
previous_receipt="$work/previous-receipt.json"
previous_plan="$work/previous-signing-plan.tsv"
signer_work="$work/signer"
transaction_started=0
transaction_committed=0
previous_app_saved=0
previous_manifest_saved=0
previous_receipt_saved=0
previous_plan_saved=0
new_app_installed=0
new_manifest_installed=0
new_receipt_installed=0
new_plan_installed=0
cleanup() {
  local status=$?
  local rollback_failed=0
  local retain_work=0
  trap - EXIT INT TERM
  if [[ "$transaction_started" -eq 1 && "$transaction_committed" -eq 0 ]]; then
    if [[ "$new_plan_installed" -eq 1 && ( -e "$plan" || -L "$plan" ) ]]; then
      if ! remove_owned_path "$plan" "$STAGING_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$new_receipt_installed" -eq 1 && ( -e "$app.signing-receipt.json" || -L "$app.signing-receipt.json" ) ]]; then
      if ! remove_owned_path "$app.signing-receipt.json" "$STAGING_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$new_manifest_installed" -eq 1 && ( -e "$app.manifest.json" || -L "$app.manifest.json" ) ]]; then
      if ! remove_owned_path "$app.manifest.json" "$STAGING_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$new_app_installed" -eq 1 && ( -e "$app" || -L "$app" ) ]]; then
      if ! remove_owned_path "$app" "$STAGING_ROOT"; then rollback_failed=1; fi
    fi
    if [[ "$previous_app_saved" -eq 1 && ( -e "$previous_app" || -L "$previous_app" ) ]]; then
      if [[ -e "$app" || -L "$app" ]] || ! mv "$previous_app" "$app"; then rollback_failed=1; fi
    fi
    if [[ "$previous_manifest_saved" -eq 1 && ( -e "$previous_manifest" || -L "$previous_manifest" ) ]]; then
      if [[ -e "$app.manifest.json" || -L "$app.manifest.json" ]] \
        || ! mv "$previous_manifest" "$app.manifest.json"; then rollback_failed=1; fi
    fi
    if [[ "$previous_receipt_saved" -eq 1 && ( -e "$previous_receipt" || -L "$previous_receipt" ) ]]; then
      if [[ -e "$app.signing-receipt.json" || -L "$app.signing-receipt.json" ]] \
        || ! mv "$previous_receipt" "$app.signing-receipt.json"; then rollback_failed=1; fi
    fi
    if [[ "$previous_plan_saved" -eq 1 && ( -e "$previous_plan" || -L "$previous_plan" ) ]]; then
      if [[ -e "$plan" || -L "$plan" ]] || ! mv "$previous_plan" "$plan"; then rollback_failed=1; fi
    fi
    if [[ "$rollback_failed" -eq 1 ]]; then
      printf '[sage-packaging] ERROR: signing rollback was incomplete; retained %s for recovery\n' "$work" >&2
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

ditto "$app" "$candidate_app"
node "$PACKAGING_SAGE_ROOT/scripts/verify-bundle.mjs" "$candidate_app"
node "$PACKAGING_SAGE_ROOT/scripts/validate-mach-o.mjs" "$candidate_app" signing-candidate
mkdir -p "$signer_work"
node "$PACKAGING_SAGE_ROOT/scripts/signing-plan.mjs" "$candidate_app" > "$candidate_plan"
node "$PACKAGING_SAGE_ROOT/scripts/validate-signing-plan.mjs" "$candidate_app" "$candidate_plan"

while IFS=$'\t' read -r kind relative_path extra; do
  [[ -n "$kind" && -n "$relative_path" && -z "${extra:-}" ]] || die 'invalid signing plan row'
  if [[ "$relative_path" == '.' ]]; then target="$candidate_app"; else target="$candidate_app/$relative_path"; fi
  [[ -e "$target" ]] || die "signing plan target disappeared: $relative_path"
  case "$kind" in
    mach-o)
      [[ "$relative_path" != '.' && -f "$target" && ! -L "$target" ]] \
        || die "invalid Mach-O signing target: $relative_path"
      assert_descendant_path "$(canonical_existing_path "$target")" "$candidate_app"
      codesign --force --sign "$identity_sha1" --timestamp=none "${codesign_keychain_args[@]}" "$target"
      ;;
    framework)
      [[ "$relative_path" == *.framework && -d "$target" && ! -L "$target" ]] \
        || die "invalid framework signing target: $relative_path"
      assert_descendant_path "$(canonical_existing_path "$target")" "$candidate_app"
      codesign --force --sign "$identity_sha1" --timestamp=none "${codesign_keychain_args[@]}" "$target"
      ;;
    helper)
      [[ "$relative_path" == *.app && -d "$target" && ! -L "$target" ]] \
        || die "invalid helper signing target: $relative_path"
      assert_descendant_path "$(canonical_existing_path "$target")" "$candidate_app"
      codesign --force --sign "$identity_sha1" --timestamp=none "${codesign_keychain_args[@]}" "$target"
      ;;
    app)
      [[ "$relative_path" == '.' && "$target" == "$candidate_app" ]] \
        || die "invalid outer app signing target: $relative_path"
      codesign --force --sign "$identity_sha1" --timestamp=none "${codesign_keychain_args[@]}" "$target"
      ;;
    *)
      die "unsupported signing plan kind: $kind"
      ;;
  esac
done < "$candidate_plan"

codesign --verify --deep --strict "$candidate_app"
node "$PACKAGING_SAGE_ROOT/scripts/signing-plan.mjs" "$candidate_app" > "$post_sign_plan"
node "$PACKAGING_SAGE_ROOT/scripts/validate-signing-plan.mjs" "$candidate_app" "$post_sign_plan"
cmp -s "$candidate_plan" "$post_sign_plan" || die 'signed code inventory drifted from the executed signing plan'
codesign -d --extract-certificates="$signer_work/certificate" "$candidate_app"
[[ -f "$signer_work/certificate0" ]] || die 'codesign did not expose the embedded leaf certificate'
node "$PACKAGING_SAGE_ROOT/scripts/write-signing-receipt.mjs" \
  "$candidate_app" "$signer_work/certificate0" "$identity_sha256" "$candidate_plan" "$candidate_receipt"
node "$PACKAGING_SAGE_ROOT/scripts/verify-signing-receipt.mjs" "$candidate_app" "$candidate_receipt"
node "$PACKAGING_SAGE_ROOT/scripts/write-manifest.mjs" "$candidate_app" "$candidate_manifest" signed

# All moves below are same-filesystem renames. Ignore asynchronous termination only across this
# bounded swap so cleanup can never observe a completed rename before its ownership flag is set.
trap '' INT TERM
transaction_started=1
mv "$app" "$previous_app"
previous_app_saved=1
if [[ -f "$app.manifest.json" ]]; then mv "$app.manifest.json" "$previous_manifest"; previous_manifest_saved=1; fi
if [[ -f "$app.signing-receipt.json" ]]; then mv "$app.signing-receipt.json" "$previous_receipt"; previous_receipt_saved=1; fi
if [[ -f "$plan" ]]; then mv "$plan" "$previous_plan"; previous_plan_saved=1; fi
mv "$candidate_app" "$app"
new_app_installed=1
mv "$candidate_manifest" "$app.manifest.json"
new_manifest_installed=1
mv "$candidate_receipt" "$app.signing-receipt.json"
new_receipt_installed=1
mv "$candidate_plan" "$plan"
new_plan_installed=1
transaction_committed=1
trap 'exit 130' INT
trap 'exit 143' TERM
say "signed and verified ${app#$REPO_ROOT/} with the fingerprint-bound Sage local identity"
