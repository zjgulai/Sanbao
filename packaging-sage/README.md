# Sage internal macOS packaging

This directory is the only packaging namespace for the Sage product. It does not call, source,
copy, or reinterpret the legacy `packaging/` chain.

## Accepted product inputs

- product: `Sage`
- bundle identifier: `com.lute.sage`
- product version: `0.1.0`
- build number: `1`
- architecture: `arm64`
- distribution: internal only
- signing: Sage-specific local self-signed identity
- notarization: disabled

The single machine-readable source is [`product.json`](product.json). Changing identity, version,
architecture, signing mode, or distribution target is a separate product decision, not a command-line
override.

## Current scope and honest boundary

This directory now contains the DMG-00 through DMG-06 code paths and contracts:

- discover the repository and pinned Electron bytes dynamically;
- require a prebuilt production app runtime and an attested profile template;
- reject native Mach-O inputs that do not contain the configured `arm64` architecture;
- create the Sage outer/helper bundle identity and install `Sage.icns`;
- remove Electron's unused camera, microphone, Bluetooth, and unrestricted ATS declarations;
- generate a deterministic leaf-to-root signing plan;
- provide an explicit-execute local signing path;
- provide an explicit-execute UDZO create, verify, mount, copy, and seal-check path;
- provide a real installed-copy first-launch/restart acceptance harness;
- write relative-path artifact manifests and SHA-256 digests.

The DMG-01/02 producer is also isolated here. It derives a reachable JavaScript graph from the
built Electron main entry, creates an offline pnpm dependency closure whose symlinks remain inside
the output, and invokes Sage's existing `materializeProfile` against a temporary Sage root. The
active generation is copied into the exact `template-manifest.json + profile/` contract consumed by
`bundled-profile.ts`.

Development-artifact pruning applies only to product-owned build output. Retained third-party
published packages keep their shipped content, including legitimate `src/`, `scripts/`, TypeScript,
source maps, and prose. The only package-aware platform projection is exact
`node-pty@1.2.0-beta.15`: it keeps `prebuilds/darwin-arm64/pty.node` and removes only the registered
non-target prebuild directories and `third_party/conpty`. An unknown version, missing/extra physical
package location, missing expected path, invalid retained payload, ELF, PE, or non-arm64 Mach-O fails
closed.

It does **not** yet prove a runnable release by itself. DMG-01/02 require a completed Sage source
build and the real producer/consumer contract below to pass; DMG-06 must still perform a real
empty-root launch/restart acceptance after assembly and signing. A Pages build, fixture, current user
profile, old renderer, or legacy DSH DMG is not acceptable input or completion evidence.

All mutable outputs are constrained to ignored `packaging-sage/staging/` and
`packaging-sage/release/` directories. Product source and secrets are never copied into a manifest.

`Contents/Resources/sage-build.json` uses metadata schema v4. `inputs.*` records the pre-sign raw
digests of the runtime, profile template, Electron base, icon, and packaging definition;
`assembly.*` records signing-normalized runtime/profile digests. Normalization operates only on a
private copy and removes only Mach-O signature superblobs; every other byte, size, mode, path,
directory, and symlink remains in the digest. `source.commit` is HEAD context, while
`source.relevantTrackedWorktreeClean` honestly records scoped tracked/untracked dirtiness. A dirty
local build is not reproducible from the commit alone; the input and packaging-definition byte
digests are the artifact provenance.

The profile input is the build-time bundle consumed by Sage's first-run installer: it contains
exactly `template-manifest.json` and `profile/`. Packaging verifies the template manifest, profile
receipt rows, attestation shape and digest bindings before copying it. It does not accept a current
user data root or `profile-current.json`.

This internal self-signed configuration deliberately disables hardened runtime and App Sandbox, so
no entitlements file is applied. Enabling hardened runtime, sandboxing, Developer ID distribution,
or notarization requires a separate reviewed configuration and matching entitlements.

The runtime stays unpacked at `Contents/Resources/app`; this foundation does not introduce ASAR.
Native `.node`, `.dylib`, and executable Mach-O files remain individually visible to the architecture
check and leaf-to-root signing plan.

## Commands

First complete the existing Sage build. The producer deliberately rejects TypeScript's empty
`SAGE_DESKTOP_BUNDLE` placeholder and never runs or repairs the build itself:

```bash
pnpm --dir apps/sage-shell build
```

Run the default quick packaging contracts:

```bash
pnpm run test:packaging-sage
```

