/**
 * 「三方技能装上了，但跑得起来吗」校验项（维护 SOP §12.10；本项是 P-02/P-04 在技能面的实例）。
 *
 * ## 为什么需要它
 *
 * 技能入库的既有判据全部在回答同一个问题：**「技能引用的 skill id 存在吗」**——
 * 目录名唯一、图标覆盖、路由引用无悬空（`dsh-overseas-skills/scripts/verify_static.mjs` 前三项）。
 * 没有一条在问 **「这个技能跑得起来吗」**。
 *
 * 2026-09-14 实测本批 592 个来件的 T0 精选 15 条：
 *
 * ```
 * Python 库：  openpyxl ✗  matplotlib ✗  python-docx ✗  python-pptx ✗
 *              PyMuPDF ✗   pdfplumber ✗  pypdf ✗       reportlab ✗
 * Node 包：    vega / vega-lite / sharp ✗
 * ```
 *
 * 这 15 条里有 4 条装完**必然 ImportError / Module not found**，而当时所有门禁是全绿的：
 * 卡片正常显示、`installed=true`、模型看得见、一调用就报错。这就是 P-02 的形态——
 * **假绿比红灯贵得多**，红灯会被处理，绿灯会被相信。
 *
 * 同一轮还实测到一种更隐蔽的形态：`matplotlib` **装上了**，默认字体 `DejaVu Sans` 却
 * 不含 CJK 字形，于是中文标题渲染成豆腐块。脚本退出码 0、图也生成了，**坏在交付物里**。
 * 对中文组织的岗位 preset 这是常态而非边缘情况。所以本项的第二条判据不是「包装没装」，
 * 而是**真的渲染一次中文**。
 *
 * ## 判据
 *
 * 1. **运行时前提齐备**：对每个**真会被挂载**的技能（各 `agt-NNN/agent.cordis.yml` 的
 *    `skill-subset.skills`），其声明的 Python / CLI / Node 依赖必须全部就位。
 *    声明的家是 `dsh-overseas-skills/manifest/runtime-deps.json`（自动抽取的基线 +
 *    `runtime-deps.overrides.json` 的人工核对覆盖）。
 * 2. **中文渲染可用**：受管 venv 的解释器渲染一次中文标题，缺字即红。
 *    `-W error::UserWarning` 把 matplotlib 的缺字警告升级成异常——**没有渲染就没有读数**，
 *    这条判据不可用「字体文件存在」代替。
 *
 * ## 射程与跳过（诚实写清楚）
 *
 * - 受管 venv 不存在时本条报**跳过**（`passed: true` + `note`），与 `patch-anchors`、
 *   `theme-tokens` 同一语义：环境不存在时不假绿也不假红。但**只有在没有任何已接线技能
 *   声明 Python 依赖时**才允许跳过；一旦有技能声明了依赖而 venv 缺失，那是红。
 * - 只判 `~/.dsh/.agent-presets/agt-NNN/` 下**实际接线**的技能子集。一条还没接线的技能
 *   不该把所有门禁拖红；但一旦接线，它的运行时前提就必须齐备。
 * - 不管依赖装得对不对版本、不管技能逻辑是否正确。本项只保证一件事：
 *   **「装了但跑不起来」不再是一个安静的选项。**
 */
import { execFileSync } from 'node:child_process'
import { nodeCommand } from '../lib/real-node.mjs'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 技能包在仓库中的位置；运行时前提层住在这里。 */
const PKG_REL = join('packages', 'capabilities', 'dsh-overseas-skills')
const SCANNER_REL = join(PKG_REL, 'scripts', 'scan-runtime-deps.mjs')
const DEPS_REL = join(PKG_REL, 'manifest', 'runtime-deps.json')

/** 受管 venv：技能脚本执行 Python 时用的解释器。 */
export const VENV_PY = process.env.DSH_SKILLS_VENV
  ? join(process.env.DSH_SKILLS_VENV, 'bin', 'python')
  : join(homedir(), '.dsh', 'skills-runtime', '.venv', 'bin', 'python')

/** 各岗位 preset 目录；`skill-subset` 的名单从这里读。 */
export const PRESET_DIR = join(homedir(), '.dsh', '.agent-presets')

/** 从 preset 组合里读出**真会被挂载**的技能名（与 verify_static 第四条同一口径）。 */
export function wiredSkills(presetDir = PRESET_DIR) {
  const wired = new Set()
  if (!existsSync(presetDir)) return wired
  for (const d of readdirSync(presetDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const yml = join(presetDir, d.name, 'agent.cordis.yml')
    if (!existsSync(yml)) continue
    const m = /id:\s*skill-subset[\s\S]{0,600}?skills:\s*\[([^\]]*)\]/.exec(readFileSync(yml, 'utf8'))
    if (!m) continue
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^['"]|['"]$/g, '')
      if (name) wired.add(name)
    }
  }
  return wired
}

