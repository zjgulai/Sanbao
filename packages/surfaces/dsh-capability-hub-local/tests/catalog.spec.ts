/**
 * 聚合器行为测试：五切片并发、404 是正常态、单切片失败不拖垮面板、缓存语义。
 */
import { describe, expect, it, vi } from 'vitest'
import { CAPABILITY_ROUTES, CapabilityCatalog, fetchCatalog, type FetchLike } from '../src/client/catalog.ts'

const SKILL_BODY = {
  ok: true,
  groups: [{ key: 'a1', title: '选品', items: [{ name: 'sk-1', title: '技能一', installed: true, modelEnabled: true }] }],
}

const SYSTEM_BODY = {
  ok: true,
  systems: [{ slug: 'grafana', name: 'Grafana', desc: '看板', kind: 'docker', tags: [], reachable: true }],
}

/**
 * 造一个按路由分派的 fetch 替身。
 * @param routes - 路由 → 响应规格（status / body / throw）。
 */
function makeFetch(routes: Record<string, { status?: number; body?: unknown; throws?: string }>): { fetchLike: FetchLike; calls: string[] } {
  const calls: string[] = []
  const fetchLike: FetchLike = async (route) => {
    calls.push(route)
    const spec = routes[route]
    if (spec === undefined) return { ok: false, status: 404, json: async () => ({}) }
    if (spec.throws !== undefined) throw new Error(spec.throws)
    const status = spec.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => spec.body }
  }
  return { fetchLike, calls }
}

describe('fetchCatalog', () => {
  it('并发取七条路由，三条技能线合并为一个 skill 切片', async () => {
    const { fetchLike, calls } = makeFetch({
      [CAPABILITY_ROUTES.overseasSkills]: { body: SKILL_BODY },
      [CAPABILITY_ROUTES.fullstackSkills]: { body: SKILL_BODY },
      [CAPABILITY_ROUTES.genericSkills]: { body: SKILL_BODY },
      [CAPABILITY_ROUTES.systems]: { body: SYSTEM_BODY },
    })

    const result = await fetchCatalog(fetchLike)

    expect(calls).toHaveLength(7)
    const skill = result.slices.find((slice) => slice.slice === 'skill')
    expect(skill?.items).toHaveLength(3)
    expect(skill?.missing).toBe(false)
    expect(result.slices.find((slice) => slice.slice === 'system')?.items).toHaveLength(1)
  })

  it('包未安装（404）是 missing 空切片，不是错误', async () => {
    const { fetchLike } = makeFetch({})
    const result = await fetchCatalog(fetchLike)

    const products = result.slices.find((slice) => slice.slice === 'product')
    expect(products).toMatchObject({ items: [], missing: true })
    // 缺键而不是 error: undefined——404 是正常态，不该在结果里留一个错误位。
    expect(products?.error).toBeUndefined()
  })

  it('单切片抛错只记它自己的 error，其余切片照常产出', async () => {
    const { fetchLike } = makeFetch({
      [CAPABILITY_ROUTES.mcpServers]: { throws: 'connection refused' },
      [CAPABILITY_ROUTES.systems]: { body: SYSTEM_BODY },
    })

    const result = await fetchCatalog(fetchLike)

    expect(result.slices.find((slice) => slice.slice === 'mcp-tool')?.error).toBe('connection refused')
    expect(result.slices.find((slice) => slice.slice === 'system')?.items).toHaveLength(1)
  })

  it('非 2xx（非 404）记 HTTP 状态，不当成功解析', async () => {
    const { fetchLike } = makeFetch({ [CAPABILITY_ROUTES.roles]: { status: 500, body: { error: 'boom' } } })
    const result = await fetchCatalog(fetchLike)

    expect(result.slices.find((slice) => slice.slice === 'role')).toMatchObject({ items: [], missing: false, error: 'HTTP 500' })
  })

  it('取消信号中止时在途切片记 aborted 而不是网络错误文案', async () => {
    const controller = new AbortController()
    const fetchLike: FetchLike = async () => {
      controller.abort()
      throw new Error('The operation was aborted')
    }

    const result = await fetchCatalog(fetchLike, controller.signal)

    // skill 切片由三条路由合并，error 是分号拼接的三段——逐段都必须是 aborted。
    expect(result.slices.every((slice) =>
      slice.error !== undefined && slice.error.split('; ').every((part) => part === 'aborted'))).toBe(true)
    expect(result.slices.every((slice) => slice.items.length === 0)).toBe(true)
  })
})

describe('CapabilityCatalog', () => {
  it('有缓存时复用，force 时重取', async () => {
    const { fetchLike, calls } = makeFetch({ [CAPABILITY_ROUTES.systems]: { body: SYSTEM_BODY } })
    const catalog = new CapabilityCatalog()

    const first = await catalog.load(fetchLike)
    const second = await catalog.load(fetchLike)
    expect(second).toBe(first)
    expect(calls).toHaveLength(7)

    await catalog.load(fetchLike, { force: true })
    expect(calls).toHaveLength(14)
  })

  it('current() 只读缓存不取数', () => {
    const catalog = new CapabilityCatalog()
    expect(catalog.current()).toBeUndefined()
  })

  it('invalidate 后下次 load 重取', async () => {
    const { fetchLike, calls } = makeFetch({})
    const catalog = new CapabilityCatalog()

    await catalog.load(fetchLike)
    catalog.invalidate()
    await catalog.load(fetchLike)
    expect(calls).toHaveLength(14)
  })

  it('取数被取消时不写缓存（下次打开仍会重取）', async () => {
    const controller = new AbortController()
    const fetchLike: FetchLike = vi.fn(async () => {
      controller.abort()
      throw new Error('aborted')
    })
    const catalog = new CapabilityCatalog()

    await catalog.load(fetchLike, { signal: controller.signal })
    expect(catalog.current()).toBeUndefined()
  })
})
