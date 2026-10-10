import { spawnSync } from 'node:child_process'
import { randomBytes, X509Certificate } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA = 'sage.local-signing-recovery.v1'
const JOURNAL_NAME = 'recovery.json'
const CERTIFICATE_NAME = 'certificate.pem'
const PRIVATE_KEY_NAME = 'private-key.pem'
const IDENTITY_ARCHIVE_NAME = 'identity.p12'
const KEYCHAIN_NAME = 'identity.keychain-db'
/** Written by sign-local.sh inside the signing window; bare absolute keychain paths, one per line. */
const SEARCH_LIST_CAPTURE_NAME = 'search-list-before.txt'
const STATES = new Set(['pre-trust', 'trust-unknown', 'trust-removed'])
const COMMAND_ENV = { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }

process.umask(0o077)

function strictWorkDirectory(workInput) {
  const stat = lstatSync(workInput)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('local-signing recovery root must be a real directory')
  }
  const work = realpathSync(workInput)
  if (!basename(work).startsWith('.local-signing.')) {
    throw new Error('local-signing recovery root has an unexpected name')
  }
  return work
}

function journalPath(work) {
  return join(work, JOURNAL_NAME)
}

function durableWriteJson(path, value) {
  const temporary = `${path}.tmp-${String(process.pid)}`
  let descriptor
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, path)
    chmodSync(path, 0o600)
    const directoryDescriptor = openSync(dirname(path), 'r')
    try {
      fsyncSync(directoryDescriptor)
    } finally {
      closeSync(directoryDescriptor)
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
  }
}

function exactJournal(work) {
  const path = journalPath(work)
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('local-signing recovery journal must be a regular non-symlink file')
  }
  const value = JSON.parse(readFileSync(path, 'utf8'))
  const keys = Object.keys(value).sort()
  const expectedKeys = ['certificate', 'keychain', 'ownerPid', 'schema', 'state']
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)
    || value.schema !== SCHEMA
    || !STATES.has(value.state)
    || !Number.isSafeInteger(value.ownerPid)
    || value.ownerPid <= 0
    || value.certificate !== CERTIFICATE_NAME
    || value.keychain !== KEYCHAIN_NAME) {
    throw new Error('local-signing recovery journal is malformed')
  }
  return value
}

function writeJournal(work, journal, state) {
  durableWriteJson(journalPath(work), { ...journal, state })
}

function assertOwner(journal, ownerPid) {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0 || journal.ownerPid !== ownerPid) {
    throw new Error('local-signing recovery owner does not match the active wrapper')
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    if (error?.code === 'EPERM') return true
    throw error
  }
}

