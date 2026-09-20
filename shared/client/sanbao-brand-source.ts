/** 品牌显示文字的唯一源；签名身份与 bundle id 保持既有值（bundle 显示名随产品名走）。 */
export const SANBAO_BRAND_SOURCE = {
  nameLatin: 'Sanbao',
  nameZh: '三宝',
  shortName: 'SB',
  sloganZh: '三宝出海，货通四方',
  sloganEn: 'Sanbao — Your AI Fleet to Global Markets',
  signingIdentity: 'LUTE Code Signing',
  bundleDisplayName: 'Sanbao',
} as const

export type SanbaoBrandSource = typeof SANBAO_BRAND_SOURCE
