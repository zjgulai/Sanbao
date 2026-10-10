import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertLocalSigningCodeSigningTrust,
  assertLocalSigningKeychainUnlisted,
  assertNoUnownedUserTrust,
  decodeIssuerCommonNames,
  findTrustEntriesByIssuerCommonName,
  initializeLocalSigningRecovery,
  markLocalSigningTrustUnknown,
  recoverLocalSigningWork,
  validateCodeSigningTrustRecord,
} from '../scripts/local-signing-recovery.mjs'
import { runBoundedCommand } from '../scripts/security-trust.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sage-local-signing-recovery-'))
  const work = join(root, '.local-signing.fixture')
  return {
    root,
    work,
    cleanup() { rmSync(root, { recursive: true, force: true }) },
  }
}

{
  const current = fixture()
  try {
    mkdirSync(current.work, { mode: 0o700 })
    initializeLocalSigningRecovery(current.work, process.pid)
    writeSensitiveFixture(current.work)
    writeFileSync(
      join(current.work, 'search-list-before.txt'),
      '/Users/example/Library/Keychains/login.keychain-db\n',
      'utf8',
    )
    const calls = []
    const result = recoverLocalSigningWork(current.work, {
      requesterPid: process.pid,
      runSecurity: fakeSecurity(current.work, { listed: true, calls }),
    })
    assert.equal(result.ok, true, result.errors.join('\n'))
    const restore = calls.find(args => args[0] === 'list-keychains' && args.includes('-s'))
    assert.deepEqual(restore, [
      'list-keychains', '-d', 'user', '-s', '/Users/example/Library/Keychains/login.keychain-db',
    ])
    process.stdout.write('PASS recovery restores the captured keychain search list\n')
  } finally {
    current.cleanup()
  }
}

{
  const current = fixture()
  try {
    mkdirSync(current.work, { mode: 0o700 })
    initializeLocalSigningRecovery(current.work, process.pid)
    writeSensitiveFixture(current.work)
    writeFileSync(join(current.work, 'search-list-before.txt'), 'not-an-absolute-path\n', 'utf8')
    const calls = []
    const result = recoverLocalSigningWork(current.work, {
      requesterPid: process.pid,
      runSecurity: fakeSecurity(current.work, { listed: true, calls }),
    })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some(error => error.includes('malformed')))
    assert.ok(!calls.some(args => args[0] === 'list-keychains' && args.includes('-s')))
    process.stdout.write('PASS a malformed captured search list is refused instead of rewritten\n')
  } finally {
    current.cleanup()
  }
}

{
  const current = fixture()
  try {
    mkdirSync(current.work, { mode: 0o700 })
    initializeLocalSigningRecovery(current.work, process.pid)
    writeSensitiveFixture(current.work)
    assert.doesNotThrow(() => assertLocalSigningKeychainUnlisted(current.work, process.pid, {
      runSecurity: fakeSecurity(current.work),
    }))
    assert.throws(
      () => assertLocalSigningKeychainUnlisted(current.work, process.pid, {
        runSecurity: fakeSecurity(current.work, { listed: true }),
      }),
      /appears in the user keychain search list/u,
    )
    process.stdout.write('PASS temporary keychain search-list drift is rejected before trust changes\n')
  } finally {
    current.cleanup()
  }
}

function fakeSecurity(work, options = {}) {
  const keychain = join(realpathSync(work), 'identity.keychain-db')
  let listed = options.listed === true
  return args => {
    options.calls?.push([...args])
    if (args[0] === 'delete-keychain' && options.deleteFails !== true && existsSync(keychain)) {
      unlinkSync(keychain)
    }
    if (args[0] === 'list-keychains') {
      // Stateful: a `-s <paths...>` rewrite moves the simulated list; later plain queries reflect
      // it, so the restore step is observable exactly like on the real system.
      if (args.includes('-s')) {
        listed = args.slice(args.indexOf('-s') + 1).includes(keychain)
      }
      return { status: 0, signal: null, stdout: listed ? `\"${keychain}\"\n` : '', stderr: '' }
    }
    return { status: options.deleteFails === true && args[0] === 'delete-keychain' ? 1 : 0, signal: null, stdout: '', stderr: '' }
  }
}