function removeRegularOrSymlink(path, errors) {
  if (!existsSync(path)) return
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      throw new Error('refusing to recursively remove an unexpected sensitive path')
    }
    unlinkSync(path)
  } catch (error) {
    errors.push(`${basename(path)}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function commandResult(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: COMMAND_ENV,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    stdio: options.inherit === true ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout ?? 30_000,
  })
  return {
    error: result.error?.message,
    signal: result.signal,
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

function defaultTrustRemove(certificate) {
  const helper = join(dirname(fileURLToPath(import.meta.url)), 'security-trust.mjs')
  return commandResult(process.execPath, [helper, 'remove', certificate], {
    inherit: true,
    timeout: 190_000,
  })
}

function defaultSecurity(args) {
  return commandResult('/usr/bin/security', args)
}

function certificateFingerprintSha1(certificate) {
  const certificateObject = new X509Certificate(readFileSync(certificate))
  return certificateObject.fingerprint.replaceAll(':', '').toUpperCase()
}

function withUserTrustSettingsExport(directory, postcondition, inspect) {
  const exportPath = join(directory, `.trust-settings-${randomBytes(12).toString('hex')}.plist`)
  try {
    const exported = commandResult('/usr/bin/security', ['trust-settings-export', exportPath])
    if (!commandSucceeded(exported)) {
      throw new Error(`could not export user trust settings for the ${postcondition} postcondition`)
    }
    const exportStat = lstatSync(exportPath)
    if (!exportStat.isFile() || exportStat.isSymbolicLink()) {
      throw new Error(`user trust settings export is unsafe for the ${postcondition} postcondition`)
    }
    chmodSync(exportPath, 0o600)
    return inspect(exportPath)
  } finally {
    rmSync(exportPath, { force: true })
  }
}

function withUserTrustSettings(certificate, postcondition, inspect) {
  const fingerprintSha1 = certificateFingerprintSha1(certificate)
  return withUserTrustSettingsExport(
    dirname(certificate),
    postcondition,
    exportPath => inspect(exportPath, fingerprintSha1),
  )
}

function plistRaw(path, keyPath, expectedType, postcondition) {
  const extracted = commandResult('/usr/bin/plutil', [
    '-extract',
    keyPath,
    'raw',
    '-expect',
    expectedType,
    '-o',
    '-',
    path,
  ])
  if (!commandSucceeded(extracted)) {
    throw new Error(`user trust settings ${keyPath} is missing or malformed for the ${postcondition} postcondition`)
  }
  return extracted.stdout.trim()
}

function plistType(path, keyPath, postcondition) {
  const extracted = commandResult('/usr/bin/plutil', ['-type', keyPath, path])
  if (!commandSucceeded(extracted)) {
    throw new Error(`user trust settings ${keyPath} type cannot be read for the ${postcondition} postcondition`)
  }
  return extracted.stdout.trim()
}

function rawKeys(value) {
  return value.split(/\r?\n/gu).map(key => key.trim()).filter(Boolean)
}

function sameKeys(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
}

function readDerElement(bytes, offset, limit) {
  if (offset >= limit) throw new Error('issuer DER is truncated')
  const tag = bytes[offset]
  if ((tag & 0x1f) === 0x1f) throw new Error('issuer DER uses an unsupported high-tag form')
  let cursor = offset + 1
  if (cursor >= limit) throw new Error('issuer DER length is truncated')
  const firstLength = bytes[cursor]
  cursor += 1
  let length
  if (firstLength < 0x80) {
    length = firstLength
  } else {
    const octets = firstLength & 0x7f
    if (octets === 0 || octets > 4 || cursor + octets > limit) {
      throw new Error('issuer DER has an invalid length')
    }
    if (bytes[cursor] === 0) throw new Error('issuer DER length is not minimally encoded')
    length = 0
    for (let index = 0; index < octets; index += 1) {
      length = (length * 256) + bytes[cursor + index]
    }
    cursor += octets
    if (length < 0x80) throw new Error('issuer DER length uses a non-minimal long form')
  }
  const end = cursor + length
  if (!Number.isSafeInteger(end) || end > limit) throw new Error('issuer DER value is truncated')
  return { contentStart: cursor, end, next: end, tag }
}

function decodeDerOid(bytes, element) {
  if (element.tag !== 0x06 || element.contentStart === element.end) {
    throw new Error('issuer DER attribute has an invalid OID')
  }
  const subidentifiers = []
  let cursor = element.contentStart
  while (cursor < element.end) {
    let value = 0n
    let firstOctet = true
    let complete = false
    while (cursor < element.end) {
      const octet = bytes[cursor]
      cursor += 1
      if (firstOctet && octet === 0x80) throw new Error('issuer DER OID is not minimally encoded')
      firstOctet = false
      value = (value << 7n) | BigInt(octet & 0x7f)
      if ((octet & 0x80) === 0) {
        complete = true
        break
      }
    }
    if (!complete) throw new Error('issuer DER OID is truncated')
    subidentifiers.push(value)
  }
  const first = subidentifiers.shift()
  const arcs = first < 40n
    ? ['0', first.toString()]
    : first < 80n
      ? ['1', (first - 40n).toString()]
      : ['2', (first - 80n).toString()]
  arcs.push(...subidentifiers.map(value => value.toString()))
  return arcs.join('.')
}

function decodeDirectoryString(bytes, element) {
  const value = bytes.subarray(element.contentStart, element.end)
  if (element.tag === 0x0c) {
    return new TextDecoder('utf-8', { fatal: true }).decode(value)
  }
  if (element.tag === 0x13) {
    const decoded = Buffer.from(value).toString('ascii')
    if (!/^[A-Za-z0-9 '()+,\-./:=?]*$/u.test(decoded)) {
      throw new Error('issuer DER PrintableString contains an invalid character')
    }
    return decoded
  }
  if (element.tag === 0x1e) {
    if (value.length % 2 !== 0) throw new Error('issuer DER BMPString has an invalid length')
    return new TextDecoder('utf-16be', { fatal: true }).decode(value)
  }
  if (element.tag === 0x1c) {
    if (value.length % 4 !== 0) throw new Error('issuer DER UniversalString has an invalid length')
    let decoded = ''
    for (let offset = 0; offset < value.length; offset += 4) {
      const codePoint = (value[offset] * 0x1000000)
        + (value[offset + 1] * 0x10000)
        + (value[offset + 2] * 0x100)
        + value[offset + 3]
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        throw new Error('issuer DER UniversalString contains an invalid code point')
      }
      decoded += String.fromCodePoint(codePoint)
    }
    return decoded
  }
  throw new Error('issuer DER commonName uses an unsupported string type')
}

export function decodeIssuerCommonNames(issuerDer) {
  const bytes = Buffer.from(issuerDer)
  const name = readDerElement(bytes, 0, bytes.length)
  if (name.tag !== 0x30 || name.next !== bytes.length) {
    throw new Error('issuer DER Name must be one complete sequence')
  }
  const commonNames = []
  let rdnOffset = name.contentStart
  while (rdnOffset < name.end) {
    const rdn = readDerElement(bytes, rdnOffset, name.end)
    if (rdn.tag !== 0x31 || rdn.contentStart === rdn.end) {
      throw new Error('issuer DER RDN must be a non-empty set')
    }
    let attributeOffset = rdn.contentStart
    while (attributeOffset < rdn.end) {
      const attribute = readDerElement(bytes, attributeOffset, rdn.end)
      if (attribute.tag !== 0x30) throw new Error('issuer DER attribute must be a sequence')
      const oid = readDerElement(bytes, attribute.contentStart, attribute.end)
      const oidValue = decodeDerOid(bytes, oid)
      const value = readDerElement(bytes, oid.next, attribute.end)
      if (value.next !== attribute.end) throw new Error('issuer DER attribute has trailing values')
      if (oidValue === '2.5.4.3') commonNames.push(decodeDirectoryString(bytes, value))
      attributeOffset = attribute.next
    }
    if (attributeOffset !== rdn.end) throw new Error('issuer DER RDN is malformed')
    rdnOffset = rdn.next
  }
  if (rdnOffset !== name.end) throw new Error('issuer DER Name is malformed')
  return commonNames
}

function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error('issuerName is not canonical base64')
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64') !== value) throw new Error('issuerName is not canonical base64')
  return decoded
}

export function findTrustEntriesByIssuerCommonName(entries, reservedCommonName) {
  if (typeof reservedCommonName !== 'string' || reservedCommonName.length === 0) {
    throw new Error('reserved signing common name must be non-empty')
  }
  const matches = []
  for (const entry of entries) {
    if (!/^[A-F0-9]{40}$/u.test(entry.fingerprintSha1)) {
      throw new Error('user trust settings contains a malformed certificate SHA-1 key')
    }
    const commonNames = decodeIssuerCommonNames(entry.issuerDer)
    if (commonNames.includes(reservedCommonName)) matches.push(entry.fingerprintSha1)
  }
  return matches.sort()
}

function scanUserTrustEntriesByIssuerCommonName(reservedCommonName) {
  const exportRoot = mkdtempSync(join(tmpdir(), 'sage-user-trust-preflight-'))
  try {
    return withUserTrustSettingsExport(exportRoot, 'reserved-name preflight', exportPath => {
      const trustVersion = plistRaw(exportPath, 'trustVersion', 'integer', 'reserved-name preflight')
      if (trustVersion !== '1') throw new Error('user trust settings version is not 1 for reserved-name preflight')
      const fingerprints = rawKeys(plistRaw(
        exportPath,
        'trustList',
        'dictionary',
        'reserved-name preflight',
      ))
      const entries = fingerprints.map(fingerprintSha1 => ({
        fingerprintSha1,
        issuerDer: decodeCanonicalBase64(plistRaw(
          exportPath,
          `trustList.${fingerprintSha1}.issuerName`,
          'data',
          'reserved-name preflight',
        )),
      }))
      return findTrustEntriesByIssuerCommonName(entries, reservedCommonName)
    })
  } finally {
    rmSync(exportRoot, { force: true, recursive: true })
  }
}

export function assertNoUnownedUserTrust(reservedCommonName, options = {}) {
  const scan = options.scan ?? scanUserTrustEntriesByIssuerCommonName
  const fingerprints = scan(reservedCommonName)
  if (!Array.isArray(fingerprints) || fingerprints.some(value => !/^[A-F0-9]{40}$/u.test(value))) {
    throw new Error('reserved-name trust preflight returned malformed evidence')
  }
  if (fingerprints.length !== 0) {
    throw new Error(
      `unowned user trust for reserved common name ${JSON.stringify(reservedCommonName)}: ${fingerprints.join(', ')}`,
    )
  }
}

export function validateCodeSigningTrustRecord(record) {
  if (record.trustVersion !== '1') {
    throw new Error('user trust settings version is not 1')
  }
  if (!/^[A-F0-9]{40}$/u.test(record.fingerprintSha1)
    || !record.trustListKeys.includes(record.fingerprintSha1)) {
    throw new Error('exact certificate SHA-1 is absent from user trust settings')
  }
  if (!sameKeys(record.entryKeys, ['issuerName', 'modDate', 'serialNumber', 'trustSettings'])) {
    throw new Error('exact certificate trust entry has an unexpected shape')
  }
  if (record.trustSettingsCount !== '1') {
    throw new Error('exact certificate trust entry is not constrained to one policy')
  }
  const allowedSettingKeys = record.result === undefined
    ? ['kSecTrustSettingsPolicy', 'kSecTrustSettingsPolicyName']
    : ['kSecTrustSettingsPolicy', 'kSecTrustSettingsPolicyName', 'kSecTrustSettingsResult']
  if (!sameKeys(record.settingKeys, allowedSettingKeys)) {
    throw new Error('code-signing trust constraint has missing or unexpected fields')
  }
  if (record.policyName !== 'CodeSigning') {
    throw new Error('trust constraint is not named CodeSigning')
  }
  const policyMatches = (record.policyType === 'data' && record.policyValue === 'KoZIhvdjZAEQ')
    || (record.policyType === 'string' && record.policyValue === '1.2.840.113635.100.1.16')
  if (!policyMatches) {
    throw new Error('trust constraint is not the Apple code-signing policy OID')
  }
  if (record.result !== undefined && record.result !== '1') {
    throw new Error('code-signing trust constraint is not TrustRoot')
  }
  return true
}

export function verifyUserCodeSigningTrustPresent(certificate) {
  return withUserTrustSettings(certificate, 'addition', (exportPath, fingerprintSha1) => {
    const trustVersion = plistRaw(exportPath, 'trustVersion', 'integer', 'addition')
    const trustListKeys = rawKeys(plistRaw(exportPath, 'trustList', 'dictionary', 'addition'))
    const entryPath = `trustList.${fingerprintSha1}`
    const entryKeys = rawKeys(plistRaw(exportPath, entryPath, 'dictionary', 'addition'))
    plistRaw(exportPath, `${entryPath}.issuerName`, 'data', 'addition')
    plistRaw(exportPath, `${entryPath}.modDate`, 'date', 'addition')
    plistRaw(exportPath, `${entryPath}.serialNumber`, 'data', 'addition')
    const trustSettingsPath = `${entryPath}.trustSettings`
    const trustSettingsCount = plistRaw(exportPath, trustSettingsPath, 'array', 'addition')
    const settingPath = `${trustSettingsPath}.0`
    const settingKeys = rawKeys(plistRaw(exportPath, settingPath, 'dictionary', 'addition'))
    const policyName = plistRaw(
      exportPath,
      `${settingPath}.kSecTrustSettingsPolicyName`,
      'string',
      'addition',
    )
    const policyPath = `${settingPath}.kSecTrustSettingsPolicy`
    const policyType = plistType(exportPath, policyPath, 'addition')
    if (policyType !== 'data' && policyType !== 'string') {
      throw new Error('code-signing trust policy has an unexpected type')
    }
    const policyValue = plistRaw(exportPath, policyPath, policyType, 'addition')
    const result = settingKeys.includes('kSecTrustSettingsResult')
      ? plistRaw(exportPath, `${settingPath}.kSecTrustSettingsResult`, 'integer', 'addition')
      : undefined
    return validateCodeSigningTrustRecord({
      entryKeys,
      fingerprintSha1,
      policyName,
      policyType,
      policyValue,
      result,
      settingKeys,
      trustListKeys,
      trustSettingsCount,
      trustVersion,
    })
  })
}

export function verifyUserTrustAbsent(certificate) {
  return withUserTrustSettings(certificate, 'removal', (exportPath, fingerprintSha1) => {
    const trustVersion = plistRaw(exportPath, 'trustVersion', 'integer', 'removal')
    if (trustVersion !== '1') {
      throw new Error('user trust settings version is not 1 for the removal postcondition')
    }
    const trustListKeys = rawKeys(plistRaw(exportPath, 'trustList', 'dictionary', 'removal'))
    return !trustListKeys.includes(fingerprintSha1)
  })
}

function commandSucceeded(result) {
  return result?.status === 0 && result.error === undefined && result.signal === null
}

function listedKeychains(output) {
  return output.split(/\r?\n/gu)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.startsWith('"') && line.endsWith('"') ? line.slice(1, -1) : line)
    .map(path => resolve(path))
}

function verifyKeychainUnlisted(keychain, runSecurity, errors) {
  for (const domain of ['user', 'dynamic']) {
    const listing = runSecurity(['list-keychains', '-d', domain])
    if (!commandSucceeded(listing)) {
      errors.push(`${KEYCHAIN_NAME}: could not verify the ${domain} keychain search list`)
      continue
    }
    if (listedKeychains(listing.stdout).includes(resolve(keychain))) {
      errors.push(`${KEYCHAIN_NAME}: appears in the ${domain} keychain search list`)
    }
  }
}

function restoreUserSearchList(work, runSecurity, errors) {
  const capturePath = join(work, SEARCH_LIST_CAPTURE_NAME)
  if (!existsSync(capturePath)) {
    // No signing window was opened: nothing was added to the search list.
    return
  }
  let lines
  try {
    lines = readFileSync(capturePath, 'utf8').split('\n')
  } catch (error) {
    errors.push(`could not read the captured user keychain search list: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const paths = lines.filter(line => line !== '')
  if (paths.length === 0 || paths.some(path => !path.startsWith('/') || path.includes('\u0000'))) {
    errors.push('captured user keychain search list is malformed; refusing to rewrite it')
    return
  }
  const restore = runSecurity(['list-keychains', '-d', 'user', '-s', ...paths])
  if (!commandSucceeded(restore)) {
    errors.push(`could not restore the user keychain search list (${paths.length} entries)`)
  }
}

function destroyKeychain(keychain, runSecurity, errors) {
  const existed = existsSync(keychain)
  if (existed) {
    runSecurity(['lock-keychain', keychain])
    const deletion = runSecurity(['delete-keychain', keychain])
    if (!commandSucceeded(deletion) && existsSync(keychain)) {
      removeRegularOrSymlink(keychain, errors)
    }
  }

  if (existsSync(keychain)) {
    errors.push(`${KEYCHAIN_NAME}: temporary keychain still exists after cleanup`)
  }

  verifyKeychainUnlisted(keychain, runSecurity, errors)
}

export function initializeLocalSigningRecovery(workInput, ownerPid) {
  const work = strictWorkDirectory(workInput)
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) {
    throw new Error('local-signing recovery owner pid must be a positive integer')
  }
  const path = journalPath(work)
  if (existsSync(path)) throw new Error('local-signing recovery journal already exists')
  durableWriteJson(path, {
    schema: SCHEMA,
    state: 'pre-trust',
    ownerPid,
    certificate: CERTIFICATE_NAME,
    keychain: KEYCHAIN_NAME,
  })
}

