/**
 * R2：`tree.stats.wiring` 的三个行级数必须是真的，且必须构成 `rows` 的一个划分。
 *
 * 为什么单独一个文件：`toOtherRole` / `none` 曾经**硬编码为 0**，而真实分布是
 * 52 / 143。页面自己走 `wiringStatus`，所以屏幕上一点异常都看不出来 —— 但任何
 * 外部消费者（报告、导出、别的 surface）读到的是「没有一张卡接线到别岗，也没有
 * 一张卡没接线」，而那两类恰恰是这一页存在的理由。**仪器读不到，不等于事实为零。**
 *
 * 三层，缺一层都不算数：
 *   ① 已知分布夹具 —— 三个状态各出现已知次数，断言逐项等于真值（不是「大于 0」）；
 *   ② 真入口 —— `apply()` 起一次插件、截下 `/org` 的处理函数、真调一遍，断言
 *      真实数据上的分布与独立算出来的划分一致，且三项之和 === `rows`；
 *   ③ 变异 —— 把 `org-tree.js` 改回硬编码 0（以及改回 `toThisRole: rowsPerRole`
 *      那个不同尺的写法），载入变异体，断言**同一批判据在变异体上会失败**。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { apply } from '../lib/index.js'
import { buildOrgTree, wiringStatus } from '../lib/org-tree.js'
import { CATEGORIES, SKILLS } from '../lib/catalog.js'
import { ROLE_ASSIGNMENTS } from '../lib/role-map.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ORG_TREE_SRC = join(HERE, '..', 'lib', 'org-tree.js')

/**
 * 已知接线分布的夹具。三个状态各出现已知次数，**每个状态都非零** —— 一个只由
 * `self` 组成的夹具会让「另外两项恒为 0」的缺陷照样通过。
 *
 * 行（岗位 × 卡）：
 *   AGT-001 × card-self    → self  （归本岗 + 本岗挂了它）
 *   AGT-001 × card-foreign → self
 *   AGT-002 × card-other   → other （归本岗，但挂载它的是 AGT-001）
 *   AGT-002 × card-none-1  → none
 *   AGT-002 × card-none-2  → none
 * ⇒ rows 5 · self 2 · other 1 · none 2
 */
const FIXTURE = {
  scenarios: [{ key: 'sc-1', title: '场景一' }],
  items: [
    { name: 'card-self', category: 'sc-1' },
    { name: 'card-foreign', category: 'sc-1' },
    { name: 'card-other', category: 'sc-1' },
    { name: 'card-none-1', category: 'sc-1' },
    { name: 'card-none-2', category: 'sc-1' },
  ],
  assignments: {
    'card-self': { roles: [{ id: 'AGT-001' }] },
    'card-foreign': { roles: [{ id: 'AGT-001' }] },
    'card-other': { roles: [{ id: 'AGT-002' }] },
    'card-none-1': { roles: [{ id: 'AGT-002' }] },
    'card-none-2': { roles: [{ id: 'AGT-002' }] },
  },
  roles: [
    {
      id: 'AGT-001',
      alias: '甲',
      title: '岗位一',
      order: 1,
      plane: { id: 'PLN-MGT', name: '经营管理' },
      domain: { id: 'DOM-01', name: '经营与组织' },
      // `card-other` 归 AGT-002，但本岗挂了它 —— 「归位 ≠ 接线」的那个状态。
      wired: ['card-self', 'card-foreign', 'card-other'],
    },
    {
      id: 'AGT-002',
      alias: '乙',
      title: '岗位二',
      order: 2,
      plane: { id: 'PLN-OPS', name: '业务运营' },
      domain: { id: 'DOM-03', name: '供应与履约' },
      wired: [],
    },
  ],
  layerIcons: {},
}

/** 夹具的真值（手写，不由被测代码算出来）。 */
const TRUTH = { rows: 5, toThisRole: 2, toOtherRole: 1, none: 2 }

/** 一次性 apply，截下路由表。 */
function routes() {
  const table = new Map()
  apply({
    credentials: undefined,
    get: () => undefined,
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    webServer: {
      register(spec) {
        table.set(spec.path, spec.handler)
        return () => {}
      },
    },
  })
  return table
}

