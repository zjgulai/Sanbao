import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { collectRuntimeGraph } from './runtime-graph.mjs'
import {
  loadConfig,
  packagingRoot,
  ownedPackagingRoots,
  safeOutputPath,
} from './lib.mjs'
import { projectKnownPlatformNativePayloads } from './native-projection.mjs'
import { removeMacosMetadata } from './macos-metadata.mjs'
import { removeExactPnpmInstallerArtifacts } from './pnpm-install-artifacts.mjs'
import { writeRuntimePackage } from './write-runtime-package.mjs'

const replace = process.argv.slice(2).includes('--replace')
const PROFILE_TREE_PHASE_TIMEOUT_MS = 45 * 60 * 1000
if (process.argv.slice(2).some(argument => argument !== '--replace')) {
  process.stderr.write('usage: node produce-inputs.mjs [--replace]\n')
  process.exit(2)
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return undefined
    throw error
  }
}

function regularFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  const entry = lstatSync(path)
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`${label} must be a regular file: ${path}`)
  return path
}

function directory(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  const entry = lstatSync(path)
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`${label} must be a real directory: ${path}`)
  return realpathSync(path)
}

function readJson(path, label) {
  regularFile(path, label)
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

function copyRegularFile(source, destination) {
  const entry = lstatSync(source)
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`release input is not a regular file: ${source}`)
  mkdirSync(dirname(destination), { recursive: true, mode: 0o755 })
  copyFileSync(source, destination)
  chmodSync(destination, entry.mode & 0o777)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: 'inherit',
    timeout: options.timeout ?? 10 * 60 * 1000,
    killSignal: 'SIGTERM',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    const reason = result.signal === null ? `status ${String(result.status)}` : `signal ${result.signal}`
    throw new Error(`${command} exited with ${reason}`)
  }
}

function installedVersion(shellRoot, packageName) {
  const manifest = readJson(
    join(shellRoot, 'node_modules', ...packageName.split('/'), 'package.json'),
    `installed package ${packageName}`,
  )
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`installed package has no version: ${packageName}`)
  }
  return manifest.version
}

function objectMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function inside(root, candidate) {
  const distance = relative(root, candidate)
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance))
}

function dependencyPackageDir(nodeModules, from, name) {
  const parts = name.startsWith('@') ? name.split('/') : [name]
  let cursor = from
  while (inside(dirname(nodeModules), cursor)) {
    const manifest = join(cursor, 'node_modules', ...parts, 'package.json')
    if (existsSync(manifest)) {
      const entry = lstatSync(manifest)
      if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`dependency manifest is not a regular file: ${name}`)
      const packageDir = realpathSync(dirname(manifest))
      if (!inside(nodeModules, packageDir)) throw new Error(`dependency resolves outside isolated node_modules: ${name}`)
      return packageDir
    }
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  return undefined
}