function validTrustRecord(overrides = {}) {
  const fingerprintSha1 = 'A'.repeat(40)
  return {
    entryKeys: ['issuerName', 'modDate', 'serialNumber', 'trustSettings'],
    fingerprintSha1,
    policyName: 'CodeSigning',
    policyType: 'data',
    policyValue: 'KoZIhvdjZAEQ',
    result: undefined,
    settingKeys: ['kSecTrustSettingsPolicy', 'kSecTrustSettingsPolicyName'],
    trustListKeys: [fingerprintSha1],
    trustSettingsCount: '1',
    trustVersion: '1',
    ...overrides,
  }
}

{
  const observedFingerprint = '7D1BF92A544A53B232C96EB621B8BC211702613A'
  const observedIssuer = Buffer.from(
    '30223120301E06035504030C1753616765204C6F63616C20436F6465205369676E696E67',
    'hex',
  )
  const unrelatedIssuer = Buffer.from(
    '30143112301006035504030C09556E72656C61746564',
    'hex',
  )
  const entries = [
    { fingerprintSha1: observedFingerprint, issuerDer: observedIssuer },
    { fingerprintSha1: 'B'.repeat(40), issuerDer: unrelatedIssuer },
  ]
  assert.deepEqual(decodeIssuerCommonNames(observedIssuer), ['Sage Local Code Signing'])
  assert.deepEqual(decodeIssuerCommonNames(unrelatedIssuer), ['Unrelated'])
  assert.deepEqual(
    findTrustEntriesByIssuerCommonName(entries, 'Sage Local Code Signing'),
    [observedFingerprint],
  )
  assert.throws(
    () => assertNoUnownedUserTrust('Sage Local Code Signing', {
      scan(commonName) { return findTrustEntriesByIssuerCommonName(entries, commonName) },
    }),
    error => error instanceof Error && error.message.includes(observedFingerprint),
  )
  assert.doesNotThrow(() => assertNoUnownedUserTrust('Different Reserved Name', {
    scan(commonName) { return findTrustEntriesByIssuerCommonName(entries, commonName) },
  }))
  assert.throws(
    () => decodeIssuerCommonNames(Buffer.concat([observedIssuer, Buffer.from([0])])),
    /one complete sequence/u,
  )
  process.stdout.write('PASS reserved common-name preflight strictly decodes DER and lists exact unowned SHA-1 entries\n')
}

{
  assert.equal(validateCodeSigningTrustRecord(validTrustRecord()), true)
  assert.equal(validateCodeSigningTrustRecord(validTrustRecord({
    result: '1',
    settingKeys: [
      'kSecTrustSettingsPolicy',
      'kSecTrustSettingsPolicyName',
      'kSecTrustSettingsResult',
    ],
  })), true)
  assert.equal(validateCodeSigningTrustRecord(validTrustRecord({
    policyType: 'string',
    policyValue: '1.2.840.113635.100.1.16',
  })), true)
  assert.throws(
    () => validateCodeSigningTrustRecord(validTrustRecord({ policyValue: 'KoZIhvcNAQEL' })),
    /not the Apple code-signing policy OID/u,
  )
  assert.throws(
    () => validateCodeSigningTrustRecord(validTrustRecord({ trustSettingsCount: '0' })),
    /not constrained to one policy/u,
  )
  assert.throws(
    () => validateCodeSigningTrustRecord(validTrustRecord({
      settingKeys: [
        'kSecTrustSettingsAllowedError',
        'kSecTrustSettingsPolicy',
        'kSecTrustSettingsPolicyName',
      ],
    })),
    /missing or unexpected fields/u,
  )
  assert.throws(
    () => validateCodeSigningTrustRecord(validTrustRecord({
      result: '3',
      settingKeys: [
        'kSecTrustSettingsPolicy',
        'kSecTrustSettingsPolicyName',
        'kSecTrustSettingsResult',
      ],
    })),
    /not TrustRoot/u,
  )
  process.stdout.write('PASS exact user trust record requires a single Apple code-signing TrustRoot constraint\n')
}

