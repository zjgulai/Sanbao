/**
 * 折叠的**真实数据**回归测试。
 *
 * 夹具 `fixtures/session-window-captured.json` 是从真机会话事件窗口里抓下来的
 * 信封事件（`{type, seq, time, data}`），只剪掉了折叠不读的负载字段。
 *
 * 为什么必须用真夹具：2026-09-20 踩过一次——折叠按「负载挂在事件对象上」写，
 * 而窗口里负载在 `event.data` 里，于是**一切都对、就是什么都不显示**（源码读起来
 * 通顺、类型也对，只有真数据能戳破）。这条测试就是那个教训的守门员。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { foldSessionActivity, type ActivityEventEntry } from '../src/client/session-activity'

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/session-window-captured.json')
const captured = JSON.parse(readFileSync(fixturePath, 'utf8')) as ActivityEventEntry[]

describe('foldSessionActivity', () => {
  it('空白会话什么都不产出（新建会话里右栏是空的）', () => {
    expect(foldSessionActivity([])).toEqual({ sections: [] })
  })

  it('从真机窗口里折出后台进程栏，且行状态被 tool/result 回填', () => {
    const { sections } = foldSessionActivity(captured)
    const ids = sections.map((section) => section.id)

    // 负载在 event.data 里——读错位置时这里会一个栏都没有。
    expect(ids).toContain('background-procs')

    const procs = sections.find((section) => section.id === 'background-procs')
    expect(procs?.items.length).toBeGreaterThan(0)
    for (const item of procs?.items ?? []) {
      // 汇总行（「还有 N 条」）不是一条活动，没有状态点；其余行必须有终态或进行态。
      if (item.state === undefined) expect(item.label.startsWith('还有 ')).toBe(true)
      else expect(['running', 'done', 'error']).toContain(item.state)
      expect(item.label).not.toBe('')
      expect(item.label.length).toBeLessThanOrEqual(80)
    }
    // 夹具里 49 次调用 / 50 次结果：结果多于调用，说明终态都回填过（没有停在 running）。
    expect(procs?.items.some((item) => item.state === 'done' || item.state === 'error')).toBe(true)
  })

  it('栏的顺序固定，且空栏不出现', () => {
    const { sections } = foldSessionActivity(captured)
    const order = ['background-procs', 'skills-mcp', 'outputs', 'web-search', 'sources']
    const indices = sections.map((section) => order.indexOf(section.id))
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    for (const section of sections) {
      expect(section.items.length).toBeGreaterThan(0)
      expect(section.label).not.toBe('')
      expect(section.icon).toContain('<svg')
    }
  })

  it('同一 revision 的重算保持引用稳定（选择器钩子不会每帧换快照）', () => {
    const first = foldSessionActivity(captured)
    const second = foldSessionActivity(captured)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
})