/** 调一次 handler，收集响应体。 */
function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: '',
      writeHead(status) { this.statusCode = status },
      end(chunk) { this.body = chunk === undefined ? '' : String(chunk); resolve(this) },
    }
    handler(req, res)
  })
}

/**
 * 断言一组 wiring 数满足判据。抽出来是为了让**原始实现与变异体跑的是同一批断言** ——
 * 变异测试要证明的正是「这批断言在坏实现上会失败」，两处各写一份断言就证明不了。
 * @param {object} tree `buildOrgTree` 的产出
 * @param {{rows:number,toThisRole:number,toOtherRole:number,none:number}} want 期望值
 */
function assertWiring(tree, want) {
  const w = tree.stats.wiring
  assert.equal(tree.stats.rows, want.rows, `rows 应为 ${want.rows}，实际 ${tree.stats.rows}`)
  assert.equal(w.toThisRole, want.toThisRole, `toThisRole 应为 ${want.toThisRole}，实际 ${w.toThisRole}`)
  assert.equal(w.toOtherRole, want.toOtherRole, `toOtherRole 应为 ${want.toOtherRole}，实际 ${w.toOtherRole}`)
  assert.equal(w.none, want.none, `none 应为 ${want.none}，实际 ${w.none}`)
  // 三项必须构成 rows 的**划分**。少了这一条，`toThisRole` 可以悄悄变成另一个尺度
  // 而逐项断言照样过（历史形态就是那样：它是 rowsPerRole，即全部行）。
  assert.equal(
    w.toThisRole + w.toOtherRole + w.none,
    tree.stats.rows,
    `toThisRole + toOtherRole + none 必须等于 rows（${w.toThisRole}+${w.toOtherRole}+${w.none} ≠ ${tree.stats.rows}）`,
  )
}

/** 载入一份被改坏的 `org-tree.js`，供变异用例使用。 */
async function loadMutant(mutations) {
  let source = readFileSync(ORG_TREE_SRC, 'utf8')
  for (const [from, to] of mutations) {
    const hits = source.split(from).length - 1
    assert.equal(hits, 1, `变异锚点必须恰好出现一次，实际 ${hits} 次：${from.slice(0, 50)}`)
    source = source.replace(from, to)
  }
  const dir = mkdtempSync(join(tmpdir(), 'org-tree-mutant-'))
  const file = join(dir, 'org-tree.mut.mjs')
  writeFileSync(file, source, 'utf8')
  return {
    module: await import(pathToFileURL(file).href),
    dispose: () => { rmSync(dir, { recursive: true, force: true }) },
  }
}

test('R2 夹具：已知接线分布逐项等于真值（三态各非零）', () => {
  const tree = buildOrgTree(FIXTURE)
  assertWiring(tree, TRUTH)
  // 夹具本身站得住：三个状态都真的出现过，否则「恒为 0」的实现也能过。
  /** @type {Array<[string, number]>} */
  const states = [['toThisRole', TRUTH.toThisRole], ['toOtherRole', TRUTH.toOtherRole], ['none', TRUTH.none]]
  for (const [name, n] of states) {
    assert.ok(n > 0, `夹具里 ${name} 必须非零，否则这条用例证明不了它`)
  }
})

