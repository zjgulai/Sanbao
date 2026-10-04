import { describe, expect, it } from 'vitest'

import { listSettingsLeaves, SETTINGS_LEAF_IDS } from '../src/main/settings-leaves.js'
import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 046 (US-209~219): eleven read-only leaf pages.
 *
 * Per-page source annotations, no write entries anywhere, and a workspace-index page that reads the
 * folded registry observation — never a filesystem scan (D-090 / US-219).
 */

const facts = (overrides: Partial<Parameters<typeof listSettingsLeaves>[0]> = {}) => ({
  host: { kind: 'active' as const },
  organizationRef: 'org-north',
  workspaceCount: 2,
  workspaceFoldRead: true,
  ...overrides,
})

describe('the leaf registry', () => {
  it('lists exactly the eleven leaves, each with a title, a source and no write entry', () => {
    const leaves = listSettingsLeaves(facts())
    expect(leaves.map((leaf) => leaf.leafId)).toEqual([...SETTINGS_LEAF_IDS])
    expect(leaves).toHaveLength(11)
    for (const leaf of leaves) {
      expect(leaf.title, leaf.leafId).not.toBe('')
      expect(leaf.source, leaf.leafId).not.toBe('')
      expect(leaf.note, leaf.leafId).not.toBe('')
      // The contract has no write slot that could be filled: 046 ships zero write entries.
      expect(leaf.writeEntry, leaf.leafId).toBeNull()
    }
  })

  it('sources the three leaves main can prove, and says unwired — never disabled — for the rest', () => {
    const leaves = listSettingsLeaves(facts())
    const byId = new Map(leaves.map((leaf) => [leaf.leafId, leaf]))
    expect(byId.get('connection')).toMatchObject({ state: 'read', source: '运行时启动观察' })
    expect(byId.get('security')).toMatchObject({ state: 'read', source: '实例策略文件' })
    expect(byId.get('security')?.note).toContain('org-north')
    expect(byId.get('workspace-index')).toMatchObject({ state: 'read', source: '工作区登记观察（follow 折叠）' })
    expect(byId.get('workspace-index')?.note).toContain('2 个工作区')
    expect(byId.get('workspace-index')?.note).toContain('不触发全量扫描')

    const unwired = leaves.filter((leaf) => leaf.state === 'unavailable')
    expect(unwired).toHaveLength(8)
    for (const leaf of unwired) {
      expect(leaf.note, leaf.leafId).toContain('未接线')
      expect(leaf.note, leaf.leafId).not.toMatch(/已停用|已关闭/u)
    }
  })

  it('keeps each absence its own sentence: an unread fold is not "zero workspaces"', () => {
    const unread = listSettingsLeaves(facts({ workspaceFoldRead: false, workspaceCount: 0 }))
    const index = unread.find((leaf) => leaf.leafId === 'workspace-index')
    expect(index).toMatchObject({ state: 'unavailable' })
    expect(index?.note).toContain('还没有读到工作区登记观察')
    const noPolicy = listSettingsLeaves(facts({ organizationRef: null }))
    expect(noPolicy.find((leaf) => leaf.leafId === 'security')).toMatchObject({ state: 'unavailable' })
    const noHost = listSettingsLeaves(facts({ host: { kind: 'unavailable' } }))
    expect(noHost.find((leaf) => leaf.leafId === 'connection')).toMatchObject({ state: 'unavailable' })
  })
})

describe('the read-only settings surface', () => {
  const payload = (leaves: unknown) => statePayload({ settingsLeaves: leaves })

  it('renders all eleven pages with their sources, and none of them has a control', async () => {
    const harness = await bootSagePage(payload(listSettingsLeaves(facts())))
    const cards = harness.node('settings-leaf-grid').children
    expect(cards).toHaveLength(11)
    expect(cards.map((card) => card.dataset.settingsLeaf)).toEqual([...SETTINGS_LEAF_IDS])
    for (const card of cards) {
      expect(card.textContent).toContain('来源：')
      expect(card.descendants().every((node) => node.tagName !== 'button' && node.tagName !== 'input' && node.tagName !== 'select')).toBe(true)
    }
    // The leaf family itself, as served: zero controls. (Ticket 047 added the appearance section —
    // a separate, clearly-marked writable block — before the read-only leaf group; the
    // zero-control claim belongs to the leaf group, whose write entries stay absent.)
    const document = renderSageDocument()
    const leafSection = document.slice(document.indexOf('id="settings-leaf-section"'), document.indexOf('class="sage-card sage-visibility-card"'))
    // A moved or renamed marker must not turn the claim vacuous — the slice has to exist.
    expect(leafSection.length, 'leaf section slice must be found').toBeGreaterThan(120)
    expect(leafSection).toContain('id="settings-leaf-grid"')
    expect([...leafSection.matchAll(/<button|<input|<select/gu)]).toHaveLength(0)
  })

  it('labels each unavailable page with its reason and its source', async () => {
    const harness = await bootSagePage(payload(listSettingsLeaves(facts({ host: { kind: 'unavailable' }, organizationRef: null, workspaceFoldRead: false }))))
    const cards = harness.node('settings-leaf-grid').children
    const pet = cards.find((card) => card.dataset.settingsLeaf === 'desktop-pet')
    expect(pet?.textContent).toContain('未接线')
    expect(pet?.textContent).toContain('无 provider')
    // The state tag itself carries the distinction — not only the sentence below it.
    const petTag = pet?.descendants().find((node) => node.className.includes('sage-state-tag'))
    expect(petTag?.textContent).toBe('未接线／未核验')
    const connectionTag = cards
      .find((card) => card.dataset.settingsLeaf === 'connection')
      ?.descendants().find((node) => node.className.includes('sage-state-tag'))
    expect(connectionTag?.textContent).toBe('未接线／未核验')
    const connection = cards.find((card) => card.dataset.settingsLeaf === 'connection')
    expect(connection?.textContent).toContain('未核验')
    expect(connection?.textContent).toContain('运行时启动观察')
  })
})

describe('the workspace-index page reads an observation, never a scan (US-219)', () => {
  it('names no file-surface call in its source or its wiring', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(new URL('../src/main/settings-leaves.ts', import.meta.url), 'utf8')
    const wiring = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    const slice = wiring.slice(wiring.indexOf('settingsLeaves: () =>'), wiring.indexOf('// Ticket 020: the display preferences'))
    expect(slice).toContain('lastWorkspaceFold')
    for (const banned of ['workspaceFiles', 'readdir', 'scandir', 'readdirSync']) {
      expect(source.includes(banned), `source: ${banned}`).toBe(false)
      expect(slice.includes(banned), `wiring: ${banned}`).toBe(false)
    }
    // The fold the index reads is the same follow-stream reader every workspace read uses, and the
    // state projection reads through that same fold (no second read path for the same fact).
    expect(wiring).toContain('readWorkspaceList((endpoint, payload, onFrame) => host.bridgeStream(endpoint, payload, onFrame))')
    expect(wiring).toContain('workspaceList: () => foldWorkspaces(),')
  })
})
