/**
 * Panel interaction tests (jsdom): Escape-dismiss semantics around form
 * fields, and the last-good list policy when a refresh fails.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillPanel } from '../src/client/SkillPanel.tsx'
import type { ListPayload } from '../src/client/api.ts'

/** Minimal fake api: list is controllable per call, other methods never used here. */
function fakeApi(listResults: Array<() => Promise<ListPayload>>) {
  let calls = 0
  return {
    calls: () => calls,
    list: async () => { const fn = listResults[Math.min(calls, listResults.length - 1)]; calls += 1; return fn() },
    setEnabled: async () => ({ name: '', enabled: true }),
    remove: async () => ({ ok: true as const, name: '', moved: '' }),
    create: async () => { throw new Error('unused') },
  }
}

const payload = (names: string[]): ListPayload => ({
  cwd: '/work',
  projectRoots: [],
  complete: true,
  groups: [{ key: 'user-dsh', title: 'User skills', hint: '', skills: names.map((name) => ({
    name, description: 'desc', provider: 'filesystem', level: 'user-dsh', path: '/work/' + name + '/SKILL.md',
    modelInvocable: true, userInvocable: true,
  })) }],
})

/** 交付通道桩：默认成功（走草稿）。要测失败路径的用例自己传。 */
const okRun = async (): Promise<{ ok: true; via: 'draft' }> => ({ ok: true, via: 'draft' })

function mount(
  api: ReturnType<typeof fakeApi>,
  onExit: () => void,
  runSkill: (prompt: string) => Promise<{ ok: true; via: 'draft' | 'clipboard' } | { ok: false; reason: string }> = okRun,
): { container: HTMLDivElement; dispose: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  // Render inside act so the commit and passive effects (the document
  // keydown listener) are drained synchronously; an unwrapped render rides
  // the Scheduler and can lose the race on slow CI runners.
  act(() => {
    root.render(<SkillPanel api={api as never} onExit={onExit} runSkill={runSkill} />)
  })
  return {
    container,
    dispose: () => {
      root.unmount()
      container.remove()
    },
  }
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve() })
}

describe('SkillPanel header', () => {
  afterEach(() => { document.body.innerHTML = ''; try { window.localStorage.removeItem('dsh-skill-center:other-expanded') } catch { /* ignore */ } })

  it('renders clean modal title without showing misleading cwd path (#1215)', async () => {
    const api = fakeApi([async () => payload(['demo-skill'])])
    const mount_ = mount(api, () => {})
    await flush()
    const head = mount_.container.querySelector('header')
    expect(head?.textContent).toContain('扩展中心')
    expect(head?.textContent).not.toContain('cwd:')
    mount_.dispose()
  })
})

/** The browse view collapses the unmapped "other" group by default; tests
 * that need plain skill cards visible pre-expand it. */
function expandOtherGroup(): void {
  try { window.localStorage.setItem('dsh-skill-center:other-expanded', '1') } catch { /* ignore */ }
}

describe('SkillPanel escape handling', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('Escape dismisses the panel when not typing in a form field', async () => {
    const api = fakeApi([async () => payload(['demo-skill'])])
    let closed = 0
    const mount_ = mount(api, () => { closed += 1 })
    await flush()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closed).toBe(1)
    mount_.dispose()
  })

const openCreateTab = async (mount_: { container: HTMLElement }): Promise<void> => {
    await act(async () => {
      // The create form lives behind developer mode now.
      const dev = Array.from(mount_.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '开发者模式')
      dev?.click()
    })
    await act(async () => {
      const tab = Array.from(mount_.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '创建')
      tab?.click()
    })
  }

  it('Escape while typing in the create form keeps the panel open', async () => {
    const api = fakeApi([async () => payload(['demo-skill'])])
    let closed = 0
    const mount_ = mount(api, () => { closed += 1 })
    await flush()
    // Developer mode -> create tab -> focus the name input.
    await openCreateTab(mount_)
    const input = mount_.container.querySelector('input') as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)
    // Dispatch from the focused element so the event target is the input.
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closed).toBe(0)
    mount_.dispose()
  })

  it('Escape in a select keeps the panel open', async () => {
    const api = fakeApi([async () => payload(['demo-skill'])])
    let closed = 0
    const mount_ = mount(api, () => { closed += 1 })
    await flush()
    await openCreateTab(mount_)
    const select = mount_.container.querySelector('select') as HTMLSelectElement
    select.focus()
    await act(async () => {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closed).toBe(0)
    mount_.dispose()
  })
})

