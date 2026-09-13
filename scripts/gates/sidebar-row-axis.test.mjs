/**
 * `sidebar-row-axis.mjs` 的反向自测。
 *
 * 为什么这些用例必须是「能说**不**」的用例：本项守的是一条**没有单一住处的事实**
 * ——「一行注入式侧边栏导航行长什么样」同时住在每个插件的 CSS module 里，而没有任何
 * 一处是清单。只会在正确时判绿的校验，与没有校验的区别只在于它更让人放心，而那正是
 * P-02「仪器假绿」的成因。
 *
 * 最要紧的是那条**恒真桩突变**（⑨）：一个只核对「登记了没有」的实现，必须在
 * 「两行行轴漂移」这条上**失效**——输入用的就是 2026-09-13 实测撞上的缺陷形状
 * （`width: calc(100% - 8px)` + `margin: 2px 4px`，行框 68…316 而兄弟行 64…320）。
 * 那种退化的实现会放过它，因为两行确实都登记了。这条用例的作用就是让退化实现红给你看。
 *
 * 另一条同样要紧的是**空射程**（⑧）：扫不到任何注入行时必须判红，不能报通过。
 * 「没量到东西」被读成「都合格」是本类判据最便宜的失效路径（ADR-0075 / P-02）。
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COLUMNS, checkSidebarRowAxis, horizontalAxis, ruleBody } from './sidebar-row-axis.mjs'

const ROOT = new URL('../../', import.meta.url).pathname

/**
 * 三行的最小 fixture。入口文件只保留本项真正读的两处声明（`rowAttribute` / `position`）。
 * `body` 是各自的 `.entry` 声明块，默认值取自 2026-09-13 修复后的真实树。
 */
const ROWS = [
  {
    entry: 'packages/surfaces/dsh-role-matrix-local/src/client/sidebar-entry.ts',
    attr: 'data-dsh-role-matrix-entry',
    pos: 'after',
    css: 'packages/surfaces/dsh-role-matrix-local/src/client/role-matrix.module.css',
    body: 'box-sizing: border-box; display: flex; width: 100%; height: 36px; margin: 2px 0; padding: 0 10px;',
  },
  {
    entry: 'packages/surfaces/dsh-skill-center-local/src/client/sidebar-entry.ts',
    attr: 'data-dsh-skill-center-entry',
    pos: 'after',
    css: 'packages/surfaces/dsh-skill-center-local/src/client/skill-panel.module.css',
    body: 'box-sizing: border-box; display: flex; width: 100%; height: 36px; padding: 0 10px;',
  },
  {
    entry: 'packages/surfaces/dsh-newapp-local/src/client/sidebar-entry.ts',
    attr: 'data-dsh-newapp-entry',
    pos: 'split',
    css: 'packages/surfaces/dsh-newapp-local/src/client/newapp.module.css',
    body: 'box-sizing: border-box; display: flex; height: 38px; margin: 0 2px 8px; padding: 8px 16px;',
  },
]

const RM = ROWS[0].entry
const SC = ROWS[1].entry
const NA = ROWS[2].entry

const temps = []
afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop(), { recursive: true, force: true })
})

/**
 * 造一棵 fixture 树。
 * @param {{bodies?: Record<string, string>, positions?: Record<string, string>, extraRows?: Array<{entry: string, attr: string, pos: string}>, dropEntry?: string}} spec 覆盖项。
 * @returns {string} 仓库根。
 */
function fixture(spec = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sidebar-row-axis-'))
  temps.push(root)
  for (const row of ROWS) {
    const entryAbs = join(root, ...row.entry.split('/'))
    mkdirSync(join(entryAbs, '..'), { recursive: true })
    if (spec.dropEntry !== row.entry) {
      const pos = spec.positions?.[row.entry] ?? row.pos
      writeFileSync(
        entryAbs,
        `export const ENTRY_SELECTOR = '[${row.attr}]'\n`
        + `mountSidebarEntry({\n  rowAttribute: '${row.attr}',\n  position: '${pos}',\n})\n`,
      )
    }
    const cssAbs = join(root, ...row.css.split('/'))
    mkdirSync(join(cssAbs, '..'), { recursive: true })
    writeFileSync(cssAbs, `.entry {\n  ${spec.bodies?.[row.entry] ?? row.body}\n}\n`)
  }
  for (const extra of spec.extraRows ?? []) {
    const abs = join(root, ...extra.entry.split('/'))
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, `mountSidebarEntry({ rowAttribute: '${extra.attr}', position: '${extra.pos}' })\n`)
  }
  return root
}

const entryCss = (rel) => readFileSync(join(ROOT, ...rel.split('/')), 'utf8')

test('真实仓库通过，并把射程写进 note（登记行数 / 列数 / 断言轴的行数）', () => {
  const result = checkSidebarRowAxis({ repoRoot: ROOT })
  assert.deepEqual(result.violations, [])
  assert.equal(result.passed, true)
  // 射程必须落在 note 里，否则「量了几个」无从判断（ADR-0075）。
  assert.match(result.note, /已登记 3 个注入行、2 列/)
  assert.match(result.note, /其中 2 行断言了行轴/)
})

