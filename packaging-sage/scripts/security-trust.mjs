import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TRUST_TIMEOUT_MS = 180_000
const SIGNAL_GRACE_MS = 2_000
const COMMAND_ENV = { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }
const FORWARDED_SIGNALS = new Map([['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]])

export function runBoundedCommand(options) {
  const {
    args,
    command,
    env = COMMAND_ENV,
    graceMs = SIGNAL_GRACE_MS,
    signalEmitter = process,
    stdio = 'inherit',
    timeoutMs = TRUST_TIMEOUT_MS,
  } = options

  return new Promise(resolveResult => {
    const child = spawn(command, args, { env, stdio })
    const signalHandlers = new Map()
    let escalation
    let finished = false
    let stopReason
    let timeout

    function clearLifecycle() {
      clearTimeout(timeout)
      if (escalation !== undefined) clearTimeout(escalation)
      for (const [signal, handler] of signalHandlers) signalEmitter.off(signal, handler)
    }

    function finish(result) {
      if (finished) return
      finished = true
      clearLifecycle()
      resolveResult(result)
    }

    function requestStop(reason, signal, exitCode) {
      if (stopReason !== undefined || finished) return
      stopReason = { reason, signal, exitCode }
      clearTimeout(timeout)
      child.kill(signal)
      escalation = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, graceMs)
    }

    timeout = setTimeout(() => requestStop('timeout', 'SIGTERM', 124), timeoutMs)
    for (const [signal, exitCode] of FORWARDED_SIGNALS) {
      const handler = () => requestStop('signal', signal, exitCode)
      signalHandlers.set(signal, handler)
      signalEmitter.on(signal, handler)
    }

    child.once('error', error => {
      finish({ error, exitCode: 1, reason: 'error', signal: null })
    })

    child.once('exit', (code, signal) => {
      if (stopReason !== undefined) {
        finish({
          exitCode: stopReason.exitCode,
          reason: stopReason.reason,
          requestedSignal: stopReason.signal,
          signal,
        })
        return
      }
      if (signal !== null) {
        finish({ exitCode: 1, reason: 'child-signal', signal })
        return
      }
      finish({ exitCode: code ?? 1, reason: 'exit', signal: null })
    })
  })
}

function trustArguments(argv) {
  const [operation, certificate, keychain, ...extra] = argv
  if (extra.length !== 0) return undefined
  if (operation === 'add' && certificate !== undefined && keychain !== undefined) {
    return ['add-trusted-cert', '-r', 'trustRoot', '-p', 'codeSign', '-k', keychain, certificate]
  }
  if (operation === 'remove' && certificate !== undefined && keychain === undefined) {
    return ['remove-trusted-cert', certificate]
  }
  return undefined
}

async function main() {
  const args = trustArguments(process.argv.slice(2))
  if (args === undefined) {
    process.stderr.write('usage: node security-trust.mjs add <certificate> <keychain> | remove <certificate>\n')
    process.exitCode = 2
    return
  }

  const result = await runBoundedCommand({
    args,
    command: '/usr/bin/security',
  })
  if (result.reason === 'error') {
    process.stderr.write(`[sage-packaging] could not run security trust operation: ${result.error.message}\n`)
  } else if (result.reason === 'timeout') {
    process.stderr.write(`[sage-packaging] security trust operation timed out after ${String(TRUST_TIMEOUT_MS / 1000)} seconds\n`)
  } else if (result.reason === 'child-signal') {
    process.stderr.write(`[sage-packaging] security trust operation ended by ${result.signal}\n`)
  }
  process.exitCode = result.exitCode
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
