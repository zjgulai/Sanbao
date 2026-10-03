/** Ticket 031 (US-159~163): shape the per-matter run monitor from the SAME session-channel
 *  facts the conversation card reads — no local copy, no second derivation.
 *
 *  Four axes stay four facts: steps (the open-turn evidence), budget (reserved/consumed/billed,
 *  unknown until a usage provider exists — never zero), device (no binding reading in this
 *  release; offline is explicitly not cancellation and not takeover) and background (the run
 *  belongs to the Host; panel open/closed is only local view state). The shape carries no
 *  synthesized run status, no total, and no compaction outcome — a missing reading stays unknown.
 */
import type { RunMonitorView, SessionChannelStatus } from '../appservice/contracts.js'

const UNKNOWN_BUDGET: RunMonitorView['budget'] = {
  reserved: { state: 'unknown', reason: 'usage-provider-unavailable' },
  consumed: { state: 'unknown', reason: 'usage-provider-unavailable' },
  billed: { state: 'unknown', reason: 'usage-provider-unavailable' },
}

const UNKNOWN_DEVICE: RunMonitorView['device'] = { state: 'unknown', reason: 'device-binding-unavailable' }
const UNKNOWN_BACKGROUND: RunMonitorView['background'] = { state: 'unknown', reason: 'background-host-unavailable' }
const UNKNOWN_CONTEXT: RunMonitorView['context'] = { state: 'unknown', reason: 'context-usage-unavailable', compaction: 'unknown' }

/** Unwired composition reads exactly this — the axes keep their honest reasons. */
export const UNAVAILABLE_RUN_MONITOR: RunMonitorView = {
  state: 'unavailable',
  matterRef: null,
  steps: { state: 'unavailable', lastTurnEnd: null, observedRecords: 0, reason: 'monitor-not-read' },
  budget: UNKNOWN_BUDGET,
  device: UNKNOWN_DEVICE,
  background: UNKNOWN_BACKGROUND,
  context: UNKNOWN_CONTEXT,
}

export function shapeRunMonitor(matterRef: string | null, channel: SessionChannelStatus | null): RunMonitorView {
  const steps: RunMonitorView['steps'] = channel === null || channel.state !== 'read'
    ? { state: 'unavailable', lastTurnEnd: null, observedRecords: 0, reason: channel === null ? 'session-channel-not-read' : channel.state === 'no-session' ? 'no-session' : (channel.code ?? 'session-channel-unavailable') }
    : { state: channel.execution === 'executing' ? 'running' : 'idle', lastTurnEnd: channel.lastTurnEnd, observedRecords: channel.records, reason: null }
  return {
    state: 'read',
    matterRef,
    steps,
    budget: UNKNOWN_BUDGET,
    device: UNKNOWN_DEVICE,
    background: UNKNOWN_BACKGROUND,
    context: UNKNOWN_CONTEXT,
  }
}
