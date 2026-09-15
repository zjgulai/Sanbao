/**
 * 三条技能线的目录/挂载闸门（出海 / AI全栈 / 通用）。
 *
 * ## 为什么必须有这一项
 *
 * `docs/maintenance-sop.md` 的入库清单把 `verify_static.mjs` 写成「全绿」这一条，
 * `scripts/pipeline.sh` 也会跑它——但 **`pnpm run gate` 里没有任何一项跑过它**。
 * 于是「技能入库要跑 verify_static」这条规则只活在文档里：它是人对自己的要求，
 * 不是一个会拦住提交的机制。这正是 P-03「『知道』没有变成『拦住』」的形态。
 *
 * 同一批入库里还有一条同类的洞：`verify-generic.mjs`（通用线 T0 是否真的挂进
 * 50 个岗位 preset）——「通用技能」的全部含义就是「每个岗位都挂」，挂漏了却
 * 没有任何一处会报错：设置页照常显示卡片、技能目录照常存在。
 *
 * 本项把三条线各自的验证器串起来，作为**唯一**的调用点。
 *
 * ## 射程与跳过（诚实写清楚）
 *
 * 三个验证器都要读本机的 `~/.dsh/skills` 与 `~/.dsh/.agent-presets`（技能装没装、
 * preset 挂没挂）。在没跑过入库的机器上它们必然红，而那不是代码缺陷。
 * 因此：**目录不存在时本项报跳过**（`passed: true` + `note`），与 `patch-anchors`、
 * `theme-tokens` 同一语义——环境不存在时不假绿也不假红。
 * 一旦目录存在，验证器的任何非零退出码都是红，且原文回传它的输出。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { nodeCommand } from '../lib/real-node.mjs'

/** 技能包位置；三个验证器都住在这里。 */
const PKG_REL = join('packages', 'capabilities', 'dsh-overseas-skills')

/** 验证器清单：rel 路径 + 它回答的问题 + 拒了以后怎么办。 */
export const VERIFIERS = [
  {
    rel: join(PKG_REL, 'scripts', 'verify_static.mjs'),
    answers: '目录名字唯一 / 图标覆盖 / 路由引用无悬空 / 三线名单无漂移 / 已接线技能的运行时前提',
    remediation: '按输出逐条修：目录重名改 manifest 行名、缺图标跑 scripts/assign_lute_icons.py、悬空引用改 unify-refine-batch*.json、运行时去跑 scripts/install-runtime-deps.sh',
  },
  {
    rel: join(PKG_REL, 'scripts', 'verify-generic.mjs'),
    answers: '通用线 T0 是否真的挂进每一个岗位 preset（挂漏了不会有任何别的报错）',
    remediation: '跑 node scripts/role-presets/generate.mjs 重新生成岗位 preset；四件套缺项补 staging/intake-localize.json 后重跑 intake-install.mjs',
  },
  {
    rel: join(PKG_REL, 'scripts', 'verify-fullstack.mjs'),
    answers: 'AI全栈 30 条安装完整 / frontmatter 合法 / 资源脚本可编译 / 路由型冒烟',
    remediation: '按输出逐条修；安装缺失跑 scripts/intake-install.mjs',
  },
]

/** 本项有射程的前提：技能库与本机岗位 preset 至少要有一个存在。 */
export function environmentPresent(home = homedir()) {
  return existsSync(join(home, '.dsh', 'skills')) || existsSync(join(home, '.dsh', '.agent-presets'))
}

/**
 * 包自身的契约测试（`node --test <包>/test/*.spec.mjs`）——**消费侧负载形状**。
 *
 * 为什么它在射程内：上面三个验证器量的是**数据**（清单、安装、挂载），而三个路由
 * 把数据拼成页面负载时还有一段只有真的 apply 一遍插件才跑得到的代码——
 * `buildGroupsLegacy` 靠 `skill.category === cat.key` 配对，清单里的分组 key 与 catalog
 * 里的 category 一旦写岔，返回的就是 N 个**空组**：页面显示成一片空白，而不是报错。
 * 这段没有任何静态判据看得见。
 *
 * 包内 fixture 在真机 preset 不足 50 个时**跳过并打印 diagnostic**（不静默通过），
 * 所以本项在没入库的机器上不会因此变红。
 */
const PKG_TEST_REL = join(PKG_REL, 'test')

