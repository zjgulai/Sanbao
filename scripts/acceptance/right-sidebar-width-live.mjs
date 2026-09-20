#!/usr/bin/env node
/**
 * 「右侧栏宽度设置口」的实机 CDP 探针（ADR 口径：只认渲染进程读数）。
 *
 * ## 它回答的问题（单测答不了的）
 * 包内 48 条测试证明的是「给定偏好，纯层会算出这些值」。**不**证明：
 *   1. 运行中的那个实例装载了这份 bundle（装载点两份、字节漂移都看不见）；
 *   2. 官方写入口真的可达——`setRightbar` 被收在 `LayoutController` 的 TS `private`
 *      字段里，能力探测在真机上探不到时一切测试照绿（P-07 的形状）；
 *   3. 我们镜像的外壳区间（300 / 0.7 / 400）与外壳**渲染行为**一致——镜像漂了，
 *      只有实机读数能揭穿。
 *
 * ## 判据（全部读渲染值，不读声明）
 *   writer-reachable   `<html data-lute-rightbar-writer>` === 'official'
 *   width-applied      播种 420 → 实测右轨 420
 *   floor-pinned       播种 200 → 实测 300（外壳 RIGHTBAR_MIN——镜像漂移即红）
 *   ceiling-pinned     播种 9999 → 实测 min(floor(视口×0.7), 视口−左轨−400)
 *   settings-row       设置模态里 `[data-lute-rightbar-setting]` 存在且 − 按钮真的改宽度
 *
 * ## 退出码（与仓内其它 live 探针同口径）
 *   exit 2  仪器不可用：端口 / 页面 target / 展开按钮 / 设置入口缺失（打印候选）
 *   exit 1  量到了、判据不过
 *   exit 0  全过（note 里带全部读数）
 *
 * ## 手法备注
 *   · 播种走 localStorage + dispatch resize：落地点订阅 resize 重读偏好（真机上
 *     设置行走的是同一条 subscribe 路，只是触发源不同）。
 *   · 每次播种后轮询实测值而不是固定 sleep：渲染经 React 提交，窗口不在前台时
 *     rAF 会被压慢（2026-09-20 实测），死等固定时长会间歇假红。
 *   · 结束后把 localStorage 恢复成探针进场前的值；面板停在展开态。
 */
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.DSH_CDP_PORT ?? 9333)
const KEY = 'dsh-qoder-sidebar:rightbar-width'
const MIN = 300
const RATIO = 0.7
const CENTER_MIN = 400

const results = []
const fail = (name, detail) => results.push({ name, pass: false, detail })
const ok = (name, detail) => results.push({ name, pass: true, detail })

function die2(message, candidates = []) {
  console.error(`[exit 2 · 仪器不可用] ${message}`)
  if (candidates.length > 0) console.error('候选：\n' + candidates.join('\n'))
  process.exit(2)
}

// ── 连 CDP：找 127.0.0.1 的 SPA 页面 target ────────────────────────────────
let targets
try {
  targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
} catch (e) {
  die2(`CDP 端口 ${PORT} 连不上（${e.message}）。应用需带 --remote-debugging-port=${PORT} 启动。`)
}
const page = targets.filter((t) => t.type === 'page' && /127\.0\.0\.1:\d+/.test(String(t.url ?? ''))).pop()
if (page === undefined) {
  die2('没有 SPA 页面 target', targets.map((t) => `${t.type}: ${String(t.url).slice(0, 90)}`))
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await Promise.race([
  new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ws error')), { once: true }) }),
  sleep(10000).then(() => { throw new Error('ws open 超时') }),
])
let seq = 0
const waiting = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data))
  if (m.id !== undefined && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
})
const send = (method, params = {}, timeoutMs = 30000) => new Promise((res, rej) => {
  const id = ++seq
  waiting.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)))
  ws.send(JSON.stringify({ id, method, params }))
  sleep(timeoutMs).then(() => { if (waiting.has(id)) { waiting.delete(id); rej(new Error(`${method} 超时`)) } })
})
await send('Runtime.enable')

/**
 * 在页面里执行一段 async 函数体，返回其返回值；抛错时原样带出。
 * wrapper 超时默认 90s：窗口在后台（document.hidden=true）时页面计时器被节流，
 * 页内 8s 的轮询循环实际可能跑 30s+（2026-09-20 实测；P-54 同款间歇假红）。
 */
