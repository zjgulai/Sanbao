/**
 * 门禁 `role-brief-shape`：名片上的一句话职责必须**仍然剥得动**。
 *
 * ── 为什么需要它（ADR-0142 登记的边界，2026-09-20 补机制）────────────────────
 *
 * 名片右栏显示的是 `cardBrief(description)`——去掉前导【平面·域】、结尾〔…〕、
 * 第一个圆括号之后的补充说明与残留标点。这条规则**依赖官方 description 的既有形状**
 * （50/50 实测同形：`【平面·域】职责（标准产物：…）`）。
 *
 * 上游换一种写法时，规则**不会报错**，只会走到自己的兜底分支——**原样返回整句**。
 * 于是名片从「两行职责」变成「一句被两行截断的长描述」，而既有判据全绿：
 * 纯函数单测喂的是旧形状的样本，面板测试喂的是夹具，没有人拿**真机的 50 张卡**问过
 * 「规则还咬得住吗」。这是 P-46 的同族：兜底把「规则失效」伪装成一个合法值。
 *
 * ── 判红口径：只动标点不算剥动 ──────────────────────────────────────────────
 *
 * 「`cardBrief` 改了原文」**不够**——`负责跨境店铺的日常运营，跟进订单与库存。` 只被
 * 清掉一个句号，也算改了，可名片照样显示整句。所以判据是**去标点后是否同形**：
 * 只有三条结构删除（前导【…】/圆括号补充/末尾〔…〕）至少命中一条、动到了实词，
 * 才算「剥得动」；只清标点 = 结构规则一条都没命中 = 上游换了写法。
 *
 * 副作用是刻意的：一张**本来就没有任何结构标记**的短 description（如 `负责跨境运营`）
 * 也判红。它无法与「规则失效」区分开——要么扩规则、要么人工看一眼，这正是本项存在的
 * 理由（静默通过的代价已经付过一次）。
 *
 * ── 射程与判红口径 ──────────────────────────────────────────────────────────
 *
 * 读 `~/.dsh/.agent-presets`（与 `live-presets` 同一把尺）：**根不在时报跳过**
 * ——跳过不算通过；根在而**一张带 description 的卡都没读到时报红**（空射程不是绿，
 * P-02：「没有读数」与「读数为好」被当成同一件事，是假绿最便宜的路径）。
 *
 * @module gates/role-brief-shape
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { cardBrief } from '../../packages/surfaces/dsh-role-matrix-local/src/client/card-brief.ts'
import { collectRoleMatrix } from '../../packages/surfaces/dsh-role-matrix-local/src/collect.ts'

/** 违规描述里回显的样本长度：够认出是哪张卡、不把整句抄进读数。 */
const ECHO_LENGTH = 46

/** 标点与空白：`cardBrief` 的收尾删除只动这些字符，动到它们不算结构命中。 */
const PUNCTUATION_OR_SPACE = /[\p{P}\s]/gu

/**
 * 两份文本去标点后是否同形——同形 = `cardBrief` 只清了标点/空白，
 * 三条结构删除一条都没命中（名片会原样显示整句）。
 *
 * @param {string} description 官方 description 原文
 * @param {string} brief `cardBrief(description)` 的结果
 * @returns {boolean} 是否只差标点/空白
 */
function punctuationOnlyChange(description, brief) {
  return description.replace(PUNCTUATION_OR_SPACE, '') === brief.replace(PUNCTUATION_OR_SPACE, '')
}

/**
 * 纯判据：每张带 description 的卡，`cardBrief` 必须**动到实词**（不止标点）。
 *
 * 只清标点/完全不变 = 规则的删除动作一个都没命中（上游换了形状）或删完为空回落原文——
 * 两种都要人看一眼，不能在读数里静默通过。
 *
 * @param {object} input
 * @param {{ id?: string, agt?: string, description?: string }[]} [input.cards] 岗位卡（真机或夹具）
 * @returns {{ violations: string[], checked: number }} 违规清单与核对张数
 */
export function judgeRoleBriefShape({ cards = [] } = {}) {
  const withDescription = cards.filter((card) => String(card?.description ?? '') !== '')
  if (withDescription.length === 0) {
    // 空射程不是合格：一张都没量到时说「通过」，正是最便宜的那种假绿（P-02）。
    return { violations: ['没有读到任何带 description 的岗位卡——空射程不是合格（P-02）'], checked: 0 }
  }

  const violations = withDescription
    .filter((card) => {
      const description = String(card.description)
      return punctuationOnlyChange(description, cardBrief(description))
    })
    .map((card) => {
      const id = card.id ?? card.agt ?? '（无 id）'
      const echo = String(card.description).slice(0, ECHO_LENGTH)
      return `${id}：description 已剥不出职责，名片会原样显示整句（样本：${echo}…）——上游换了写法或规则该扩了`
    })
  return { violations, checked: withDescription.length }
}

/**
 * 读真机预设根并判定。根不在时返回跳过（不是「都合格」）。
 *
 * @param {object} [input]
 * @param {string} [input.root] 预设根；默认 `~/.dsh/.agent-presets`
 * @returns {{ passed: boolean, skipped?: boolean, violations: string[], note: string }} 门禁读数
 */
export function checkRoleBriefShape({ root = join(homedir(), '.dsh', '.agent-presets') } = {}) {
  if (!existsSync(root)) {
    return {
      passed: true,
      skipped: true,
      violations: [],
      note: `预设根不存在（${root}）——本项**未核对任何卡片**（不是「都合格」）`,
    }
  }

  const payload = collectRoleMatrix(root)
  const cards = payload.planes.flatMap((plane) => plane.domains.flatMap((domain) => domain.roles))
  const { violations, checked } = judgeRoleBriefShape({ cards })
  return {
    passed: violations.length === 0,
    violations,
    note: `核对 ${checked}/${cards.length} 张带描述的岗位卡：${root}`,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = checkRoleBriefShape({})
  for (const violation of result.violations) console.log(`✗ ${violation}`)
  console.log(result.skipped ? `跳过：${result.note}` : result.note)
  if (result.passed && !result.skipped) console.log('✓ role-brief-shape 通过')
  process.exit(result.passed ? 0 : 1)
}
