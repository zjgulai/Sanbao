/**
 * 更新 feed 判据（gate:update-feed）：入库清单（git 里那份）与 feed 快照不许分家。
 *
 * 为什么是离线判据：feed 的六个派生字段全部来自 `release/<版本>.sha256`（ADR-0058），
 * 清单在 git 里、进 CI——所以「feed 说了什么」不需要产物字节就能核对。这正是 DA-10
 * 「可离线判的部分先行」那半。
 *
 * 判什么（逐条能说出红在哪）：
 *   · 每个**已提交的** feed 快照（`release/<版本>.latest.json`）：形状合法（lib/update-feed.mjs
 *     的 validateUpdateFeed）且与同版本清单逐字段对账（checkFeedAgainstManifest）；
 *   · **最新版本**必须有快照——发布时漏生成/漏提交，更新器就永远读不到新版本；
 *   · 历史版本没有快照不判红（机制引入前的版本本就没有）；
 *   · 射程为空（没有任何入库清单）判红：空射程不是通过（P-15），读不到清单正文同样判红。
 *
 * 边界（诚实写清）：本项判「feed 与清单一致、形状合法」，不判「feed 已上传到哪个域名」——
 * 上传是发布动作（SOP），它的读数不在这条判据里。
 */
import {
  checkFeedAgainstManifest,
  compareVersions,
  parseReleaseManifest,
  validateUpdateFeed,
} from '../lib/update-feed.mjs'

/**
 * @param {{entries: Array<{version: string, manifestText: string|null, feedText: string|null}>}} input
 *   entries 按 release/ 目录实际内容给出：manifestText 为 null 表示清单读不到；
 *   feedText 为 null 表示该版本没有 feed 快照。
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkUpdateFeeds({ entries }) {
  const violations = []
  if (entries.length === 0) {
    return {
      passed: false,
      violations: ['release/ 下没有任何入库清单——射程为空不是通过（清单是 feed 的唯一源，P-15）'],
    }
  }
  for (const entry of entries) {
    if (entry.manifestText === null || entry.manifestText === undefined) {
      violations.push(`release/${entry.version}.sha256：读不到清单正文——读不到不许静默`)
    }
  }
  let newest
  try {
    newest = [...entries].sort((a, b) => compareVersions(b.version, a.version))[0]
  } catch (error) {
    return { passed: false, violations: [`入库清单文件名不是版本形状：${error.message}`] }
  }

  for (const entry of entries) {
    if (entry.feedText === null || entry.feedText === undefined) {
      if (entry.version === newest.version) {
        violations.push(
          `release/${entry.version}.latest.json：最新版本没有 feed 快照——发布时漏生成或漏提交；`
            + 'feed 是更新器的入口，缺了它更新检查永远读不到新版本',
        )
      }
      continue
    }
    if (entry.manifestText === null || entry.manifestText === undefined) continue
    let manifest
    try {
      manifest = parseReleaseManifest(entry.manifestText)
    } catch (error) {
      violations.push(`release/${entry.version}.sha256：${error.message}`)
      continue
    }
    let feed
    try {
      feed = JSON.parse(entry.feedText)
    } catch {
      violations.push(`release/${entry.version}.latest.json：读不成 JSON——读不到不许静默`)
      continue
    }
    const shape = validateUpdateFeed(feed)
    for (const violation of shape.violations) {
      violations.push(`release/${entry.version}.latest.json：${violation}`)
    }
    if (shape.passed) {
      const cross = checkFeedAgainstManifest({ feed, manifest })
      for (const violation of cross.violations) {
        violations.push(`release/${entry.version}.latest.json：${violation}`)
      }
    }
  }
  return { passed: violations.length === 0, violations }
}
