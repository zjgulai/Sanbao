import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ownedPackagingRoots, packagingRoot } from '../scripts/lib.mjs'
import { acquireInputLock, releaseInputLock } from '../lib/input-lock.mjs'

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${script} exited with ${String(result.status)}`)
}

const lock = acquireInputLock({
  lockDir: join(process.env.PACKAGING_STAGING_ROOT ?? join(packagingRoot, 'staging'), '.packaging-input.lock'),
  operation: 'producer-contract',
})
let interruptedSignal
const signalHandlers = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => {
  const handler = () => { interruptedSignal ??= signal }
  process.on(signal, handler)
  return [signal, handler]
}))
const assertNotInterrupted = () => {
  if (interruptedSignal !== undefined) throw new Error(`producer contract interrupted by ${interruptedSignal}`)
}
let temporary
try {
  assertNotInterrupted()
  const repoRoot = execFileSync('git', ['-C', packagingRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const [stagingRoot] = ownedPackagingRoots(packagingRoot)
  const inputRoot = join(stagingRoot, 'input')
  const appRuntime = join(inputRoot, 'app-runtime')
  const profileTemplate = join(inputRoot, 'profile-template')
  if (!existsSync(appRuntime) || !existsSync(profileTemplate)) {
    throw new Error('production inputs are missing; run packaging-sage/produce-inputs.sh first')
  }

  runNode(join(packagingRoot, 'scripts', 'validate-inputs.mjs'), ['runtime', appRuntime])
  assertNotInterrupted()
  runNode(join(packagingRoot, 'scripts', 'validate-inputs.mjs'), ['profile', profileTemplate])
  assertNotInterrupted()

  const shellRoot = join(repoRoot, 'apps', 'sage-shell')
  const pathsModule = await import(pathToFileURL(join(shellRoot, 'lib', 'profile', 'paths.js')).href)
  const bundledModule = await import(pathToFileURL(join(shellRoot, 'lib', 'profile', 'bundled-profile.js')).href)
  const templateManifest = JSON.parse(readFileSync(join(profileTemplate, 'template-manifest.json'), 'utf8'))
  temporary = mkdtempSync(join(stagingRoot, '.producer-contract.'))
  const paths = pathsModule.resolveSagePaths({
    home: join(temporary, 'home'),
    root: join(temporary, 'root'),
  })
  const first = await bundledModule.installBundledProfileTemplate({ paths, templateRoot: profileTemplate })
  assertNotInterrupted()
  if (first.state !== 'installed' || first.profile.generation !== templateManifest.generation
    || first.profile.manifestSha256 !== templateManifest.profileManifestSha256) {
    throw new Error('bundled-profile contract did not install the produced generation')
  }
  const second = await bundledModule.installBundledProfileTemplate({ paths, templateRoot: profileTemplate })
  assertNotInterrupted()
  if (second.state !== 'existing' || second.profile.generation !== first.profile.generation
    || second.profile.manifestSha256 !== first.profile.manifestSha256) {
    throw new Error('bundled-profile contract did not reuse the installed generation')
  }
  process.stdout.write(`PASS produced runtime and profile validators\n`)
  process.stdout.write(`PASS bundled-profile install/reuse contract (${templateManifest.generation})\n`)
  process.stdout.write(`PASS no signing or DMG execution (${relative(repoRoot, inputRoot)})\n`)
} finally {
  try {
    if (temporary !== undefined) rmSync(temporary, { recursive: true, force: true })
  } finally {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler)
    releaseInputLock(lock)
  }
}
