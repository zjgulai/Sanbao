#!/usr/bin/env bash

set -euo pipefail

PACKAGING_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
REPO_ROOT="$(git -C "$PACKAGING_ROOT" rev-parse --show-toplevel)"
STAGING_ROOT="$PACKAGING_ROOT/staging"
mkdir -p "$STAGING_ROOT"
TEST_ROOT="$(mktemp -d "$STAGING_ROOT/fixture-test.XXXXXX")"

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'FAIL %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'PASS %s\n' "$*"
}

for script in "$PACKAGING_ROOT/assemble.sh" "$PACKAGING_ROOT/sign.sh" "$PACKAGING_ROOT/dmg.sh" "$PACKAGING_ROOT/tests/fixture-test.sh"; do
  bash -n "$script"
done
pass 'shell syntax'

electron_fixture="$TEST_ROOT/Electron.app"
runtime_fixture="$TEST_ROOT/runtime"
profile_fixture="$TEST_ROOT/profile-template"
app="$TEST_ROOT/output/Sage.app"
real_electron="$REPO_ROOT/apps/sage-shell/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
[[ -f "$real_electron" ]] || fail 'real pinned Electron binary is unavailable for the fixture architecture check'

make_plist() {
  local path="$1"
  local name="$2"
  local executable="$3"
  local identifier="$4"
  mkdir -p "$(dirname "$path")"
  printf '%s\n' \
    '<?xml version="1.0" encoding="UTF-8"?>' \
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
    '<plist version="1.0"><dict>' \
    "<key>CFBundleName</key><string>$name</string>" \
    "<key>CFBundleDisplayName</key><string>$name</string>" \
    "<key>CFBundleExecutable</key><string>$executable</string>" \
    "<key>CFBundleIdentifier</key><string>$identifier</string>" \
    '<key>CFBundlePackageType</key><string>APPL</string>' \
    '<key>CFBundleShortVersionString</key><string>43.3.0</string>' \
    '<key>CFBundleVersion</key><string>43.3.0</string>' \
    '</dict></plist>' > "$path"
}

make_plist "$electron_fixture/Contents/Info.plist" Electron Electron com.github.Electron
plutil -insert CFBundleIconFile -string electron.icns "$electron_fixture/Contents/Info.plist"
plutil -insert NSCameraUsageDescription -string camera "$electron_fixture/Contents/Info.plist"
plutil -insert NSMicrophoneUsageDescription -string microphone "$electron_fixture/Contents/Info.plist"
plutil -insert NSAudioCaptureUsageDescription -string audio "$electron_fixture/Contents/Info.plist"
plutil -insert NSBluetoothAlwaysUsageDescription -string bluetooth "$electron_fixture/Contents/Info.plist"
plutil -insert NSBluetoothPeripheralUsageDescription -string bluetooth "$electron_fixture/Contents/Info.plist"
plutil -insert NSAppTransportSecurity -xml '<dict><key>NSAllowsArbitraryLoads</key><true/></dict>' "$electron_fixture/Contents/Info.plist"
plutil -insert ElectronAsarIntegrity -xml '<dict><key>Resources/default_app.asar</key><dict><key>algorithm</key><string>SHA256</string><key>hash</key><string>fixture</string></dict></dict>' "$electron_fixture/Contents/Info.plist"
mkdir -p "$electron_fixture/Contents/MacOS" "$electron_fixture/Contents/Resources"
cp "$real_electron" "$electron_fixture/Contents/MacOS/Electron"
printf 'fixture\n' > "$electron_fixture/Contents/Resources/electron.icns"
printf 'fixture\n' > "$electron_fixture/Contents/Resources/default_app.asar"

for helper in 'Electron Helper' 'Electron Helper (Renderer)' 'Electron Helper (GPU)' 'Electron Helper (Plugin)'; do
  helper_root="$electron_fixture/Contents/Frameworks/$helper.app"
  make_plist "$helper_root/Contents/Info.plist" "$helper" "$helper" com.github.Electron.helper
  mkdir -p "$helper_root/Contents/MacOS"
  cp "$real_electron" "$helper_root/Contents/MacOS/$helper"
done

framework="$electron_fixture/Contents/Frameworks/Electron Framework.framework/Versions/A"
mkdir -p "$framework/Resources"
cp "$real_electron" "$framework/Electron Framework"
printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.github.Electron.framework</string></dict></plist>' > "$framework/Resources/Info.plist"

