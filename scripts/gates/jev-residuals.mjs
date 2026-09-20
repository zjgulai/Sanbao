/**
 * Jev 残余登记处校验项（ADR-0138 后果节的机器面；2026-09-21 DA-15 对账收口）。
 *
 * ## 为什么需要它
 *
 * ADR-0138 的后果节把五件事记成「未闭口」，但那是**散文**：它在 ADR、CHANGELOG、
 * 项目记忆三处各有一份快照，三份会各自腐烂——DA-15 对账时实测到的正是这个形态
 * （记忆仍写「出网门禁与 key 可读性两条口子」，而出网边界 2026-09-20 已从纪律变机制、
 * key 可读性已在同日**重判并接受**）。修法：残余有**一个机器可读的家**
 * （`jev.residuals.json`），本判据守它的形状——形状守不住，家就会退化成第三份快照。
 *
 * ## 判据（形状契约）
 *
 * 1. 登记簿必须可读、可解析、非空（空登记簿让本项恒绿，P-02）。
 * 2. 每条必须有 `id` / `status` / `what` / `why` / `evidence`；`id` 不得重复。
 * 3. 语义随 status 分叉，**这是本条判据存在的理由**：
 *    · `accepted` —— 被拍板接受：必须给 `decisionDoc`（哪篇记录拍的板）。
 *      「接受」是可以的，但**裸接受不许**——没有决策记录的接受只是遗忘。
 *    · `open` —— 未决/待做：必须给 `nextAction`（下一步做什么）。
 * 4. 本项**不**判断残余是否「应该被接受」——那是人的裁决；也不检查 decisionDoc
 *    路径可达（那是 docs-link-integrity 的射程）。
 *
 * @module
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 登记簿路径（仓库根相对）。 */
export const REGISTRY_REL_PATH = 'scripts/gates/jev.residuals.json'

/** status 枚举。 */
export const RESIDUAL_STATUSES = Object.freeze(['accepted', 'open'])

/**
 * 跑一次登记处校验。
 * @param {{registryText: string|null|undefined}} input 读不到传 null/undefined
 * @returns {{passed: boolean, violations: string[], note: string}}
 */
export function checkJevResiduals({ registryText }) {
  if (typeof registryText !== 'string') {
    return {
      passed: false,
      violations: [`${REGISTRY_REL_PATH}: 读不出（缺失或不可读）——「读不到」不等于「没有残余」，判红而不是当作空登记簿`],
      note: '登记簿读不到，本项未核对任何残余',
    }
  }
  let parsed
  try {
    parsed = JSON.parse(registryText)
  } catch (error) {
    return {
      passed: false,
      violations: [`${REGISTRY_REL_PATH}: 解析失败（${error.message}）——本项无法判定任何东西，判红而不是当作「没有登记项」`],
      note: '登记簿损坏，本项未核对任何残余',
    }
  }

  const list = Array.isArray(parsed?.residuals) ? parsed.residuals : null
  if (list === null) {
    return {
      passed: false,
      violations: [`${REGISTRY_REL_PATH}: 缺 residuals 数组`],
      note: '登记簿形状非法，本项未核对任何残余',
    }
  }
  if (list.length === 0) {
    return {
      passed: false,
      violations: [`${REGISTRY_REL_PATH}: residuals 为空——空登记簿让本项恒绿，那是一条永远不会说「不」的判据（P-02）`],
      note: '登记 0 条残余',
    }
  }

  const violations = []
  const seen = new Set()
  let accepted = 0
  let open = 0
  for (const entry of list) {
    const id = typeof entry?.id === 'string' && entry.id !== '' ? entry.id : `<缺 id 的第 ${seen.size + 1} 项>`
    for (const field of ['what', 'why', 'evidence']) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') {
        violations.push(`${REGISTRY_REL_PATH}: ${id} 缺 ${field}——登记一条残余必须附「是什么 / 为什么 / 读数在哪」`)
      }
    }
    if (!RESIDUAL_STATUSES.includes(entry?.status)) {
      violations.push(`${REGISTRY_REL_PATH}: ${id} 的 status=${JSON.stringify(entry?.status)} 不在枚举内（${RESIDUAL_STATUSES.join(' / ')}）`)
    } else if (entry.status === 'accepted') {
      accepted += 1
      if (typeof entry.decisionDoc !== 'string' || entry.decisionDoc.trim() === '') {
        violations.push(`${REGISTRY_REL_PATH}: ${id} 是 accepted 但没有 decisionDoc——「接受」必须有据，裸接受只是遗忘`)
      }
    } else {
      open += 1
      if (typeof entry.nextAction !== 'string' || entry.nextAction.trim() === '') {
        violations.push(`${REGISTRY_REL_PATH}: ${id} 是 open 但没有 nextAction——未决项必须写下一步做什么`)
      }
    }
    if (seen.has(id)) violations.push(`${REGISTRY_REL_PATH}: id 重复（${id}）——同一件事只能有一个家`)
    seen.add(id)
  }

  const passed = violations.length === 0
  return {
    passed,
    violations,
    note: `登记 ${list.length} 条残余（accepted ${accepted} / open ${open}）：${[...seen].join('、')}`,
  }
}

// ── CLI（只读；给「对账」直接用） ─────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = join(dirname(fileURLToPath(import.meta.url)), 'jev.residuals.json')
  let text = null
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    text = null
  }
  const result = checkJevResiduals({ registryText: text })
  process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'}  ${result.note}\n`)
  for (const violation of result.violations) process.stdout.write(`  - ${violation}\n`)
  process.exitCode = result.passed ? 0 : 1
}