function pruneInstalledDependencyClosure(nodeModules, directNames) {
  const virtualStore = directory(join(nodeModules, '.pnpm'), 'isolated pnpm virtual store')
  const queue = directNames.map(name => ({ from: dirname(nodeModules), name, optional: false }))
  const visited = new Set()
  const retainedEntries = new Set()
  while (queue.length > 0) {
    const request = queue.shift()
    const packageDir = dependencyPackageDir(nodeModules, request.from, request.name)
    if (packageDir === undefined) {
      if (request.optional) continue
      throw new Error(`isolated dependency closure is missing ${request.name}`)
    }
    if (visited.has(packageDir)) continue
    visited.add(packageDir)
    const distance = relative(virtualStore, packageDir)
    if (distance === '..' || distance.startsWith(`..${sep}`) || isAbsolute(distance)) {
      throw new Error(`dependency package escapes the pnpm virtual store: ${request.name}`)
    }
    retainedEntries.add(distance.split(sep)[0])
    const manifest = readJson(join(packageDir, 'package.json'), `dependency package ${request.name}`)
    for (const name of Object.keys(objectMap(manifest.dependencies)).sort()) {
      queue.push({ from: packageDir, name, optional: false })
    }
    for (const name of Object.keys(objectMap(manifest.optionalDependencies)).sort()) {
      queue.push({ from: packageDir, name, optional: true })
    }
    const peerMetadata = objectMap(manifest.peerDependenciesMeta)
    for (const name of Object.keys(objectMap(manifest.peerDependencies)).sort()) {
      queue.push({ from: packageDir, name, optional: objectMap(peerMetadata[name]).optional === true })
    }
  }

  const targetIsRetained = path => {
    try {
      const target = realpathSync(path)
      const distance = relative(virtualStore, target)
      return distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance)
        && retainedEntries.has(distance.split(sep)[0])
    } catch {
      return false
    }
  }
  const pruneBinLinks = root => {
    const bin = join(root, '.bin')
    if (!existsSync(bin)) return
    const entry = lstatSync(bin)
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(`pnpm .bin entry must be a real directory: ${bin}`)
    }
    for (const name of readdirSync(bin)) {
      const command = join(bin, name)
      if (!targetIsRetained(command)) rmSync(command, { recursive: true, force: true })
    }
    if (readdirSync(bin).length === 0) rmdirSync(bin)
  }
  const pruneLinkFarm = (root, skipVirtualStore = false) => {
    if (!existsSync(root)) return
    pruneBinLinks(root)
    for (const name of readdirSync(root)) {
      if (name === '.bin' || (skipVirtualStore && name === '.pnpm')) continue
      const child = join(root, name)
      if (name.startsWith('@')) {
        const entry = lstatSync(child)
        if (entry.isSymbolicLink() || !entry.isDirectory()) {
          rmSync(child, { recursive: true, force: true })
          continue
        }
        for (const packageName of readdirSync(child)) {
          const packageLink = join(child, packageName)
          if (!targetIsRetained(packageLink)) rmSync(packageLink, { recursive: true, force: true })
        }
        if (readdirSync(child).length === 0) rmdirSync(child)
      } else if (!targetIsRetained(child)) {
        rmSync(child, { recursive: true, force: true })
      }
    }
  }
  pruneLinkFarm(nodeModules, true)
  pruneLinkFarm(join(virtualStore, 'node_modules'))
  for (const name of readdirSync(virtualStore)) {
    const child = join(virtualStore, name)
    if (name === 'node_modules') continue
    const entry = lstatSync(child)
    if (!entry.isDirectory() || entry.isSymbolicLink() || !retainedEntries.has(name)) {
      rmSync(child, { recursive: true, force: true })
    }
  }
  process.stdout.write(`[sage-packaging] runtime dependency closure: ${String(visited.size)} packages in ${String(retainedEntries.size)} pnpm entries\n`)
}

function isolatedInstallEnvironment({ home, temporary }) {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: home,
    TMPDIR: temporary,
    CI: 'true',
    LANG: 'C',
    LC_ALL: 'C',
  }
}

function writeJsonAtomic(path, value, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode })
  renameSync(temporary, path)
}

function replaceOutputBestEffort(input) {
  const previousOutput = join(input.work, 'previous-input')
  const failedCandidate = join(input.work, 'failed-candidate-input')
  const journal = join(input.work, 'replace-transaction.json')
  let previousMoved = false
  let candidateActive = false
  let committed = false
  const writeState = (phase, extra = {}) => writeJsonAtomic(journal, {
    schemaVersion: 'sage.production-input-replace-transaction.v1',
    pid: process.pid,
    phase,
    hadPreviousOutput: previousMoved,
    ...extra,
  }, 0o600)

  writeState('candidate-validated')
  try {
    input.assertNotInterrupted()
    const existingOutput = lstatIfPresent(input.outputRoot)
    if (existingOutput !== undefined) {
      if (existingOutput.isSymbolicLink() || !existingOutput.isDirectory()) {
        throw new Error(`existing production input must be a real directory: ${input.outputRoot}`)
      }
      renameSync(input.outputRoot, previousOutput)
      previousMoved = true
      writeState('previous-retained')
    }
    input.assertNotInterrupted()
    renameSync(input.candidateRoot, input.outputRoot)
    candidateActive = true
    writeState('candidate-active')
    input.assertNotInterrupted()
    writeState('committed')
    committed = true
    if (previousMoved) {
      try {
        rmSync(previousOutput, { recursive: true, force: true })
      } catch (cause) {
        input.preserveWork()
        writeState('committed-cleanup-failed', {
          reason: cause instanceof Error ? cause.message : String(cause),
        })
        throw new Error(`production inputs committed, but previous backup remnants were retained in ${input.work}`, { cause })
      }
    }
    try {
      writeState('complete')
    } catch (cause) {
      input.preserveWork()
      throw new Error(`production inputs committed, but transaction completion state was retained in ${input.work}`, { cause })
    }
  } catch (error) {
    if (!committed && (previousMoved || candidateActive)) {
      let rollbackError
      try {
        writeState('rollback-started')
      } catch (cause) {
        rollbackError = cause
      }
      try {
        if (candidateActive && existsSync(input.outputRoot)) renameSync(input.outputRoot, failedCandidate)
        if (previousMoved && existsSync(previousOutput)) renameSync(previousOutput, input.outputRoot)
        try {
          writeState('rolled-back')
        } catch (cause) {
          rollbackError ??= cause
        }
        if (rollbackError === undefined && existsSync(failedCandidate)) {
          rmSync(failedCandidate, { recursive: true, force: true })
        }
      } catch (cause) {
        rollbackError ??= cause
      }
      if (rollbackError !== undefined) {
        input.preserveWork()
        try {
          writeState('rollback-failed', {
            reason: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          })
        } catch {
          // The work directory and any unique backup remain the recovery record.
        }
        throw new AggregateError(
          [error, rollbackError],
          `production input replacement failed and rollback is incomplete; preserve ${input.work}`,
        )
      }
    }
    throw error
  }
}

