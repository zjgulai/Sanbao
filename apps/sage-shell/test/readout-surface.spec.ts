import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

/**
 * Ticket 026, the four rear read-only families.
 *
 * US-129~139 are mostly prohibitions, so this spec is mostly structural: no control where a
 * write entry would be, no conclusion where a local observation is, and an unwired store that
 * says "unwired" instead of "empty".
 */

const readout = {
  visibility: { organizationRef: 'org-north', organizationNote: 'read', responsiblePartyRoleRef: 'role:owner', matterNote: 'read' },
  plugins: {
    state: 'read',
    code: null,
    components: [
      { identity: 'host:sage-shell-host', version: '5.0.0', artifactDigestShort: 'aaaaaaaaaaaa…' },
      { identity: 'harness:@deepseek-ai/dsh', version: '0.2.0-rc.2', artifactDigestShort: 'bbbbbbbbbbbb…' },
    ],
    observation: { loaderPhase: 'active', runtimeGeneration: 2, bootIdShort: 'sage-host:ab…' },
  },
  knowledge: { state: 'not-wired', reason: 'knowledge-store-unavailable' },
  diagnostics: {
    harnessVersion: '0.2.0-rc.2',
    protocolVersion: '5',
    profileGeneration: 'sage-dev',
    manifestSha256Short: 'ffffffffffff…',
    manifestVerified: true,
    dataRoot: '/Users/someone/Library/Application Support/Sage',
    lastError: null,
  },
}

const reference = {
  referenceId: 'ref-1',
  workspaceRoot: '/Users/someone/project',
  path: 'notes/plan.md',
  absolutePath: '/Users/someone/project/notes/plan.md',
  version: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  bytes: 42,
  createdAt: '2026-10-02T12:00:00.000Z',
  lastUse: 'stale',
}

const controls = (card: FakeElement): string[] => card.descendants().filter((node) => node.tagName === 'button' || node.tagName === 'input').map((node) => node.tagName)

describe('the read-only families ship no write entries', () => {
  it('has no update controls anywhere in the document', () => {
    const document = renderSageDocument()
    // US-138: the two entry labels do not exist in the served document at all.
    expect(document).not.toMatch(/检查更新|立即更新/u)
    // US-135: no enable/disable/install/authorize controls either.
    const labels = [...document.matchAll(/<button[^>]*>([^<]*)</gu)].map((match) => match[1])
    for (const banned of ['启用', '停用', '安装', '授权', '发布', '退役', '邀请']) {
      expect(labels.some((label) => label.includes(banned)), banned).toBe(false)
    }
  })

  it('renders each of the four cards with zero controls — except the deliberate 048 feedback entry', async () => {
    const harness = await bootSagePage(statePayload({ readout, fileReferences: [reference] }))
    for (const id of ['visibility-note', 'knowledge-rows', 'plugin-rows', 'diagnostics-error']) {
      expect(harness.node(id), id).toBeDefined()
    }
    const panel = renderSageDocument().slice(
      renderSageDocument().indexOf('id="panel-readout"'),
      renderSageDocument().indexOf('<footer'),
    )
    // Ticket 048 deliberately adds ONE interactive entry to this panel (submit feedback: text +
    // structured diagnostics only). Every other control stays absent — the exception is pinned
    // by exact id and count so a second control cannot ride in unnoticed.
    const buttons = [...panel.matchAll(/<button/gu)]
    expect(buttons).toHaveLength(1)
    expect(panel).toContain('id="feedback-submit"')
    const buttonTags = [...panel.matchAll(/<button[^>]*>/gu)].map((match) => match[0])
    expect(buttonTags.every((tag) => tag.includes('id="feedback-submit"'))).toBe(true)
  })
})

describe('visible scope (US-129/130)', () => {
  it('shows the verified organization and main owner, and says where an absence comes from', async () => {
    const harness = await bootSagePage(statePayload({ readout }))
    expect(harness.node('visibility-org').textContent).toBe('org-north')
    expect(harness.node('visibility-owner').textContent).toBe('role:owner')
    expect(harness.node('visibility-note').textContent).toBe('')

    harness.setPayload(statePayload({
      readout: { ...readout, visibility: { organizationRef: null, organizationNote: 'policy-unreadable', responsiblePartyRoleRef: null, matterNote: 'projection-absent' } },
    }))
    await harness.refresh()
    expect(harness.node('visibility-org').textContent).toContain('未核验')
    expect(harness.node('visibility-owner').textContent).toContain('未核验')
    // The absence is explained, and no name is invented for either slot.
    expect(harness.node('visibility-note').textContent).toContain('组织范围暂不能显示')
    expect(harness.node('visibility-note').textContent).toContain('不表示没有主责')
  })
})

