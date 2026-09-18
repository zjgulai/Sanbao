/**
 * 动作分发测试：每个 action type 走的都是既有通道，且失败可见不静默。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchAction, type DispatcherDeps } from '../src/client/dispatcher.ts'
import type { CapabilityAction } from '../src/client/types.ts'

/** 收到的 CustomEvent 记录。 */
interface SeenEvent {
  type: string
  detail: unknown
}

// 原始 dispatchEvent 只保存一次：每个 beforeEach 都重新包装会让补丁层层叠加，
// 同一次派发被记多次（假绿/假红的经典来源）。
const pristineDispatch = window.dispatchEvent.bind(window)

let seen: SeenEvent[] = []

beforeEach(() => {
  seen = []
  window.dispatchEvent = ((event: Event) => {
    seen.push({ type: event.type, detail: (event as CustomEvent).detail })
    return pristineDispatch(event)
  }) as typeof window.dispatchEvent
})

afterEach(() => {
  window.dispatchEvent = pristineDispatch as typeof window.dispatchEvent
  vi.restoreAllMocks()
})

/**
 * 造分发依赖。
 * @param overrides - 覆盖项（sessionId / conversation / fetchLike / layout / mainKeys）。
 */
function deps(overrides: Partial<DispatcherDeps> = {}): DispatcherDeps {
  return {
    sessionId: () => 'session-1',
    conversation: () => undefined,
    fetchLike: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    layout: () => undefined,
    mainKeys: () => [],
    ...overrides,
  }
}

/** 一个能记录 selectPanel 调用的假 layout 服务。 */
function fakeLayout(): { service: { selectPanel: (id: string | null) => void }; selected: Array<string | null> } {
  const selected: Array<string | null> = []
  return { selected, service: { selectPanel: (id) => { selected.push(id) } } }
}

/** 一个能记录 setDraft 调用的假 conversation 服务。 */
function fakeConversation(): { service: unknown; drafts: string[] } {
  const drafts: string[] = []
  return {
    drafts,
    service: { input: { shell: () => ({ actions: { setDraft: (text: string) => { drafts.push(text) } } }) } },
  }
}

