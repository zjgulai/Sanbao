import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { constants as osConstants } from 'node:os'

import electronPath from 'electron'

const convertProcessSignalToExitCode = (signal) => {
  const number = osConstants.signals[signal]
  return typeof number === 'number' ? 128 + number : undefined
}

const require = createRequire(import.meta.url)
const vitestPath = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const child = spawn(electronPath, [vitestPath, ...process.argv.slice(2)], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: 'inherit',
})

let childClosed = false
let childError
const signalHandlers = new Map()

for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
  const handler = () => {
    if (childClosed || child.exitCode !== null || child.signalCode !== null) return
    child.kill(signal)
  }
  try {
    process.on(signal, handler)
    signalHandlers.set(signal, handler)
  } catch {
    // Some signals are unavailable on Windows. The child still inherits its console.
  }
}

child.once('error', (error) => {
  childError = error
})

child.once('close', (code, signal) => {
  childClosed = true
  for (const [name, handler] of signalHandlers) process.off(name, handler)

  if (childError !== undefined) {
    console.error(`Failed to run Vitest with the installed Electron executable: ${childError.message}`)
    process.exitCode = 1
    return
  }
  if (signal !== null) {
    if (process.platform !== 'win32') {
      try {
        process.kill(process.pid, signal)
        return
      } catch {
        // Fall through to the portable signal-derived exit status.
      }
    }
    process.exitCode = convertProcessSignalToExitCode(signal) ?? 1
    return
  }
  process.exitCode = code ?? 1
})