mkdir -p \
  "$runtime_fixture/lib/main" \
  "$runtime_fixture/config" \
  "$runtime_fixture/seed" \
  "$runtime_fixture/node_modules/@deepseek-ai/dsh-launch-environment" \
  "$runtime_fixture/node_modules/@deepseek-ai/cordis/src" \
  "$runtime_fixture/node_modules/@deepseek-ai/cordis/scripts" \
  "$runtime_fixture/node_modules/@deepseek-ai/cordis/docs"
printf '%s\n' \
  "import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'" \
  "import { SAGE_DESKTOP_BUNDLE } from './desktop-bundle.js'" \
  'export const fixture = [DSH_LAUNCH_ENVIRONMENT_KEY, SAGE_DESKTOP_BUNDLE]' \
  > "$runtime_fixture/lib/main/index.js"
printf '%s\n' 'export const SAGE_DESKTOP_BUNDLE = "fixture-bundle"' > "$runtime_fixture/lib/main/desktop-bundle.js"
printf '%s\n' "require('electron')" > "$runtime_fixture/lib/main/sanbao-host-preload.cjs"
printf '%s\n' 'fixture: true' > "$runtime_fixture/config/shell.cordis.patch.yml"
printf '%s\n' '{"name":"sage-shell-profile","private":true,"type":"module"}' > "$runtime_fixture/seed/package.json"
printf '%s\n' 'overrides: {}' > "$runtime_fixture/seed/pnpm-workspace.yaml"
printf '%s\n' "lockfileVersion: '9.0'" > "$runtime_fixture/seed/pnpm-lock.yaml"
printf '%s\n' 'plugins: {}' > "$runtime_fixture/seed/cordis.yml"
printf '%s\n' 'plugins: {}' > "$runtime_fixture/seed/cordis.patch.yml"
printf '%s\n' '{"name":"@deepseek-ai/dsh-launch-environment","version":"0.2.0-rc.2","type":"module","main":"index.js","dependencies":{"@deepseek-ai/cordis":"4.0.4"}}' > "$runtime_fixture/node_modules/@deepseek-ai/dsh-launch-environment/package.json"
printf '%s\n' 'export const DSH_LAUNCH_ENVIRONMENT_KEY = "fixture"' > "$runtime_fixture/node_modules/@deepseek-ai/dsh-launch-environment/index.js"
printf '%s\n' '{"name":"@deepseek-ai/cordis","version":"4.0.4","type":"module","main":"src/index.js"}' > "$runtime_fixture/node_modules/@deepseek-ai/cordis/package.json"
printf '%s\n' 'export const cordis = true' > "$runtime_fixture/node_modules/@deepseek-ai/cordis/src/index.js"
printf '%s\n' 'export const runtimeHelper = true' > "$runtime_fixture/node_modules/@deepseek-ai/cordis/scripts/runtime-helper.js"
printf '%s\n' '# Published package documentation' > "$runtime_fixture/node_modules/@deepseek-ai/cordis/docs/runtime.md"
printf '%s\n' '# Published package README' > "$runtime_fixture/node_modules/@deepseek-ai/cordis/README.md"
node "$PACKAGING_ROOT/scripts/write-runtime-package.mjs" "$runtime_fixture"
node "$PACKAGING_ROOT/scripts/validate-inputs.mjs" runtime "$runtime_fixture" >/dev/null
pass 'third-party main=src/index.js and published package content are retained'

expect_runtime_rejected() {
  local fixture="$1"
  if node "$PACKAGING_ROOT/scripts/validate-inputs.mjs" runtime "$fixture" >/dev/null 2>&1; then
    fail "runtime validator accepted forbidden fixture $(basename "$fixture")"
  fi
}

for forbidden_kind in src test scripts declaration typescript source-map repository-automation benchmark prose; do
  forbidden_runtime="$TEST_ROOT/forbidden-$forbidden_kind-runtime"
  cp -R "$runtime_fixture" "$forbidden_runtime"
  case "$forbidden_kind" in
    src|test|scripts)
      mkdir -p "$forbidden_runtime/$forbidden_kind"
      printf '%s\n' 'export const forbidden = true' > "$forbidden_runtime/$forbidden_kind/forbidden.js"
      ;;
    declaration)
      printf '%s\n' 'export declare const forbidden: true' > "$forbidden_runtime/lib/main/forbidden.d.ts"
      ;;
    typescript)
      printf '%s\n' 'export const forbidden: true = true' > "$forbidden_runtime/lib/main/forbidden.ts"
      ;;
    source-map)
      printf '%s\n' '{}' > "$forbidden_runtime/lib/main/forbidden.js.map"
      ;;
    repository-automation)
      mkdir -p "$forbidden_runtime/.github/workflows"
      printf '%s\n' 'name: forbidden' > "$forbidden_runtime/.github/workflows/ci.yml"
      ;;
    benchmark)
      mkdir -p "$forbidden_runtime/benchmark"
      printf '%s\n' 'export const forbidden = true' > "$forbidden_runtime/benchmark/index.js"
      ;;
    prose)
      printf '%s\n' '# forbidden release prose' > "$forbidden_runtime/README.md"
      ;;
  esac
  expect_runtime_rejected "$forbidden_runtime"
