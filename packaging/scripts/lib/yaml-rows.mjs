/**
 * Cordis 组合文件（`agent.cordis.yml` / `cordis.patch.yml`）的**顶层条目块**切分与手术。
 *
 * ## 为什么独立成模块
 *
 * 这段逻辑原先只住在 `strip-local-products.mjs` 里。2026-09-14 需要第二条判据
 * （`check-preset-rows.mjs`：出货 preset 的每一行必须在出货面里解析得到）时，它有两条路：
 * 抄一份，或者共用一份。抄一份正是本仓库总账 P-07 记下的形态——「同一个判据出现在两个以上
 * 文件里时，正确动作不是『都改对』，而是**收成一家**：两份实现迟早分叉，而分叉时没有任何
 * 东西会说话」（2026-09-14 实测过一次：`docs-links` 与 `pitfalls-playbook` 各有一份
 * 「哪段文字算链接」，剥行内代码的规则已经不一致了）。
 *
 * 所以这里只保留**与用途无关**的那一半：把文本切成条目块、把块拆成「自身行 / 子条目」、
 * 按判定过滤块。**怎么判定**（哪些行该删）留在各自的调用方——那是两条判据的真正区别。
 *
 * ## 判据的形状（两条调用方都依赖它）
 *
 * 一条 Cordis 行的语义写在**它自己的行**里（`- id:` / `  name:` / 同一层级的键），
 * 子条目是另一个插件行。于是「这一行是不是引用了 X」必须只看自身行：
 *
 *     - insert:                       ← 容器：自身不带包名
 *         - id: a                     ← 子条目：带了才删它，容器与兄弟行保留
 *           name: '@scope/x'
 *         - id: b
 *           name: 'keep-me'
 *
 * 只看整块就会连带删掉 `b`——那是**静默丢失**，比多留一行危险得多。
 *
 * ## 边界（诚实写清楚）
 *
 * 这不是 YAML 解析器：它只认「顶层 `- ` 开头 + 缩进」这一种形态，因为两个调用方的输入都是
 * 我们自己生成的组合文件（`scripts/role-presets/generate.mjs` 的输出）。遇到本模块看不懂的
 * 形态（`!!js` 块标量、行内流式列表里再嵌条目）它不会报错、也不会猜——调用方的判定会把
 * 「没解析出 name」当成一条需要人看的形态处理（见 `check-preset-rows.mjs`）。
 *
 * @module
 */

/**
 * 把一个行数组切成顶层条目块。
 *
 * `start` 是该块第一行在**传入数组**里的下标（0 基）。嵌套调用时它是相对被切片的子数组的
 * 下标，不是全文行号——需要全文行号时按顶层调用的结果取（`check-preset-rows.mjs` 报违规
 * 行号就是这么用的）。
 * @param {string[]} lines 原始行
 * @returns {Array<{indent: number, lines: string[], start: number, lead?: boolean}>} 条目块；文件开头的非条目行归入首块并带 `lead: true`
 */
export function splitRowBlocks(lines) {
  const blocks = []
  let lead = []
  let leadStart = 0
  let cur = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const m = /^(\s*)- /.exec(line)
    if (m !== null) {
      if (cur !== null) blocks.push(cur)
      cur = { indent: m[1].length, lines: [line], start: i }
    } else if (cur === null) {
      if (lead.length === 0) leadStart = i
      lead.push(line)
    } else {
      cur.lines.push(line)
    }
  }
  if (cur !== null) blocks.push(cur)
  if (lead.length > 0) blocks.unshift({ indent: -1, lead: true, lines: lead, start: leadStart })
  return blocks
}

/**
 * 把一个条目块拆成「自身行」与「子条目块」。
 * 子条目 = 缩进比本块深的条目行及其续行。
 * @param {{indent: number, lines: string[]}} block 条目块
 * @returns {{own: string[], children: Array<{indent: number, lines: string[]}>}}
 */
export function splitOwnBlock(block) {
  const own = []
  const childLines = []
  let inChild = false
  for (const line of block.lines) {
    const m = /^(\s*)- /.exec(line)
    if (m !== null && m[1].length > block.indent) inChild = true
    if (inChild) childLines.push(line)
    else own.push(line)
  }
  return { own, children: childLines.length > 0 ? splitRowBlocks(childLines) : [] }
}

/**
 * 按判定过滤条目块，返回保留下来的行。
 *
 * 语义（与 `strip-local-products.mjs` 2026-09-13 起的行为逐条对齐，重构时以 dry-run 输出
 * 逐字节相同为证）：
 * - 前导块原样保留；
 * - `decide(own, children, block)` 判 `'drop'` → 整块（含子条目）删掉；
 * - 否则递归过滤子条目；**子条目被删空时容器一并删**——空的 `- insert:` 会让 loader 报错。
 * @param {Array<{indent: number, lines: string[], lead?: boolean}>} blocks 条目块
 * @param {(own: string[], children: unknown[], block: unknown) => 'drop' | 'keep'} decide 判定
 * @param {(info: {kind: 'row' | 'emptyContainer', own: string[]}) => void} [onDrop] 每次删除的回报（调用方据此打印读数）
 * @returns {string[]} 保留下来的行
 */
export function filterRowBlocks(blocks, decide, onDrop) {
  const keep = (block) => {
    if (block.lead === true) return block.lines
    const { own, children } = splitOwnBlock(block)
    if (decide(own, children, block) === 'drop') {
      onDrop?.({ kind: 'row', own })
      return null
    }
    if (children.length === 0) return own
    const keptChildren = children.map(keep).filter((x) => x !== null)
    if (keptChildren.length === 0) {
      onDrop?.({ kind: 'emptyContainer', own })
      return null
    }
    return [...own, ...keptChildren.flat()]
  }
  return blocks
    .map(keep)
    .filter((x) => x !== null)
    .flat()
}

/**
 * 一条插件行的自述字段。
 * @param {string[]} own 该行的自身行
 * @returns {{id?: string, name?: string, fileRefs: string[]}} 解析结果；缺失即 `undefined`，由调用方决定怎么处置
 */
export function rowFields(own) {
  let id
  let name
  const fileRefs = []
  for (const line of own) {
    const kv = /^\s*(?:- )?([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv === null) continue
    const value = kv[2].trim().replace(/^['"]|['"]$/g, '')
    if (kv[1] === 'id' && id === undefined) id = value
    else if (kv[1] === 'name' && name === undefined) name = value
    if (/(?:^|\s)file:/.test(kv[2]) || value.startsWith('file:')) fileRefs.push(value)
  }
  return { id, name, fileRefs }
}