/** 装一个假剪贴板。 */
function fakeClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('dispatchAction', () => {
  it('execute-skill：回到对话流并写进草稿，不再广播零听者的技能事件', async () => {
    const { service, drafts } = fakeConversation()
    const { service: layout, selected } = fakeLayout()
    const action: CapabilityAction = { type: 'execute-skill', skillName: 'sk-1', prompt: '请帮我选品：' }

    const outcome = await dispatchAction(action, deps({ conversation: () => service, layout: () => layout }))

    expect(outcome).toEqual({ ok: true })
    // `dsh:skill-execute` 全仓 + 基座零听者（2026-09-19 实测），已删：事件不承载事实。
    expect(seen.map((event) => event.type)).toEqual(['dsh:view-change'])
    expect(seen[0]?.detail).toEqual({ view: 'chat' })
    expect(selected).toEqual([null])
    expect(drafts).toEqual(['请帮我选品：'])
  })

  it('keyed 面板打开时执行技能必须取消面板选中——否则草稿写进了被盖住的 composer', async () => {
    // S3.1 实测到的缺陷形状：面板是中心列视图，它盖着 composer；只广播 view-change
    // 不会取消 keyed 面板（没有任何听者会调 selectPanel），用户点完什么也看不见。
    const { service, drafts } = fakeConversation()
    const { service: layout, selected } = fakeLayout()

    await dispatchAction(
      { type: 'execute-skill', skillName: 'sk-1', prompt: '文本' },
      deps({ conversation: () => service, layout: () => layout, mainKeys: () => ['extensions'] }),
    )

    expect(selected).toEqual([null])
    expect(drafts).toEqual(['文本'])
  })

  it('prefill-draft：写草稿并回到对话流，不派发技能事件', async () => {
    const { service, drafts } = fakeConversation()
    const { service: layout, selected } = fakeLayout()

    const outcome = await dispatchAction(
      { type: 'prefill-draft', prompt: '帮我用 Apify 采集' },
      deps({ conversation: () => service, layout: () => layout }),
    )

    expect(outcome).toEqual({ ok: true })
    expect(drafts).toEqual(['帮我用 Apify 采集'])
    expect(selected).toEqual([null])
    expect(seen.map((event) => event.type)).toEqual(['dsh:view-change'])
  })

  it('草稿通道不可用时降级剪贴板，且原因被上报（不静默）', async () => {
    const writeText = vi.fn(async () => {})
    fakeClipboard(writeText)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const outcome = await dispatchAction({ type: 'prefill-draft', prompt: '文本' }, deps({ conversation: () => undefined }))

    expect(outcome).toEqual({ ok: true })
    expect(writeText).toHaveBeenCalledWith('文本')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('降级为复制到剪贴板'))
  })

  it('没有当前会话时也要出声，不能静默降级', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fakeClipboard(async () => {})

    await dispatchAction({ type: 'prefill-draft', prompt: '文本' }, deps({ sessionId: () => undefined }))

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('没有当前会话 id'))
  })

  it('剪贴板写入被拒时返回失败（回归：曾返回 ok 让点击毫无效果却日志干净）', async () => {
    fakeClipboard(async () => { throw new Error('NotAllowedError') })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const outcome = await dispatchAction({ type: 'prefill-draft', prompt: '文本' }, deps({ sessionId: () => undefined }))

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toContain('NotAllowedError')
  })

  it('会话与草稿都不可用、环境也没有剪贴板 API 时如实报失败', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })

    const outcome = await dispatchAction({ type: 'prefill-draft', prompt: '文本' }, deps({ sessionId: () => undefined }))

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toContain('剪贴板')
  })

  it('open-panel：目标已注册为 main key 时走官方 selectPanel，不广播', async () => {
    const { service: layout, selected } = fakeLayout()

    const outcome = await dispatchAction(
      { type: 'open-panel', view: 'extensions' },
      deps({ layout: () => layout, mainKeys: () => ['extensions'] }),
    )

    expect(outcome).toEqual({ ok: true })
    expect(selected).toEqual(['extensions'])
    expect(seen).toEqual([])
  })

  it('open-panel：目标还没迁到 keyed slot 时回退旧总线，并且出声（静默死点击更难查）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const outcome = await dispatchAction({ type: 'open-panel', view: 'roles' }, deps({ mainKeys: () => ['extensions'] }))

    expect(outcome).toEqual({ ok: true })
    expect(seen).toEqual([{ type: 'dsh:view-change', detail: { view: 'roles' } }])
    expect(warn.mock.calls.flat().join(' ')).toContain("open-panel 'roles'")
  })

  it('open-panel chat：取消面板选中并广播（两条通道都还在用）', async () => {
    const { service: layout, selected } = fakeLayout()

    const outcome = await dispatchAction(
      { type: 'open-panel', view: 'chat' },
      deps({ layout: () => layout, mainKeys: () => ['extensions'] }),
    )

    expect(outcome).toEqual({ ok: true })
    expect(selected).toEqual([null])
    expect(seen).toEqual([{ type: 'dsh:view-change', detail: { view: 'chat' } }])
  })

  it('open-system：只发 slug，不发地址（客户端从不发 URL 的既有边界）', async () => {
    const fetchLike = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))

    const outcome = await dispatchAction({ type: 'open-system', slug: 'grafana' }, deps({ fetchLike }))

    expect(outcome).toEqual({ ok: true })
    expect(fetchLike).toHaveBeenCalledWith('/api/dsh-newapp/open-system', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'grafana' }),
    })
  })

  it('open-system 被宿主拒绝时把原因返回给调用方，不当成功吞掉', async () => {
    const fetchLike = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'unknown system: nope' }) }))

    const outcome = await dispatchAction({ type: 'open-system', slug: 'nope' }, deps({ fetchLike }))

    expect(outcome).toEqual({ ok: false, reason: 'unknown system: nope' })
  })

  it('依赖抛异常时返回失败原因，不向 shell 的栈上抛', async () => {
    const outcome = await dispatchAction(
      { type: 'execute-skill', skillName: 'sk-1', prompt: '文本' },
      deps({ sessionId: () => { throw new Error('boom') } }),
    )

    expect(outcome).toEqual({ ok: false, reason: 'boom' })
  })
})
