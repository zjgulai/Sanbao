/** 品牌显示文字的唯一源；签名和 bundle 身份保持既有值。 */
export const SANBAO_BRAND_SOURCE = {
  nameLatin: 'Sanbao',
  nameZh: '三宝',
  shortName: 'SB',
  sloganZh: '三宝出海，货通四方',
  sloganEn: 'Sanbao — Your AI Fleet to Global Markets',
  signingIdentity: 'LUTE Code Signing',
  bundleDisplayName: 'LUTE Agentic System',
} as const

export type SanbaoBrandSource = typeof SANBAO_BRAND_SOURCE