export function markLocalSigningTrustUnknown(workInput, ownerPid) {
  const work = strictWorkDirectory(workInput)
  const journal = exactJournal(work)
  assertOwner(journal, ownerPid)
  if (journal.state !== 'pre-trust') {
    throw new Error(`cannot enter trust-unknown from ${journal.state}`)
  }
  const certificate = join(work, CERTIFICATE_NAME)
  const certificateStat = lstatSync(certificate)
  if (!certificateStat.isFile() || certificateStat.isSymbolicLink()) {
    throw new Error('public recovery certificate must be a regular non-symlink file')
  }
  const certificateDescriptor = openSync(certificate, 'r')
  try {
    fsyncSync(certificateDescriptor)
  } finally {
    closeSync(certificateDescriptor)
  }
  writeJournal(work, journal, 'trust-unknown')
}

export function assertLocalSigningKeychainUnlisted(workInput, ownerPid, options = {}) {
  const work = strictWorkDirectory(workInput)
  const journal = exactJournal(work)
  assertOwner(journal, ownerPid)
  const errors = []
  verifyKeychainUnlisted(join(work, KEYCHAIN_NAME), options.runSecurity ?? defaultSecurity, errors)
  if (errors.length !== 0) throw new Error(errors.join('; '))
}

export function assertLocalSigningCodeSigningTrust(workInput, ownerPid, options = {}) {
  const work = strictWorkDirectory(workInput)
  const journal = exactJournal(work)
  assertOwner(journal, ownerPid)
  if (journal.state !== 'trust-unknown') {
    throw new Error(`cannot verify code-signing trust from ${journal.state}`)
  }
  const certificate = join(work, CERTIFICATE_NAME)
  const certificateStat = lstatSync(certificate)
  if (!certificateStat.isFile() || certificateStat.isSymbolicLink()) {
    throw new Error('public recovery certificate must be a regular non-symlink file')
  }
  const verifyTrustPresent = options.verifyTrustPresent ?? verifyUserCodeSigningTrustPresent
  if (verifyTrustPresent(certificate) !== true) {
    throw new Error('exact user code-signing trust postcondition was not proven')
  }
}

