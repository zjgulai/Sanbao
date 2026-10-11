import type { ActiveMatterContextStatus, MatterLinkState, SessionChannelStatus, WorkspaceListStatus } from '../../src/appservice/contracts.js'
import type { SageMatterViewState } from '../../src/product/view-state.js'

export function desktopSessionPayload() {
  const activeContext = {
    state: 'active', contextGeneration: 3, matterId: 'matter:one', revisionId: 'revision:one',
    workspaceRef: 'workspace:one', frameGeneration: 5,
  } satisfies ActiveMatterContextStatus
  const matter = {
    schemaVersion: 'sage.matter-view.v1', projectionSource: 'live',
    matter: {
      matterId: 'matter:one', goal: '核对清单', responsiblePartyRoleRef: 'role:one',
      stage: 'running', conclusion: undefined, currentRevisionId: 'revision:one',
      revisionCount: 1, evidenceCount: 0, unknownCount: 0, dependencyCount: 0, pendingClarification: undefined,
    },
    compatibilityOutcome: 'equivalent', authorizationState: 'authorized', availabilityState: 'available',
    actionability: 'allowed', denialReason: undefined, actions: [], decisions: [], attempts: [], artifacts: [], receipts: [],
  } satisfies SageMatterViewState
  const workspaces = {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'workspace:one', path: '/controlled/workspace', title: '工作区', sessionCount: 1, createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z' }],
    order: ['workspace:one'], archivedSessions: 0, frames: 1, unapplied: 0,
  } satisfies WorkspaceListStatus
  const matterLinks = {
    state: 'read', links: [{ matterRef: 'matter:one', workspaceRef: 'workspace:one', workspacePath: '/controlled/workspace', linkedAt: '2026-10-05T00:00:00Z', isDefault: true }], trail: [],
  } satisfies MatterLinkState
  const sessionChannel = {
    state: 'read', sessionId: 'session:one', execution: 'idle', lastTurnEnd: 'completed',
    reply: { text: '实际回复', endKind: 'completed', failed: false, actions: ['copy', 'quote'] },
    transcript: [
      { role: 'user', text: '实际问题', source: 'history', at: '2026-10-05T00:00:00Z', attachments: [], messageRef: 'request:old' },
      { role: 'assistant', text: '实际回复', source: 'history', at: '2026-10-05T00:00:01Z', attachments: [] },
    ],
    reconciled: true, streamBroken: false, code: null, records: 2, unapplied: 0,
    turnProcess: { durationMs: null, endedAt: null, iterations: null, fileWrites: [] },
    contextUsage: null,
    paused: false, pending: [], queue: { state: 'read', occurrences: [] },
  } satisfies SessionChannelStatus
  // ADR-0300: the artifact slot rides the same envelope; the default fixture carries none.
  const artifacts = { state: 'read', cards: [] as const, preview: { state: 'closed' as const } }
  const monitor = {
    state: 'read', matterRef: 'matter:one',
    steps: { state: 'idle', lastTurnEnd: 'completed', observedRecords: 2, reason: null },
    budget: { state: 'unknown', reason: 'usage-provider-unavailable' },
    device: { state: 'unknown', reason: 'device-binding-unavailable' },
    background: { state: 'unknown', reason: 'background-host-unavailable' },
    context: { state: 'unknown', reason: 'context-usage-unavailable', compaction: 'unknown' },
  }
  return {
    artifacts,
    runMonitor: monitor,
    service: { status: 'unavailable', reason: 'authenticated', auth: { status: 'signed-in', displayName: null }, correlation: 'response:one', command: null },
    runtime: { status: 'ready', message: 'private-actor', retryable: true },
    activeContext, matter, workspaces, matterLinks, sessionChannel,
  }
}
