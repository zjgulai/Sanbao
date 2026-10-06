#!/usr/bin/env bash

set -euo pipefail

PACKAGING_SAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPO_ROOT="$(git -C "$PACKAGING_SAGE_ROOT" rev-parse --show-toplevel)"
CONFIG_PATH="$PACKAGING_SAGE_ROOT/product.json"
STAGING_ROOT="$PACKAGING_SAGE_ROOT/staging"
RELEASE_ROOT="$PACKAGING_SAGE_ROOT/release"
PACKAGING_INPUT_LOCK_DIR="$STAGING_ROOT/.packaging-input.lock"
PACKAGING_INPUT_LOCK_HELPER="$PACKAGING_SAGE_ROOT/lib/input-lock.mjs"

die() {
  printf '[sage-packaging] ERROR: %s\n' "$*" >&2
  exit 1
}

say() {
  printf '[sage-packaging] %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

config_value() {
  node "$PACKAGING_SAGE_ROOT/scripts/config-value.mjs" "$1"
}

canonical_existing_path() {
  node -e 'const fs=require("node:fs"); console.log(fs.realpathSync(process.argv[1]))' "$1"
}

assert_descendant_path() {
  node -e '
    const fs = require("node:fs")
    const path = require("node:path")
    const candidate = path.resolve(process.argv[1])
    const root = fs.realpathSync(process.argv[2])
    let existing = candidate
    while (!fs.existsSync(existing)) {
      const parent = path.dirname(existing)
      if (parent === existing) throw new Error(`no existing ancestor for ${candidate}`)
      existing = parent
    }
    const effective = path.resolve(fs.realpathSync(existing), path.relative(existing, candidate))
    const relative = path.relative(root, effective)
    if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      process.stderr.write(`unsafe output path ${effective}; expected a strict descendant of ${root}\n`)
      process.exit(1)
    }
  ' "$1" "$2" || die "output path escaped its owned root"
}

prepare_output_roots() {
  mkdir -p "$STAGING_ROOT" "$RELEASE_ROOT"
}

require_packaging_input_lock() {
  local operation="$1"
  shift
  local token="${SAGE_PACKAGING_INPUT_LOCK_TOKEN-}"
  local owner_pid="${SAGE_PACKAGING_INPUT_LOCK_OWNER_PID-}"
  local owner_operation="${SAGE_PACKAGING_INPUT_LOCK_OPERATION-}"
  local owner_lock_dir="${SAGE_PACKAGING_INPUT_LOCK_DIR-}"

  if [[ -z "$token" ]]; then
    exec node "$PACKAGING_INPUT_LOCK_HELPER" run \
      --lock-dir "$PACKAGING_INPUT_LOCK_DIR" \
      --operation "$operation" \
      -- "$@"
  fi

  [[ "$owner_operation" == "$operation" ]] \
    || die "packaging input lock operation mismatch: expected $operation, observed ${owner_operation:-missing}"
  [[ "$owner_lock_dir" == "$PACKAGING_INPUT_LOCK_DIR" ]] \
    || die 'packaging input lock path mismatch'
  node "$PACKAGING_INPUT_LOCK_HELPER" assert-owner \
    --lock-dir "$PACKAGING_INPUT_LOCK_DIR" \
    --operation "$operation" \
    --token "$token" \
    --pid "$owner_pid"
  unset SAGE_PACKAGING_INPUT_LOCK_DIR
  unset SAGE_PACKAGING_INPUT_LOCK_OPERATION
  unset SAGE_PACKAGING_INPUT_LOCK_OWNER_PID
  unset SAGE_PACKAGING_INPUT_LOCK_TOKEN
}

remove_owned_path() {
  local target="$1"
  local owner="$2"
  assert_descendant_path "$target" "$owner"
  rm -rf -- "$target"
}

plist_has_key() {
  plutil -extract "$2" raw -o - "$1" >/dev/null 2>&1
}

plist_set_string() {
  local plist="$1"
  local key="$2"
  local value="$3"
  if plist_has_key "$plist" "$key"; then
    plutil -replace "$key" -string "$value" "$plist"
  else
    plutil -insert "$key" -string "$value" "$plist"
  fi
}

plist_remove_if_present() {
  local plist="$1"
  local key="$2"
  if plist_has_key "$plist" "$key"; then
    plutil -remove "$key" "$plist"
  fi
}

assert_arm64_macho() {
  local path="$1"
  [[ -f "$path" ]] || die "missing Mach-O input: $path"
  local arches
  arches="$(lipo -archs "$path" 2>/dev/null)" || die "input is not a Mach-O binary: $path"
  [[ "$arches" == "arm64" ]] || die "expected thin arm64 binary at $path; observed: $arches"
}

require_macos_packaging_tools() {
  [[ "$(uname -s)" == "Darwin" ]] || die "Sage macOS packaging requires Darwin"
  for command_name in node git ditto plutil lipo file shasum; do
    require_command "$command_name"
  done
}