done

absolute_link_runtime="$TEST_ROOT/forbidden-absolute-link-runtime"
cp -R "$runtime_fixture" "$absolute_link_runtime"
printf '%s\n' 'outside' > "$TEST_ROOT/outside-runtime-file"
ln -s "$TEST_ROOT/outside-runtime-file" "$absolute_link_runtime/node_modules/absolute-link"
expect_runtime_rejected "$absolute_link_runtime"
pass 'development artifacts and external absolute symlinks fail closed'

generation='fixture-generation'
generation_root="$profile_fixture/profile"
mkdir -p \
  "$generation_root/sage-host/host" \
  "$generation_root/node_modules/fixture-runtime/src"
printf '%s\n' '{"name":"sage-shell-profile","private":true,"type":"module","dsh":{"profile":{"bundles":[]}}}' > "$generation_root/package.json"
printf '%s\n' 'packages: []' > "$generation_root/pnpm-workspace.yaml"
printf '%s\n' "lockfileVersion: '9.0'" > "$generation_root/pnpm-lock.yaml"
printf '%s\n' 'plugins: {}' > "$generation_root/cordis.yml"
printf '%s\n' 'plugins: {}' > "$generation_root/cordis.patch.yml"
printf '%s\n' 'export const fixture = true' > "$generation_root/sage-host/host/index.js"
printf '%s\n' 'plugins: {}' > "$generation_root/sage-host/shell.cordis.patch.yml"
printf '%s\n' '{"name":"fixture-runtime","version":"1.0.0","type":"module","main":"src/index.js"}' > "$generation_root/node_modules/fixture-runtime/package.json"
printf '%s\n' 'export const fixtureRuntime = true' > "$generation_root/node_modules/fixture-runtime/src/index.js"

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

cordis_patch_sha="$(sha256_file "$generation_root/cordis.patch.yml")"
cordis_sha="$(sha256_file "$generation_root/cordis.yml")"
package_sha="$(sha256_file "$generation_root/package.json")"
lock_sha="$(sha256_file "$generation_root/pnpm-lock.yaml")"
workspace_sha="$(sha256_file "$generation_root/pnpm-workspace.yaml")"
host_sha="$(sha256_file "$generation_root/sage-host/host/index.js")"
overlay_sha="$(sha256_file "$generation_root/sage-host/shell.cordis.patch.yml")"
owned_rows="[{\"path\":\"cordis.patch.yml\",\"sha256\":\"$cordis_patch_sha\"},{\"path\":\"cordis.yml\",\"sha256\":\"$cordis_sha\"},{\"path\":\"package.json\",\"sha256\":\"$package_sha\"},{\"path\":\"pnpm-lock.yaml\",\"sha256\":\"$lock_sha\"},{\"path\":\"pnpm-workspace.yaml\",\"sha256\":\"$workspace_sha\"},{\"path\":\"sage-host/host/index.js\",\"sha256\":\"$host_sha\"},{\"path\":\"sage-host/shell.cordis.patch.yml\",\"sha256\":\"$overlay_sha\"}]"
owned_canonical="{\"schemaVersion\":\"sage.owned-profile-file-set.v1\",\"files\":$owned_rows}"
owned_profile_digest="sha256:$(printf '%s' "$owned_canonical" | shasum -a 256 | awk '{print $1}')"
node --input-type=module - \
  "$REPO_ROOT/apps/sage-shell/lib/profile/runtime-artifact-attestation.js" \
  "$generation_root" "$generation" "$owned_profile_digest" <<'NODE'
import { pathToFileURL } from 'node:url'

const [, , modulePath, profileDir, generation, ownedProfileDigest] = process.argv
const { createRuntimeArtifactAttestation } = await import(pathToFileURL(modulePath).href)
await createRuntimeArtifactAttestation({ profileDir, generation, ownedProfileDigest })
NODE
attestation_digest="$(node -e 'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).artifactAttestationDigest)' "$generation_root/runtime-artifact-attestation.json")"

