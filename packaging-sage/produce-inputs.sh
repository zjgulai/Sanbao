#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

cli_arguments=("$@")

usage() {
  cat <<'EOF'
usage: bash packaging-sage/produce-inputs.sh [--replace]

Builds the unsigned DMG-01 app runtime and DMG-02 bundled profile template from
an already-built apps/sage-shell tree. It never signs code or creates a DMG.
EOF
}

replace=0
while [[ $# -gt 0 ]]; do
  case "$1" in
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

require_macos_packaging_tools
require_command pnpm
prepare_output_roots
require_packaging_input_lock producer bash "$SCRIPT_DIR/produce-inputs.sh" ${cli_arguments[@]+"${cli_arguments[@]}"}

arguments=()
if [[ "$replace" -eq 1 ]]; then arguments+=(--replace); fi
node "$PACKAGING_SAGE_ROOT/scripts/produce-inputs.mjs" ${arguments[@]+"${arguments[@]}"}
