// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/skill-panel.module.css', import.meta.url), 'utf8')

describe('skill center Codex visual contract', () => {
  it('keeps the responsive panel in the shared responsive family', () => {
    expect(css).toContain('.panelPage {')
    expect(css).toContain('background: var(--dsw-alias-bg-base')
  })

  it('uses semantic business accents instead of the former blue visual language', () => {
    expect(css).toContain('var(--dsw-alias-state-business-primary')
    expect(css).toContain('var(--dsw-alias-state-business-tertiary')
    expect(css).not.toContain('#4353a3')
    expect(css).not.toContain('#eef2ff')
    expect(css).not.toContain('#dde3f8')
  })

  it('keeps motion within the shared duration and reduced-motion contract', () => {
    expect(css).toContain('180ms')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toContain('.panelPage *')
  })

  it('gives the content panel one control and state language', () => {
    expect(css).toContain('height: 32px')
    expect(css).toContain('.panelPage button:disabled')
    expect(css).toContain('.formInput:focus')
    expect(css).toContain('.feedbackOk')
    expect(css).toContain('var(--dsw-alias-state-error-secondary')
    expect(css).toContain('var(--dsw-alias-state-success-secondary')
    expect(css).toContain('border-left: 2px solid var(--dsw-alias-state-business-primary')
  })

  it('keeps narrow content single-column and flattens skill entries', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*\.grid\s*\{\s*grid-template-columns:\s*1fr;/)
    expect(css).toContain('transition: border-color 180ms ease, background 180ms ease;')
    expect(css).not.toContain('box-shadow: 0 2px 10px')
  })

  // S3（2026-09-19）：面板从抽屉/浮层迁到 main keyed slot 的中心列视图。
  // 新契约是「零层叠」：本包不声明任何层号，显隐与层叠归 slot 管（D4）。
  // `position: absolute` 不在此列——它只用于局部装饰（图标角上的徽标、开关滑块），
  // 不建立浮层；判据钉的是**层号声明**，不是定位方式。
  it('carries no stacking layer of its own (center-column view, not an overlay)', () => {
    expect(css).not.toMatch(/z-index\s*:/)
    expect(css).not.toMatch(/position:\s*fixed/)
    expect(css).not.toContain('--dsh-skill-center-overlay-layer')
    expect(css).not.toContain('@keyframes')
  })
})
