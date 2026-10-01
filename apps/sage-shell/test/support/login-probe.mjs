/** WT-02B.2F live login probe: runs the production OIDC adapter path against the real Logto
 * deployment (organizations scope included), then reports non-secret outcomes only — login
 * status, candidate count, handle minted. Tokens, subjects and refs are never printed.
 *
 * Run (macOS; build first): cd apps/sage-shell && npx tsc && node test/support/login-probe.mjs
 * The system browser opens — sign in there and return here. Port 3000 must be free. */
import { execFile } from 'node:child_process'
import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createOidcAdapter } from '../../lib/main/oidc-adapter.js'
import { createIdentityRegistry } from '../../lib/main/identity-registry.js'
import { createTokenVault } from '../../lib/main/token-vault.js'

let server
async function listen(port, handler) {
  server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Sage login probe: sign-in captured — you can close this tab and check the terminal.')
    handler(req)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
}

async function closeListen() {
  const current = server
  server = undefined
  if (current === undefined) return
  await new Promise((resolve) => current.close(() => resolve()))
}

const registry = createIdentityRegistry({ randomHandle: () => nodeRandomBytes(32).toString('base64url') })
let capturedCandidateCount
let handleMinted = false
const adapter = createOidcAdapter({
  fetchImpl: fetch,
  openExternal: (url) => new Promise((resolve, reject) => {
    execFile('open', [url], (error) => (error ? reject(error) : resolve()))
  }),
  now: () => Math.floor(Date.now() / 1000),
  listen,
  closeListen,
  randomBytes: nodeRandomBytes,
  resolveIdentity: (input) => {
    const entry = registry.resolve(input)
    capturedCandidateCount = input.candidateOrgRefs.length
    handleMinted = entry.identityHandle.length > 0
    return entry
  },
})

const vault = createTokenVault({ mintSessionRef: () => nodeRandomBytes(32).toString('base64url') })
console.log('login-probe: opening the system browser — sign in with your Logto account...')
const outcome = await adapter.startLogin(vault)
if (!outcome.ok) {
  console.log(`login: failed (${outcome.code})`)
  process.exitCode = 1
} else {
  console.log(`login: ok${outcome.displayName === null ? '' : ` (${outcome.displayName})`}`)
  console.log(`session: ${vault.identitySession() === null ? 'missing' : 'active'}`)
  console.log(`candidates: ${capturedCandidateCount === undefined ? 'n/a' : String(capturedCandidateCount)}`)
  console.log(`handle: ${handleMinted ? 'minted' : 'not minted'}`)
}