{
  const current = fixture()
  try {
    mkdirSync(current.work, { mode: 0o700 })
    initializeLocalSigningRecovery(current.work, process.pid)
    writeSensitiveFixture(current.work)
    markLocalSigningTrustUnknown(current.work, process.pid)
    assert.doesNotThrow(() => assertLocalSigningCodeSigningTrust(current.work, process.pid, {
      verifyTrustPresent() { return true },
    }))
    assert.equal(state(current.work), 'trust-unknown')
    assert.throws(
      () => assertLocalSigningCodeSigningTrust(current.work, process.pid, {
        verifyTrustPresent() { return false },
      }),
      /postcondition was not proven/u,
    )
    assert.equal(state(current.work), 'trust-unknown')
    process.stdout.write('PASS trust-add postcondition fails closed while recovery ownership stays trust-unknown\n')
  } finally {
    current.cleanup()
  }
}

function writeSensitiveFixture(work) {
  writeFileSync(join(work, 'certificate.pem'), 'public certificate')
  writeFileSync(join(work, 'private-key.pem'), 'private key')
  writeFileSync(join(work, 'identity.p12'), 'identity archive')
  writeFileSync(join(work, 'identity.keychain-db'), 'keychain')
}

function state(work) {
  return JSON.parse(readFileSync(join(work, 'recovery.json'), 'utf8')).state
}

{
  const current = fixture()
  try {
    mkdirSync(current.work, { mode: 0o700 })
    initializeLocalSigningRecovery(current.work, process.pid)
    writeSensitiveFixture(current.work)
    let trustCalls = 0
    const result = recoverLocalSigningWork(current.work, {
      requesterPid: process.pid,
      runSecurity: fakeSecurity(current.work),
      runTrustRemove() { trustCalls += 1; return { status: 0, signal: null } },
      verifyTrustAbsent() { throw new Error('pre-trust cleanup must not inspect trust settings') },
    })
    assert.equal(result.ok, true)
    assert.equal(trustCalls, 0)
    assert.equal(state(current.work), 'trust-removed')
    assert.equal(existsSync(join(current.work, 'private-key.pem')), false)
    assert.equal(existsSync(join(current.work, 'identity.p12')), false)
    assert.equal(existsSync(join(current.work, 'identity.keychain-db')), false)
    process.stdout.write('PASS pre-trust failure destroys all reusable signing material without a trust call\n')
  } finally {
    current.cleanup()
  }
}

{
  const current = fixture()
  try {
    mkdirSync(current.work, { mode: 0o700 })
    initializeLocalSigningRecovery(current.work, process.pid)
    writeSensitiveFixture(current.work)
    assert.throws(
      () => recoverLocalSigningWork(current.work, {
        requesterPid: process.pid + 1,
        runSecurity: fakeSecurity(current.work),
        runTrustRemove() { return { status: 0, signal: null } },
        verifyTrustAbsent() { return true },
      }),
      /still owned by live pid/u,
    )
    assert.equal(existsSync(join(current.work, 'private-key.pem')), true)
    assert.equal(existsSync(join(current.work, 'identity.keychain-db')), true)
    process.stdout.write('PASS stale-state scanning cannot reap a concurrently active wrapper\n')
  } finally {
    current.cleanup()
  }
}

