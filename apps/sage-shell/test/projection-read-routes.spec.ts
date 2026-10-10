import { describe, expect, it, vi } from 'vitest'
import type { ProjectionReadCandidate } from '../src/appservice/contracts.js'
import type { ProjectionReadIntent, ProjectionReadScope } from '../src/appservice/projection-read-admission.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

const jsonHeaders = { 'content-type': 'application/json' }
const callerBinding = { correlation: 'projection-read-route-test' }

interface RouteCase {
  readonly name: string
  readonly path: string
  readonly operation: string
  readonly provider: string
  readonly body?: Readonly<Record<string, unknown>>
  readonly blockedCode?: string
}

const cases: readonly RouteCase[] = [
  { name: 'state', path: '/.sage/state', operation: 'state.read', provider: 'readState' },
  { name: 'file candidates', path: '/.sage/workspace/files/candidates', operation: 'workspace.files.list-candidates', provider: 'listFileCandidates', body: { workspaceRoot: '/workspace', path: 'notes.md' }, blockedCode: 'file-candidates-unavailable' },
  { name: 'file reference', path: '/.sage/workspace/files/reference', operation: 'workspace.files.create-reference', provider: 'createFileReference', body: { workspaceRoot: '/workspace', path: 'notes.md' }, blockedCode: 'file-reference-unavailable' },
  { name: 'file use', path: '/.sage/workspace/files/use', operation: 'workspace.files.use-reference', provider: 'useFileReference', body: { referenceId: 'reference-1' }, blockedCode: 'file-reference-unavailable' },
  { name: 'history list', path: '/.sage/session/history', operation: 'session.history.list', provider: 'sessionHistoryList', body: { action: 'list' }, blockedCode: 'session-history-unavailable' },
  { name: 'history detail', path: '/.sage/session/history', operation: 'session.history.detail', provider: 'sessionHistoryDetail', body: { action: 'detail', runSeq: 1 }, blockedCode: 'session-history-unavailable' },
  { name: 'anchors read', path: '/.sage/session/anchors', operation: 'session.anchors.read', provider: 'sessionAnchorsRead', body: { action: 'read' }, blockedCode: 'session-anchors-unavailable' },
  { name: 'anchors locate', path: '/.sage/session/anchors', operation: 'session.anchors.locate', provider: 'sessionAnchorLocate', body: { action: 'locate', runSeq: 1 }, blockedCode: 'session-anchors-unavailable' },
  { name: 'terminal read', path: '/.sage/session/terminal-read', operation: 'session.terminal.read', provider: 'terminalRead', body: { terminalId: 'terminal-1' }, blockedCode: 'terminals-provider-unavailable' },
  { name: 'attempt status', path: '/.sage/session/attempt-status', operation: 'session.attempt.status', provider: 'sessionAttemptStatus', body: {}, blockedCode: 'session-attempt-status-unavailable' },
  { name: 'search', path: '/.sage/search', operation: 'search.query', provider: 'search', body: { query: 'roadmap' }, blockedCode: 'search-unavailable' },
  { name: 'artifact observe', path: '/.sage/artifacts/observe', operation: 'artifacts.observe', provider: 'observeArtifacts', body: { matterRef: 'matter-1', workspaceRoot: '/workspace' }, blockedCode: 'artifact-store-unavailable' },
  { name: 'artifact open', path: '/.sage/artifacts/open', operation: 'artifacts.open', provider: 'openArtifact', body: { artifactId: 'artifact-1' }, blockedCode: 'artifact-preview-unavailable' },
  { name: 'artifact retry', path: '/.sage/artifacts/retry', operation: 'artifacts.retry', provider: 'retryArtifact', body: {}, blockedCode: 'artifact-preview-unavailable' },
  { name: 'edit draft create', path: '/.sage/edit-drafts/create', operation: 'edit-drafts.create', provider: 'createEditDraft', body: { referenceId: 'reference-1' }, blockedCode: 'edit-draft-unavailable' },
  { name: 'edit draft diff', path: '/.sage/edit-drafts/diff', operation: 'edit-drafts.diff', provider: 'diffEditDraft', body: { draftId: 'draft-1' }, blockedCode: 'edit-draft-unavailable' },
  { name: 'run log', path: '/.sage/run-log', operation: 'run-log.read', provider: 'readRunLog', body: { workspaceRoot: '/workspace', path: 'run.log' }, blockedCode: 'run-log-unavailable' },
]

function requestOf(entry: RouteCase): Request {
  if (entry.body === undefined) return new Request(`dsh-app://app${entry.path}`)
  return new Request(`dsh-app://app${entry.path}`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(entry.body),
  })
}

describe('projection-read route admission', () => {
  for (const entry of cases) {
    it(`${entry.name} fails closed before its raw provider when no read runner is assembled`, async () => {
      const raw = vi.fn(async () => Response.json({ raw: true }))
      const blockedState = vi.fn(async () => Response.json({ matter: null, blocked: true }))
      const providers = {
        [entry.provider]: raw,
        readBlockedState: blockedState,
      }

      const response = await handleSageServiceRequest(requestOf(entry), {
        callerBinding,
        providers: providers as never,
      })

      expect(response.status).toBe(200)
      expect(raw).not.toHaveBeenCalled()
      const body = await response.json() as Record<string, unknown>
      if (entry.path === '/.sage/state') {
        expect(blockedState).toHaveBeenCalledOnce()
        expect(body).toEqual({ matter: null, blocked: true })
      } else {
        expect(body.code).toBe(entry.blockedCode)
      }
    })
  }

  for (const entry of cases) {
    it(`${entry.name} invokes its raw provider only inside an accepted runner callback`, async () => {
      let insideAdmission = false
      const raw = vi.fn(async () => {
        expect(insideAdmission).toBe(true)
        return Response.json({ raw: entry.operation })
      })
      const runProjectionRead = vi.fn(async (
        intent: ProjectionReadIntent<ProjectionReadCandidate>,
        read: (scope: ProjectionReadScope) => Promise<Response>,
      ) => {
        expect(intent.operation).toBe(entry.operation)
        insideAdmission = true
        const value = await read({
          matterRef: 'matter-1', revisionRef: 'revision-1', workspaceRef: 'workspace-1',
          trustedWorkspaceRoot: '/workspace', sessionRef: 'session-1', actorScopeRef: 'actor-1',
          contextGeneration: 1, frameGeneration: 1,
        })
        insideAdmission = false
        return { state: 'read' as const, correlation: 'accepted-read', value }
      })

      const response = await handleSageServiceRequest(requestOf(entry), {
        callerBinding,
        providers: {
          [entry.provider]: raw,
          readBlockedState: async () => Response.json({ blocked: true }),
          runProjectionRead,
        } as never,
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ raw: entry.operation })
      expect(runProjectionRead).toHaveBeenCalledOnce()
      expect(raw).toHaveBeenCalledOnce()
    })
  }

  it('keeps exact parser rejection ahead of read admission', async () => {
    const raw = vi.fn(async () => Response.json({ raw: true }))
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/session/history', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ action: 'detail', runSeq: -1 }),
    }), {
      callerBinding,
      providers: { sessionHistoryDetail: raw } as never,
    })

    expect(response.status).toBe(400)
    expect(raw).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({ code: 'invalid-session-request', stage: 'intent' })
  })
})
