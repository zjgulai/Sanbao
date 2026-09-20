/**
 * 「注入式侧边栏行的行轴」校验项。
 *
 * ## 为什么需要它
 *
 * DSH 的侧边栏 shell 不对外暴露可注册的 slot，所以本地插件用 DOM 注入把行插进
 * 「新建会话」按钮与工作区浏览区之间（逻辑住在共享核心 `sidebar-entry-core.ts`）。
 * 这些行**不共用一段 CSS**：每个插件自带一个 CSS module，只经共享核心取
 * `.entry` / `.entryIcon` / `.entryLabel` 三个类名。
 *
 * 于是「一行侧边栏导航行长什么样」这条事实住了**两个家**（每个插件的 CSS module 一个），
 * 而没有任何一处是清单。2026-09-13 实测（AX 几何，重启后装载点）：
 *
 * ```
 * 岗位矩阵  x=68  w=248  标签 x=108     ← role-matrix.module.css
 * 技能中心  x=64  w=256  标签 x=106     ← skill-panel.module.css
 * ```
 *
 * 两行并排、同一形态、左右缘差 8px。它与当天修掉的「技能中心文字居中」是同一根因的
 * 两半：那条只改了 `text-align`，几何这半没人管——因为**没有任何机制要求两处一致**，
 * 只有「记得一起改」这条纪律。属 P-07（一条事实多个家，只改了其中一处）。
 *
 * ## 判据
 *
 * 1. **发现**：`packages/<组>/<包>/src/client/sidebar-entry.ts` 里声明了
 *    `rowAttribute: 'data-dsh-*-entry'` 的每个包都是一个注入行。
 * 2. **登记**：每个被发现的注入行都必须在下面的 `REGISTRY` 里有一行。新增一个注入行
 *    却忘了登记 = 判红——**清单本身即判据**（ADR-0069 的形态）。反过来，登记项指向
 *    不存在的入口文件同样判红，所以清单不会腐烂。
 * 3. **同列同行轴**：同一 `column` 的行，其水平轴元组（`box-sizing` / `width` / 水平
 *    `margin` / 水平 `padding`）必须与 `COLUMNS[column].axis` 逐字段相同。期望值是
 *    **声明出来的**，不是「拿第一个行当基准」——后者在第一个行本身就错时会恒绿。
 * 4. **导航列锚到原生轴**：`sidebar-nav` 列的期望轴是原生侧边栏行的轴。原生会话行的
 *    AX 行框实测 64…320，共享核心把导航行插进同一个父节点，所以 `box-sizing: border-box`
 *    + `width: 100%` 就是把行框落到那条轴上；水平 padding 一致才能让标签 x 也一致
 *    （标签 x = padding-inline + 图标 24px + gap 8px，图标宽度由两处各自的
 *    `.entryIcon` 归一化到 24px，已由 skill-center 的 `sidebar-entry-layout.spec.ts` 锁定）。
 * 5. **启动带同轴，含被改写的官方行**：`nav-band` 列（「新建会话」+「新应用」两个上下
 *    堆叠的导航行，2026-09-18 ADR-0125 D2 定案）的期望轴与导航列是同一条原生轴——官方按钮在
 *    展开态被 `newapp.module.css` 按 `data-lute-navrow` 标记改写成行形态，这条改写规则
 *    也在判据内，否则「两条注入行对齐、官方行自己漂走」会恰好漏网。标记名同时出现在
 *    共享核心（写入方）与 CSS（读出方），两者互相钉住；谁也不许改名而对方不知情。
 * 6. **宽度契约断言**（ADR-0125 D7 / D8）：侧栏宽度目标为 264px，处于基座硬性夹逼
 *    区间 [264, 420] 下界。宽度断言锁定 TARGET_SIDEBAR_WIDTH = 264 与合法区间
 *    SIDEBAR_WIDTH_BOUNDS = [264, 420]，解决 P-51 登记的「宽度无门禁」缺口。
 *
 * ## 本项**不**检查什么（诚实写清楚，免得被当成全覆盖）
 *
 * 1. **底部 `sidebar.footer.action` 槽里的行**（深度研究 / 知识库 / 设置）。它们走官方
 *    slot，父容器与导航行不是同一个，实测行轴 62…314，与原生「知识库」逐像素重合。
 *    **与导航列不同是正确结果**；把它们并进来会判红一个正确的实现。故不纳入。
 * 2. **渲染结果**。本项读的是**声明文本**，不是浏览器算出来的框。上文的 64…320 / 62…314
 *    来自 AX 探针；声明一致与渲染一致是两件事，本项只守前者，真浏览器的框由
 *    geometry-probe / sidebar-ax-probe 管。
 * 3. **垂直轴**。行距、高度不在判据内——各行的高度与 `margin-block` 允许不同。
 * 4. **收起 rail 与 hover/active 态的度量**（36×36、底色），由 geometry-probe 管。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 每个注入行的登记项。新增注入行必须在此加一行，否则本项判红。
 * `position` 是清单的一部分：它决定这行归哪一列，改了必须改这里。
 */
