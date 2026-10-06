import { execFileSync, spawnSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, packagingRoot, sha256File } from './lib.mjs'
import { artifactTreeDigest, designatedRequirement } from './signing-evidence.mjs'
import { assertLocalSelfSignedCodeSigningCertificate } from './certificate-policy.mjs'

const [app, receiptPath] = process.argv.slice(2)
if (app === undefined || receiptPath === undefined) {
  process.stderr.write('usage: node verify-signing-receipt.mjs <Sage.app> <signing-receipt.json>\n')
  process.exit(2)
}

function exactKeys(value, expected) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function inspectSignedTarget(target, index, receipt, temporary) {
  const prefix = join(temporary, `target-${String(index)}-certificate`)
  execFileSync('/usr/bin/codesign', ['-d', `--extract-certificates=${prefix}`, target], {
    stdio: 'pipe', timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024,
  })
  const leafPath = `${prefix}0`
  if (!existsSync(leafPath)) throw new Error(`signed target ${String(index)} has no embedded leaf certificate`)
  const certificate = new X509Certificate(readFileSync(leafPath))
  const sha256 = certificate.fingerprint256.replaceAll(':', '').toLowerCase()
  const sha1 = certificate.fingerprint.replaceAll(':', '').toLowerCase()
  if (sha256 !== receipt.certificateSha256 || sha1 !== receipt.certificateSha1
    || certificate.toLegacyObject().subject?.CN !== receipt.identityCommonName) {
    throw new Error(`signed target ${String(index)} does not use the receipt identity`)
  }
  const detail = spawnSync('/usr/bin/codesign', ['-d', '--verbose=4', target], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
  })
  if (detail.error !== undefined || detail.status !== 0) {
    throw new Error(`could not inspect signed target ${String(index)}`)
  }
  const observed = `${detail.stdout}\n${detail.stderr}`
  if (/flags=.*\bruntime\b/iu.test(observed)) {
    throw new Error(`signed target ${String(index)} unexpectedly enables hardened runtime`)
  }
  if (/^Timestamp=/mu.test(observed)) {
    throw new Error(`signed target ${String(index)} unexpectedly carries a secure timestamp`)
  }
  const entitlements = spawnSync('/usr/bin/codesign', ['-d', '--entitlements', ':-', target], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
  })
  if (entitlements.error !== undefined || entitlements.status !== 0) {
    throw new Error(`could not inspect entitlements for signed target ${String(index)}`)
  }
  if (`${entitlements.stdout}\n${entitlements.stderr}`.includes('com.apple.security.app-sandbox')) {
    throw new Error(`signed target ${String(index)} unexpectedly enables App Sandbox`)
  }
}

const temporary = mkdtempSync(join(packagingRoot, 'staging', '.verify-signer.'))
let cleaned = false
const cleanup = () => {
  if (cleaned) return
  cleaned = true
  rmSync(temporary, { recursive: true, force: true })
}
const interrupt = () => {
  cleanup()
  process.exit(130)
}
const terminate = () => {
  cleanup()
  process.exit(143)
}
process.once('SIGINT', interrupt)
process.once('SIGTERM', terminate)
try {
  const config = loadConfig()
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)
    || !exactKeys(receipt, [
      'schemaVersion', 'product', 'bundleId', 'version', 'build', 'mode',
      'identityCommonName', 'certificateSha256', 'certificateSha1', 'timestamp',
      'signedAppTreeSha256', 'signingPlanSha256', 'designatedRequirement',
      'hardenedRuntime', 'appSandbox', 'notarized',
    ])) {
    throw new Error('signing receipt has an unsupported shape')
  }
  if (receipt.schemaVersion !== 'sage.local-signing-receipt.v2'
    || receipt.product !== config.productName || receipt.bundleId !== config.bundleId
    || receipt.version !== config.version || receipt.build !== config.build
    || receipt.mode !== config.signing.mode
    || receipt.identityCommonName !== config.signing.identityCommonName
    || receipt.timestamp !== 'none'
    || receipt.hardenedRuntime !== false || receipt.appSandbox !== false || receipt.notarized !== false
    || typeof receipt.certificateSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.certificateSha256)
    || typeof receipt.certificateSha1 !== 'string' || !/^[a-f0-9]{40}$/u.test(receipt.certificateSha1)
    || typeof receipt.signedAppTreeSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.signedAppTreeSha256)
    || typeof receipt.signingPlanSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.signingPlanSha256)
    || typeof receipt.designatedRequirement !== 'string' || receipt.designatedRequirement === '') {
    throw new Error('signing receipt does not match the Sage internal signing contract')
  }
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], {
    stdio: 'pipe', timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024,
  })
  const prefix = join(temporary, 'certificate')
  execFileSync('/usr/bin/codesign', ['-d', `--extract-certificates=${prefix}`, app], {
    stdio: 'pipe', timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024,
  })
  const leafPath = `${prefix}0`
  if (!existsSync(leafPath)) throw new Error('codesign did not expose an embedded leaf certificate')
  const certificate = new X509Certificate(readFileSync(leafPath))
  const sha256 = certificate.fingerprint256.replaceAll(':', '').toLowerCase()
  const sha1 = certificate.fingerprint.replaceAll(':', '').toLowerCase()
  if (sha256 !== receipt.certificateSha256 || sha1 !== receipt.certificateSha1
    || certificate.toLegacyObject().subject?.CN !== receipt.identityCommonName) {
    throw new Error('embedded signer does not match the signing receipt')
  }
  assertLocalSelfSignedCodeSigningCertificate(certificate, receipt.identityCommonName)
  if (artifactTreeDigest(app) !== receipt.signedAppTreeSha256) {
    throw new Error('signed app tree does not match the signing receipt')
  }
  const planPath = join(temporary, 'signing-plan.tsv')
  const generator = fileURLToPath(new URL('./signing-plan.mjs', import.meta.url))
  const plan = execFileSync(process.execPath, [generator, app], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  writeFileSync(planPath, plan, { mode: 0o600 })
  if (sha256File(planPath) !== receipt.signingPlanSha256) {
    throw new Error('signed code inventory does not match the signing receipt')
  }
  const planRows = plan.trimEnd().split('\n')
  for (const [index, row] of planRows.entries()) {
    const [kind, relativePath, extra] = row.split('\t')
    if (extra !== undefined || !['mach-o', 'framework', 'helper', 'app'].includes(kind)
      || relativePath === undefined || relativePath === '') {
      throw new Error(`invalid signed code inventory row ${String(index)}`)
    }
    const target = relativePath === '.' ? app : join(app, relativePath)
    inspectSignedTarget(target, index, receipt, temporary)
  }
  if (designatedRequirement(app) !== receipt.designatedRequirement) {
    throw new Error('designated requirement does not match the signing receipt')
  }
  process.stdout.write(`[sage-packaging] signer verified: ${receipt.identityCommonName} sha256:${sha256}\n`)
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', terminate)
  cleanup()
}
