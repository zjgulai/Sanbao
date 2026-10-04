import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'

/**
 * Batch 12 / UI-01A: the shell drops display-scale chrome (overview hero, decorative network
 * card, clamp()-scaled page titles) and keeps one operational heading scale per panel.
 *
 * These are source-contract assertions on the shipped document. The real computed scale, the
 * absent display chrome and the real DOM structure are additionally asserted in the Electron
 * probe (`sage-fixture-projection-window.spec.ts` + `support/sage-fixture-projection-probe.mjs`).
 */
const doc = renderSageDocument()

describe('workbench visual tone (dense + calm)', () => {
  it('retires the overview hero and decorative network card markup', () => {
    expect(doc).not.toContain('sage-hero')
    expect(doc).not.toContain('sage-network')
    expect(doc).not.toContain('SHARED OPERATING MATTER')
    expect(doc).not.toContain('让经营目标')
    expect(doc).not.toContain('在明确边界内持续推进')
    expect(doc).not.toContain('sage-lead')
  })

  it('removes every display-scale clamp from the stylesheet', () => {
    expect(doc).not.toContain('clamp(2rem')
    expect(doc).not.toContain('clamp(1.55rem')
    expect(doc).not.toContain('clamp(1.4rem, 3vw')
    expect(doc).not.toContain('4.2rem')
    expect(doc).not.toContain('3.35rem')
  })

  it('keeps one operational heading scale for panels and the matter goal', () => {
    expect(doc).toContain('.sage-section-heading h1 { margin: 0; color: var(--sage-ink); font-size: 1.35rem; font-weight: 620; letter-spacing: -.01em; line-height: 1.3; }')
    expect(doc).toContain('.sage-matter-workbench-main > h2 { margin-top: 1rem; font-size: 1.3rem; font-weight: 620; letter-spacing: -.01em; line-height: 1.35; }')
  })

  it('drops dead css families and the explanatory filler sentence', () => {
    expect(doc).not.toContain('sage-trace-list')
    expect(doc).not.toContain('sage-matter-layout')
    expect(doc).not.toContain('sage-matter-main')
    expect(doc).not.toContain('当前事项是工作台的主对象')
  })

  it('keeps the fail-closed honesty markers after the cleanup', () => {
    expect(doc).toContain('不执行外部动作')
    expect(doc).toContain('只标记当前阶段，不表示左侧阶段已完成')
    expect(doc).toContain('只读 composer：没有输入、提交或执行入口')
    expect(doc).toContain('总览不合成事项进度')
    expect(doc).toContain('不提交 ·')
  })

  it('keeps exactly the six panel headings and no page-level display title', () => {
    expect((doc.match(/<h1>/gu) ?? []).length).toBe(6)
    expect(doc).not.toContain('<h1>让经营目标')
    expect(doc).toContain('<h1>经营事项脉络</h1>')
  })
})
