#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
usage: bash packaging-sage/sign-local.sh --app <staging/Sage.app> --execute

Creates a short-lived Sage-only self-signed code-signing identity in a private temporary
keychain, asks macOS SecurityAgent to trust it for code signing, delegates the artifact
transaction to sign.sh, removes the trust, and deletes all temporary identity material.

This command intentionally requires interactive SecurityAgent approval. It never uses an
existing identity; the private keychain must be absent from the user's keychain search lists
before the operation, joins them for the signing window only, and every path restores the
exactly captured prior list afterwards.
EOF
}

RECOVERY_HELPER="$PACKAGING_SAGE_ROOT/scripts/local-signing-recovery.mjs"

recover_local_signing_root() {
  local recovery_root="$1"
  if node "$RECOVERY_HELPER" recover "$recovery_root"; then
    remove_owned_path "$recovery_root" "$STAGING_ROOT" || return 1
    return 0
  fi
  printf '[sage-packaging] ERROR: local-signing recovery remains unresolved at %s\n' "$recovery_root" >&2
  printf '[sage-packaging] RECOVERY: node %q recover %q\n' "$RECOVERY_HELPER" "$recovery_root" >&2
  return 1
}

recover_stale_local_signing_roots() {
  local recovery_root
  local -a recovery_roots=()
  shopt -s nullglob
  recovery_roots=("$STAGING_ROOT"/.local-signing.*)
  shopt -u nullglob
  for recovery_root in ${recovery_roots[@]+"${recovery_roots[@]}"}; do
    [[ -d "$recovery_root" && ! -L "$recovery_root" ]] \
      || die "unsafe stale local-signing recovery path: $recovery_root"
    say "recovering stale local-signing state before starting a new operation: ${recovery_root#$REPO_ROOT/}"
    recover_local_signing_root "$recovery_root" \
      || die 'stale local-signing trust state must be resolved before a new signing operation'
  done
}

