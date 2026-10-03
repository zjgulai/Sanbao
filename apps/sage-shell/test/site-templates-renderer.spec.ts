import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 040 on the shipped page (US-195/196): the site starting-template panel lists entries
 * read-only with name/source/version; selecting one fills ONLY the draft input (editable) with
 * zero requests — nothing is created or published, and the wording never says 已建站/已发布;
 * an unavailable catalog shows its reason and never an empty list.
 */

const entry = (overrides: Record<string, unknown> = {}) => ({
  templateId: 'tpl-digital-particles',
  name: '数字粒子 · 企业官网',
  source: 'sage-builtin',
  version: '1',
  prompt: '请为一个企业官网生成落地页：主视觉用数字粒子、文案聚焦一句话价值。',
  ...overrides,
})

const payload = (siteTemplates: unknown, extra: Record<string, unknown> = {}) => statePayload({
  draft: { state: 'unlocked', drafts: [] },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
    reply: null,
  },
  sessionClarifications: { state: 'read', pending: [], deferred: [], receipts: [], code: null, at: null },
  siteTemplates,
  ...extra,
})

describe('the site starting-template panel (ticket 040)', () => {
  it('lists entries read-only with provenance; selecting one fills only the draft input with zero requests', async () => {
    const harness = await bootSagePage(payload({
      state: 'read',
      reason: null,
      entries: [entry(), entry({ templateId: 'tpl-orbit', name: 'Orbit · SaaS 产品官网', prompt: null })],
    }))
    await harness.refresh()
    const rows = harness.node('site-template-rows').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('数字粒子 · 企业官网')
    expect(rows[0]?.textContent).toContain('来源：sage-builtin · 版本：1')
    expect(rows[0]?.querySelector('[data-site-template-use]')).not.toBeNull()
    // 无提示词的条目：列出但不可插入，且不说成"已失效"。
    expect(rows[1]?.textContent).toContain('提示词未接线（本入口不可用；不代表模板已失效）')
    expect(rows[1]?.querySelector('[data-site-template-use]')).toBeNull()
    // 预览在首版未接线：按钮禁用（原产品行为未采集）。
    expect(rows[0]?.querySelectorAll('[data-site-template-use]')).toHaveLength(1)
    expect(harness.node('site-template-note').textContent).toContain('选择只填入本次草案输入，不建站、不写配置。')

    harness.node('site-template-rows').dispatch('click', { target: rows[0]?.querySelector('[data-site-template-use]') })
    await harness.settle()
    // 零请求：没有站点创建、没有配置写入、没有任何 POST。
    expect(harness.requests).toEqual([])
    expect(harness.node('draft-input').value).toContain('请为一个企业官网生成落地页')
    const note = harness.node('site-template-note').textContent
    expect(note).toContain('已填入草案输入（可编辑）')
    expect(note).toContain('选模板不等于已建站或已发布')
    expect(note).not.toContain('已建站：')
  })

  it('appends after existing draft text instead of replacing the user input', async () => {
    const harness = await bootSagePage(payload({
      state: 'read', reason: null, entries: [entry()],
    }))
    await harness.refresh()
    harness.node('draft-input').value = '我自己的需求句子。'
    const rows = harness.node('site-template-rows').children
    harness.node('site-template-rows').dispatch('click', { target: rows[0]?.querySelector('[data-site-template-use]') })
    await harness.settle()
    expect(harness.node('draft-input').value).toBe('我自己的需求句子。\n\n请为一个企业官网生成落地页：主视觉用数字粒子、文案聚焦一句话价值。')
    expect(harness.requests).toEqual([])
  })

  it('shows the named reason for an unavailable catalog and never an empty list', async () => {
    const harness = await bootSagePage(payload({
      state: 'unavailable', reason: 'site-templates-provider-unavailable', entries: [],
    }))
    await harness.refresh()
    expect(harness.node('site-template-rows').children).toHaveLength(0)
    const note = harness.node('site-template-note').textContent
    expect(note).toContain('模板目录不可用（site-templates-provider-unavailable）')
    expect(note).toContain('不以空列表冒充，也不静默替换')
  })

  it('a readable but empty catalog says exactly that — not "no source", not a fake list', async () => {
    const harness = await bootSagePage(payload({ state: 'read', reason: null, entries: [] }))
    await harness.refresh()
    expect(harness.node('site-template-rows').children).toHaveLength(0)
    expect(harness.node('site-template-note').textContent).toContain('模板目录可读，但当前没有条目')
  })
})