async function inPage(body, { cdpTimeout = 90000 } = {}) {
  if (process.env.PROBE_VERBOSE === '1') console.error(`[probe] eval: ${body.slice(0, 80).replace(/\n/g, ' ')} …`)
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${body} })()`,
    returnByValue: true,
    awaitPromise: true,
  }, cdpTimeout)
  if (r.exceptionDetails) throw new Error(`页面内抛错：${JSON.stringify(r.exceptionDetails).slice(0, 300)}`)
  return r.result?.value ?? null
}

/** 等实测右轨变成期望值（轮询，不吃 rAF 节流的亏）。 */
const waitTrack = (expected, label) => inPage(`
  const deadline = Date.now() + 8000;
  let tracks = null, last = -1;
  while (Date.now() < deadline) {
    const col = document.querySelector('[data-rightbar-col]');
    const frame = col ? col.parentElement : null;
    tracks = frame ? getComputedStyle(frame).gridTemplateColumns.trim().split(/\\s+/) : null;
    last = tracks && tracks.length >= 3 ? Math.round(Number.parseFloat(tracks[2])) : -1;
    if (last === ${expected}) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { expected: ${expected}, got: last, tracks, label: ${JSON.stringify(label)} };
`)

// ── 0) 进场前把原偏好存起来（探针结束要还原） ─────────────────────────────
const original = await inPage(`return localStorage.getItem('${KEY}')`)

// ── 1) 写入口可达性：探测结论钉在 <html> 上 ───────────────────────────────
const verdict = await inPage(`return document.documentElement.getAttribute('data-lute-rightbar-writer')`)
if (verdict === null) {
  die2('页面里没有 data-lute-rightbar-writer 属性——bundle 没装载或插件没跑（先核对两处装载点字节一致）')
}
verdict === 'official'
  ? ok('writer-reachable', '官方 setRightbar 写入口探测成功（html[data-lute-rightbar-writer=official]）')
  : fail('writer-reachable', `探测结论是 ${verdict}——本包不写宽度，一切后续判据都会跟着失效`)

// ── 2) 打开右栏面板（没展开按钮 = 仪器问题，不是判据问题） ──────────────────
const opened = await inPage(`
  const panel = document.querySelector('[data-sidebar-right-panel]');
  const already = panel && panel.getAttribute('aria-hidden') !== 'true';
  if (already) return { opened: 'already' };
  // 展开控件有两代锚点：toggle（tab 条上的开关）与 expand（折叠 rail 的展开钮），先到先用。
  const btn = document.querySelector('[data-sidebar-right-toggle], [data-sidebar-right-expand]');
  if (btn === null) return { opened: 'no-button' };
  btn.click();
  await new Promise((r) => setTimeout(r, 900));
  const after = document.querySelector('[data-sidebar-right-panel]');
  return { opened: after && after.getAttribute('aria-hidden') !== 'true' ? 'clicked' : 'click-failed' };
`)
if (opened?.opened === 'no-button') die2('找不到右栏展开控件 [data-sidebar-right-toggle]/[data-sidebar-right-expand]（活动页注册失败？）')
if (opened?.opened !== 'already' && opened?.opened !== 'clicked') fail('panel-open', `展开失败：${JSON.stringify(opened)}`)

// ── 3) 播种 420：偏好应经官方写入口落到轨道上 ─────────────────────────────
const viewport = await inPage('return window.innerWidth')
const seed = (px) => inPage(`
  localStorage.setItem('${KEY}', '${px}');
  window.dispatchEvent(new Event('resize'));
  return null;
`)
await seed(420)
const r420 = await waitTrack(420, '播种 420')
r420.got === 420
  ? ok('width-applied', `播种 420 → 实测右轨 ${r420.got}（viewport=${viewport}）`)
  : fail('width-applied', `播种 420 → 实测 ${r420.got}（tracks=${r420.tracks}）——偏好没经官方写入口落地`)

// ── 4) 播种 200：外壳自己的下限是 300，镜像漂了这里红 ───────────────────────
await seed(200)
const r200 = await waitTrack(300, '播种 200')
r200.got === 300
  ? ok('floor-pinned', '播种 200 → 实测 300：外壳 RIGHTBAR_MIN 与我们的镜像一致')
  : fail('floor-pinned', `播种 200 → 实测 ${r200.got}（期望 300）——镜像下限与外壳渲染分叉`)

// ── 5) 播种 9999：上限 = min(floor(视口×0.7), 视口−左轨−400) ─────────────────
await seed(9999)
const sidebarTrack = await inPage(`
  const col = document.querySelector('[data-rightbar-col]');
  const frame = col ? col.parentElement : null;
  const t = frame ? getComputedStyle(frame).gridTemplateColumns.trim().split(/\\s+/) : null;
  return t && t.length >= 1 ? Math.round(Number.parseFloat(t[0])) : null;
`)
const ceiling = Math.max(MIN, Math.min(Math.floor(viewport * RATIO), viewport - (sidebarTrack ?? 280) - CENTER_MIN))
const rBig = await waitTrack(ceiling, '播种 9999')
rBig.got === ceiling
  ? ok('ceiling-pinned', `播种 9999 → 实测 ${rBig.got}（=min(floor(${viewport}×0.7), ${viewport}−${sidebarTrack}−${CENTER_MIN})）`)
  : fail('ceiling-pinned', `播种 9999 → 实测 ${rBig.got}（期望 ${ceiling}）——镜像上限与外壳渲染分叉`)

// ── 6) 设置行：打开设置模态，行要在，− 按钮要真的改宽度 ─────────────────────
const settingsOpened = await inPage(`
  const modal = document.querySelector('div[role="dialog"][aria-modal="true"]');
  if (modal) return { opened: 'already' };
  const buttons = [...document.querySelectorAll('button')];
  // 聊天内容里也会出现含「设置」的按钮（实测第一匹配是某会话操作钮）——
  // 先认 aria-label/文本**恰好**是「设置」的那个，再退回包含匹配。
  const exact = (b) => {
    const aria = (b.getAttribute('aria-label') ?? '').trim();
    const text = (b.textContent ?? '').trim();
    return aria === '设置' || aria === 'Settings' || text === '设置' || text === 'Settings';
  };
  const loose = (b) => /设置|Settings/i.test((b.getAttribute('aria-label') ?? '') + (b.title ?? '') + (b.textContent ?? ''));
  const hit = buttons.find(exact) ?? buttons.find(loose);
  if (hit === undefined) return { opened: 'no-trigger', names: buttons.slice(0, 40).map((b) => (b.getAttribute('aria-label') ?? b.title ?? b.textContent ?? '').trim()).filter(Boolean) };
  hit.click();
  await new Promise((r) => setTimeout(r, 900));
  return { opened: document.querySelector('div[role="dialog"][aria-modal="true"]') ? 'clicked' : 'click-failed' };
`)
if (settingsOpened?.opened === 'no-trigger') {
  die2('找不到设置入口按钮', (settingsOpened.names ?? []).map((n) => `· ${n.slice(0, 40)}`))
}
if (settingsOpened?.opened === 'already' || settingsOpened?.opened === 'clicked') {
  ok('settings-open', `设置模态已打开（${settingsOpened.opened}）`)
} else {
  fail('settings-open', `点设置入口后没有模态：${JSON.stringify(settingsOpened)}`)
}

const row = await inPage(`return document.querySelector('[data-lute-rightbar-setting]') !== null`)
if (row) {
  await seed(420)
  await waitTrack(420, '回位 420')
  const clicked = await inPage(`
    const row = document.querySelector('[data-lute-rightbar-setting]');
    const minus = [...row.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '收窄右侧栏');
    if (minus === undefined) return { clicked: false, reason: 'no-minus-button' };
    minus.click();
    await new Promise((r) => setTimeout(r, 900));
    return { clicked: true, stored: localStorage.getItem('${KEY}') };
  `)
  const stored = Number(clicked?.stored)
  if (clicked?.clicked !== true) {
    fail('settings-row', `行在但 − 按钮找不到：${JSON.stringify(clicked)}`)
  } else if (Number.isInteger(stored) && stored === 380) {
    const r380 = await waitTrack(380, '设置行 − 一次')
    r380.got === 380
      ? ok('settings-row', '设置行渲染、− 步进 40（420→380）并经官方写入口落地、localStorage 同步')
      : fail('settings-row', `localStorage 到 380 但实测轨道 ${r380.got}（tracks=${r380.tracks}）`)
  } else {
    fail('settings-row', `点 − 后偏好是 ${clicked?.stored}（期望 380）——动作面或按钮没接上`)
  }
} else {
  fail('settings-row', '设置模态里没有 [data-lute-rightbar-setting]——设置行没注册或没渲染')
}

// ── 7) 收尾：还原进场前的偏好，关掉设置模态 ───────────────────────────────
await inPage(`
  ${original === null || original === undefined
    ? `localStorage.removeItem('${KEY}')`
    : `localStorage.setItem('${KEY}', ${JSON.stringify(String(original))})`}
  window.dispatchEvent(new Event('resize'));
  const close = document.querySelector('div[role="dialog"][aria-modal="true"] button');
  if (close !== null) close.click();
  return null;
`)

// ── 判决 ──────────────────────────────────────────────────────────────────
console.log(`viewport=${viewport} sidebarTrack=${sidebarTrack} 进场前偏好=${original === null ? '未设' : original}`)
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`)
const failed = results.filter((r) => !r.pass)
console.log(`判据 ${results.length - failed.length}/${results.length} 过`)
ws.close()
process.exit(failed.length > 0 ? 1 : 0)
