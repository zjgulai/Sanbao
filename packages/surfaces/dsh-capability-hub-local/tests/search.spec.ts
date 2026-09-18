/**
 * 搜索评分测试：中英混排下子串 > tag > 摘要 > 子序列的次序，以及空查询语义。
 */
import { describe, expect, it } from 'vitest'
import { searchItems } from '../src/client/search.ts'
import type { CapabilityItem } from '../src/client/types.ts'

function item(overrides: Partial<CapabilityItem> & { id: string }): CapabilityItem {
  return {
    kind: 'skill',
    title: overrides.id,
    summary: '',
    tags: [],
    availability: 'ready',
    action: { type: 'open-panel', view: 'chat' },
    source: { slice: 'skill', route: '/r' },
    ...overrides,
  }
}

describe('searchItems', () => {
  it('空查询按切片优先级分块，而不是沿用取数顺序（回归：首屏曾全是工具）', () => {
    const items = [
      item({ id: 'tool-1', kind: 'mcp-tool' }),
      item({ id: 'skill-1', kind: 'skill' }),
      item({ id: 'system-1', kind: 'system' }),
      item({ id: 'role-1', kind: 'role' }),
    ]

    expect(searchItems(items, '   ').map((hit) => hit.item.id))
      .toEqual(['skill-1', 'role-1', 'system-1', 'tool-1'])
  })

  it('空查询每切片封顶 10 条，保证五个切片都在单屏内可见', () => {
    const many = (kind: 'skill' | 'mcp-tool', count: number) =>
      Array.from({ length: count }, (_, index) => item({ id: `${kind}-${index}`, kind }))
    const hits = searchItems([...many('mcp-tool', 12), ...many('skill', 12)], '')

    expect(hits).toHaveLength(20)
    expect(hits.slice(0, 10).every((hit) => hit.item.kind === 'skill')).toBe(true)
    expect(hits.slice(10).every((hit) => hit.item.kind === 'mcp-tool')).toBe(true)
    expect(hits.every((hit) => hit.score === 0)).toBe(true)
  })

  it('同切片内保持目录原序', () => {
    const items = [item({ id: 'b' }), item({ id: 'a' })]
    expect(searchItems(items, '').map((hit) => hit.item.id)).toEqual(['b', 'a'])
  })

  it('标题子串得分最高，排在 tag/摘要命中之前', () => {
    const items = [
      item({ id: 'summary-hit', summary: '包含 选品 二字' }),
      item({ id: 'tag-hit', tags: ['选品'] }),
      item({ id: 'title-hit', title: '选品研究' }),
    ]

    expect(searchItems(items, '选品').map((hit) => hit.item.id))
      .toEqual(['title-hit', 'tag-hit', 'summary-hit'])
  })

  it('大小写不敏感，且首尾空白不影响命中', () => {
    const items = [item({ id: 'Grafana 看板', title: 'Grafana 看板' })]
    expect(searchItems(items, '  grafana ').map((hit) => hit.item.id)).toEqual(['Grafana 看板'])
  })

  it('子序列兜底：保序不保连续也命中，但排在子串之后', () => {
    const items = [
      item({ id: 'subsequence-only', title: 'a-m-a-z-o-n' }),
      item({ id: 'substring', title: 'amazon 选品' }),
    ]

    // 'amazon' 对第一个条目只是子序列（10 分），对第二个是标题子串（100 分）。
    expect(searchItems(items, 'amazon').map((hit) => hit.item.id)).toEqual(['substring', 'subsequence-only'])
    expect(searchItems(items, 'amazon').map((hit) => hit.score)).toEqual([100, 10])
  })

  it('完全不匹配的条目被过滤掉，不是给 0 分留着', () => {
    const items = [item({ id: 'unrelated', title: '毫不相关' })]
    expect(searchItems(items, 'zzz')).toEqual([])
  })
})
