import { spawnSync } from 'node:child_process'

const CODE_SIGNING_OID = '1.3.6.1.5.5.7.3.3'

function exactCriticalExtension(text, name, expected) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const matches = [...text.matchAll(new RegExp(`X509v3 ${escaped}: critical\\r?\\n\\s+([^\\r\\n]+)`, 'gu'))]
  if (matches.length !== 1 || matches[0][1].trim() !== expected) {
    throw new Error(`${name} must be one critical ${expected} extension`)
  }
}

export function assertLocalSelfSignedCodeSigningCertificate(certificate, expectedCommonName) {
  const now = Date.now()
  if (certificate.toLegacyObject().subject?.CN !== expectedCommonName) {
    throw new Error('certificate common name does not match the Sage signing identity')
  }
  if (certificate.subject !== certificate.issuer || !certificate.verify(certificate.publicKey)) {
    throw new Error('certificate is not cryptographically self-signed')
  }
  if (certificate.ca) throw new Error('code-signing certificate must not be a CA certificate')
  if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now) {
    throw new Error('code-signing certificate is not currently valid')
  }
  if (certificate.keyUsage.length !== 1 || certificate.keyUsage[0] !== CODE_SIGNING_OID) {
    throw new Error('certificate extended key usage must be exactly code signing')
  }
  const result = spawnSync('/usr/bin/openssl', ['x509', '-inform', 'DER', '-noout', '-text'], {
    input: certificate.raw,
    encoding: 'utf8',
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000,
    killSignal: 'SIGKILL',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`could not inspect certificate extensions: ${result.error?.message ?? result.stderr.trim()}`)
  }
  exactCriticalExtension(result.stdout, 'Basic Constraints', 'CA:FALSE')
  exactCriticalExtension(result.stdout, 'Key Usage', 'Digital Signature')
  exactCriticalExtension(result.stdout, 'Extended Key Usage', 'Code Signing')
}