attestation_sha="$(sha256_file "$generation_root/runtime-artifact-attestation.json")"
printf '%s\n' \
  '{' \
  '  "schemaVersion": 1,' \
  "  \"generation\": \"$generation\"," \
  '  "files": [' \
  "    {\"path\":\"cordis.patch.yml\",\"sha256\":\"$cordis_patch_sha\"}," \
  "    {\"path\":\"cordis.yml\",\"sha256\":\"$cordis_sha\"}," \
  "    {\"path\":\"package.json\",\"sha256\":\"$package_sha\"}," \
  "    {\"path\":\"pnpm-lock.yaml\",\"sha256\":\"$lock_sha\"}," \
  "    {\"path\":\"pnpm-workspace.yaml\",\"sha256\":\"$workspace_sha\"}," \
  "    {\"path\":\"runtime-artifact-attestation.json\",\"sha256\":\"$attestation_sha\"}," \
  "    {\"path\":\"sage-host/host/index.js\",\"sha256\":\"$host_sha\"}," \
  "    {\"path\":\"sage-host/shell.cordis.patch.yml\",\"sha256\":\"$overlay_sha\"}" \
  '  ]' \
  '}' > "$generation_root/profile-manifest.json"
chmod 600 "$generation_root/profile-manifest.json"
manifest_sha="$(sha256_file "$generation_root/profile-manifest.json")"
printf '%s\n' \
  '{' \
  '  "schemaVersion": "sage.bundled-profile-template.v1",' \
  "  \"generation\": \"$generation\"," \
  "  \"profileManifestSha256\": \"$manifest_sha\"," \
  "  \"runtimeArtifactAttestationSha256\": \"$attestation_sha\"," \
  "  \"ownedProfileDigest\": \"$owned_profile_digest\"," \
  "  \"artifactAttestationDigest\": \"$attestation_digest\"" \
  '}' > "$profile_fixture/template-manifest.json"

bash "$PACKAGING_ROOT/assemble.sh" \
  --electron-app "$electron_fixture" \
  --app-runtime "$runtime_fixture" \
  --profile-template "$profile_fixture" \
  --output "$app"
pass 'fixture assembles without signing or creating a DMG'

expect_plist() {
  local plist="$1"
  local key="$2"
  local expected="$3"
  local observed
  observed="$(plutil -extract "$key" raw -o - "$plist")"
  [[ "$observed" == "$expected" ]] || fail "$key expected $expected, observed $observed"
}

expect_absent_plist() {
  local plist="$1"
  local key="$2"
  if plutil -extract "$key" raw -o - "$plist" >/dev/null 2>&1; then fail "$key must be absent"; fi
}

outer="$app/Contents/Info.plist"
expect_plist "$outer" CFBundleName Sage
expect_plist "$outer" CFBundleDisplayName Sage
expect_plist "$outer" CFBundleExecutable Sage
expect_plist "$outer" CFBundleIdentifier com.lute.sage
expect_plist "$outer" CFBundleShortVersionString 0.1.0
expect_plist "$outer" CFBundleVersion 1
expect_plist "$outer" CFBundleIconFile Sage.icns
expect_absent_plist "$outer" NSAppTransportSecurity
expect_absent_plist "$outer" NSCameraUsageDescription
expect_absent_plist "$outer" NSMicrophoneUsageDescription
expect_absent_plist "$outer" NSAudioCaptureUsageDescription
expect_absent_plist "$outer" NSBluetoothAlwaysUsageDescription
expect_absent_plist "$outer" NSBluetoothPeripheralUsageDescription
expect_absent_plist "$outer" ElectronAsarIntegrity
pass 'outer Info.plist identity and privacy boundary'

expect_plist "$app/Contents/Frameworks/Sage Helper.app/Contents/Info.plist" CFBundleIdentifier com.lute.sage.helper
expect_plist "$app/Contents/Frameworks/Sage Helper (Renderer).app/Contents/Info.plist" CFBundleIdentifier com.lute.sage.helper.renderer
expect_plist "$app/Contents/Frameworks/Sage Helper (GPU).app/Contents/Info.plist" CFBundleIdentifier com.lute.sage.helper.gpu
expect_plist "$app/Contents/Frameworks/Sage Helper (Plugin).app/Contents/Info.plist" CFBundleIdentifier com.lute.sage.helper.plugin
[[ -x "$app/Contents/MacOS/Sage" ]] || fail 'renamed Sage executable is missing'
[[ ! -e "$app/Contents/MacOS/Electron" ]] || fail 'old Electron executable remains'
[[ -f "$app/Contents/Resources/Sage.icns" ]] || fail 'Sage.icns is missing'
[[ ! -e "$app/Contents/Resources/electron.icns" ]] || fail 'old Electron icon remains'
[[ ! -e "$app/Contents/Resources/default_app.asar" ]] || fail 'default Electron fallback remains'
pass 'helper identities, executable names, and icon replacement'

