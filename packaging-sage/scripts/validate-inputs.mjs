import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertDirectory,
  assertRegularFile,
  isProductDevelopmentArtifactPath,
  loadConfig,
  packagingRoot,
  sha256Bytes,
  sha256File,
  validateSymlinkTree,
  walkTree,
} from './lib.mjs'
import { validateNodeDependencyClosure } from './node-closure.mjs'
import { collectRuntimeGraph } from './runtime-graph.mjs'

const HEX_SHA256 = /^[a-f0-9]{64}$/u
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u
const GENERATION = /^[a-z0-9][a-z0-9-]{0,63}$/u

function readJson(path, label) {
  assertRegularFile(path, label)
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error(`${label} is not valid JSON: ${path}`, { cause })
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object: ${path}`)
  }
  return value
}

function assertExactKeys(value, expected, label) {
  const observed = Object.keys(value).sort()
  const required = [...expected].sort()
  if (JSON.stringify(observed) !== JSON.stringify(required)) {
    throw new Error(`${label} has an unsupported shape`)
  }
}

function isLiteralRelativePath(value) {
  return typeof value === 'string' && value.trim() === value && value !== ''
    && !value.includes('\\') && !value.includes('\u0000')
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

function validateRuntime(input) {
  const config = loadConfig()
  const root = assertDirectory(input, 'app runtime')
  const manifest = readJson(join(root, 'package.json'), 'app runtime package')
  if (manifest.productName !== config.productName || manifest.version !== config.version
    || manifest.type !== 'module' || manifest.main !== 'lib/main/index.js') {
    throw new Error('app runtime package identity must match Sage 0.1.0 with main lib/main/index.js')
  }
  if (manifest.scripts !== undefined || manifest.devDependencies !== undefined) {
    throw new Error('app runtime package must not carry scripts or development dependencies')
  }

  const required = [
    'lib/main/index.js',
    'lib/main/desktop-bundle.js',
    'config/shell.cordis.patch.yml',
    'seed/package.json',
    'seed/pnpm-workspace.yaml',
    'seed/pnpm-lock.yaml',
    'seed/cordis.yml',
    'seed/cordis.patch.yml',
    'node_modules/@deepseek-ai/dsh-launch-environment/package.json',
  ]
  for (const name of required) assertRegularFile(join(root, name), `app runtime ${name}`)

  const desktopBundle = readFileSync(join(root, 'lib/main/desktop-bundle.js'), 'utf8')
  if (!desktopBundle.includes('SAGE_DESKTOP_BUNDLE')
    || /SAGE_DESKTOP_BUNDLE\s*=\s*(?:''|"")/u.test(desktopBundle)) {
    throw new Error('app runtime desktop bundle is missing or empty; run the real Sage build first')
  }

  for (const forbidden of ['src', 'test', 'scripts', 'tsconfig.json', 'tsconfig.tsbuildinfo', 'vitest.config.ts']) {
    if (existsSync(join(root, forbidden))) throw new Error(`development-only runtime input is forbidden: ${forbidden}`)
  }
  const rows = walkTree(root)
  const forbiddenArtifact = rows.find((row) => isProductDevelopmentArtifactPath(row.relative, row.kind))
  if (forbiddenArtifact !== undefined) {
    throw new Error(`development artifact is forbidden in production runtime: ${forbiddenArtifact.relative}`)
  }
  const links = validateSymlinkTree(root)

  const graph = collectRuntimeGraph(root)
  const closure = manifest.sageRuntimeClosure
  if (closure === null || typeof closure !== 'object' || Array.isArray(closure)) {
    throw new Error('app runtime package has no sageRuntimeClosure')
  }
  assertExactKeys(closure, [
    'schemaVersion',
    'entry',
    'assets',
    'providedModules',
    'files',
    'externalDependencies',
    'digest',
  ], 'app runtime closure')
  if (closure.schemaVersion !== 'sage.runtime-closure.v1'
    || closure.entry !== graph.entry
    || JSON.stringify(closure.assets) !== JSON.stringify(graph.assets)
    || JSON.stringify(closure.providedModules) !== JSON.stringify(graph.providedModules)
    || !Array.isArray(closure.files)
    || !Array.isArray(closure.externalDependencies)
    || typeof closure.digest !== 'string' || !SHA256_DIGEST.test(closure.digest)) {
    throw new Error('app runtime closure has an unsupported shape')
  }

  const closureFiles = []
  let previousFile = ''
  for (const row of closure.files) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('app runtime closure contains an invalid file row')
    }
    assertExactKeys(row, ['path', 'sha256'], 'app runtime closure file row')
    if (!isLiteralRelativePath(row.path) || !row.path.startsWith('lib/')
      || typeof row.sha256 !== 'string' || !HEX_SHA256.test(row.sha256) || row.path <= previousFile) {
      throw new Error('app runtime closure files must be safe, unique, and sorted')
    }
    previousFile = row.path
    if (sha256File(assertRegularFile(join(root, row.path), `runtime closure ${row.path}`)) !== row.sha256) {
      throw new Error(`app runtime closure digest mismatch: ${row.path}`)
    }
    closureFiles.push({ path: row.path, sha256: row.sha256 })
  }
  if (JSON.stringify(closureFiles.map(row => row.path)) !== JSON.stringify(graph.files)) {
    throw new Error('app runtime closure file list does not match the reachable module graph')
  }
  const actualLibFiles = rows.filter(row => row.kind === 'file' && row.relative.startsWith('lib/')).map(row => row.relative)
  if (JSON.stringify(actualLibFiles) !== JSON.stringify(graph.files)) {
    throw new Error('app runtime lib contains files outside the reachable production graph')
  }

  const dependencies = manifest.dependencies
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    throw new Error('app runtime package dependencies must be an object')
  }
  const externalDependencies = []
  let previousDependency = ''
  for (const row of closure.externalDependencies) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('app runtime closure contains an invalid dependency row')
    }
    assertExactKeys(row, ['name', 'version'], 'app runtime closure dependency row')
    if (typeof row.name !== 'string' || row.name === '' || row.name <= previousDependency
      || typeof row.version !== 'string' || row.version === '') {
      throw new Error('app runtime dependencies must be nonempty, unique, and sorted')
    }
    previousDependency = row.name
    const installed = readJson(join(root, 'node_modules', ...row.name.split('/'), 'package.json'), `runtime dependency ${row.name}`)
    if (dependencies[row.name] !== row.version || installed.version !== row.version) {
      throw new Error(`app runtime dependency version mismatch: ${row.name}`)
    }
    externalDependencies.push({ name: row.name, version: row.version })
  }
  if (JSON.stringify(externalDependencies.map(row => row.name)) !== JSON.stringify(graph.externalPackages)
    || JSON.stringify(Object.keys(dependencies).sort()) !== JSON.stringify(graph.externalPackages)) {
    throw new Error('app runtime dependencies do not match external imports in the reachable graph')
  }
  const closureBody = {
    schemaVersion: closure.schemaVersion,
    entry: closure.entry,
    assets: closure.assets,
    providedModules: closure.providedModules,
    files: closureFiles,
    externalDependencies,
  }
  if (`sha256:${sha256Bytes(Buffer.from(JSON.stringify(closureBody), 'utf8'))}` !== closure.digest) {
    throw new Error('app runtime closure digest does not match its canonical body')
  }
  const dependencyClosure = validateNodeDependencyClosure(root, dependencies)
  if (!dependencyClosure.packages.some(entry => entry.name === '@deepseek-ai/cordis')) {
    throw new Error('app runtime dependency closure does not contain @deepseek-ai/cordis')
  }
  process.stdout.write(`${JSON.stringify({
    kind: 'runtime',
    files: rows.filter((row) => row.kind === 'file').length,
    graphFiles: graph.files.length,
    dependencyPackages: dependencyClosure.packages.length,
    symlinks: links.length,
  })}\n`)
}

async function validateProfile(input) {
  const root = assertDirectory(input, 'profile template')
  const topLevel = readdirSync(root).sort()
  if (JSON.stringify(topLevel) !== JSON.stringify(['profile', 'template-manifest.json'])) {
    throw new Error('profile template must contain exactly template-manifest.json and profile/')
  }

  const template = readJson(join(root, 'template-manifest.json'), 'profile template manifest')
  assertExactKeys(template, [
    'schemaVersion',
    'generation',
    'profileManifestSha256',
    'runtimeArtifactAttestationSha256',
    'ownedProfileDigest',
    'artifactAttestationDigest',
  ], 'profile template manifest')
  if (template.schemaVersion !== 'sage.bundled-profile-template.v1'
    || typeof template.generation !== 'string' || !GENERATION.test(template.generation)
    || typeof template.profileManifestSha256 !== 'string' || !HEX_SHA256.test(template.profileManifestSha256)
    || typeof template.runtimeArtifactAttestationSha256 !== 'string' || !HEX_SHA256.test(template.runtimeArtifactAttestationSha256)
    || typeof template.ownedProfileDigest !== 'string' || !SHA256_DIGEST.test(template.ownedProfileDigest)
    || typeof template.artifactAttestationDigest !== 'string' || !SHA256_DIGEST.test(template.artifactAttestationDigest)) {
    throw new Error('profile template manifest has an unsupported value')
  }

  const generation = assertDirectory(join(root, 'profile'), 'profile template profile')
  const manifestPath = join(generation, 'profile-manifest.json')
  const manifest = readJson(manifestPath, 'profile manifest')
  assertExactKeys(manifest, ['schemaVersion', 'generation', 'files'], 'profile manifest')
  if (manifest.schemaVersion !== 1 || manifest.generation !== template.generation || !Array.isArray(manifest.files)) {
    throw new Error('profile manifest does not bind the template generation')
  }
  if (sha256File(manifestPath) !== template.profileManifestSha256) {
    throw new Error('template digest does not match profile-manifest.json')
  }

  let previousPath = ''
  let attestationReceipt
  const receiptRows = []
  const receiptPaths = new Set()
  for (const row of manifest.files) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('profile manifest contains an invalid file row')
    }
    assertExactKeys(row, ['path', 'sha256'], 'profile manifest file row')
    if (!isLiteralRelativePath(row.path) || typeof row.sha256 !== 'string' || !HEX_SHA256.test(row.sha256)
      || row.path <= previousPath) {
      throw new Error('profile manifest file rows must be safe, unique, and sorted')
    }
    previousPath = row.path
    const path = assertRegularFile(join(generation, row.path), `profile receipt ${row.path}`)
    if (sha256File(path) !== row.sha256) throw new Error(`profile receipt digest mismatch: ${row.path}`)
    receiptRows.push({ path: row.path, sha256: row.sha256 })
    receiptPaths.add(row.path)
    if (row.path === 'runtime-artifact-attestation.json') attestationReceipt = row
  }
  if (attestationReceipt === undefined) throw new Error('profile receipt does not seal runtime-artifact-attestation.json')
  for (const required of [
    'cordis.patch.yml',
    'cordis.yml',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'sage-host/host/index.js',
    'sage-host/shell.cordis.patch.yml',
  ]) {
    if (!receiptPaths.has(required)) throw new Error(`profile receipt does not seal required file: ${required}`)
  }
  const ownedCanonical = JSON.stringify({
    schemaVersion: 'sage.owned-profile-file-set.v1',
    files: receiptRows.filter(row => row.path !== 'runtime-artifact-attestation.json'),
  })
  if (`sha256:${sha256Bytes(Buffer.from(ownedCanonical, 'utf8'))}` !== template.ownedProfileDigest) {
    throw new Error('profile receipt does not match the template ownedProfileDigest')
  }

  const attestationPath = assertRegularFile(
    join(generation, 'runtime-artifact-attestation.json'),
    'runtime artifact attestation',
  )
  if ((lstatSync(attestationPath).mode & 0o777) !== 0o600) {
    throw new Error('runtime artifact attestation must have mode 0600')
  }
  if (sha256File(attestationPath) !== template.runtimeArtifactAttestationSha256
    || attestationReceipt.sha256 !== template.runtimeArtifactAttestationSha256) {
    throw new Error('template digest does not match runtime-artifact-attestation.json')
  }
  const attestation = readJson(attestationPath, 'runtime artifact attestation')
  assertExactKeys(attestation, [
    'schemaVersion',
    'canonicalizationVersion',
    'producerContractVersion',
    'generation',
    'ownedProfileDigest',
    'artifactSetDigest',
    'installerMetadataDigest',
    'artifactAttestationDigest',
  ], 'runtime artifact attestation')
  if (attestation.schemaVersion !== 'sage.runtime-artifact-attestation.v1'
    || attestation.canonicalizationVersion !== 'sage.runtime-artifact-attestation-canonical-json.v1'
    || attestation.producerContractVersion !== 'sage.runtime-artifact-attestation-producer.v1'
    || attestation.generation !== template.generation
    || attestation.ownedProfileDigest !== template.ownedProfileDigest
    || typeof attestation.artifactSetDigest !== 'string' || !SHA256_DIGEST.test(attestation.artifactSetDigest)
    || typeof attestation.installerMetadataDigest !== 'string' || !SHA256_DIGEST.test(attestation.installerMetadataDigest)
    || attestation.artifactAttestationDigest !== template.artifactAttestationDigest) {
    throw new Error('runtime artifact attestation does not bind the template')
  }
  const attestationBody = {
    schemaVersion: attestation.schemaVersion,
    canonicalizationVersion: attestation.canonicalizationVersion,
    producerContractVersion: attestation.producerContractVersion,
    generation: attestation.generation,
    ownedProfileDigest: attestation.ownedProfileDigest,
    artifactSetDigest: attestation.artifactSetDigest,
    installerMetadataDigest: attestation.installerMetadataDigest,
  }
  if (`sha256:${sha256Bytes(Buffer.from(JSON.stringify(attestationBody), 'utf8'))}` !== attestation.artifactAttestationDigest) {
    throw new Error('runtime artifact attestation digest does not match its canonical body')
  }
  const attestationModulePath = assertRegularFile(
    join(resolve(packagingRoot, '..'), 'apps', 'sage-shell', 'lib', 'profile', 'runtime-artifact-attestation.js'),
    'built runtime artifact attestation verifier',
  )
  const attestationModule = await import(pathToFileURL(attestationModulePath).href)
  if (typeof attestationModule.verifyRuntimeArtifactAttestation !== 'function') {
    throw new Error('built runtime artifact attestation verifier has no verifyRuntimeArtifactAttestation export')
  }
  const verifiedAttestation = await attestationModule.verifyRuntimeArtifactAttestation({
    profileDir: generation,
    generation: template.generation,
    ownedProfileDigest: template.ownedProfileDigest,
    expectedArtifactAttestationDigest: template.artifactAttestationDigest,
  })
  if (verifiedAttestation.artifactSetDigest !== attestation.artifactSetDigest
    || verifiedAttestation.installerMetadataDigest !== attestation.installerMetadataDigest) {
    throw new Error('fresh runtime artifact attestation verification returned different tree evidence')
  }

  const profilePackage = readJson(join(generation, 'package.json'), 'materialized profile package')
  if (profilePackage.dsh === null || typeof profilePackage.dsh !== 'object' || Array.isArray(profilePackage.dsh)
    || profilePackage.dsh.profile === null || typeof profilePackage.dsh.profile !== 'object'
    || Array.isArray(profilePackage.dsh.profile)
    || !Array.isArray(profilePackage.dsh.profile.bundles)) {
    throw new Error('materialized profile package has no dsh.profile.bundles array')
  }
  assertRegularFile(join(generation, 'sage-host', 'host', 'index.js'), 'materialized Host entry')
  assertRegularFile(join(generation, 'sage-host', 'shell.cordis.patch.yml'), 'materialized Host overlay')
  assertDirectory(join(generation, 'node_modules'), 'materialized profile node_modules')

  const rows = walkTree(root)
  const forbiddenArtifact = rows.find((row) => isProductDevelopmentArtifactPath(row.relative, row.kind))
  if (forbiddenArtifact !== undefined) {
    throw new Error(`development artifact is forbidden in production profile: ${forbiddenArtifact.relative}`)
  }
  const links = validateSymlinkTree(root)
  process.stdout.write(`${JSON.stringify({
    kind: 'profile-template',
    generation: template.generation,
    manifestSha256: template.profileManifestSha256,
    artifactSetDigest: verifiedAttestation.artifactSetDigest,
    artifactAttestationDigest: template.artifactAttestationDigest,
    files: rows.filter((row) => row.kind === 'file').length,
    symlinks: links.length,
  })}\n`)
}

const kind = process.argv[2]
const input = process.argv[3]
if ((kind !== 'runtime' && kind !== 'profile') || input === undefined) {
  process.stderr.write('usage: node validate-inputs.mjs <runtime|profile> <directory>\n')
  process.exit(2)
}

try {
  if (kind === 'runtime') validateRuntime(input)
  else await validateProfile(input)
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