test('R2 真入口：/org 的真实分布与独立算出的划分一致，且三项之和 === rows', async () => {
  const handler = routes().get('/api/dsh-overseas-skills/org')
  assert.ok(handler, '/org 没注册')
  const res = await call(handler, {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:43120' },
  })
  assert.equal(res.statusCode, 200, `回环 GET 应 200，实际 ${res.statusCode}：${res.body.slice(0, 200)}`)
  const body = JSON.parse(res.body)
  const { tree } = body

  // 独立算一遍：不复用 buildOrgTree 的任何计数，只按 wiringStatus 的约定逐行列举。
  // （真机 preset 目录读不到时 roles 为空，那时这条只能证明恒等式，证明不了数值。）
  // 岗位骨架在**负载顶层**（`body.roles`），不在树里：岗位在 8 个场景下会重复出现，
  // 所以树里放的是节点、清单放顶层。第一版写成 `tree.roles` 直接 TypeError。
  const roleIds = new Set(body.roles.map((r) => r.id))
  // ⚠️ 分母必须与 `buildOrgTree` 同域：它只走 `items`（出海目录），而归位表里还有
  //    归位到本目录之外的条目。少这一行会多算 10 行（329 vs 319），看起来像「判据错了」。
  const catalogNames = new Set(SKILLS.map((s) => s.name))
  const counts = { self: 0, other: 0, none: 0 }
  for (const [name, rec] of Object.entries(ROLE_ASSIGNMENTS)) {
    if (!catalogNames.has(name)) continue
    for (const r of rec?.roles ?? []) {
      if (!roleIds.has(r.id)) continue
      counts[wiringStatus(name, r.id, tree.wiredIndex).kind] += 1
    }
  }
  assert.equal(
    tree.stats.wiring.toThisRole, counts.self,
    `toThisRole 应是 ${counts.self} 行（本岗挂了它），实际 ${tree.stats.wiring.toThisRole}`,
  )
  assert.equal(
    tree.stats.wiring.toOtherRole, counts.other,
    `toOtherRole 应是 ${counts.other} 行（挂了、但挂它的不是本岗），实际 ${tree.stats.wiring.toOtherRole}`,
  )
  assert.equal(tree.stats.wiring.none, counts.none, `none 应是 ${counts.none} 行，实际 ${tree.stats.wiring.none}`)

  assert.equal(
    tree.stats.wiring.toThisRole + tree.stats.wiring.toOtherRole + tree.stats.wiring.none,
    tree.stats.rows,
    '三项必须构成 rows 的划分',
  )

  // 这两个数**在真实数据上非零**：它们曾经是 0，正是 R2 报的缺陷。
  assert.ok(tree.stats.wiring.toOtherRole > 0, '真实数据上「接线到别岗」的行数必须非零')
  assert.ok(tree.stats.wiring.none > 0, '真实数据上「谁也没挂」的行数必须非零')

  // `wired` 是另一个尺度（preset 白名单槽位数），不属于这个划分，不许拿它当第四项。
  assert.equal(
    typeof tree.stats.wiring.wired, 'number',
    'wired 必须保留（外部消费者在用），但它是槽位数不是行数',
  )
})

test('R2 变异：改回硬编码 0 ⇒ 同一批判据失败', async () => {
  // 这正是 R2 的历史形态：另两项写死 0，页面看不出来，外部消费者拿到错数。
  const mutant = await loadMutant([
    ['        toOtherRole: rowsToOtherRole,\n        none: rowsUnwired,', '        toOtherRole: 0,\n        none: 0,'],
  ])
  try {
    // 先证明变异真的改了取值，再谈断言有没有劲。
    const original = buildOrgTree(FIXTURE)
    const broken = mutant.module.buildOrgTree(FIXTURE)
    assert.deepEqual(
      [original.stats.wiring.toThisRole, original.stats.wiring.toOtherRole, original.stats.wiring.none],
      [TRUTH.toThisRole, TRUTH.toOtherRole, TRUTH.none],
    )
    assert.deepEqual(
      [broken.stats.wiring.toThisRole, broken.stats.wiring.toOtherRole, broken.stats.wiring.none],
      [TRUTH.toThisRole, 0, 0],
    )
    assert.throws(() => assertWiring(broken, TRUTH), /toOtherRole 应为 1，实际 0/)
  } finally {
    mutant.dispose()
  }
})

test('R2 变异：把 toThisRole 改回「全部行」那个尺度 ⇒ 划分恒等式当场失败', async () => {
  const mutant = await loadMutant([['        toThisRole: rowsToThisRole,', '        toThisRole: rowsPerRole,']])
  try {
    const broken = mutant.module.buildOrgTree(FIXTURE)
    assert.equal(broken.stats.wiring.toThisRole, TRUTH.rows, '变异体应把 toThisRole 变成全部行')
    assert.throws(() => assertWiring(broken, TRUTH), /toThisRole 应为 2|必须等于 rows/)
  } finally {
    mutant.dispose()
  }
})
