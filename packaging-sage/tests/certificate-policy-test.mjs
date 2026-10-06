import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { assertLocalSelfSignedCodeSigningCertificate } from '../scripts/certificate-policy.mjs'
import { packagingRoot } from '../scripts/lib.mjs'

const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporary = mkdtempSync(join(stagingRoot, '.certificate-policy-test.'))

function generate(name, extendedKeyUsage) {
  const key = join(temporary, `${name}.key.pem`)
  const certificate = join(temporary, `${name}.certificate.pem`)
  execFileSync('/usr/bin/openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes',
    '-subj', '/CN=Sage Local Code Signing',
    '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'keyUsage=critical,digitalSignature',
    '-addext', `extendedKeyUsage=critical,${extendedKeyUsage}`,
    '-keyout', key,
    '-out', certificate,
  ], { stdio: 'ignore' })
  return new X509Certificate(readFileSync(certificate))
}

try {
  const exact = generate('exact', 'codeSigning')
  assert.doesNotThrow(() => assertLocalSelfSignedCodeSigningCertificate(exact, 'Sage Local Code Signing'))
  const extraUsage = generate('extra-usage', 'codeSigning,serverAuth')
  assert.throws(
    () => assertLocalSelfSignedCodeSigningCertificate(extraUsage, 'Sage Local Code Signing'),
    /extended key usage must be exactly code signing/u,
  )
  process.stdout.write('local self-signed certificate policy: PASS\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