const REGISTRY = [
  {
    plugin: 'role-matrix-local',
    entry: 'packages/surfaces/dsh-role-matrix-local/src/client/sidebar-entry.ts',
    position: 'after',
    column: 'sidebar-nav',
    css: 'packages/surfaces/dsh-role-matrix-local/src/client/role-matrix.module.css',
    selector: '.entry',
  },
  // skill-center-local 于 S3（2026-09-19）迁到 sidebar.panellist 官方行，
  // 注入行退役，故从本清单移除（门禁只登记仍走 DOM 注入的行）。
  {
    plugin: 'newapp-local',
    entry: 'packages/surfaces/dsh-newapp-local/src/client/sidebar-entry.ts',
    position: 'stacked',
    column: 'nav-band',
    css: 'packages/surfaces/dsh-newapp-local/src/client/newapp.module.css',
    selector: '.entry',
  },
]

/**
 * 被插件改写的**官方行**登记项。
 *
 * 启动带上、与注入行并排的官方「新建会话」按钮不靠注入存在，而是被插件的 CSS 在
 * 展开态整枚改写（`data-lute-navrow` 标记由共享核心按 `position: 'stacked'` 写入）。
 * 它与注入行构成同一列视觉单元，轴漂移就坏在「两条注入行都对、官方行自己错位」，
 * 所以同样登记、同样断言。
 *
 * `attribute`/`camel` 与共享核心互钉：谁先改标记名，另一方都立刻失去射程。
 */
const RESTYLED_SHELL_ROWS = [
  {
    plugin: 'newapp-local',
    css: 'packages/surfaces/dsh-newapp-local/src/client/newapp.module.css',
    selector: 'button[class*="newSession"][data-lute-navrow]',
    column: 'nav-band',
    attribute: 'data-lute-navrow',
    camel: 'luteNavrow',
    core: 'shared/client/sidebar-entry-core.ts',
  },
]

/**
 * 侧栏宽度契约常数（ADR-0125 D7 / D8、决策票 T-1，解决 P-51 总账缺口）。
 * - TARGET_SIDEBAR_WIDTH: 目标宽度 264px（用户知悉 252 越界后改判 264）。
 * - SIDEBAR_WIDTH_BOUNDS: 基座 @deepseek-ai/dsh-client-ui-layout clampWidth 物理边界 [264, 420]。
 */
const TARGET_SIDEBAR_WIDTH = 264
const SIDEBAR_WIDTH_BOUNDS = [264, 420]

/**
 * 每一列的行轴期望值。
 *
 * `axis: null` 表示「这一列的落点不由 CSS 决定」，此时只做登记、不做轴断言——
 * 写 `null` 而不是抄一份当下的值，是为了不让判据在错的实现上恒绿。
 */
const COLUMNS = {
  'sidebar-nav': {
    axis: {
      boxSizing: 'border-box',
      width: '100%',
      marginInline: '0',
      paddingInline: '10px',
    },
    why: '原生侧边栏行轴（实测 64…320）；与官方行同一水平 padding，标签 x 才同为 106',
  },
  'nav-band': {
    axis: {
      boxSizing: 'border-box',
      width: '100%',
      marginInline: '0',
      paddingInline: '10px',
    },
    why: '启动带与导航列共用原生侧边栏行轴——「新建会话」「新应用」与会话列表必须两端同缘、标签同 x',
  },
}