describe('knowledge and references (US-131/132/133)', () => {
  it('says the knowledge store is unwired and lists references read-only with source, version and reachability', async () => {
    const harness = await bootSagePage(statePayload({ readout, fileReferences: [reference] }))
    expect(harness.node('knowledge-state').textContent).toContain('未接线')
    const rows = harness.node('knowledge-rows').children
    expect(rows).toHaveLength(1)
    const text = rows[0]!.textContent
    expect(text).toContain('notes/plan.md')
    expect(text).toContain('/Users/someone/project/notes/plan.md')
    expect(text).toContain('版本 sha256:aaaaa…')
    expect(text).toContain('可达性：上次取用已阻断')
    // Read-only: no reference control on this page; the 取用 button stays on the capability card.
    expect(controls(rows[0]!)).toEqual([])
    expect(harness.node('knowledge-note').textContent).toContain('知识库 provider 仍未接线')
    expect(harness.node('knowledge-note').textContent).toContain('取用')
  })

  it('lists no entries when nothing was referenced, without claiming the store is empty', async () => {
    const harness = await bootSagePage(statePayload({ readout, fileReferences: [] }))
    expect(harness.node('knowledge-rows').children).toHaveLength(0)
    expect(harness.node('knowledge-note').textContent).toContain('没有任何知识条目可列')
  })
})

describe('plugins and extensions (US-134~136)', () => {
  it('prints installation evidence rows and the boot observation apart, with the disclaimer', async () => {
    const harness = await bootSagePage(statePayload({ readout }))
    const rows = harness.node('plugin-rows').children
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('host:sage-shell-host')
    expect(rows[0]!.textContent).toContain('版本 5.0.0')
    expect(rows[0]!.textContent).toContain('来源（安装时证据）aaaaaaaaaaaa…')
    expect(harness.node('plugin-observation').textContent).toContain('本次启动的一次观察')
    expect(harness.node('plugin-observation').textContent).toContain('不是兼容或可用结论')
    const note = harness.node('plugin-note').textContent
    expect(note).toContain('已安装不等于已挂载')
    expect(note).toContain('连接成功不等于可用')
    // No row renders a conclusion: no availability, compatibility or disabled claim.
    for (const row of rows) {
      expect(row.textContent).not.toMatch(/可用|兼容|已停用|已启用/u)
    }
    expect(controls(harness.node('plugin-rows'))).toEqual([])
  })

  it('keeps an unread inventory as 未核验 with its reason, never as disabled', async () => {
    const harness = await bootSagePage(statePayload({
      readout: { ...readout, plugins: { state: 'unavailable', code: 'pmap-incomplete', components: [], observation: { loaderPhase: null, runtimeGeneration: null, bootIdShort: null } } },
    }))
    expect(harness.node('plugin-rows').children).toHaveLength(0)
    const note = harness.node('plugin-note').textContent
    expect(note).toContain('未核验')
    expect(note).toContain('安装面证据不完整')
    expect(note).not.toMatch(/已停用|未挂载/u)
    expect(harness.node('plugin-observation').textContent).toContain('还没有可用的观察')
  })
})

describe('about and diagnostics (US-137~139)', () => {
  it('names the version source and the pin check, the data root, and the last command error', async () => {
    const harness = await bootSagePage(statePayload({
      readout: { ...readout, diagnostics: { ...readout.diagnostics, lastError: { code: 'policy-denied', correlation: 'c-9' } } },
    }))
    expect(harness.node('diagnostics-harness').textContent).toBe('0.2.0-rc.2')
    expect(harness.node('diagnostics-protocol').textContent).toBe('5')
    expect(harness.node('diagnostics-generation').textContent).toBe('sage-dev')
    expect(harness.node('diagnostics-manifest').textContent).toContain('ffffffffffff…')
    expect(harness.node('diagnostics-manifest').textContent).toContain('已按 pin 核对')
    expect(harness.node('diagnostics-dataroot').textContent).toBe('/Users/someone/Library/Application Support/Sage')
    expect(harness.node('diagnostics-error').textContent).toContain('policy-denied')
    expect(harness.node('diagnostics-error').textContent).toContain('c-9')
  })

  it('claims nothing about identity when no boot was accepted', async () => {
    const harness = await bootSagePage(statePayload({
      readout: {
        ...readout,
        diagnostics: { harnessVersion: null, protocolVersion: null, profileGeneration: null, manifestSha256Short: null, manifestVerified: false, dataRoot: '/sage-data', lastError: null },
      },
    }))
    expect(harness.node('diagnostics-harness').textContent).toContain('未核验')
    expect(harness.node('diagnostics-manifest').textContent).toContain('未核验')
    expect(harness.node('diagnostics-dataroot').textContent).toBe('/sage-data')
    expect(harness.node('diagnostics-error').textContent).toContain('还没有派发过动作')
  })
})
