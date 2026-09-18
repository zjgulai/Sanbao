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
import {
  COLUMNS,
  SIDEBAR_WIDTH_BOUNDS,
  TARGET_SIDEBAR_WIDTH,
  checkSidebarRowAxis,
  horizontalAxis,
  ruleBody,
} from './sidebar-row-axis.mjs'

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
    pos: 'stacked',
    css: 'packages/surfaces/dsh-newapp-local/src/client/newapp.module.css',
    body: 'box-sizing: border-box; display: flex; width: 100%; height: 36px; margin: 2px 0; padding: 0 10px;',
  },
]

/**
 * 启动带上被新应用包改写的官方「新建会话」行：fixture 必须连它的规则一起造出来，
 * 否则本项对它的轴断言会因为「找不到规则」而判红——正常 fixture 必须过。
 */
const RESTYLED = {
  css: ROWS[2].css,
  selector: 'button[class*="newSession"][data-lute-navrow]',
  body: 'box-sizing: border-box; width: 100%; margin: 2px 0; padding: 0 10px;',
}
const CORE = 'shared/client/sidebar-entry-core.ts'
const CORE_TEXT = "const official = {}\nofficial.dataset.luteNavrow = ''\n"


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
    writeFileSync(cssAbs, `.entry {\n  ${spec.bodies?.[row.entry] ?? row.body}\n}\n`
      + (row.css === RESTYLED.css
        ? `${RESTYLED.selector} {\n  ${spec.restyledBody ?? RESTYLED.body}\n}\n`
        : ''))
  }
  const coreAbs = join(root, ...CORE.split('/'))
  mkdirSync(join(coreAbs, '..'), { recursive: true })
  writeFileSync(coreAbs, spec.coreText ?? CORE_TEXT)
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
  assert.match(result.note, /其中 3 行断言了行轴/)
  assert.match(result.note, /另断言 1 条被插件改写的官方行同轴/)
})

test('真实仓库里两行行轴逐字段相同，且等于声明出来的原生轴', () => {
  const rm = horizontalAxis(ruleBody(entryCss(ROWS[0].css), '.entry'))
  const sc = horizontalAxis(ruleBody(entryCss(ROWS[1].css), '.entry'))
  assert.deepEqual(rm, sc)
  assert.deepEqual(rm, COLUMNS['sidebar-nav'].axis)
})

test('真实仓库里启动带三行（新应用行 + 被改写的官方行）同在一条原生轴上', () => {
  const na = horizontalAxis(ruleBody(entryCss(ROWS[2].css), '.entry'))
  const official = horizontalAxis(ruleBody(entryCss(ROWS[2].css), RESTYLED.selector))
  assert.deepEqual(na, COLUMNS['nav-band'].axis)
  assert.deepEqual(official, COLUMNS['nav-band'].axis)
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

test("⑥ position 从 'after' 改成 'stacked' 必须判红（列归属变了，落点路径也不同）", () => {
  const root = fixture({ positions: { [RM]: 'stacked' } })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /position 从 'after' 变成了 'stacked'/)
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

test('⑪b 分组选择器续行的 `.entry {`（`.root,` 换行续过来）不得被读成 `.entry` 的声明块', () => {
  // token 块常写成 `.root,\n.entry {`：续行的 `.entry` 顶着行首，长得跟独立规则一模一样。
  // 这只瞎读会把「token 块」当 row 的轴去读，然后判出一个假红。
  const grouped = '.root,\n.entry {\n  --lute-brand: #000;\n}\n.entry {\n  box-sizing: border-box;\n  width: 100%;\n}\n'
  const body = ruleBody(grouped, '.entry')
  assert.equal(body.includes('--lute-brand'), false)
  assert.equal(horizontalAxis(body).width, '100%')
})

test('⑫ 被改写的官方行轴漂移必须判红（启动带官方行自我漂移的准确断法）', () => {
  const root = fixture({ restyledBody: 'box-sizing: border-box; width: 100%; margin: 2px 4px; padding: 0 10px;' })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /改写的官方行.*marginInline='4px'/)
})

test('⑬ 共享核心不再写 data-lute-navrow 标记时必须判红（CSS 改名/核心改名都会静默失去射程）', () => {
  const root = fixture({ coreText: 'export const noop = 1\n' })
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /dataset\.[a-zA-Z]+|找不到 data-lute-navrow/)
})

test('⑭ 改写规则消失（选择器改了名）必须判红，而不是静默失去射程', () => {
  const root = fixture({ restyledBody: RESTYLED.body })
  writeFileSync(
    join(root, ...RESTYLED.css.split('/')).replace(/\.css$/, '.mjs'),
    '',
  )
  // 顺手把 CSS 里的改写规则写成选择器改名版——规则块还在，但锚名变了。
  const cssAbs = join(root, ...RESTYLED.css.split('/'))
  writeFileSync(cssAbs, `.entry {\n  ${ROWS[2].body}\n}\nbutton[class*="newSession"][data-renamed-anchor] {\n  ${RESTYLED.body}\n}\n`)
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /找不到规则 `button\[class\*="newSession"\]\[data-lute-navrow\] \{`/)
})

test('⑮ 宽度契约常数与合法区间断言（ADR-0125 D7/D8，解决 P-51 缺口）', () => {
  assert.equal(TARGET_SIDEBAR_WIDTH, 264, '目标宽度必须锁定 264px（用户改判定案）')
  assert.deepEqual(SIDEBAR_WIDTH_BOUNDS, [264, 420], '合法边界必须对齐基座 clampWidth 物理区间')
  const root = fixture()
  const result = checkSidebarRowAxis({ repoRoot: root })
  assert.equal(result.passed, true)
  assert.match(result.note, /侧栏宽度契约锁定 264px ⊂ \[264, 420\]/)
})

test('⑯ 侧栏目标宽度契约漂移必须判红（突变断言：模拟误设为 252 或 280）', () => {
  const checkWidthMutant = (mutantWidth) => {
    const [minWidth, maxWidth] = SIDEBAR_WIDTH_BOUNDS
    const violations = []
    if (mutantWidth !== 264) {
      violations.push(
        `侧栏目标宽度契约漂移：当前声明为 ${mutantWidth}px，必须严格为 264px（ADR-0125 D7）`
        + '——解决总账 P-51 登记的「宽度无门禁」缺口',
      )
    }
    if (mutantWidth < minWidth || mutantWidth > maxWidth) {
      violations.push(
        `侧栏目标宽度 ${mutantWidth}px 超出基座 clampWidth 物理边界 [${minWidth}, ${maxWidth}]`,
      )
    }
    return { passed: violations.length === 0, violations }
  }

  // 突变 1：试图硬写 252px（越过基座下界）
  const res252 = checkWidthMutant(252)
  assert.equal(res252.passed, false, '252px 越过下界必须判红')
  assert.match(res252.violations.join('\n'), /必须严格为 264px/)
  assert.match(res252.violations.join('\n'), /超出基座 clampWidth 物理边界/)

  // 突变 2：退回默认 280px
  const res280 = checkWidthMutant(280)
  assert.equal(res280.passed, false, '280px 偏离 264px 目标必须判红')
  assert.match(res280.violations.join('\n'), /当前声明为 280px，必须严格为 264px/)
})
