import { X509Certificate } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { assertLocalSelfSignedCodeSigningCertificate } from './certificate-policy.mjs'

const [certificatePath, commonName] = process.argv.slice(2)
if (certificatePath === undefined || commonName === undefined) {
  process.stderr.write('usage: node signing-certificate-fingerprint.mjs <certificate> <common-name>\n')
  process.exit(2)
}

try {
  const stat = lstatSync(certificatePath)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('certificate must be a regular non-symlink file')
  }
  const certificate = new X509Certificate(readFileSync(certificatePath))
  assertLocalSelfSignedCodeSigningCertificate(certificate, commonName)
  process.stdout.write(`${certificate.fingerprint256.replaceAll(':', '').toUpperCase()}\n`)
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