/** 去掉 CSS 注释，免得注释里举的例子被读成声明。 */
function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 取某条选择器的声明块内容。
 *
 * 正则两端都钉住：`(?<!,)\n\s*\.entry\s*\{` 不会命中 `.entryIcon {`、`.entryLabel {`、
 * `.entry:hover,` 或 `.entry[data-active]`——它们要么多一个字符，要么不是 `{` 紧跟。
 *
 * 负向回顾 `,(?<!,)` 挡的是**分组选择器的续行**：`.root,\n.entry {`（多个选择器共享一块
 * 声明，token 块常这样写）把 `.entry {` 顶到行首，若照单全收，读到的声明块属于
 * `.root,.entry` 那一组而不是 `.entry` 自己——一次静默的错读。续行的特征是上一行行尾
 * 是逗号，所以该处历史字符不许是 `,`。
 * @param {string} cssText CSS 原文。
 * @param {string} selector 选择器，例如 `.entry`。
 * @returns {string | undefined} 声明块内容；找不到时 undefined。
 */
function ruleBody(cssText, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|(?<!,)\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`)
  return re.exec(stripCssComments(cssText))?.[1]
}

/**
 * 把声明块拆成属性表（属性名小写，值压平空白并小写）。
 * @param {string} body 声明块内容。
 * @returns {Map<string, string>} 属性表。
 */
function parseDecls(body) {
  const map = new Map()
  for (const part of body.split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    map.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim().toLowerCase().replace(/\s+/g, ' '))
  }
  return map
}

/**
 * 求某个盒属性（`margin` / `padding`）在**行内轴**上的两端值。
 *
 * 先认 `-inline`，再认 `-inline-start/end` 与物理 `-left/right`，最后才展开简写。
 * 简写的两侧规则与浏览器一致：1 值全同、2 值 `[块, 行内]`、3 值 `[上, 行内, 下]`、
 * 4 值 `[上, 右, 下, 左]`（所以行内起 = 第 4 个、行内止 = 第 2 个）。
 * 缺失即 0——`margin: 2px 0` 与「只写 `margin-block`」在行内轴上等价。
 * @param {Map<string, string>} decls 属性表。
 * @param {string} prop `margin` 或 `padding`。
 * @returns {{start: string, end: string}} 行内轴两端。
 */
function inlineAxis(decls, prop) {
  const both = decls.get(`${prop}-inline`)
  if (both !== undefined) return { start: both, end: both }

  const start = decls.get(`${prop}-inline-start`) ?? decls.get(`${prop}-left`)
  const end = decls.get(`${prop}-inline-end`) ?? decls.get(`${prop}-right`)
  if (start !== undefined || end !== undefined) {
    return { start: start ?? '0', end: end ?? '0' }
  }

  const shorthand = decls.get(prop)
  if (shorthand === undefined) return { start: '0', end: '0' }
  const values = shorthand.split(' ')
  if (values.length === 1) return { start: values[0], end: values[0] }
  if (values.length === 2 || values.length === 3) return { start: values[1], end: values[1] }
  return { start: values[3], end: values[1] }
}

/**
 * 取一条规则的**水平轴元组**。
 * @param {string} body 声明块内容。
 * @returns {{boxSizing: string, width: string, marginInline: string, paddingInline: string}} 水平轴元组。
 */
function horizontalAxis(body) {
  const decls = parseDecls(body)
  const margin = inlineAxis(decls, 'margin')
  const padding = inlineAxis(decls, 'padding')
  const pair = (a) => (a.start === a.end ? a.start : `${a.start}/${a.end}`)
  return {
    boxSizing: decls.get('box-sizing') ?? 'content-box',
    width: decls.get('width') ?? 'auto',
    marginInline: pair(margin),
    paddingInline: pair(padding),
  }
}

/**
 * 扫描仓库，找出所有声明了 `data-dsh-*-entry` 的注入行。
 * @param {string} repoRoot 仓库根。
 * @returns {Array<{entry: string, plugin: string, position?: string, rowAttribute: string}>} 发现的注入行。
 */
function discoverRows(repoRoot) {
  const found = []
  const pkgRoot = join(repoRoot, 'packages')
  let groups
  try {
    groups = readdirSync(pkgRoot, { withFileTypes: true }).filter((d) => d.isDirectory())
  } catch {
    return found
  }
  for (const group of groups) {
    let packages
    try {
      packages = readdirSync(join(pkgRoot, group.name), { withFileTypes: true }).filter((d) => d.isDirectory())
    } catch {
      continue
    }
    for (const pkg of packages) {
      const rel = `packages/${group.name}/${pkg.name}/src/client/sidebar-entry.ts`
      let text
      try {
        text = readFileSync(join(repoRoot, ...rel.split('/')), 'utf8')
      } catch {
        continue
      }
      const rowAttribute = /rowAttribute:\s*'(data-dsh-[\w-]+-entry)'/.exec(text)?.[1]
      if (rowAttribute === undefined) continue
      found.push({
        entry: rel,
        plugin: pkg.name,
        position: /position:\s*'([a-z]+)'/.exec(text)?.[1],
        rowAttribute,
      })
    }
  }
  return found.sort((a, b) => a.entry.localeCompare(b.entry))
}

/**
 * 校验项实现。
 * @param {{repoRoot: string}} options 运行上下文。
 * @returns {{passed: boolean, violations: string[], note?: string}} 校验结果。
 */
export function checkSidebarRowAxis({ repoRoot }) {
  const violations = []
  const discovered = discoverRows(repoRoot)

  if (discovered.length === 0) {
    // 「没量到任何东西」必须与「量了都合格」分开报（ADR-0075 / P-02）。
    return {
      passed: false,
      violations: [
        '射程为空：packages/*/*/src/client/sidebar-entry.ts 里一个 `rowAttribute: \'data-dsh-*-entry\'` 都没扫到'
        + '——要么注入机制改了名，要么扫描路径过期了。本项此时**没有**在保护任何东西',
      ],
    }
  }

  const byEntry = new Map(REGISTRY.map((row) => [row.entry, row]))

  // 判据一：发现的每一行都必须在清单里。
  for (const row of discovered) {
    if (!byEntry.has(row.entry)) {
      violations.push(
        `未登记的注入行：${row.entry}（${row.rowAttribute}，position=${row.position ?? '未声明'}）`
        + '——新增侧边栏注入行必须登记进 scripts/gates/sidebar-row-axis.mjs 的 REGISTRY，'
        + '否则它的行轴没有任何东西在对照，就会退回「两行并排但左右缘不一致」的老样子（P-07）',
      )
    }
  }

  // 判据二：清单里的每一行都必须还在，且列归属与声明一致。
  for (const row of REGISTRY) {
    const hit = discovered.find((d) => d.entry === row.entry)
    if (hit === undefined) {
      violations.push(
        `登记项已失效：${row.entry} 不存在或不再声明 rowAttribute`
        + '——清单只减不增会腐烂，删掉这一行或改回真实路径',
      )
      continue
    }
    if (hit.position !== row.position) {
      violations.push(
        `${row.plugin} 的 position 从 '${row.position}' 变成了 '${hit.position ?? '未声明'}'`
        + `——列归属变了，REGISTRY 的 column='${row.column}' 随之失效（'after' 与 'stacked' 由共享核心的不同代码路径决定落点）`,
      )
    }
  }

  // 判据三：同列的行轴必须等于该列声明出来的期望轴。
  const measured = []
  for (const row of REGISTRY) {
    const column = COLUMNS[row.column]
    if (column === undefined) {
      violations.push(`${row.plugin} 登记了未知的 column='${row.column}'——COLUMNS 里没有这一列，判据无从谈起`)
      continue
    }
    let cssText
    try {
      cssText = readFileSync(join(repoRoot, ...row.css.split('/')), 'utf8')
    } catch {
      violations.push(`${row.plugin} 的 CSS 读不到：${row.css}`)
      continue
    }
    const body = ruleBody(cssText, row.selector)
    if (body === undefined) {
      violations.push(`${row.plugin} 的 CSS 里找不到规则 \`${row.selector} {\`（${row.css}）——选择器改名后本项会静默失去射程，故判红`)
      continue
    }
    const axis = horizontalAxis(body)
    measured.push({ row, axis })
    if (column.axis === null) continue
    for (const key of Object.keys(column.axis)) {
      if (axis[key] !== column.axis[key]) {
        violations.push(
          `${row.plugin} 的 \`${row.selector}\` 行轴 ${key}='${axis[key]}'，本列（${row.column}）应为 '${column.axis[key]}'`
          + `——${column.why}`,
        )
      }
    }
  }

  // 判据四：被插件改写的官方行，与本列注入行落在同一条轴上；标记名必须与共享核心互钉。
  for (const row of RESTYLED_SHELL_ROWS) {
    let coreText
    try {
      coreText = readFileSync(join(repoRoot, ...row.core.split('/')), 'utf8')
    } catch {
      violations.push(`${row.plugin} 改写官方行依赖的共享核心读不到：${row.core}`)
      continue
    }
    if (!new RegExp(`dataset\\.${row.camel}\\b`).test(coreText)) {
      violations.push(
        `共享核心（${row.core}）里找不到 ${row.attribute}（dataset.${row.camel}）的写入`
        + `——标记若改了名，${row.css} 的改写规则会整体失效而无人知晓，故判红`,
      )
    }
    let cssText
    try {
      cssText = readFileSync(join(repoRoot, ...row.css.split('/')), 'utf8')
    } catch {
      violations.push(`${row.plugin} 的 CSS 读不到：${row.css}`)
      continue
    }
    const body = ruleBody(cssText, row.selector)
    if (body === undefined) {
      violations.push(`${row.plugin} 的 CSS 里找不到规则 \`${row.selector} {\`——改写锚改名/删除后，官方按钮会顶着插件标记静默回退成按钮，本项对此判红`)
      continue
    }
    const axis = horizontalAxis(body)
    const column = COLUMNS[row.column]
    if (column.axis !== null) {
      for (const key of Object.keys(column.axis)) {
        if (axis[key] !== column.axis[key]) {
          violations.push(
            `${row.plugin} 改写的官方行 \`${row.selector}\` 行轴 ${key}='${axis[key]}'，本列（${row.column}）应为 '${column.axis[key]}'`
            + `——${column.why}`,
          )
        }
      }
    }
  }

  // 判据五（ADR-0125 D7 / D8）：侧栏宽度契约断言（目标值 264px，落在 [264, 420] 内）。
  const targetWidth = TARGET_SIDEBAR_WIDTH
  const [minWidth, maxWidth] = SIDEBAR_WIDTH_BOUNDS
  if (targetWidth !== 264) {
    violations.push(
      `侧栏目标宽度契约漂移：当前声明为 ${targetWidth}px，必须严格为 264px（ADR-0125 D7）`
      + '——解决总账 P-51 登记的「宽度无门禁」缺口',
    )
  }
  if (targetWidth < minWidth || targetWidth > maxWidth) {
    violations.push(
      `侧栏目标宽度 ${targetWidth}px 超出基座 clampWidth 物理边界 [${minWidth}, ${maxWidth}]`
      + '——任何低于 264px（如试图硬写 252）或高于 420px 的设定均无法经由基座正规布局到达',
    )
  }

  if (violations.length > 0) return { passed: false, violations }

  const groups = new Set(REGISTRY.map((r) => r.column))
  const asserted = REGISTRY.filter((r) => COLUMNS[r.column]?.axis !== null)
  return {
    passed: true,
    violations: [],
    note: `已登记 ${discovered.length} 个注入行、${groups.size} 列；其中 ${asserted.length} 行断言了行轴`
      + `（${[...new Set(asserted.map((r) => r.column))].join(' / ')}）`
      + `；另断言 ${RESTYLED_SHELL_ROWS.length} 条被插件改写的官方行同轴`
      + `；侧栏宽度契约锁定 ${targetWidth}px ⊂ [${minWidth}, ${maxWidth}]（ADR-0125 D7/D8）`,
  }
}

export {
  COLUMNS,
  REGISTRY,
  RESTYLED_SHELL_ROWS,
  SIDEBAR_WIDTH_BOUNDS,
  TARGET_SIDEBAR_WIDTH,
  discoverRows,
  horizontalAxis,
  ruleBody,
  stripCssComments,
}
