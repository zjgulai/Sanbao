/**
 * 「已证伪的仪器不得再被开成判据」校验项（ADR-0080）。
 *
 * ## 为什么需要它
 *
 * 2026-09-13：`docs/sop/dmg-release.md` §0 的发布前检查清单里有一条
 * 「本机无运行中的 DSH 实例（`pgrep -f "/Applications/DSH Desktop.app/Contents/MacOS/"` 为空）」。
 * 它**在那台机器的 DSH 主进程确实在跑时返回 0 条**——照着这条清单核对的人会看到「空」，
 * 得出「没有实例在跑」的结论，然后在运行中替换 app bundle：整屏白屏。
 * **它守的是白屏红线，而它等于没有守**（P-02 仪器假绿）。
 *
 * 这件事最贵的地方不是「用错了命令」：同一条事实（`pgrep -f` 看不见那个 Electron 主进程）
 * **早就写在 `packaging/scripts/first-launch-test.sh` 的注释里了**，而清单、安装器、
 * 品牌重放三处各自又写了一遍——四处同一条事实，修的时候只修看得见的那一处（P-07）。
 * 所以本条判据不检查「有没有人记得」，它检查**判据面里还有没有那个仪器**：
 * 把「知道」变成「拦住」，且拦住的是**每一个**被开出去的位置，不靠谁记得。
 *
 * ## 判据
 *
 * 1. **登记簿必须可读且非空**。读不到、解析失败、`instruments` 为空数组——都判红：
 *    一本空登记簿让本项恒绿，那是「一条永远不会说不的判据」，比没有更坏（P-02）。
 * 2. **射程**＝`git ls-files` 里的 `*.md` / `*.sh` / `*.bash`（跟着 git 走，不跟着磁盘走；
 *    `packaging/staging/`、`release/` 等产物本就不在索引里，天然退出射程）。
 * 3. **「判据面」的三种形态**——只有它们算「被开出去」：
 *    · 文档里的**清单行**（`- [ ] …`）：清单项按形式就是**规定动作**，没有「提及」这个读法；
 *    · 文档里的**围栏代码块**里的行：那是给人**照着敲**的；
 *    · 脚本里**去掉注释后仍有内容**的行：注释是说明，不是判据。
 * 4. 命中的行，若整个仪器片段被 `「…」` 包住，则算**引用**、不算使用
 *    （仓库约定；`stripQuotedSpans` 的实现家在 `dmg-layout.mjs`，本项 import 它而不是复制一份）。
 * 5. 读数里**常显分母**（扫了多少文件、多少行判据面、登记了几种仪器）——「一处都没比」
 *    与「比了都干净」不能在读数上同形（P-15）。抽不出任何一行判据面同样判红：那说明
 *    围栏/清单行解析坏了，而不是「仓库很干净」。
 *
 * ## 本项**不**检查什么（诚实写清楚，免得被当成全覆盖）
 *
 * 1. **散文里的提及**。`docs/notes/…` 里可以用行内代码提到一个已证伪的仪器——那是**叙述**，
 *    机器分不出「叙述」与「规定」，所以本项不去猜：散文不在射程内，提及随你写。
 *    **代价是明摆着的**：把一条死仪器写进散文里的操作步骤（而不是清单项或代码块），
 *    本项看不见。要让它可见，就写成清单项或代码块。
 * 2. **未入库的文件**。射程取 `git ls-files`（含已 `git add` 的）。草稿不扫——
 *    这也意味着「先提交、后检查」的顺序不会漏：`git add` 之后它就在射程里了。
 * 3. **`.mjs` / `.js` / `.json` 里的字符串**。门禁的 `remediation` 文案里可以出现命令，
 *    但那是给**人**读的散文而不是可执行判据，且没有可判的形态。要新增这条射程，
 *    先想清楚「什么形态算被开出去」——想不清就别加，加了就是一条会误报的判据。
 * 4. **仪器的语义**。本项做的是**模式匹配**，不认识上下文：它只保证「这个字符串没有出现在
 *    判据面上」。一个把死仪器用对（例如拿它的输出去证明它自己坏了）的写法也会被判红——
 *    那正是「」引用存在的意义。
 */
import { stripQuotedSpans } from './dmg-layout.mjs'
import { stripShellComment } from './checks.mjs'

/** 登记簿的仓库根相对路径（`$comment` 之外的部分即契约）。 */
export const REGISTRY_REL_PATH = 'scripts/gates/dead-instruments.json'

/** 清单行：`- [ ] …` / `* [x] …`（允许缩进）。 */
const CHECKLIST_RE = /^\s*[-*+]\s*\[[ xX]\]/

