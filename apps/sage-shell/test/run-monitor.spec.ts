import { describe, expect, it } from 'vitest'

import type { SessionChannelStatus } from '../src/appservice/contracts.js'
import { shapeRunMonitor } from '../src/main/run-monitor.js'

/**
 * Ticket 031, the four-axis run monitor (US-159~163).
 *
 * Four axes stay four facts: the steps axis mirrors the session channel's own projection, the
 * other three say `unknown` with their own reasons, and nothing anywhere synthesizes a run
 * status or turns a missing number into zero.
 */

const channel = (overrides: Partial<SessionChannelStatus> = {}): SessionChannelStatus => ({
  state: 'read', sessionId: 's1', execution: 'idle', lastTurnEnd: null, transcript: [],
  reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
  ...overrides,
})

describe('the four axes (US-159/161)', () => {
  it('mirrors the session channel for steps and keeps the other axes unknown with their own reasons', () => {
    const monitor = shapeRunMonitor('matter:1', channel({ execution: 'executing', records: 7, lastTurnEnd: 't-9' }))
    expect(monitor).toMatchObject({
      state: 'read',
      matterRef: 'matter:1',
      steps: { state: 'running', observedRecords: 7, lastTurnEnd: 't-9', reason: null },
      budget: {
        reserved: { state: 'unknown', reason: 'usage-provider-unavailable' },
        consumed: { state: 'unknown', reason: 'usage-provider-unavailable' },
        billed: { state: 'unknown', reason: 'usage-provider-unavailable' },
      },
      device: { state: 'unknown', reason: 'device-binding-unavailable' },
      background: { state: 'unknown', reason: 'background-host-unavailable' },
      context: { state: 'unknown', reason: 'context-usage-unavailable', compaction: 'unknown' },
    })
    // No synthesized single run status, no totals, and no zero pretending to be a reading.
    const text = JSON.stringify(monitor)
    for (const banned of ['overall', 'runStatus', 'total', '"0"]', 'stopped', 'takeover', 'offline']) {
      expect(text, banned).not.toContain(banned)
    }
    expect(Object.keys(monitor).sort()).toEqual(['background', 'budget', 'context', 'device', 'matterRef', 'state', 'steps'])
  })

  it('an unread or absent channel is its own steps state, not an idle guess', () => {
    expect(shapeRunMonitor('matter:1', null).steps).toEqual({ state: 'unavailable', lastTurnEnd: null, observedRecords: 0, reason: 'session-channel-not-read' })
    expect(shapeRunMonitor('matter:1', channel({ state: 'no-session', sessionId: null })).steps)
      .toMatchObject({ state: 'unavailable', reason: 'no-session' })
    expect(shapeRunMonitor('matter:1', channel({ state: 'unavailable', code: 'session-read-failed' })).steps)
      .toMatchObject({ state: 'unavailable', reason: 'session-read-failed' })
  })

  it('the steps axis is the same projection the conversation reads — no second derivation', () => {
    const status = channel({ execution: 'executing', records: 3 })
    const monitor = shapeRunMonitor('matter:1', status)
    expect(monitor.steps.state).toBe(status.execution === 'executing' ? 'running' : 'idle')
    expect(monitor.steps.observedRecords).toBe(status.records)
    expect(monitor.steps.lastTurnEnd).toBe(status.lastTurnEnd)
  })
})