/** 渲染一次中文标题；返回 `{ ok, detail }`。缺字会被 `-W error::UserWarning` 变成异常。 */
export function cjkRenderProbe(pythonPath = VENV_PY) {
  if (!existsSync(pythonPath)) return { ok: false, detail: 'venv 解释器不存在' }
  const script = [
    'import matplotlib; matplotlib.use("Agg")',
    'import matplotlib.pyplot as plt',
    'fig, ax = plt.subplots()',
    'ax.set_title("季度销量趋势"); ax.set_ylabel("销量（件）")',
    'fig.savefig("/dev/null", format="png")',
  ].join('\n')
  try {
    execFileSync(pythonPath, ['-W', 'error::UserWarning', '-c', script], { stdio: 'pipe', timeout: 120000 })
    return { ok: true, detail: '零缺字警告' }
  } catch (e) {
    const msg = String(e.stderr || e.message || '').trim().split('\n').filter(Boolean).slice(-2).join(' / ')
    return { ok: false, detail: msg || '渲染失败' }
  }
}

/**
 * @param {object} io
 * @param {string} io.repoRoot 仓库根
 * @param {(n: number) => string} [io.readManifest] 便于用例注入
 */
export function checkSkillRuntimePreconditions({ repoRoot, presetDir = PRESET_DIR, pythonPath = VENV_PY, runScanner } = {}) {
  const scanner = join(repoRoot, SCANNER_REL)
  const deps = join(repoRoot, DEPS_REL)
  const violations = []

  const wired = wiredSkills(presetDir)
  if (wired.size === 0) {
    return {
      passed: true,
      skipped: true,
      violations,
      note: '没有已接线的技能子集（未建立 preset 或 preset 尚未生成）——本项未核对任何运行时前提',
    }
  }
  if (!existsSync(deps)) {
    return {
      passed: false,
      violations: [
        `${DEPS_REL} 不存在，而已有 ${wired.size} 条技能接线——`
        + '运行时前提层没有事实源，等于这条判据不在保护任何东西（P-02）。'
        + '跑 `node packages/capabilities/dsh-overseas-skills/scripts/scan-runtime-deps.mjs` 生成。',
      ],
    }
  }

  const probe = runScanner
    ? runScanner()
    : (() => {
        try {
          // 走 real-node：pnpm 下 process.execPath 是宿主 Electron，直接拿它起子进程
          // 会「退出码 0 且没有任何输出」，于是这条判据变成一句没有信息量的话（ADR-0040）。
          const { command, env } = nodeCommand()
          const out = execFileSync(command, [scanner, '--check', '--json', '--subset', [...wired].join(',')], {
            cwd: join(repoRoot, PKG_REL), encoding: 'utf8', timeout: 120000, env,
          })
          return { status: 0, stdout: out }
        } catch (e) {
          return { status: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') }
        }
      })()

  let parsed = null
  try { parsed = JSON.parse(probe.stdout || '{}') } catch { /* 落到下面的报错分支 */ }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.red)) {
    return {
      passed: false,
      violations: [
        '运行时前提检查未能执行——探查器没有吐出可解析的读数，'
        + `调用方无法区分「都核对了」与「有一项没核对」（P-17）。`
        + `stderr: ${String(probe.stderr || '').trim().split('\n').slice(-2).join(' / ') || '(空)'}`,
      ],
    }
  }

  for (const r of parsed.red) {
    violations.push(
      `运行时前提缺失：${r.skill} 缺 ${(r.missing || []).join(', ')}——`
      + '技能会被正常挂载、卡片显示 installed，模型一调用就 ImportError。'
      + '跑 `packages/capabilities/dsh-overseas-skills/scripts/install-runtime-deps.sh` 补齐。',
    )
  }

  // 第二条判据：中文渲染。只在**确实有技能声明了 Python 依赖**时才要求 venv，
  // 否则会把「还没装任何 Python 技能」错判成红。
  const scanned = parsed.checked ?? 0
  if (scanned > 0) {
    const cjk = cjkRenderProbe(pythonPath)
    if (!cjk.ok) {
      violations.push(
        `中文渲染不可用：${cjk.detail}——matplotlib 缺少 CJK 字形时，中文标题会渲染成豆腐块，`
        + '脚本退出码 0、图也生成了，坏的是交付物而不是退出码（P-02 最隐蔽的形态）。'
        + '重建配置：`packages/capabilities/dsh-overseas-skills/scripts/install-runtime-deps.sh --python-only`。',
      )
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    note: `已接线 ${parsed.subset ?? wired.size} 条 / 需探测 ${scanned} 条 / 中文渲染自检`,
  }
}