test('真实仓库里两行行轴逐字段相同，且等于声明出来的原生轴', () => {
  const rm = horizontalAxis(ruleBody(entryCss(ROWS[0].css), '.entry'))
  const sc = horizontalAxis(ruleBody(entryCss(ROWS[1].css), '.entry'))
  assert.deepEqual(rm, sc)
  assert.deepEqual(rm, COLUMNS['sidebar-nav'].axis)
})

test('① 岗位矩阵退回自带宽度约定（width: calc(100% - 8px) + margin: 2px 4px）必须判红', () => {
  const root = fixture({
    bodies: {
      [RM]: 'box-sizing: border-box; display: flex; width: calc(100% - 8px); margin: 2px 4px; padding: 6px 8px;',
    },
  })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /marginInline='4px'/)
  assert.match(result.violations.join('\n'), /width='calc\(100% - 8px\)'/)
})

test('② 技能中心丢掉 box-sizing 必须判红（content-box 下 width:100% 还要再加 padding）', () => {
  const root = fixture({
    bodies: { [SC]: 'display: flex; width: 100%; height: 36px; padding: 0 10px;' },
  })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /boxSizing='content-box'/)
})

test('③ 两行 padding-inline 不同必须判红（标签 x 会正好差这个 padding）', () => {
  const root = fixture({
    bodies: { [RM]: 'box-sizing: border-box; width: 100%; margin: 2px 0; padding: 0 8px;' },
  })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /paddingInline='8px'/)
})

test('④ 新增一个没登记的注入行必须判红（清单本身即判据）', () => {
  const root = fixture({
    extraRows: [{
      entry: 'packages/surfaces/dsh-taskboard-local/src/client/sidebar-entry.ts',
      attr: 'data-dsh-taskboard-entry',
      pos: 'after',
    }],
  })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /未登记的注入行：packages\/surfaces\/dsh-taskboard-local/)
})

test('⑤ 登记项指向不存在的入口必须判红（清单不许腐烂）', () => {
  const root = fixture({ dropEntry: NA })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /登记项已失效：.*dsh-newapp-local/)
})

test("⑥ position 从 'after' 改成 'split' 必须判红（列归属变了，几何算法也不同）", () => {
  const root = fixture({ positions: { [RM]: 'split' } })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /position 从 'after' 变成了 'split'/)
})

test('⑦ 选择器改名后必须判红，而不是静默失去射程', () => {
  const root = fixture()
  writeFileSync(
    join(root, ...ROWS[0].css.split('/')),
    '.entryRenamed {\n  box-sizing: border-box;\n  width: 100%;\n}\n',
  )
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /找不到规则 `\.entry \{`/)
})

test('⑧ 射程为空必须判红，不许当「没什么可比的」放行', () => {
  const root = mkdtempSync(join(tmpdir(), 'sidebar-row-axis-empty-'))
  temps.push(root)
  mkdirSync(join(root, 'packages'), { recursive: true })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /射程为空/)
})

test('⑨ 恒真桩突变：只核对「登记了没有」的实现，必须在本项最该拦的缺陷上失效', () => {
  // 一个只看「发现的注入行是否都在清单里」的实现——它对行轴一无所知。
  const REGISTERED = new Set(ROWS.map((r) => r.entry))
  const registrationOnlyStub = (repoRoot) => {
    const found = ROWS.filter((row) => {
      try {
        readFileSync(join(repoRoot, ...row.entry.split('/')))
        return true
      } catch {
        return false
      }
    })
    return found.filter((row) => !REGISTERED.has(row.entry)).length === 0
  }
  // 缺陷就在树里：岗位矩阵退回改前的宽度约定。
  const root = fixture({
    bodies: { [RM]: 'box-sizing: border-box; width: calc(100% - 8px); margin: 2px 4px; padding: 6px 8px;' },
  })
  assert.equal(registrationOnlyStub(root), true, '桩在缺陷树上应报通过——这正是它退化的证据')
  assert.equal(checkSidebarRowAxis({ repoRoot: root }).passed, false, '真判据必须说「不」')
})

test('⑩ 简写展开与浏览器一致：2 值取行内、4 值取起止两侧、单值两侧相同', () => {
  assert.equal(horizontalAxis('margin: 2px 0;').marginInline, '0')
  assert.equal(horizontalAxis('margin: -2px;').marginInline, '-2px')
  assert.equal(horizontalAxis('padding: 0 10px 0 8px;').paddingInline, '8px/10px')
  // 显式 inline 属性优先于简写。
  assert.equal(horizontalAxis('margin: 2px 4px; margin-inline: 0;').marginInline, '0')
  // 物理 left/right 也算行内轴（本项目是 LTR）。
  assert.equal(horizontalAxis('padding-left: 8px; padding-right: 10px;').paddingInline, '8px/10px')
  // 完全没写 = 0，与只写 margin-block 等价。
  assert.equal(horizontalAxis('padding: 0 10px;').marginInline, '0')
})

test('⑪ 注释里出现的 `.entry {` 不得被读成声明', () => {
  const withComment = '/* 举例：\n.entry { width: 999px; }\n*/\n.entry {\n  width: 100%;\n}\n'
  assert.equal(ruleBody(withComment, '.entry').includes('999px'), false)
})