/** 围栏定界：``` 或 ~~~（允许缩进与语言标注）。 */
const FENCE_RE = /^\s*(?:```|~~~)/

/**
 * 从一个文档里抽出「判据面」的行。
 *
 * 清单项**连同它的续行**一起算：Markdown 里一条 `- [ ]` 项的内容一直到空行为止，
 * 续行同样是「规定动作」的一部分（本条判据自己就是这么修的——SOP §0 那一条现在
 * 有好几行续行）。只认 bullet 那一行的话，把命令挪到续行就能绕过。
 *
 * @param {string} text 文档正文
 * @returns {Array<{line: number, text: string}>} 1 起的行号 + 原始行
 */
export function extractDocPrescriptions(text) {
  const out = []
  const lines = text.split('\n')
  let inFence = false
  let inItem = false
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    if (FENCE_RE.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      out.push({ line: i + 1, text: raw })
      continue
    }
    if (raw.trim() === '') {
      inItem = false
      continue
    }
    if (CHECKLIST_RE.test(raw)) {
      inItem = true
      out.push({ line: i + 1, text: raw })
      continue
    }
    if (inItem) out.push({ line: i + 1, text: raw })
  }
  return out
}

/**
 * 从一个 shell 脚本里抽出「判据面」的行：去掉注释后仍有内容的行。
 * @param {string} text 脚本正文
 * @returns {Array<{line: number, text: string}>}
 */
export function extractScriptPrescriptions(text) {
  const out = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const code = stripShellComment(lines[i]).trim()
    if (code !== '') out.push({ line: i + 1, text: lines[i] })
  }
  return out
}

/**
 * 解析登记簿并逐条编译模式。
 * @param {string} registryText 登记簿正文（读不到传空串）
 * @returns {{instruments: Array<{id: string, re: RegExp, why: string, useInstead: string}>, errors: string[]}}
 */
export function parseRegistry(registryText) {
  const errors = []
  let parsed
  try {
    parsed = JSON.parse(registryText)
  } catch (error) {
    return { instruments: [], errors: [`${REGISTRY_REL_PATH}: 读不出/解析失败（${error.message}）——本项无法判定任何东西，判红而不是当作「没有登记项」`] }
  }
  const list = Array.isArray(parsed?.instruments) ? parsed.instruments : null
  if (list === null) {
    return { instruments: [], errors: [`${REGISTRY_REL_PATH}: 缺 instruments 数组`] }
  }
  if (list.length === 0) {
    errors.push(`${REGISTRY_REL_PATH}: instruments 为空——空登记簿让本项恒绿，那是一条永远不会说「不」的判据（P-02）`)
  }
  const instruments = []
  for (const entry of list) {
    const id = typeof entry?.id === 'string' ? entry.id : `<缺 id 的第 ${instruments.length + 1} 项>`
    if (typeof entry?.pattern !== 'string' || entry.pattern === '') {
      errors.push(`${REGISTRY_REL_PATH}: ${id} 缺 pattern`)
      continue
    }
    for (const field of ['provenOn', 'reading', 'why', 'useInstead']) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        errors.push(`${REGISTRY_REL_PATH}: ${id} 缺 ${field}——登记一条死仪器必须附证据与替代物，否则只是一句口味`)
      }
    }
    try {
      instruments.push({ id, re: new RegExp(entry.pattern, 'g'), why: entry.why ?? '', useInstead: entry.useInstead ?? '' })
    } catch (error) {
      errors.push(`${REGISTRY_REL_PATH}: ${id} 的 pattern 不是合法正则（${error.message}）`)
    }
  }
  return { instruments, errors }
}

/**
 * 跑一次「死仪器」校验。
 *
 * @param {{
 *   registryText: string,
 *   files: Array<{relPath: string, text: string}>,
 * }} input
 *   `files` 由调用方按 git 索引给出（`*.md` / `*.sh` / `*.bash`）；读不到内容传空串。
 * @returns {{passed: boolean, violations: string[], note?: string}}
 */
export function checkDeadInstrument({ registryText, files }) {
  const { instruments, errors } = parseRegistry(registryText)
  const violations = [...errors]

  if (files.length === 0) {
    violations.push('射程为空：git 索引里没有一个受检文件——「一个都没比」与「都比过且干净」必须分开（P-15）')
    return { passed: false, violations }
  }

  let prescriptionLines = 0
  for (const { relPath, text } of files) {
    const isDoc = relPath.endsWith('.md')
    const prescriptions = isDoc ? extractDocPrescriptions(text) : extractScriptPrescriptions(text)
    for (const { line, text: raw } of prescriptions) {
      prescriptionLines += 1
      const subject = stripQuotedSpans(raw)
      for (const { id, re, why, useInstead } of instruments) {
        re.lastIndex = 0
        const hit = re.exec(subject)
        if (!hit) continue
        violations.push(
          `${relPath}:${line}: 用了已证伪的仪器「${id}」（命中 ${JSON.stringify(hit[0].trim())}）`
            + `——${why}改用 ${useInstead}；若这里是**引用**它作为反例，把它写成「…」引用形式`
            + '（`scripts/gates/dead-instruments.json` 有完整读数）',
        )
      }
    }
  }

  if (prescriptionLines === 0 && violations.length === 0) {
    violations.push('判据面抽不出任何一行（清单行/围栏/脚本代码行全为 0）——解析坏了，不是「仓库干净」')
    return { passed: false, violations }
  }

  const note = `扫 ${files.length} 个文件 / ${prescriptionLines} 行判据面；登记 ${instruments.length} 种已证伪仪器`
  return { passed: violations.length === 0, violations, note }
}