describe('SkillPanel last-good list policy', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('a failed refresh keeps the previous payload and shows an inline error', async () => {
    expandOtherGroup()
    const api = fakeApi([
      async () => payload(['demo-skill']),
      async () => { throw new Error('boom') },
    ])
    const mount_ = mount(api, () => {})
    await flush()
    expect(mount_.container.textContent).toContain('demo-skill')
    // Trigger a refresh that will fail.
    await act(async () => {
      const refresh = Array.from(mount_.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '刷新')
      refresh?.click()
    })
    await flush()
    const text = mount_.container.textContent ?? ''
    expect(text).toContain('demo-skill')
    expect(text).toContain('boom')
    mount_.dispose()
  })
})

describe('SkillPanel mutation identity', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('forwards the displayed skill path when toggling', async () => {
    expandOtherGroup()
    const api = fakeApi([async () => payload(['demo-skill'])])
    const setEnabled = vi.fn(async () => ({ name: 'demo-skill', enabled: false }))
    api.setEnabled = setEnabled
    const mount_ = mount(api, () => {})
    await flush()
    const toggle = mount_.container.querySelector('[role="switch"]') as HTMLButtonElement
    await act(async () => {
      toggle.click()
    })
    await flush()
    expect(setEnabled).toHaveBeenCalledWith('demo-skill', '/work/demo-skill/SKILL.md', false)
    mount_.dispose()
  })

  it('forwards the displayed skill path when deleting', async () => {
    expandOtherGroup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = fakeApi([async () => payload(['demo-skill'])])
    const remove = vi.fn(async () => ({ ok: true as const, name: 'demo-skill', moved: '/trash/SKILL.md' }))
    api.remove = remove
    const mount_ = mount(api, () => {})
    await flush()
    const deleteButton = Array.from(mount_.container.querySelectorAll('button')).find(button => button.textContent?.trim() === '删除')
    await act(async () => {
      deleteButton?.click()
    })
    await flush()
    expect(remove).toHaveBeenCalledWith('demo-skill', '/work/demo-skill/SKILL.md')
    mount_.dispose()
  })
})

/**
 * S3（2026-09-19）：本面板成了 `main` keyed slot 的中心列视图，「离开」只剩
 * onExit（= 官方 `selectPanel(null)`）一条路；提示词交付走共享 `deliverPrompt`。
 * 这组用例钉住三条退役事实：不再广播 `dsh:view-change`(chat)（听者随注入形态退役）、
 * 不再广播 `dsh:skill-execute`（全仓+基座零听者）、交付失败时不谎报成功。
 */
describe('SkillPanel run path exit channel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    try { window.localStorage.removeItem('dsh-skill-center:other-expanded') } catch { /* ignore */ }
  })

  it('「执行」leaves through onExit, delivers via the shared channel, broadcasts nothing', async () => {
    expandOtherGroup()
    const api = fakeApi([async () => payload(['demo-skill'])])
    let exits = 0
    const prompts: string[] = []
    const seen: string[] = []
    const onEvent = (event: Event): void => { seen.push(event.type) }
    window.addEventListener('dsh:view-change', onEvent)
    window.addEventListener('dsh:skill-execute', onEvent)
    const mount_ = mount(api, () => { exits += 1 }, async (prompt) => { prompts.push(prompt); return { ok: true, via: 'draft' } })
    await flush()
    const run = Array.from(mount_.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '执行')
    expect(run).toBeDefined()
    await act(async () => { run?.click() })
    await flush()
    window.removeEventListener('dsh:view-change', onEvent)
    window.removeEventListener('dsh:skill-execute', onEvent)
    expect(exits).toBe(1)
    expect(prompts).toEqual(['使用技能 /demo-skill'])
    expect(seen).toEqual([])
    mount_.dispose()
  })

  it('两级通道都失败时出声，且不显示「已发送到会话！」（那句话会是撒谎）', async () => {
    expandOtherGroup()
    const api = fakeApi([async () => payload(['demo-skill'])])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mount_ = mount(api, () => {}, async () => ({ ok: false, reason: '草稿通道不可用，且这个环境没有剪贴板 API' }))
    await flush()
    const run = Array.from(mount_.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '执行')
    await act(async () => { run?.click() })
    await flush()
    expect(warn.mock.calls.flat().join(' ')).toContain('未能交付提示词')
    expect(mount_.container.textContent).not.toContain('已发送到会话')
    warn.mockRestore()
    mount_.dispose()
  })
})