{
  const signalEmitter = new EventEmitter()
  const startedAt = Date.now()
  const result = await runBoundedCommand({
    args: ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'],
    command: process.execPath,
    graceMs: 50,
    signalEmitter,
    stdio: 'ignore',
    timeoutMs: 100,
  })
  assert.equal(result.reason, 'timeout')
  assert.equal(result.exitCode, 124)
  assert.ok(Date.now() - startedAt < 2_000)
  process.stdout.write('PASS trust helper timeout has a bounded SIGTERM-to-SIGKILL escalation\n')
}

{
  const signalEmitter = new EventEmitter()
  const startedAt = Date.now()
  const resultPromise = runBoundedCommand({
    args: ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'],
    command: process.execPath,
    graceMs: 50,
    signalEmitter,
    stdio: 'ignore',
    timeoutMs: 5_000,
  })
  setTimeout(() => signalEmitter.emit('SIGTERM'), 100)
  const result = await resultPromise
  assert.equal(result.reason, 'signal')
  assert.equal(result.exitCode, 143)
  assert.ok(Date.now() - startedAt < 2_000)
  process.stdout.write('PASS forwarded termination is bounded even when the child ignores SIGTERM\n')
}

{
  const current = fixture()
  try {
    mkdirSync(current.work, { mode: 0o700 })
    initializeLocalSigningRecovery(current.work, process.pid)
    writeSensitiveFixture(current.work)
    markLocalSigningTrustUnknown(current.work, process.pid)
    const failed = recoverLocalSigningWork(current.work, {
      requesterPid: process.pid,
      runSecurity: fakeSecurity(current.work),
      runTrustRemove() { return { status: 0, signal: null } },
      verifyTrustAbsent() { return false },
    })
    assert.equal(failed.ok, false)
    assert.equal(failed.state, 'trust-unknown')
    assert.equal(existsSync(join(current.work, 'private-key.pem')), false)
    assert.equal(existsSync(join(current.work, 'identity.p12')), false)
    assert.equal(existsSync(join(current.work, 'identity.keychain-db')), false)
    assert.equal(existsSync(join(current.work, 'certificate.pem')), true)
    assert.equal(existsSync(join(current.work, 'recovery.json')), true)
    assert.deepEqual(readdirSync(current.work).sort(), ['certificate.pem', 'recovery.json'])

    const recovered = recoverLocalSigningWork(current.work, {
      requesterPid: process.pid,
      runSecurity: fakeSecurity(current.work),
      runTrustRemove() { return { status: 1, signal: null } },
      verifyTrustAbsent() { return true },
    })
    assert.equal(recovered.ok, true)
    assert.equal(recovered.state, 'trust-removed')
    process.stdout.write('PASS exact trust absence, not child exit status, closes unknown recovery state\n')
  } finally {
    current.cleanup()
  }
}

{
  const current = fixture()
  try {
    mkdirSync(current.work, { mode: 0o700 })
    initializeLocalSigningRecovery(current.work, process.pid)
    writeSensitiveFixture(current.work)
    markLocalSigningTrustUnknown(current.work, process.pid)
    const securityCalls = []
    const result = recoverLocalSigningWork(current.work, {
      requesterPid: process.pid,
      runSecurity: fakeSecurity(current.work, { calls: securityCalls, deleteFails: true }),
      runTrustRemove() { return { status: 1, signal: null } },
      verifyTrustAbsent() { return false },
    })
    assert.equal(result.ok, false)
    assert.equal(existsSync(join(current.work, 'private-key.pem')), false)
    assert.equal(existsSync(join(current.work, 'identity.p12')), false)
    assert.equal(existsSync(join(current.work, 'identity.keychain-db')), false)
    assert.equal(state(current.work), 'trust-unknown')
    assert.deepEqual(readdirSync(current.work).sort(), ['certificate.pem', 'recovery.json'])
    assert.deepEqual(securityCalls.map(args => args[0]), [
      'lock-keychain',
      'delete-keychain',
      'list-keychains',
      'list-keychains',
    ])
    process.stdout.write('PASS keychain command failure still unlinks private material and retains public recovery state\n')
  } finally {
    current.cleanup()
  }
}
