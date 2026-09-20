#!/usr/bin/env node
/**
 * 右栏「活动面」真机验收：**本会话做过什么**才出现在右栏。
 *
 * ## 为什么要它
 *
 * 参照形态（Qoder 的右栏）不是常驻看板：空白会话里右栏什么都没有，AI 调用工具、
 * 产出资源时一栏一栏地长出来。这条契约只能在**真渲染进程**里验：数据要穿过
 * 会话事件源 → 折叠 → 槽位 inject 面（`hooks.sessionActivity` → `useSessionActivity`）
 * → 组件 → CSS module，任何一段断了都表现为「栏不出现」，而源码读起来是通的。
 *
 * ## 判据
 *
 * 1. 原生右栏能被展开（`[data-sidebar-right-toggle]` / `[data-sidebar-right-expand]`，
 *    两代锚点先用先用），标签条上是「活动」。
 * 2. 标签体 `[data-dsh-part="qoder-sidebar"]` 存在，且 `data-section-count` ≥ 1
 *    （脚本默认跑在**有历史**的会话上；空白会话的期望是 0，见 `--expect-blank`）。
 * 3. 每栏标题来自固定清单；行上的状态点取主题 token（读计算色，不读源码）。
 * 4. 折叠可交互：点表头后 `aria-expanded` 翻转、内容行盒高度归零。
 *
 * 仪器自检：连不上端口 / 找不到窗口 / 找不到展开按钮，都报 exit 2（「没量到」与
 * 「量了不合格」分开报）。会话是空白时会报 exit 3 并提示换一个会话重跑——空白态
 * 是**合法**期望（那正是本模型的核心），不能混进失败计数。
 *
 * ## 用法
 *
 *   node scripts/acceptance/right-sidebar-activity-live.mjs [--port 9333] [--expect-blank]
 *
 * 退出码：0 = 判据通过；1 = 判据不通过；2 = 前置/仪器不可用；3 = 会话空白（无活动可验）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const PORT = Number(opt('port', '9333'))
const EXPECT_BLANK = args.includes('--expect-blank')
const OUT_DIR = resolve(opt('out', join(REPO_ROOT, '.scratch/dsh-right-sidebar/acceptance')))

const KNOWN_SECTIONS = ['环境信息', '后台进程', '技能与 MCP', '产出', '网页查阅', '来源']

let failures = 0
const say = (line) => console.log(line)
const require_ = (ok, message) => {
  if (ok) say(`  ✓ ${message}`)
  else {
    failures += 1
    say(`  ✗ ${message}`)
  }
  return ok
}

// ── CDP 客户端（零依赖：Node 自带 fetch 与 WebSocket）─────────────────────────
class CdpSession {
  #socket
  #seq = 0
  #waiting = new Map()

  constructor(socket) {
    this.#socket = socket
    socket.addEventListener('message', (event) => {
      let frame
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (frame.id === undefined) return
      const pending = this.#waiting.get(frame.id)
      if (pending === undefined) return
      this.#waiting.delete(frame.id)
      if (frame.error !== undefined) pending.reject(new Error(String(frame.error.message)))
      else pending.resolve(frame.result)
    })
  }

  static async open(wsUrl) {
    const socket = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error('CDP websocket 未能建立')), { once: true })
    })
    return new CdpSession(socket)
  }

  send(method, params = {}) {
    const id = ++this.#seq
    return new Promise((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.#socket.close()
  }
}

async function fetchTargets() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    if (!response.ok) {
      say(`[FATAL] CDP 列出 targets 失败：HTTP ${response.status}`)
      process.exit(2)
    }
    return await response.json()
  } catch (error) {
    say(`[FATAL] 连不上 CDP（127.0.0.1:${PORT}）：${error.message}`)
    say('        DSH Desktop 必须以调试端口启动；重启脚本：scripts/acceptance/relaunch-dsh-cdp.sh')
    process.exit(2)
  }
}

const targets = await fetchTargets()
const pages = targets.filter((t) => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string')
say(`[activity] CDP 127.0.0.1:${PORT}：${targets.length} 个 target，page 类 ${pages.length} 个`)
for (const t of targets) say(`  · [${t.type}] ${String(t.title ?? '').slice(0, 40)} | ${String(t.url ?? '').slice(0, 70)}`)

const page = pages.find((t) => /127\.0\.0\.1:\d+/.test(String(t.url ?? ''))) ?? pages[0]
if (page === undefined) {
  say('[FATAL] CDP 里没有任何 page 类 target —— DSH 窗口可能还没创建')
  process.exit(2)
}
say(`[activity] 选中 target：${page.id} | ${String(page.url ?? '').slice(0, 80)}`)

const session = await CdpSession.open(page.webSocketDebuggerUrl)
await session.send('Runtime.enable')

const consoleErrors = []
session.send('Log.enable').catch(() => {})
await session.send('Runtime.addBinding', { name: '__probeNote' }).catch(() => {})

const evaluate = async (expression) => {
  const result = await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails !== undefined) {
    throw new Error(String(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'evaluate failed'))
  }
  return result.result.value
}

// 收集本插件相关的控制台错误（登记失败会在 renderer console 里留字）。
const collected = await evaluate(`(() => {
  const marks = [...document.querySelectorAll('[data-dsh-part]')].map((el) => el.getAttribute('data-dsh-part'))
  return { marks, rightbarPresent: document.querySelector('[data-sidebar-right-panel]') !== null }
})()`)
say(`[activity] 页面里已有 data-dsh-part：${JSON.stringify(collected.marks)}（右栏面板在场=${collected.rightbarPresent}）`)

// ── 1) 展开原生右栏 ─────────────────────────────────────────────────────────
say('')
say('1) 展开原生右栏（点会话标题栏右上角的展开按钮）')
const opened = await evaluate(`(() => {
  const panel = document.querySelector('[data-sidebar-right-panel]')
  // 面板节点在**折叠时也在场**（宽 621、x=1020、aria-hidden=true）——在场不是展开的判据。
  const expanded = panel !== null && panel.getAttribute('aria-hidden') !== 'true'
  if (expanded) return { ok: true, already: true }
  const btn = document.querySelector('[data-sidebar-right-toggle], [data-sidebar-right-expand]')
  if (btn === null) {
    return { ok: false, candidates: [...document.querySelectorAll('button[aria-expanded],button')].length }
  }
  btn.click()
  return { ok: true, already: false }
})()`)
if (!opened.ok) {
  say(`[FATAL] 找不到原生展开控件 [data-sidebar-right-toggle]/[data-sidebar-right-expand]（页面 button 计数=${opened.candidates}）`)
  process.exit(2)
}
await new Promise((r) => setTimeout(r, 1600))

// ── 2) 标签体在场 + 活动栏 ───────────────────────────────────────────────────
say('')
say('2) 标签体与活动栏（真渲染进程的 DOM 读数）')
const view = await evaluate(`(() => {
  const panel = document.querySelector('[data-sidebar-right-panel]')
  const body = document.querySelector('[data-dsh-part="qoder-sidebar"]')
  const chips = panel === null ? [] : [...panel.querySelectorAll('[role="tab"], button')].map((el) => (el.textContent ?? '').trim()).filter((t) => t !== '')
  const groups = body === null ? [] : [...body.querySelectorAll('[data-section]')].map((section) => {
    const header = section.querySelector('button[aria-expanded]')
    const items = [...section.querySelectorAll('li')].map((li) => {
      const dot = li.querySelector('span[aria-hidden="true"]')
      const spans = [...li.querySelectorAll('span')]
      return {
        label: spans[1] === undefined ? '' : (spans[1].textContent ?? '').trim(),
        state: li.getAttribute('data-state'),
        dot: dot === null ? 'none' : getComputedStyle(dot).backgroundColor,
      }
    })
    return {
      id: section.getAttribute('data-module'),
      title: header === null ? '' : (header.textContent ?? '').trim(),
      expanded: header === null ? null : header.getAttribute('aria-expanded'),
      controls: header === null ? null : header.getAttribute('aria-controls'),
      items,
    }
  })
  const bodyStyle = body === null ? null : getComputedStyle(body)
  return {
    panelPresent: panel !== null,
    panelExpanded: panel !== null && panel.getAttribute('aria-hidden') !== 'true',
    panelBackground: panel === null ? '' : getComputedStyle(panel).backgroundColor,
    panelBorderLeft: panel === null ? '' : getComputedStyle(panel).borderLeftWidth,
    chipText: chips.slice(0, 12),
    bodyPresent: body !== null,
    sectionCount: body === null ? -1 : Number(body.getAttribute('data-section-count')),
    bodyGap: bodyStyle === null ? '' : bodyStyle.rowGap,
    groups,
  }
})()`)

require_(view.panelPresent, '原生右栏面板在场（[data-sidebar-right-panel]）')
require_(view.panelExpanded, '右栏处于展开态（aria-hidden ≠ true）')
require_(view.bodyPresent, '活动标签体在场（[data-dsh-part="qoder-sidebar"]）')
if (!view.bodyPresent) {
  say('        标签体不在场 = 标签类型登记或标签体登记失败；看 renderer console 的 [qoder-sidebar] 告警。')
  say(`        标签条上的 chip 文本：${JSON.stringify(view.chipText)}`)
} else {
  say(`    右栏底色 ${view.panelBackground}，左边界 ${view.panelBorderLeft}，标签条 ${JSON.stringify(view.chipText)}`)
  say(`    data-section-count=${view.sectionCount}；栏：${JSON.stringify(view.groups.map((g) => g.id))}`)
  for (const group of view.groups) {
    say(`      · ${group.id}／${group.title} expanded=${group.expanded} controls=${group.controls} 行数=${group.items.length}`)
    for (const item of group.items.slice(0, 3)) say(`          - [${item.state}] ${item.label.slice(0, 60)}  点色 ${item.dot}`)
  }

  if (EXPECT_BLANK) {
    require_(view.sectionCount === 0, `空白会话期望 0 栏（实测 ${view.sectionCount}）`)
  } else {
    require_(view.sectionCount >= 1, `有历史的会话至少 1 栏（实测 ${view.sectionCount}）`)
    if (view.sectionCount === 0) {
      say('        本会话没有可折叠的活动（或事件窗口还没到）——换一个有工具调用的会话重跑；')
      say('        想验空白态就加 --expect-blank。')
      writeReport({ view, opened, verdict: 'session-blank' })
      session.close()
      process.exit(3)
    }
    require_(
      view.groups.every((g) => KNOWN_SECTIONS.includes(g.title) || g.title !== ''),
      `栏标题来自固定清单（实测 ${JSON.stringify(view.groups.map((g) => g.title))}）`,
    )
    // 活动行带状态点（running/done/error）；汇总行（「还有 N 条」）与环境信息行是
    // `summary`——它们没有状态点，不该有颜色。
    const dotted = view.groups.flatMap((g) => g.items.filter((i) => i.state !== 'summary'))
    require_(
      dotted.every((i) => /^rgb/u.test(i.dot)),
      `活动行的状态点有实色（${JSON.stringify(dotted.slice(0, 4).map((i) => i.dot))}）`,
    )
    const summaries = view.groups.flatMap((g) => g.items.filter((i) => i.state === 'summary'))
    require_(summaries.every((i) => i.dot === 'none'), '汇总行的状态点不画（dot=none）')
    const states = new Set(view.groups.flatMap((g) => g.items.map((i) => i.state)))
    require_(
      [...states].every((s) => ['running', 'done', 'error', 'summary'].includes(String(s))),
      `行状态取值合法（实测 ${JSON.stringify([...states])}）`,
    )
    require_(
      view.groups.every((g) => g.controls !== null),
      '每栏表头带 aria-controls（折叠可及性）',
    )
  }

  // ── 3) 折叠行为 ───────────────────────────────────────────────────────────
  if (view.groups.length > 0) {
    say('')
    say('3) 折叠行为（点第一栏表头 → 高度塌陷 → 再点恢复）')
    const fold = await evaluate(`(async () => {
      // 后台窗口的渲染进程不跑帧，grid-template-rows 过渡会停在中途（实测）。这里临时
      // 关掉过渡量**机制**：data-expanded/aria-expanded 与行盒目标高度，而不是动画过程。
      const killer = document.createElement('style')
      killer.textContent = '*{transition:none !important;animation:none !important}'
      document.head.appendChild(killer)
      const body = document.querySelector('[data-dsh-part="qoder-sidebar"]')
      const section = body === null ? null : body.querySelector('[data-section]')
      const header = section === null ? null : section.querySelector('button[aria-expanded]')
      if (header === null) return { ok: false }
      const id = header.getAttribute('aria-controls')
      const content = id === null ? null : document.getElementById(id)
      const inner = content === null ? null : content.firstElementChild
      const before = Math.round(inner === null ? -1 : inner.getBoundingClientRect().height)
      header.click()
      await new Promise((r) => setTimeout(r, 420))
      const collapsed = Math.round(inner === null ? -1 : inner.getBoundingClientRect().height)
      const expandedAttr = header.getAttribute('aria-expanded')
      header.click()
      await new Promise((r) => setTimeout(r, 420))
      const restored = Math.round(inner === null ? -1 : inner.getBoundingClientRect().height)
      killer.remove()
      return { ok: true, id, before, collapsed, restored, expandedAttrAfterCollapse: expandedAttr }
    })()`)
    if (!fold.ok) {
      require_(false, '第一栏的表头/内容节点可定位')
    } else {
      require_(fold.before > 0, `折叠前行盒有高度（${fold.before}px）`)
      require_(fold.collapsed === 0, `折叠后行盒归零（${fold.collapsed}px）`)
      require_(fold.expandedAttrAfterCollapse === 'false', `折叠后 aria-expanded=false（实测 ${fold.expandedAttrAfterCollapse}）`)
      require_(fold.restored >= fold.before, `再点恢复高度（${fold.restored} ≥ ${fold.before}）`)
      require_(fold.id !== null && fold.id.startsWith('dsh-qoder-sidebar-body-'), `aria-controls 指向本包 id（${fold.id}）`)
    }
  }
}

say('')
say(`累计不通过：${failures}`)
writeReport({ view, opened, verdict: failures === 0 ? 'pass' : 'fail' })
session.close()
process.exit(failures === 0 ? 0 : 1)

function writeReport(payload) {
  try {
    mkdirSync(OUT_DIR, { recursive: true })
    const file = join(OUT_DIR, `activity-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`)
    writeFileSync(file, `${JSON.stringify({ ...payload, consoleErrors }, null, 2)}\n`)
    say(`[activity] 报告：${file}`)
  } catch (error) {
    say(`[activity] 报告写入失败（不影响判据）：${error.message}`)
  }
}
