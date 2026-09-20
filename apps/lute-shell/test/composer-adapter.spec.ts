import { describe, expect, it } from 'vitest'
import { Script } from 'node:vm'
import { readFileSync } from 'node:fs'
import { adaptClientBundle } from '../src/host/composer-adapter.js'

const bundle = readFileSync(new URL('./fixtures/conversation-client.js', import.meta.url), 'utf8')
const presetBundle = readFileSync(new URL('./fixtures/agent-preset-client.js', import.meta.url), 'utf8')

describe('conversation asset adapter', () => {
  it('replaces the resident render body without replacing the input machine or approval chain', () => {
    const adapted = adaptClientBundle(bundle)
    expect(() => new Script(adapted)).not.toThrow()
    expect(adapted).toContain('data-sanbao-composer')
    expect(adapted).toContain('keyboard.submit(primarySubmitMode)')
    expect(adapted).toContain('registerComposerKeymap(editor,')
    expect(adapted).toContain('renderSlotChain("conversation.composer"')
    expect(adapted).not.toContain('const inert = sessionId === void 0 || hero && chipTitle === void 0;')
    expect(adapted).toContain('accessory: heroWorkspaceRow')
  })

  it('rejects a renamed editor binding before returning executable bytes', () => {
    const changed = bundle.replaceAll('ComposerContentEditable', 'RenamedContentEditable')
    expect(() => adaptClientBundle(changed)).toThrow(/composer.*anchor/u)
  })

  it('rejects an incompatible composer rather than silently serving the old UI', () => {
    expect(() => adaptClientBundle(bundle.replace('const primaryStops =', 'const renamedPrimaryStops =')))
      .toThrow(/composer.*anchor/u)
  })

  it('does not rewrite neighboring modules in a combined response', () => {
    const neighbor = 'window.__ModuleLoader__.load({\n\tid: "neighbor",\n\tfactory: () => ({label: chipTitle, renderSlot: true})\n});'
    const combined = neighbor + '\n' + bundle + '\n' + neighbor
    expect(adaptClientBundle(combined).startsWith(neighbor + '\n')).toBe(true)
    expect(adaptClientBundle(combined).endsWith('\n' + neighbor)).toBe(true)
  })

  it('shares concurrent bootstrap work and does not select a session after its view leaves', async () => {
    let finishCreate!: (id: string) => void
    let creates = 0
    const opened: string[] = []
    const sessions = {
      list: { getSnapshot: () => ({ current: undefined, phase: 'ready' }) },
      create: async ({ cwd }: { cwd: string }) => {
        expect(cwd).toBe('/private/session-workspaces/chat-one')
        creates += 1
        return new Promise<string>(resolve => { finishCreate = resolve })
      },
    }
    const adapted = adaptClientBundle(bundle)
    const body = adapted.slice(adapted.indexOf('let localSessionPending;'), adapted.indexOf('const registerConversationRoot'))
    const start = new Function('sessions', 'workspaceNavigation', 'fetch', body + '; return startLocalSession;')(
      sessions, { openSession: (id: string) => { opened.push(id) } },
      async () => Response.json({ cwd: '/private/session-workspaces/chat-one' }),
    ) as (signal: AbortSignal) => Promise<string>
    const stale = new AbortController()
    const active = new AbortController()
    const one = start(stale.signal)
    const two = start(active.signal)
    await new Promise(resolve => setImmediate(resolve))
    stale.abort()
    finishCreate('session-one')
    await Promise.all([one, two])
    expect(creates).toBe(1)
    expect(opened).toEqual(['session-one'])
  })

  it('does not open the bootstrap session after all requesting views leave', async () => {
    let finishCreate!: (id: string) => void
    const opened: string[] = []
    const adapted = adaptClientBundle(bundle)
    const body = adapted.slice(adapted.indexOf('let localSessionPending;'), adapted.indexOf('const registerConversationRoot'))
    const start = new Function('sessions', 'workspaceNavigation', 'fetch', body + '; return startLocalSession;')(
      { list: { getSnapshot: () => ({ current: undefined, phase: 'ready' }) }, create: () => new Promise<string>(resolve => { finishCreate = resolve }) },
      { openSession: (id: string) => { opened.push(id) } },
      async () => Response.json({ cwd: '/private/session-workspaces/chat-two' }),
    ) as (signal: AbortSignal) => Promise<string>
    const controller = new AbortController()
    const pending = start(controller.signal)
    await new Promise(resolve => setImmediate(resolve))
    controller.abort()
    finishCreate('session-two')
    await pending
    expect(opened).toEqual([])
  })

  it('leaves unrelated plugin bytes unchanged', () => {
    expect(adaptClientBundle('window.__ModuleLoader__.load({id: "another-plugin"});'))
      .toBe('window.__ModuleLoader__.load({id: "another-plugin"});')
  })

  it('labels the workspace chip 项目 while its picker keeps the full accessible name', () => {
    const adapted = adaptClientBundle(bundle)
    expect(adapted).toContain('label: chipTitle ?? "项目",')
    expect(adapted).not.toContain('"无项目"')
  })

  it('shortens permission labels and keeps the full name for aria and tooltip', () => {
    const adapted = adaptClientBundle(bundle)
    const body = adapted.slice(
      adapted.indexOf('function displayName(name) {'),
      adapted.indexOf('function PermissionSelect({ value, locked, command, t }) {'),
    )
    const en = {
      'access.preset.readOnly': 'Read Only',
      'access.preset.workspaceWrite': 'Workspace Write',
      'access.preset.fullAccess': 'Full access',
    }
    const zh = {
      readOnly: '仅可查看',
      workspaceWrite: '工作区内修改',
      fullAccess: '完全权限',
    }
    const t = (key: string) => (key === 'access.preset.readOnly' ? zh.readOnly : key === 'access.preset.fullAccess' ? zh.fullAccess : zh.workspaceWrite)
    const { permissionLabel, permissionShortLabel } = new Function('en', 'FULL_ACCESS', `${body}; return { permissionLabel, permissionShortLabel };`)(en, 'danger-full-access') as {
      permissionLabel: (value: string, name: string, t: (key: string) => string) => string
      permissionShortLabel: (value: string, name: string, t: (key: string) => string) => string
    }
    expect(permissionLabel('workspace-write', zh.workspaceWrite, t)).toBe('工作区内修改')
    expect(permissionShortLabel('workspace-write', zh.workspaceWrite, t)).toBe('可改')
    expect(permissionShortLabel('read-only', zh.readOnly, t)).toBe('只读')
    expect(permissionShortLabel('danger-full-access', zh.fullAccess, t)).toBe('全权')
    expect(permissionShortLabel('read-only', 'Read Only', t)).toBe('只读')
    expect(permissionShortLabel('workspace-write', '我的自定义', t)).toBe('我的自定义')
    expect(adapted).toContain('"aria-label": t("input.accessMode", { name: currentFullLabel })')
    expect(adapted).toContain('title: current?.description ?? currentFullLabel,')
    expect(adapted).toContain('label: permissionShortLabel(option.value, option.name, t),')
  })

  it('shortens the built-in preset seat label while hover and picker keep the full name', () => {
    const adapted = adaptClientBundle(presetBundle)
    expect(() => new Script(adapted)).not.toThrow()
    const body = adapted.slice(
      adapted.indexOf('const SANBAO_SHORT_PRESET_NAMES = {'),
      adapted.indexOf('function AgentPresetSeat({ load, select, introduced, useAgentPresetSeat, t }) {'),
    )
    const { presetSeatLabel } = new Function(`${body}; return { presetSeatLabel };`)() as {
      presetSeatLabel: (preset: { id: string; trust: string } | undefined, label: string) => string
    }
    expect(presetSeatLabel({ id: 'standard', trust: 'system' }, '标准模式')).toBe('标准')
    expect(presetSeatLabel({ id: 'cordis', trust: 'system' }, '创造模式')).toBe('创造')
    expect(presetSeatLabel({ id: 'mine', trust: 'user' }, '我的预设')).toBe('我的预设')
    expect(presetSeatLabel(undefined, '标准模式')).toBe('标准模式')
    expect(adapted).toContain('const seatLabel = presetSeatLabel(chosen, label);')
    expect(adapted).toContain('const characters = Array.from(seatLabel);')
    expect(adapted).toContain('}) : seatLabel;')
    expect(adapted).toContain('label + " · " + t("seatHint")')
    expect(adapted).not.toContain('data-sanbao-composer')
  })

  it('rejects an agent preset bundle whose seat anchors drifted', () => {
    const drifted = presetBundle.replace(
      'if (!ready) return null;\n\t\t\tconst characters = Array.from(label);',
      'if (!ready) return null;\n\t\t\tconst characters = [...label];',
    )
    expect(() => adaptClientBundle(drifted)).toThrow(/agent preset.*anchor/u)
  })
})
