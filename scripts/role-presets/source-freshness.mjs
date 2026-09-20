/**
 * AGT / MGT 预设「共享源 → 产物」新鲜度判据（DA-14 / P-03 收口）。
 *
 * ## 为什么需要它
 *
 * `docs/architecture.md` §3 写着：「**AGT 共享源（含 ROSTER.md）任何改动 = 存量 50 全量重生成**，
 * 动它们之前先读 research/16 §3.6」。但这条此前是**阅读纪律**：只改共享源而不重跑
 * `scripts/role-presets/generate.mjs`，产物与源不一致**不会有任何东西报错**——P-03 的形态
 * （知道没有变成拦住）。
 *
 * ## 判据怎么算（与生成器同源，不手抄第二份）
 *
 * 生成器把每次运行的 `source_revision`（`source-hash:<sha256(canonicalJson(四项源))>`）与
 * `shared_source_hashes`（逐共享文件的 sha256）写进每份产物的 `source_snapshot`。
 * 本模块**只做比对**：把「产物里记录的」与「现场重算的」两类读数摊开——
 *   · `shared_source_hashes` 逐 key 比 → 变了就**点名哪个共享文件**；
 *   · `revision` 整串比 → 抓「共享文件没变、但角色卡 / soul / playbook / blueprint 等
 *     其他源变了」这一半（那些也进 revision 的 payload）。
 * 重算本身住在生成器里（`generate.mjs --check` 调用本模块），本模块不自己读源文件——
 * 两份实现算同一件事就是下一个会分叉的「旧值」（P-07）。
 *
 * @module
 */

/**
 * 从产物 manifest 里读回记录的源快照。
 * 缺 `source_snapshot` / 字段形状不对 → 返回 null（读不到 ≠ 干净，调用方必须判红而不是放行）。
 *
 * @param {unknown} manifest 产物 manifest.json 解析结果
 * @returns {{revision: string, hashes: Record<string, string>}|null}
 */
export function readRecordedSnapshot(manifest) {
  if (manifest === null || typeof manifest !== 'object') return null
  const snapshot = /** @type {Record<string, unknown>} */ (manifest).source_snapshot
  if (snapshot === null || typeof snapshot !== 'object') return null
  const record = /** @type {Record<string, unknown>} */ (snapshot)
  const revision = typeof record.source_revision === 'string' && record.source_revision !== '' ? record.source_revision : null
  const hashes = record.shared_source_hashes
  if (hashes === null || typeof hashes !== 'object' || Array.isArray(hashes)) return null
  if (revision === null) return null
  return { revision, hashes: /** @type {Record<string, string>} */ (hashes) }
}

/**
 * 比对「产物记录的」与「现场重算的」源快照。
 *
 * @param {{
 *   recorded: {revision: string, hashes: Record<string, string>}|null,
 *   computed: {revision: string, hashes: Record<string, string>}|null,
 * }} input
 * @returns {{fresh: boolean, changed: Array<{key: string, recorded: string|null, computed: string|null}>, reason: string}}
 */
export function judgeSourceFreshness({ recorded, computed }) {
  if (recorded === null || computed === null) {
    return {
      fresh: false,
      changed: [],
      reason: '源快照读数缺失（产物没有 source_snapshot，或现场重算失败）——读不到 ≠ 干净，不能算新鲜',
    }
  }

  const keys = [...new Set([...Object.keys(recorded.hashes), ...Object.keys(computed.hashes)])].sort()
  const changed = keys
    .filter((key) => recorded.hashes[key] !== computed.hashes[key])
    .map((key) => ({
      key,
      recorded: recorded.hashes[key] ?? null,
      computed: computed.hashes[key] ?? null,
    }))

  const revisionMatches = recorded.revision === computed.revision
  if (changed.length === 0 && revisionMatches) {
    return { fresh: true, changed: [], reason: `与共享源一致（${recorded.revision}）` }
  }
  if (changed.length > 0) {
    const names = changed.map((entry) => entry.key).join('、')
    return {
      fresh: false,
      changed,
      reason: `共享源已变：${names}（产物=${changed[0].recorded ?? '缺'}… 现场=${changed[0].computed ?? '缺'}…）`
        + '——重跑 node scripts/role-presets/generate.mjs 全量重生成后再提交',
    }
  }
  return {
    fresh: false,
    changed: [],
    reason: `共享文件未变但 source_revision 变了（${recorded.revision} → ${computed.revision}）`
      + '——角色卡 / soul / playbook / blueprint 等其他共享源也进了 revision，同样需要全量重生成',
  }
}
