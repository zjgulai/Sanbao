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
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const shellLib = resolve(new URL('../../apps/sage-shell/lib', import.meta.url).pathname.replace(/^\/([A-Z]:)/u, '$1'))
const pathsModule = await import(`file://${join(shellLib, 'profile/paths.js')}`)
const domainModule = await import(`file://${join(shellLib, 'domain/business-matter.js')}`)
const codecModule = await import(`file://${join(shellLib, 'domain/business-matter-codec.js')}`)
const storeModule = await import(`file://${join(shellLib, 'persistence/business-matter-event-store.js')}`)
const draftStoreModule = await import(`file://${join(shellLib, 'main/draft-store.js')}`)
const { randomBytes, randomUUID } = await import('node:crypto')

const args = process.argv.slice(2)
const valueOf = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
const workspaceId = valueOf('--workspace-id') ?? 'workspace:sage-walkthrough'
// Default the adopted workspace to this repository root — derived from the script's own
// location, never a machine-absolute literal.
const repoRoot = resolve(new URL('../../', import.meta.url).pathname)
const workspacePath = realpathSync(resolve(valueOf('--workspace-path') ?? repoRoot))
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

// The matter roster derives from draft facts (US-093): a matter appears only through its
// converted draft. Seed the record a real 草案→转化 leaves behind, so the roster row — the
// only context-selection surface — names the demo matter. Idempotent per matterRef.
const draftStore = draftStoreModule.createDraftStore({
  draftsDir: paths.draftsDir,
  now: () => new Date().toISOString(),
  nextId: () => randomUUID(),
  randomKey: () => randomBytes(32),
})
const existing = draftStore.list(true)
const already = existing.state === 'ready'
  && existing.drafts.some((draft) => draft.matterRef === matterId)
if (already) {
  process.stdout.write(`[session-demo-seed] converted draft for ${matterId} already present; nothing written\n`)
} else {
  const created = draftStore.create('真机会话走查：首条消息的工作事项。', true)
  const draftId = created.state === 'ready' ? created.drafts[0]?.draftId : undefined
  if (draftId === undefined) throw new Error('draft store refused the demo draft')
  const updated = draftStore.update(draftId, {
    fields: {
      goal: '真机会话走查：首条消息的工作事项。',
      deliverable: '一次受治理的会话发送。',
      responsibility: 'role:owner',
      projectRef: '',
    },
  }, true)
  if (updated === undefined || updated.state !== 'ready') throw new Error('draft store refused the field update')
  const committed = draftStore.commitConversion(draftId, matterId)
  process.stdout.write(`[session-demo-seed] draft ${draftId} -> ${String(committed?.status)} ${String(committed?.matterRef)}\n`)
  if (committed?.status !== 'converted') process.exitCode = 1
}

// The live workspace fold reads the base's own `workspace` domain storage
// (<root>/harness/storages/workspace.json). The native picker backend is disabled by the shell
// overlay ("in-app browsing until its native picker bridge exists"), so the walkthrough adopts
// its environment here — same shape the base's create writes. Idempotent by workspace id.
const workspaceStorePath = join(root, 'harness', 'storages', 'workspace.json')
const workspaceStore = existsSync(workspaceStorePath)
  ? JSON.parse(readFileSync(workspaceStorePath, 'utf8'))
  : { unit: { name: 'workspace', version: 2 }, global: { initialized: true, workspaceIds: [], archivedSessionIds: [], pinnedSessionIds: [] }, tables: { workspaces: {} } }
workspaceStore.global ??= { initialized: true, workspaceIds: [], archivedSessionIds: [], pinnedSessionIds: [] }
workspaceStore.tables ??= { workspaces: {} }
workspaceStore.tables.workspaces ??= {}
if (workspaceStore.tables.workspaces[workspaceId] !== undefined) {
  process.stdout.write(`[session-demo-seed] workspace ${workspaceId} already present; nothing written\n`)
} else {
  const timestamp = new Date().toISOString()
  workspaceStore.tables.workspaces[workspaceId] = {
    path: workspacePath,
    title: workspacePath.split('/').filter(Boolean).at(-1) ?? workspacePath,
    sessionIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  if (!Array.isArray(workspaceStore.global.workspaceIds)) workspaceStore.global.workspaceIds = []
  if (!workspaceStore.global.workspaceIds.includes(workspaceId)) workspaceStore.global.workspaceIds.push(workspaceId)
  workspaceStore.global.initialized = true
  mkdirSync(dirname(workspaceStorePath), { recursive: true, mode: 0o700 })
  writeFileSync(workspaceStorePath, `${JSON.stringify(workspaceStore, null, 2)}\n`, { mode: 0o600 })
  process.stdout.write(`[session-demo-seed] workspace ${workspaceId} -> ${workspacePath}\n`)
}
