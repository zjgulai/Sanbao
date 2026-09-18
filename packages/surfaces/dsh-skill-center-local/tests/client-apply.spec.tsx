/**
 * Browser-half apply smoke (jsdom): registers the locale dictionary and the two
 * official slots (`main` keyed view + `sidebar.panellist` row). S3 起承载方式是
 * slot 注册而非 DOM 注入，所以断言面从「行出现在 DOM」换成「注册调用发生」。
 */
import { describe, expect, it, vi } from 'vitest'
import { apply, PANEL_KEY } from '../src/client/index.ts'

describe('skill-explorer client apply', () => {
  it('registers the locale namespace and both slots, and disposes cleanly', () => {
    const registered: string[] = []
    const registrations: Array<Record<string, unknown>> = []
    const disposers: Array<() => void> = []
    const ctx = {
      effect: (fn: () => unknown) => {
        const disposer = fn()
        disposers.push(() => {
          if (typeof disposer === 'function') (disposer as () => void)()
        })
      },
      locale: {
        register: (ns: string) => { registered.push(ns); return () => {} },
      },
      get: () => undefined,
      slots: {
        register: (options: Record<string, unknown>) => {
          registrations.push(options)
          return () => {}
        },
        inject: (_slot: string, factory: () => unknown) => {
          factory()
          return () => {}
        },
      },
    }
    expect(() => apply(ctx as never)).not.toThrow()
    expect(registered).toEqual(['dsh-skill-center-local'])
    // main keyed 视图 + panellist 行，键/行 id 同值（官方联动契约）。
    expect(registrations.map((options) => [options.name, options.key ?? options.id]))
      .toEqual([['main', PANEL_KEY], ['sidebar.panellist', PANEL_KEY]])
    for (const dispose of disposers) dispose()
  })

  it('degrades with a warning when the slot mechanism is absent', () => {
    const warn = console.warn
    const warnings: string[] = []
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }
    try {
      const ctx = {
        effect: (fn: () => unknown) => { fn(); return () => {} },
        locale: { register: () => () => {} },
        get: () => undefined,
        slots: { register: () => () => {} },
      }
      expect(() => apply(ctx as never)).not.toThrow()
      expect(warnings.some((line) => line.includes('slots.inject'))).toBe(true)
    } finally {
      console.warn = warn
    }
  })

  /**
   * 交付通道的接线是 S3 收尾新增的（共享 `deliverPrompt`）：会话 id 来自 `sessions`、
   * 草稿面来自 `ctx.get('conversation')`。这两处接错的话面板照常挂载、点击照常「成功」，
   * 而提示词哪儿也没去——所以接线本身要有用例，不能只靠实机点出来。
   */
  it('wires the run channel: sessions id + conversation facade reach the shared deliverPrompt', async () => {
    const drafts: string[] = []
    const registrations: Array<Record<string, unknown>> = []
    const ctx = {
      effect: (fn: () => unknown) => { fn(); return () => {} },
      locale: { register: () => () => {} },
      get: (name: string) => (name === 'conversation'
        ? { input: { shell: () => ({ actions: { setDraft: (text: string) => { drafts.push(text) } } }) } }
        : undefined),
      inject: (_services: readonly string[], callback: (scoped: unknown) => unknown) =>
        callback({ sessions: { list: { getSnapshot: () => ({ current: 'session-9' }) } } }),
      slots: {
        register: (options: Record<string, unknown>) => { registrations.push(options); return () => {} },
        inject: (_slot: string, factory: () => unknown) => { factory(); return () => {} },
      },
    }
    apply(ctx as never)
    const main = registrations.find((options) => options.name === 'main')
    const face = (main?.inject as () => { runSkill: (prompt: string) => Promise<{ ok: boolean; via?: string }> })()
    const outcome = await face.runSkill('使用技能 /demo-skill')
    expect(outcome).toEqual({ ok: true, via: 'draft' })
    expect(drafts).toEqual(['使用技能 /demo-skill'])
  })

  it('没有 sessions / conversation 时如实报失败，不假装交付成功', async () => {
    const registrations: Array<Record<string, unknown>> = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = {
      effect: (fn: () => unknown) => { fn(); return () => {} },
      locale: { register: () => () => {} },
      get: () => undefined,
      slots: {
        register: (options: Record<string, unknown>) => { registrations.push(options); return () => {} },
        inject: (_slot: string, factory: () => unknown) => { factory(); return () => {} },
      },
    }
    apply(ctx as never)
    const main = registrations.find((options) => options.name === 'main')
    const face = (main?.inject as () => { runSkill: (prompt: string) => Promise<{ ok: boolean; reason?: string }> })()
    const outcome = await face.runSkill('文本')
    expect(outcome.ok).toBe(false)
    expect(warn.mock.calls.flat().join(' ')).toContain('没有当前会话 id')
    warn.mockRestore()
  })
})
