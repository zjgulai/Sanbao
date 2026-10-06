import { X509Certificate } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadConfig, safeOutputPath, packagingRoot, sha256File } from './lib.mjs'
import { artifactTreeDigest, designatedRequirement } from './signing-evidence.mjs'
import { assertLocalSelfSignedCodeSigningCertificate } from './certificate-policy.mjs'

const [app, certificatePath, fingerprintInput, signingPlanPath, output] = process.argv.slice(2)
const fingerprint = fingerprintInput?.replaceAll(':', '').toLowerCase()
if (app === undefined || certificatePath === undefined || signingPlanPath === undefined || output === undefined
  || fingerprint === undefined || !/^[a-f0-9]{64}$/u.test(fingerprint)) {
  process.stderr.write('usage: node write-signing-receipt.mjs <Sage.app> <leaf-certificate> <certificate-sha256> <signing-plan.tsv> <output>\n')
  process.exit(2)
}

try {
  const config = loadConfig()
  if (!lstatSync(app).isDirectory()) throw new Error('signing receipt app must be a directory')
  const certificate = new X509Certificate(readFileSync(certificatePath))
  const certificateSha256 = certificate.fingerprint256.replaceAll(':', '').toLowerCase()
  const certificateSha1 = certificate.fingerprint.replaceAll(':', '').toLowerCase()
  if (certificateSha256 !== fingerprint) throw new Error('embedded leaf certificate does not match the selected SHA-256 fingerprint')
  assertLocalSelfSignedCodeSigningCertificate(certificate, config.signing.identityCommonName)
  const resolvedOutput = safeOutputPath(output, [`${packagingRoot}/staging`, `${packagingRoot}/release`])
  const planEntry = lstatSync(signingPlanPath)
  if (!planEntry.isFile() || planEntry.isSymbolicLink()) throw new Error('signing plan must be a regular file')
  const receipt = {
    schemaVersion: 'sage.local-signing-receipt.v2',
    product: config.productName,
    bundleId: config.bundleId,
    version: config.version,
    build: config.build,
    mode: config.signing.mode,
    identityCommonName: config.signing.identityCommonName,
    certificateSha256,
    certificateSha1,
    signedAppTreeSha256: artifactTreeDigest(app),
    signingPlanSha256: sha256File(signingPlanPath),
    designatedRequirement: designatedRequirement(app),
    timestamp: 'none',
    hardenedRuntime: config.signing.hardenedRuntime,
    appSandbox: config.signing.appSandbox,
    notarized: config.signing.notarized,
  }
  mkdirSync(dirname(resolvedOutput), { recursive: true })
  const temporary = `${resolvedOutput}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, resolvedOutput)
  process.stdout.write(`signing receipt: ${resolvedOutput}\n`)
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