app=''
execute=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      [[ $# -ge 2 ]] || die '--app requires a path'
      app="$2"
      shift 2
      ;;
    --execute)
      [[ "$execute" -eq 0 ]] || die '--execute may be specified only once'
      execute=1
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
[[ "$execute" -eq 1 ]] || die 'local identity provisioning and signing require explicit --execute'
require_macos_packaging_tools
for command_name in openssl security codesign; do
  require_command "$command_name"
done
prepare_output_roots
recover_stale_local_signing_roots
[[ -d "$app" ]] || die "Sage.app is missing: $app"
app="$(canonical_existing_path "$app")"
assert_descendant_path "$app" "$STAGING_ROOT"
[[ "$(basename "$app")" == 'Sage.app' ]] || die 'signing target must be named Sage.app'

signing_mode="$(config_value signing.mode)"
[[ "$signing_mode" == 'local-self-signed' ]] || die "unsupported local signing mode: $signing_mode"
identity="$(config_value signing.identityCommonName)"
node "$RECOVERY_HELPER" assert-no-unowned-trust "$identity"
node "$PACKAGING_SAGE_ROOT/scripts/verify-bundle.mjs" "$app"
node "$PACKAGING_SAGE_ROOT/scripts/validate-mach-o.mjs" "$app" local-signing-preflight

work="$(mktemp -d "$STAGING_ROOT/.local-signing.XXXXXX")"
chmod 700 "$work"
if ! node "$RECOVERY_HELPER" init "$work" "$$"; then
  remove_owned_path "$work" "$STAGING_ROOT"
  die 'could not initialize durable local-signing recovery state'
fi
private_key="$work/private-key.pem"
certificate="$work/certificate.pem"
identity_archive="$work/identity.p12"
keychain="$work/identity.keychain-db"
keychain_password="$(openssl rand -hex 32)"
archive_password="$(openssl rand -hex 32)"
cleanup_attempted=0

cleanup() {
  local status=$?
  trap - EXIT HUP INT TERM
  trap '' HUP INT TERM
  if [[ "$cleanup_attempted" -eq 0 && -n "${work:-}" && -d "$work" ]]; then
    cleanup_attempted=1
    if ! recover_local_signing_root "$work"; then status=1; fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

openssl req -x509 -newkey rsa:3072 -sha256 -days 2 -nodes \
  -subj "/CN=$identity" \
  -addext 'basicConstraints=critical,CA:FALSE' \
  -addext 'keyUsage=critical,digitalSignature' \
  -addext 'extendedKeyUsage=critical,codeSigning' \
  -keyout "$private_key" \
  -out "$certificate"
certificate_sha256="$(node "$PACKAGING_SAGE_ROOT/scripts/signing-certificate-fingerprint.mjs" "$certificate" "$identity")"

# OpenSSL 3 writes PKCS#12 with AES-256-CBC/SHA-256 by default, which macOS `security import`
# refuses ("MAC verification failed during PKCS12 import"); only the traditional PBE set is
# accepted by Security.framework. LibreSSL (macOS /usr/bin/openssl) is legacy already and has no
# `-legacy` flag, so gate the flag on the actual version instead of assuming one implementation.
pkcs12_legacy=''
if openssl version 2>/dev/null | grep -q '^OpenSSL 3\.'; then
  pkcs12_legacy='-legacy'
fi
# shellcheck disable=SC2086 # intentional word-splitting: empty = no flag, set = one fixed flag.
openssl pkcs12 -export $pkcs12_legacy \
  -inkey "$private_key" \
  -in "$certificate" \
  -name "$identity" \
  -passout "pass:$archive_password" \
  -out "$identity_archive"

/usr/bin/security create-keychain -p "$keychain_password" "$keychain"
node "$RECOVERY_HELPER" assert-keychain-unlisted "$work" "$$"
# Idle auto-lock must outlive the whole signing transaction: sign.sh copies the ~29k-file
# candidate and re-verifies its plans BEFORE the first codesign call, with zero keychain access
# in between — a short idle timeout locks the keychain mid-flight and codesign then reports
# "<sha1>: no identity found" (first real run, 2026-10-10). The security boundary here is the
# end-of-script trust removal and material deletion, not the idle lock.
/usr/bin/security set-keychain-settings -lut 3600 "$keychain"
/usr/bin/security unlock-keychain -p "$keychain_password" "$keychain"
/usr/bin/security import "$identity_archive" \
  -k "$keychain" \
  -P "$archive_password" \
  -T /usr/bin/codesign \
  -T /usr/bin/security
/usr/bin/security set-key-partition-list \
  -S 'apple-tool:,apple:,codesign:' \
  -s \
  -k "$keychain_password" \
  "$keychain" >/dev/null

# The imported keychain is now the only required private-key container. Remove the plaintext
# source key and transport archive before trust is changed so every later failure has less to reap.
remove_owned_path "$private_key" "$work"
remove_owned_path "$identity_archive" "$work"
unset archive_password

node "$RECOVERY_HELPER" mark-trust-unknown "$work" "$$"

say 'SecurityAgent approval is required to trust the temporary Sage identity for code signing.'
trap '' HUP INT TERM
if node "$PACKAGING_SAGE_ROOT/scripts/security-trust.mjs" add "$certificate" "$keychain"; then
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
else
  add_status=$?
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  exit "$add_status"
fi

node "$RECOVERY_HELPER" assert-code-signing-trust "$work" "$$"
node "$PACKAGING_SAGE_ROOT/scripts/resolve-signing-identity.mjs" \
  "$identity" "$certificate_sha256" "$keychain" >/dev/null

# Re-unlock immediately before the transaction so a sleep/lock between trust and signing cannot
# strand codesign with an inaccessible private key.
/usr/bin/security unlock-keychain -p "$keychain_password" "$keychain"

# codesign(1) "SIGNING IDENTITIES": an identity must be stored in a keychain that is on the
# calling user's keychain search list — --keychain only narrows that search (first real run,
# 2026-10-10: codesign reported "<sha1>: no identity found" although find-identity saw the
# identity). The ephemeral keychain therefore joins the search list for the signing window only.
# The exact prior list is captured first so recovery restores it on every path, crash included.
search_list_paths=()
while IFS= read -r raw_line; do
  stripped="${raw_line#"${raw_line%%[![:space:]]*}"}"
  stripped="${stripped%\"}"
  stripped="${stripped#\"}"
  [[ -z "$stripped" ]] || search_list_paths+=("$stripped")
done < <(/usr/bin/security list-keychains -d user)
[[ ${#search_list_paths[@]} -gt 0 ]] || die 'user keychain search list is unexpectedly empty'
printf '%s\n' ${search_list_paths[@]+"${search_list_paths[@]}"} > "$work/search-list-before.txt"
chmod 600 "$work/search-list-before.txt"
/usr/bin/security list-keychains -d user -s ${search_list_paths[@]+"${search_list_paths[@]}"} "$keychain"

bash "$PACKAGING_SAGE_ROOT/sign.sh" \
  --app "$app" \
  --execute \
  --identity-sha256 "$certificate_sha256" \
  --keychain "$keychain"

unset keychain_password
cleanup_attempted=1
trap '' HUP INT TERM
if ! recover_local_signing_root "$work"; then
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  die 'signed app was produced, but temporary trust recovery remains unresolved'
fi
work=''
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
say "signed ${app#$REPO_ROOT/} with an ephemeral Sage-only identity and removed its trust and keychain"