export function recoverLocalSigningWork(workInput, options = {}) {
  const work = strictWorkDirectory(workInput)
  const journal = exactJournal(work)
  const requesterPid = options.requesterPid
  if (journal.ownerPid !== requesterPid && processIsAlive(journal.ownerPid)) {
    throw new Error(`local-signing recovery root is still owned by live pid ${String(journal.ownerPid)}`)
  }

  const runTrustRemove = options.runTrustRemove ?? defaultTrustRemove
  const runSecurity = options.runSecurity ?? defaultSecurity
  const verifyTrustAbsent = options.verifyTrustAbsent ?? verifyUserTrustAbsent
  const errors = []
  const privateKey = join(work, PRIVATE_KEY_NAME)
  const identityArchive = join(work, IDENTITY_ARCHIVE_NAME)
  const keychain = join(work, KEYCHAIN_NAME)
  const certificate = join(work, CERTIFICATE_NAME)

  // Restore the user keychain search list FIRST: codesign(1) requires the identity's keychain to
  // be on that list, so sign-local.sh adds the ephemeral keychain for the signing window only and
  // captures the exact prior list here. Without this step a crash inside the window would leave a
  // dangling entry (and destroyKeychain's unlisted postcondition would fail).
  restoreUserSearchList(work, runSecurity, errors)

  // Destroy reusable signing capability before any potentially interactive trust operation.
  removeRegularOrSymlink(privateKey, errors)
  removeRegularOrSymlink(identityArchive, errors)
  destroyKeychain(keychain, runSecurity, errors)

  let state = journal.state
  if (state === 'trust-unknown') {
    try {
      const certificateStat = lstatSync(certificate)
      if (!certificateStat.isFile() || certificateStat.isSymbolicLink()) {
        throw new Error('public recovery certificate is missing or unsafe')
      }
      const removal = runTrustRemove(certificate)
      const trustAbsent = verifyTrustAbsent(certificate)
      if (trustAbsent === true) {
        writeJournal(work, journal, 'trust-removed')
        state = 'trust-removed'
      } else {
        const removalResult = commandSucceeded(removal) ? 'reported success' : 'reported failure'
        errors.push(`temporary code-signing trust remains present after removal ${removalResult}`)
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  } else if (state === 'pre-trust' && errors.length === 0) {
    writeJournal(work, journal, 'trust-removed')
    state = 'trust-removed'
  }

  return {
    errors,
    ok: state === 'trust-removed' && errors.length === 0,
    state,
    work,
  }
}

function parsePositivePid(input) {
  const value = Number.parseInt(input, 10)
  if (!Number.isSafeInteger(value) || value <= 0 || String(value) !== input) {
    throw new Error('pid must be a positive base-10 integer')
  }
  return value
}

function usage() {
  process.stderr.write('usage: node local-signing-recovery.mjs assert-no-unowned-trust <reserved-common-name> | init <work> <owner-pid> | assert-keychain-unlisted <work> <owner-pid> | mark-trust-unknown <work> <owner-pid> | assert-code-signing-trust <work> <owner-pid> | recover <work>\n')
}

function main() {
  const [operation, work, pidInput, ...extra] = process.argv.slice(2)
  if (operation === 'assert-no-unowned-trust' && work !== undefined
    && pidInput === undefined && extra.length === 0) {
    assertNoUnownedUserTrust(work)
    return
  }
  if (operation === undefined || work === undefined) {
    usage()
    process.exitCode = 2
    return
  }
  if (operation === 'init' && pidInput !== undefined && extra.length === 0) {
    const pid = parsePositivePid(pidInput)
    initializeLocalSigningRecovery(work, pid)
    return
  }
  if (operation === 'mark-trust-unknown' && pidInput !== undefined && extra.length === 0) {
    const pid = parsePositivePid(pidInput)
    markLocalSigningTrustUnknown(work, pid)
    return
  }
  if (operation === 'assert-keychain-unlisted' && pidInput !== undefined && extra.length === 0) {
    const pid = parsePositivePid(pidInput)
    assertLocalSigningKeychainUnlisted(work, pid)
    return
  }
  if (operation === 'assert-code-signing-trust' && pidInput !== undefined && extra.length === 0) {
    const pid = parsePositivePid(pidInput)
    assertLocalSigningCodeSigningTrust(work, pid)
    return
  }
  if (operation === 'recover' && pidInput === undefined && extra.length === 0) {
    const result = recoverLocalSigningWork(work, { requesterPid: process.ppid })
    if (!result.ok) {
      for (const error of result.errors) process.stderr.write(`[sage-packaging] ${error}\n`)
      process.stderr.write(`[sage-packaging] public recovery material retained at ${result.work}\n`)
      process.stderr.write(`[sage-packaging] RECOVERY: node ${fileURLToPath(import.meta.url)} recover ${result.work}\n`)
      process.exitCode = 1
    }
    return
  }
  usage()
  process.exitCode = 2
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
