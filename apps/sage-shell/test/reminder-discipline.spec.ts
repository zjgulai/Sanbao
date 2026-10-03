import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 023 (FW-018, US-114~116): in-app reminders are the partitions and their counts — and
 * nothing else. These tests are the machine enforcement of that negative space:
 *
 * - no notification / permission / badge / title-flash API may exist anywhere in the shell sources;
 * - the state contract carries no second "unread" counter;
 * - the nav marker and the list counts are two views of the ONE `matterList` fact, moving together
 *   on the next projection read — coming back to the app is the whole reminder.
 */

function sourceFiles(): string[] {
  const root = fileURLToPath(new URL('../src/', import.meta.url))
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts')) found.push(path)
    }
  }
  walk(root)
  return found
}

describe('the reminder discipline (023)', () => {
  it('never touches a notification, permission, badge, or title-flash API (US-114/116)', () => {
    const banned = [
      'new Notification',
      'Notification.requestPermission',
      'requestPermission',
      'setBadgeCount',
      'setBadge(',
      'flashFrame',
      'app.dock',
      'dock.setBadge',
    ]
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(50)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const token of banned) {
        expect(text.includes(token), `${file} must not use ${token}`).toBe(false)
      }
    }
  })

  it('carries no second "unread" state in the contract (US-115)', () => {
    const contracts = readFileSync(new URL('../src/appservice/contracts.ts', import.meta.url), 'utf8')
    // Field-shaped only: prose may say "unread" about unreadable projections, a field may not.
    expect(contracts).not.toMatch(/readonly\s+\w*unread/iu)
    expect(contracts).not.toMatch(/['"]\w*unread\w*['"]/iu)
    // The reminder vocabulary the list uses instead: partition + count, nothing else.
    expect(contracts).toContain('MatterListState')
  })

  it('keeps the nav marker and the list counts on the one projection fact, and follows the next read', async () => {
    const withAction = statePayload({
      matterList: {
        state: 'read', code: null,
        items: [{
          itemId: 'receipt:1', matterRef: 'receipt:1', title: '稳定订单增长', partition: 'action',
          triggers: [{ kind: 'pending-inputs', ref: 'receipt:1', count: 1 }], acceptanceCandidateCount: 0,
          lifecycle: 'active', updatedAt: '2026-10-02T12:00:00.000Z',
        }],
        counts: { action: 1, inProgress: 0, acceptance: 0 },
      },
    })
    const harness = await bootSagePage(withAction)
    // Same number in both places, from the same payload: one fact, two views.
    expect(harness.node('nav-matter-count').hidden).toBe(false)
    expect(harness.node('nav-matter-count').textContent).toBe('1')
    expect(harness.node('nav-matter-count').attributes['aria-label']).toBe('待我处理 1 项')
    expect(harness.node('matter-count-action').textContent).toBe('1')

    // Coming back to the app is enough: the next read moves both together (no user action).
    harness.setPayload(statePayload({
      matterList: { state: 'read', code: null, items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } },
    }))
    await harness.refresh()
    expect(harness.node('nav-matter-count').hidden).toBe(true)
    expect(harness.node('matter-count-action').textContent).toBe('0')

    // An underivable list hides the marker too — absence never reads as "nothing to do".
    harness.setPayload(statePayload({
      matterList: { state: 'unavailable', code: 'matter-list-locked', items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } },
    }))
    await harness.refresh()
    expect(harness.node('nav-matter-count').hidden).toBe(true)
    expect(harness.node('matter-count-action').textContent).toBe('—')
  })

  it('keeps the task-title and dock surfaces untouched by the design: no title flash text exists', () => {
    const renderer = readFileSync(new URL('../src/product/renderer.ts', import.meta.url), 'utf8')
    for (const banned of ['document.title =', 'setTitle', 'title flash', '标题闪烁']) {
      expect(renderer.includes(banned), banned).toBe(false)
    }
  })
})