This command first proves that all 12 filesystem test entrypoints are registered, then runs only the
7 `pure` entries. It does not run the producer, assembler, signing, DMG, packaged acceptance, or read
`packaging-sage/staging/input`. The other registered layers are `platform` (4), `input` (1), and
`live` (0); they require an explicit command and are not part of the default quick gate. The manifest
and its fail-closed discovery self-test can be checked directly with:

```bash
node --test scripts/gates/sage-packaging-contracts.test.mjs
```

The pure set includes the isolated pnpm-installer-artifact fixture and the local-signing recovery
contract with a fake security runner. Neither invokes pnpm, SecurityAgent, `security`, `codesign`,
the producer, or the assembler; each cleans only its uniquely owned test temporary root.

Produce the reviewed DMG-01/02 inputs. Existing inputs require the explicit `--replace` switch:

```bash
bash packaging-sage/produce-inputs.sh --replace
```

The outputs are:

- `packaging-sage/staging/input/app-runtime`
- `packaging-sage/staging/input/profile-template`

Run the existing bundled-profile implementation against those produced bytes:

```bash
node packaging-sage/tests/producer-contract-test.mjs
```

Assemble an unsigned app from explicit inputs:

```bash
bash packaging-sage/assemble.sh \
  --app-runtime packaging-sage/staging/input/app-runtime \
  --profile-template packaging-sage/staging/input/profile-template
```

Inspect the signing order without modifying the app:

```bash
bash packaging-sage/sign.sh --app packaging-sage/staging/Sage.app --plan
```

`sign-local.sh` is the only wrapper that provisions the internal signing identity. It creates an
ephemeral private keychain and the exact `Sage Local Code Signing` self-signed certificate, asks
SecurityAgent for interactive approval when adding and removing code-signing trust, delegates only
the artifact signing transaction to `sign.sh`, and then removes the trust and deletes the keychain.
The command is not successful until both trust removal and keychain deletion complete; a cleanup
failure returns non-zero and retains exact recovery material and commands:

```bash
bash packaging-sage/sign-local.sh \
  --app packaging-sage/staging/Sage.app \
  --execute
```

`sign.sh` itself never creates a certificate, changes trust, or deletes a keychain. Execute mode
requires an already resolved exact identity/fingerprint and one explicit regular non-symlink
`--keychain`; there is no default-search-list signing fallback. `codesign --keychain` restricts
signer-identity lookup, while the single self-signed certificate plus the post-sign SHA-256/SHA-1/CN
checks bind every signed target.

If trust cleanup cannot be proven, recovery destroys the private key, P12, and temporary keychain
first, then retains only the public certificate and durable journal needed for exact user-domain
trust removal. The current CLI implementation still passes short-lived random keychain/P12
passphrases through local process arguments because the `security` subcommands lack a uniform secure
non-interactive password channel. The `0700` work root, early deletion, and short lifetime reduce but
do not eliminate same-user process observation; removing that residual hardening gap requires a
separately reviewed native Security.framework helper.

The `sage.local-signing-receipt.v2` signing receipt is artifact-specific. It binds the product facts,
signed app raw tree, executed signing-plan digest, embedded leaf certificate SHA-256/SHA-1/CN, outer
designated requirement, no timestamp, and the disabled hardened-runtime/App-Sandbox/notarization
facts. Verification regenerates the plan and checks every Mach-O, framework, helper, and outer app
for the same signer and prohibited runtime/timestamp/entitlement state. A receipt from a different
Sage build cannot be reused for DMG creation.

Inspect the DMG operation without creating one:

```bash
bash packaging-sage/dmg.sh --app packaging-sage/staging/Sage.app --plan
```

Creating the internal DMG requires an already valid app seal and explicit `--execute`:

```bash
bash packaging-sage/dmg.sh --app packaging-sage/staging/Sage.app --execute
```

Run real DMG-06 acceptance into a brand-new evidence directory:

```bash
node packaging-sage/scripts/accept-dmg.mjs \
  --dmg packaging-sage/release/Sage-0.1.0-internal-arm64.dmg \
  --evidence packaging-sage/staging/dmg-06-acceptance-<unique-run>
```

Only `acceptance-result.json` with `kind=sage.packaged-acceptance.v1` and `passed=true`, together
with the DMG/receipt hash, fresh-root launch, same-root restart, six viewport screenshots, and
cleanup/detach evidence, proves DMG-06. The presence of this harness, a fixture pass, an assembled
app, or a mounted DMG is not that acceptance result. No real accepted DMG is recorded by this README.

Run the generated-fixture contract test:

```bash
bash packaging-sage/tests/fixture-test.sh
```

The fixture test never creates a certificate, signs an app, or creates a DMG.