/**
 * @param {object} io
 * @param {string} io.repoRoot 仓库根
 * @param {string} [io.home] 覆盖 home（便于用例注入）
 * @param {(rel: string) => {status:number, stdout:string, stderr:string}} [io.runOne] 便于用例注入
 */
export function checkSkillLines({ repoRoot, home = homedir(), runOne } = {}) {
  if (!environmentPresent(home)) {
    return {
      passed: true,
      violations: [],
      note: '本机没有 ~/.dsh/skills 与 ~/.dsh/.agent-presets —— 三条技能线尚未入库，本项无射程（不假绿也不假红）',
    }
  }
  const violations = []
  const notes = []
  const { command, env } = nodeCommand()
  for (const v of VERIFIERS) {
    const abs = join(repoRoot, v.rel)
    if (!existsSync(abs)) {
      violations.push(`${v.rel} 不存在 —— 声称在守「${v.answers}」，实际没有消费者（P-02）`)
      continue
    }
    const r = runOne
      ? runOne(v.rel)
      : (() => {
          try {
            const out = execFileSync(command, [abs], { cwd: repoRoot, encoding: 'utf8', timeout: 300000, env })
            return { status: 0, stdout: out, stderr: '' }
          } catch (e) {
            return { status: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') }
          }
        })()
    const tail = `${v.rel.split('/').slice(-1)[0]}`
    if (r.status !== 0) {
      const detail = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').filter(Boolean).slice(-8).join(' / ')
      violations.push(`${tail} 判红（守的是「${v.answers}」）：${detail || '无输出'}。修法：${v.remediation}`)
    } else {
      const last = `${r.stdout || ''}`.trim().split('\n').filter(Boolean).slice(-1)[0] || '通过'
      notes.push(`${tail}: ${last.replace(/^[✓★]\s*/, '')}`)
    }
  }
  // ── 第四个：包自身的契约测试（消费侧负载形状）────────────────────────────
  {
    const testDir = join(repoRoot, PKG_TEST_REL)
    if (!existsSync(testDir)) {
      violations.push(`${PKG_TEST_REL} 不存在 —— 声称在守「三个路由拼出来的页面负载形状」，实际没有消费者（P-02）`)
    } else {
      const specs = readdirSync(testDir).filter((f) => f.endsWith('.spec.mjs')).map((f) => join(testDir, f))
      if (specs.length === 0) {
        violations.push(`${PKG_TEST_REL} 下一个 *.spec.mjs 都没有 —— 空射程不得长得像通过（P-11）`)
      } else {
        let r
        if (runOne) {
          r = runOne(PKG_TEST_REL)
        } else {
          try {
            const out = execFileSync(command, ['--test', ...specs], { cwd: repoRoot, encoding: 'utf8', timeout: 300000, env })
            r = { status: 0, stdout: out, stderr: '' }
          } catch (e) {
            r = { status: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') }
          }
        }
        // node 的 TAP 摘要前缀随版本变化（实测 Node 26 用 `ℹ pass 67`，老版本用 `# pass 67`）。
        // 只认一种前缀时另一种下会打印「（无摘要行）」——那是**读数死了但判据还绿**，
        // 正是本文件存在的理由（P-02）。两种都认，且两项都取到才算数。
        const counts = ['tests', 'pass', 'fail']
          .map((k) => new RegExp(`^[ℹ#] ${k} \\d+$`, 'm').exec(`${r.stdout || ''}`)?.[0])
          .filter(Boolean)
          .join(' ')
        const countNote = counts.split(' ').length >= 6 ? counts : '摘要行未能解析（读数缺失，不是通过）'
        if (r.status !== 0) {
          const detail = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').filter(Boolean).slice(-8).join(' / ')
          violations.push(
            `test/*.spec.mjs 判红（守的是「三个路由拼出来的页面负载形状」）：${detail || '无输出'}。`
            + `修法：cd ${PKG_REL} && node --test test/*.spec.mjs 看红在哪条；清单与 catalog 的分组 key 写岔会让页面拿到空组而不是报错`,
          )
        } else {
          notes.push(`test/*.spec.mjs: ${specs.length} 个文件全部通过（${countNote}）`)
        }
      }
    }
  }

  return { passed: violations.length === 0, violations, note: notes.join(' | ') }
}
