/**
 * 品牌名源（S-A，全仓唯一可编辑面）。
 *
 * 改名 = 只改这里 + 重跑生成（ADR-0136 D2）；任何游离在生成之外的名字字面量
 * 都是缺陷。002 骨架期的值 = 现状（换皮前的 LUTE 品牌），派生面尚未接线，
 * 改动本模块暂无行为效果；Sanbao 值由名字迁移批工单迁入。
 *
 * 字顺分工（ADR-0131）：拉丁名管图形与文件名（不得含汉字），中文名管描述语
 * 与文档标题。
 *
 * 经 `scripts/sync-shared.mjs` 分发（副本首行带生成标记）；改这里后跑
 * `node scripts/sync-shared.mjs --write`。
 */

export const SANBAO_BRAND_SOURCE = {
  /** 拉丁名（图形与文件名位）。现状出处：dsh-patches/brand-replay.sh 头注与 Info.plist 段。 */
  nameLatin: 'LUTE Agentic System',
  /** 中文名（描述语与文档标题位）。现状出处：侧栏品牌座第一行（brand.tsx）。 */
  nameZh: '路特创新',
  /** 短名（长度受限位与口语短称）。 */
  shortName: 'LUTE',
  /** 中文描述语。现状出处：侧栏品牌座第二行（brand.tsx）。 */
  sloganZh: 'AgenticOS',
  /** 英文描述语。现状出处：hero 文案（brand.tsx）。 */
  sloganEn: 'Artificial Business Intelligence Agentic',
  /** codesign 身份默认名。现状出处：packaging/scripts/ensure-signing-identity.sh 的 IDENTITY 默认值。 */
  signingIdentity: 'LUTE Code Signing',
  /** Info.plist 显示名。现状出处：dsh-patches/brand-replay.sh 的 CFBundleName/DisplayName 段。 */
  bundleDisplayName: 'LUTE Agentic System',
} as const

export type SanbaoBrandSource = typeof SANBAO_BRAND_SOURCE