async function produce() {
  const config = loadConfig()
  if (process.platform !== 'darwin' || process.arch !== config.arch) {
    throw new Error(`producer requires Darwin ${config.arch}; observed ${process.platform} ${process.arch}`)
  }
  const repoRoot = execFileSync('git', ['-C', packagingRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const shellRoot = directory(join(repoRoot, 'apps', 'sage-shell'), 'Sage shell root')
  const pnpmStore = directory(
    execFileSync('pnpm', ['store', 'path'], { encoding: 'utf8' }).trim(),
    'pnpm store',
  )
  // Honor the same relocation override the shell layer documents (ADR-0292): a checkout inside
  // an iCloud-managed scope must be able to build outside the sync domain, where the sync
  // daemon cannot write .DS_Store files into the tree mid-digest.
  const [stagingRoot] = ownedPackagingRoots(packagingRoot)
  mkdirSync(stagingRoot, { recursive: true, mode: 0o755 })
  const outputRoot = safeOutputPath(join(stagingRoot, 'input'), [stagingRoot])
  const existingOutput = lstatIfPresent(outputRoot)
  if (existingOutput !== undefined && (existingOutput.isSymbolicLink() || !existingOutput.isDirectory())) {
    throw new Error(`existing production input must be a real directory: ${relative(repoRoot, outputRoot)}`)
  }
  if (existingOutput !== undefined && !replace) {
    throw new Error(`production input already exists; pass --replace for this exact owned path: ${relative(repoRoot, outputRoot)}`)
  }

  regularFile(join(shellRoot, 'lib', 'main', 'index.js'), 'built Sage main entry')
  const desktopBundlePath = regularFile(join(shellRoot, 'lib', 'main', 'desktop-bundle.js'), 'built desktop bundle')
  const desktopBundle = readFileSync(desktopBundlePath, 'utf8')
  if (!desktopBundle.includes('SAGE_DESKTOP_BUNDLE')
    || /SAGE_DESKTOP_BUNDLE\s*=\s*(?:''|"")/u.test(desktopBundle)) {
    throw new Error('built desktop bundle is missing or empty; run pnpm --dir apps/sage-shell build first')
  }

  const work = mkdtempSync(join(stagingRoot, '.produce-inputs.'))
  let preserveWork = false
  let interruptedSignal
  let primaryFailed = false
  const signalHandlers = new Map(['SIGINT', 'SIGTERM'].map(signal => {
    const handler = () => { interruptedSignal ??= signal }
    process.on(signal, handler)
    return [signal, handler]
  }))
  const assertNotInterrupted = () => {
    if (interruptedSignal !== undefined) throw new Error(`producer interrupted by ${interruptedSignal}`)
  }
  try {
    const candidateRoot = join(work, 'input')
    const appRuntime = join(candidateRoot, 'app-runtime')
    const profileTemplate = join(candidateRoot, 'profile-template')
    mkdirSync(appRuntime, { recursive: true, mode: 0o755 })

    const graph = collectRuntimeGraph(shellRoot)
    for (const path of graph.files) copyRegularFile(join(shellRoot, path), join(appRuntime, path))
    copyRegularFile(
      join(shellRoot, 'config', 'shell.cordis.patch.yml'),
      join(appRuntime, 'config', 'shell.cordis.patch.yml'),
    )
    for (const name of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.yml', 'cordis.patch.yml']) {
      copyRegularFile(join(shellRoot, 'seed', name), join(appRuntime, 'seed', name))
    }
    // T05-mid (ADR-0282): shipped governance publications ride with the runtime at the same
    // relative path the loader resolves in a dev checkout (app root / publications).
    for (const name of readdirSync(join(shellRoot, 'publications'))) {
      copyRegularFile(join(shellRoot, 'publications', name), join(appRuntime, 'publications', name))
    }

    const dependencies = Object.fromEntries(graph.externalPackages.map(name => [name, installedVersion(shellRoot, name)]))
    const dependencyInstall = join(work, 'runtime-dependencies')
    const dependencyHome = join(work, 'runtime-dependencies-home')
    const dependencyTmp = join(work, 'runtime-dependencies-tmp')
    mkdirSync(dependencyInstall, { recursive: true, mode: 0o755 })
    mkdirSync(dependencyHome, { recursive: true, mode: 0o700 })
    mkdirSync(dependencyTmp, { recursive: true, mode: 0o700 })
    copyRegularFile(join(shellRoot, 'package.json'), join(dependencyInstall, 'package.json'))
    copyRegularFile(join(shellRoot, 'pnpm-lock.yaml'), join(dependencyInstall, 'pnpm-lock.yaml'))
    copyRegularFile(join(shellRoot, 'pnpm-workspace.yaml'), join(dependencyInstall, 'pnpm-workspace.yaml'))
    run('pnpm', [
      'install',
      '--dir', dependencyInstall,
      '--dev',
      '--offline',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--trust-lockfile',
      '--store-dir', pnpmStore,
    ], {
      cwd: dependencyInstall,
      env: isolatedInstallEnvironment({ home: dependencyHome, temporary: dependencyTmp }),
      timeout: 15 * 60 * 1000,
    })
    assertNotInterrupted()
    const installedNodeModules = directory(join(dependencyInstall, 'node_modules'), 'installed runtime dependency closure')
    cpSync(installedNodeModules, join(appRuntime, 'node_modules'), {
      recursive: true,
      errorOnExist: true,
      verbatimSymlinks: true,
    })
    pruneInstalledDependencyClosure(join(appRuntime, 'node_modules'), graph.externalPackages)
    projectKnownPlatformNativePayloads(join(appRuntime, 'node_modules'), { architecture: config.arch })
    removeExactPnpmInstallerArtifacts(join(appRuntime, 'node_modules'))
    writeRuntimePackage(appRuntime)
    const runtimeMetadata = removeMacosMetadata(appRuntime)
    if (runtimeMetadata > 0) {
      process.stdout.write(`[sage-packaging] removed ${String(runtimeMetadata)} macOS .DS_Store metadata files (iCloud/Finder artifact)\n`)
    }

    run(process.execPath, [join(packagingRoot, 'scripts', 'validate-inputs.mjs'), 'runtime', appRuntime])
    run(process.execPath, [join(packagingRoot, 'scripts', 'validate-mach-o.mjs'), appRuntime, 'app-runtime'])
    run(process.execPath, [
      join(packagingRoot, 'scripts', 'assert-relocatable.mjs'),
      appRuntime,
      '--forbid', repoRoot,
      '--forbid', shellRoot,
      '--forbid', work,
    ])
    assertNotInterrupted()

    const pathsModule = await import(pathToFileURL(join(shellRoot, 'lib', 'profile', 'paths.js')).href)
    const materializeModule = await import(pathToFileURL(join(shellRoot, 'lib', 'profile', 'materialize.js')).href)
    const materializeRoot = join(work, 'materialize', 'root')
    const materializeHome = join(work, 'materialize', 'home')
    const materializeTmp = join(work, 'materialize', 'tmp')
    mkdirSync(materializeHome, { recursive: true, mode: 0o700 })
    mkdirSync(materializeTmp, { recursive: true, mode: 0o700 })
    const paths = pathsModule.resolveSagePaths({ home: materializeHome, root: materializeRoot })
    await pathsModule.ensureSageDirectories(paths)
    const generation = `sage-${config.version.replaceAll('.', '-')}-build-${config.build}-${config.arch}`
    const materialized = await materializeModule.materializeProfile({
      seedDir: join(shellRoot, 'seed'),
      shellRoot,
      repoRoot,
      paths,
      generation,
      install: async (profileDir) => {
        run('pnpm', [
          'install',
          '--dir', profileDir,
          '--prod',
          '--offline',
          '--frozen-lockfile',
          '--ignore-scripts',
          '--trust-lockfile',
          '--store-dir', pnpmStore,
        ], {
          cwd: profileDir,
          env: isolatedInstallEnvironment({ home: materializeHome, temporary: materializeTmp }),
          timeout: PROFILE_TREE_PHASE_TIMEOUT_MS,
        })
        assertNotInterrupted()
        const profileNodeModules = join(profileDir, 'node_modules')
        projectKnownPlatformNativePayloads(profileNodeModules, { architecture: config.arch })
        removeExactPnpmInstallerArtifacts(profileNodeModules)
        run(
          process.execPath,
          [join(packagingRoot, 'scripts', 'validate-mach-o.mjs'), profileDir, 'materialized-profile'],
          { timeout: PROFILE_TREE_PHASE_TIMEOUT_MS },
        )
      },
    })
    assertNotInterrupted()
    const active = await pathsModule.readActiveProfile(paths)
    if (active === null || active.generation !== materialized.generation
      || active.runtimeArtifactAttestationSha256 === undefined) {
      throw new Error('materialized profile did not produce a receipt-bound active generation')
    }
    const attestation = readJson(
      join(materialized.profileDir, 'runtime-artifact-attestation.json'),
      'materialized runtime artifact attestation',
    )
    if (typeof attestation.ownedProfileDigest !== 'string'
      || typeof attestation.artifactAttestationDigest !== 'string') {
      throw new Error('materialized runtime artifact attestation has an unsupported shape')
    }

    mkdirSync(profileTemplate, { recursive: true, mode: 0o755 })
    cpSync(materialized.profileDir, join(profileTemplate, 'profile'), {
      recursive: true,
      errorOnExist: true,
      verbatimSymlinks: true,
    })
    writeJsonAtomic(join(profileTemplate, 'template-manifest.json'), {
      schemaVersion: 'sage.bundled-profile-template.v1',
      generation: materialized.generation,
      profileManifestSha256: materialized.manifestSha256,
      runtimeArtifactAttestationSha256: active.runtimeArtifactAttestationSha256,
      ownedProfileDigest: attestation.ownedProfileDigest,
      artifactAttestationDigest: attestation.artifactAttestationDigest,
    })

    const templateMetadata = removeMacosMetadata(profileTemplate)
    if (templateMetadata > 0) {
      process.stdout.write(`[sage-packaging] removed ${String(templateMetadata)} macOS .DS_Store metadata files (iCloud/Finder artifact)\n`)
    }
    run(
      process.execPath,
      [join(packagingRoot, 'scripts', 'validate-inputs.mjs'), 'profile', profileTemplate],
      { timeout: PROFILE_TREE_PHASE_TIMEOUT_MS },
    )
    run(
      process.execPath,
      [join(packagingRoot, 'scripts', 'validate-mach-o.mjs'), profileTemplate, 'profile-template'],
      { timeout: PROFILE_TREE_PHASE_TIMEOUT_MS },
    )
    run(process.execPath, [
      join(packagingRoot, 'scripts', 'assert-relocatable.mjs'),
      profileTemplate,
      '--forbid', repoRoot,
      '--forbid', shellRoot,
      '--forbid', work,
    ], { timeout: PROFILE_TREE_PHASE_TIMEOUT_MS })
    assertNotInterrupted()
    replaceOutputBestEffort({
      work,
      candidateRoot,
      outputRoot,
      assertNotInterrupted,
      preserveWork: () => { preserveWork = true },
    })
    process.stdout.write(`[sage-packaging] production inputs ready at ${relative(repoRoot, outputRoot)}\n`)
    process.stdout.write(`[sage-packaging] runtime graph: ${String(graph.files.length)} files, ${String(graph.externalPackages.length)} direct packages\n`)
    process.stdout.write(`[sage-packaging] profile generation: ${materialized.generation}\n`)
  } catch (error) {
    primaryFailed = true
    throw error
  } finally {
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler)
    if (preserveWork) {
      process.stderr.write(`[sage-packaging] retained recovery work directory: ${work}\n`)
    } else {
      try {
        rmSync(work, { recursive: true, force: true })
      } catch (cause) {
        process.stderr.write(`[sage-packaging] failed to clean producer work directory ${work}: ${cause instanceof Error ? cause.message : String(cause)}\n`)
        if (!primaryFailed) throw cause
      }
    }
  }
}

try {
  await produce()
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
