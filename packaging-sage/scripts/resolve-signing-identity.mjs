import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { assertLocalSelfSignedCodeSigningCertificate } from './certificate-policy.mjs'

const [commonName, fingerprintInput, keychainInput] = process.argv.slice(2)
const fingerprint = fingerprintInput?.replaceAll(':', '').toUpperCase()
if (commonName === undefined || fingerprint === undefined || !/^[A-F0-9]{64}$/u.test(fingerprint)) {
  process.stderr.write('usage: node resolve-signing-identity.mjs <common-name> <certificate-sha256> [keychain]\n')
  process.exit(2)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

try {
  let keychain
  if (keychainInput !== undefined) {
    const keychainStat = lstatSync(keychainInput)
    if (!keychainStat.isFile() || keychainStat.isSymbolicLink()) {
      throw new Error('explicit signing keychain must be a regular non-symlink file')
    }
    keychain = realpathSync(keychainInput)
  }
  const certificateArgs = ['find-certificate', '-a', '-c', commonName, '-p']
  if (keychain !== undefined) certificateArgs.push(keychain)
  const pem = execFileSync('/usr/bin/security', certificateArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu) ?? []
  const matches = blocks.map(block => new X509Certificate(block)).filter(certificate => {
    const subject = certificate.toLegacyObject().subject
    return subject?.CN === commonName
      && certificate.fingerprint256.replaceAll(':', '').toUpperCase() === fingerprint
  })
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${commonName} certificate with SHA-256 ${fingerprint}; observed ${String(matches.length)}`)
  }
  assertLocalSelfSignedCodeSigningCertificate(matches[0], commonName)
  const sha1 = matches[0].fingerprint.replaceAll(':', '').toUpperCase()
  const identityArgs = ['find-identity', '-v', '-p', 'codesigning']
  if (keychain !== undefined) identityArgs.push(keychain)
  const identities = execFileSync('/usr/bin/security', identityArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  const identity = new RegExp(`^\\s*\\d+\\)\\s+${sha1}\\s+"${escapeRegExp(commonName)}"\\s*$`, 'mu')
  if (!identity.test(identities)) {
    throw new Error(`certificate ${fingerprint} is not an available valid code-signing identity`)
  }
  process.stdout.write(`${sha1}\n`)
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
