/** Internal-test seed: one custody-shape matter into a packaged Sage data root (ADR-0293 batch).
 *
 *  Mirrors what `matter-custody` would write at creation: created + a policy-less `revision:1`
 *  with one `insufficient` evidence item ("a later revision declares what may run"). The
 *  selection-time ensure then enters the working revision during the walkthrough — that IS the
 *  thing under test.
 *
 *  The store demands exclusive access semantics: quit the packaged app before seeding. The
 *  matter id is fixed; an existing matter of the same id is left untouched.
 *
 *  Usage (the store demands the pinned Electron runtime, so run it under the shell's Electron):
 *    cd apps/sage-shell && ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron \
 *      ../../packaging-sage/scripts/session-demo-seed.mjs [--root "<SAGE_ROOT>"] [--home "<HOME>"]
 *  Default root: ~/Library/Application Support/Sage (the installed app's data root).
 */
import { mkdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const shellLib = resolve(new URL('../../apps/sage-shell/lib', import.meta.url).pathname.replace(/^\/([A-Z]:)/u, '$1'))
const pathsModule = await import(`file://${join(shellLib, 'profile/paths.js')}`)
const domainModule = await import(`file://${join(shellLib, 'domain/business-matter.js')}`)
const codecModule = await import(`file://${join(shellLib, 'domain/business-matter-codec.js')}`)
const storeModule = await import(`file://${join(shellLib, 'persistence/business-matter-event-store.js')}`)

const args = process.argv.slice(2)
const valueOf = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
// The store boundary demands the canonical physical path; /tmp-style symlinked prefixes fail it.
const root = realpathSync(resolve(valueOf('--root') ?? join(homedir(), 'Library', 'Application Support', 'Sage')))
const home = resolve(valueOf('--home') ?? homedir())
const matterId = 'matter:sage.session-demo'

const paths = pathsModule.resolveSagePaths({ home, root, platform: process.platform })
mkdirSync(join(root, 'data', 'business-matter'), { recursive: true, mode: 0o700 })

const store = storeModule.openBusinessMatterEventStore({
  sagePaths: paths,
  maxStreamEvents: 4096,
  maxPayloadBytes: 1024 * 1024,
  busyTimeoutMs: 2000,
  clock: () => new Date().toISOString(),
})

try {
  const existing = store.load(matterId)
  if (existing.kind !== 'not-found') {
    process.stdout.write(`[session-demo-seed] ${matterId} already present (${existing.kind}); nothing written\n`)
    process.exitCode = 0
  } else {
    const occurredAt = new Date().toISOString()
    const matter = domainModule.enterEvidence(domainModule.createBusinessMatter({
      matterId,
      eventId: `${matterId}:created`,
      occurredAt,
      goal: '真机会话走查：首条消息的工作事项。',
      responsibleParty: { kind: 'human', roleRef: 'role:owner' },
    }), {
      eventId: `${matterId}:revision-1`,
      occurredAt,
      revisionId: 'revision:1',
      changeReason: '实例走查创建。',
      scope: '一次受治理的会话发送。',
      permissionBoundary: '仅会话通道。',
      dataDestination: 'Sage 会话通道。',
      evidence: [{
        evidenceId: 'evidence:session-demo-draft',
        source: 'session-demo:seed',
        observedAt: occurredAt,
        status: 'insufficient',
      }],
      unknowns: [], options: [], dependencies: [], experienceRefs: [],
      actionPolicies: [],
    })
    const result = store.append({
      matterId,
      expectedVersion: { kind: 'not-exists' },
      appendId: `session-demo:${occurredAt}`,
      events: codecModule.encodeBusinessMatterEvents(matter).map((event) => ({
        matterId: event.matterId,
        eventId: event.eventId,
        eventType: event.eventType,
        eventSchemaVersion: event.eventSchemaVersion,
        occurredAt: event.occurredAt,
        payloadBytes: event.payloadBytes.slice(),
      })),
    })
    process.stdout.write(`[session-demo-seed] append: ${result.kind}\n`)
    process.exitCode = result.kind === 'appended' ? 0 : 1
  }
} finally {
  store.close()
}