[[ -f "$app/Contents/Resources/app/lib/main/index.js" ]] || fail 'runtime input was not copied'
[[ -f "$app/Contents/Resources/sage-profile-template/template-manifest.json" ]] || fail 'profile template manifest was not copied'
[[ -f "$app/Contents/Resources/sage-profile-template/profile/profile-manifest.json" ]] || fail 'profile generation was not copied'
[[ -f "$app/Contents/Resources/sage-build.json" ]] || fail 'build metadata is missing'
[[ -f "$app.manifest.json" ]] || fail 'assembled artifact manifest is missing'
if rg -a -F -l "$REPO_ROOT" "$app" >/dev/null; then fail 'absolute repository path leaked into assembled app'; fi
pass 'artifact carries no absolute repository path'

bash "$PACKAGING_ROOT/sign.sh" --app "$app" --plan
plan="$app.signing-plan.tsv"
[[ -s "$plan" ]] || fail 'signing plan is missing'
[[ "$(tail -n 1 "$plan")" == $'app\t.' ]] || fail 'outer app is not the final signing target'
rg -F $'helper\tContents/Frameworks/Sage Helper.app' "$plan" >/dev/null \
  || { sed -n '1,120p' "$plan" >&2; fail 'main helper is absent from signing plan'; }
rg -F $'helper\tContents/Frameworks/Sage Helper (Renderer).app' "$plan" >/dev/null \
  || { sed -n '1,120p' "$plan" >&2; fail 'renderer helper is absent from signing plan'; }
pass 'leaf-to-root signing plan without codesign execution'

bash "$PACKAGING_ROOT/dmg.sh" --app "$app" --plan
[[ -f "$app.dmg-plan.txt" ]] || fail 'DMG plan is missing'
[[ ! -e "$PACKAGING_ROOT/release/Sage-0.1.0-internal-arm64.dmg" ]] || fail 'fixture plan must not create a DMG'
if rg -a -F -l "$REPO_ROOT" "$app.manifest.json" "$plan" "$app.dmg-plan.txt" >/dev/null; then
  fail 'absolute repository path leaked into a manifest or packaging plan'
fi
pass 'UDZO verify/mount/copy plan without DMG creation'

if bash "$PACKAGING_ROOT/assemble.sh" \
  --electron-app "$electron_fixture" \
  --app-runtime "$TEST_ROOT/missing-runtime" \
  --profile-template "$profile_fixture" \
  --output "$TEST_ROOT/missing-runtime-output/Sage.app" >/dev/null 2>&1; then
  fail 'assemble accepted a missing runtime input'
fi
if bash "$PACKAGING_ROOT/assemble.sh" \
  --electron-app "$electron_fixture" \
  --app-runtime "$runtime_fixture" \
  --profile-template "$TEST_ROOT/missing-profile" \
  --output "$TEST_ROOT/missing-profile-output/Sage.app" >/dev/null 2>&1; then
  fail 'assemble accepted a missing profile template'
fi
tampered_profile="$TEST_ROOT/tampered-profile-template"
cp -R "$profile_fixture" "$tampered_profile"
printf '%s\n' 'tampered' >> "$tampered_profile/profile/sage-host/host/index.js"
if bash "$PACKAGING_ROOT/assemble.sh" \
  --electron-app "$electron_fixture" \
  --app-runtime "$runtime_fixture" \
  --profile-template "$tampered_profile" \
  --output "$TEST_ROOT/tampered-profile-output/Sage.app" >/dev/null 2>&1; then
  fail 'assemble accepted a profile template that drifted from its receipt'
fi
pass 'missing or receipt-drifted build/profile inputs fail closed'

tampered_node_modules="$TEST_ROOT/tampered-node-modules-profile-template"
cp -R "$profile_fixture" "$tampered_node_modules"
printf '%s\n' 'tampered runtime bytes' >> "$tampered_node_modules/profile/node_modules/fixture-runtime/src/index.js"
if node "$PACKAGING_ROOT/scripts/validate-inputs.mjs" profile "$tampered_node_modules" >/dev/null 2>&1; then
  fail 'profile validator accepted node_modules bytes that drifted from the runtime artifact attestation'
fi
pass 'fresh runtime artifact attestation rejects profile node_modules tamper'

printf 'packaging-sage fixture test: PASS\n'
