/** R17-B (ADR-0332 之后): the observed model-settings structures, reproduced as data.
 *
 *  Every label and description below is verbatim from the in-repo observation capture
 *  (vendor/sanbao-prototype/dist/research/batch20-capture.md, QB20-01..07). The structures are
 *  read-only reproductions: the API Key stays an always-empty read-only placeholder, 校验并添加
 *  禁用并具名 — no credential is entered, validated, stored or sent. The write path (a real
 *  credential store) is its own named batch; the host currently has no Sage-face credential
 *  write path (v10 walkthrough finding).
 */

export type ModelProviderId = 'aliyun' | 'deepseek' | 'openai-compatible' | 'anthropic-compatible'

export interface ModelProviderGroup {
  readonly group: string
  readonly names: readonly string[]
}

/** QB20-03: the provider menu's three groups / 17 entries, verbatim order. */
export const PROVIDER_GROUPS: readonly ModelProviderGroup[] = [
  { group: '推荐', names: ['阿里云百炼 - 中国', '阿里云百炼 - 新加坡', '阿里云百炼 - 美国', '千问AI平台 - 中国', '千问AI平台 - 新加坡'] },
  { group: '更多', names: ['智谱 - 中国', '智谱 - 国际', 'Kimi', 'MiniMax - 中国', 'MiniMax - 国际', 'DeepSeek', '小米 MIMO - 中国', 'OpenAI', 'Google', 'OpenRouter'] },
  { group: '自定义', names: ['OpenAI Compatible', 'Anthropic Compatible'] },
]

export const PROVIDER_NAMES: Readonly<Record<ModelProviderId, string>> = {
  aliyun: '阿里云百炼 - 中国',
  deepseek: 'DeepSeek',
  'openai-compatible': 'OpenAI Compatible',
  'anthropic-compatible': 'Anthropic Compatible',
}

/** ADR-0345（证据：L2 分析 drafts/analysis/analysis-qoder-provider-key-mapping-draft-20261013.md，
 *  本机 Qoder 0.4.4 asar providerIcons 词表）：观测菜单中与已装 pi-ai 目录 id **同名且语义一致**
 *  的条目——只收无歧义项。其余观测条目（Kimi/MiniMax/智谱/小米/千问/阿里云百炼）目录映射
 *  多候选或缺失，保持不猜、不接线。 */
export const OBSERVED_CATALOG_PROVIDERS: Readonly<Record<string, string>> = {
  OpenAI: 'openai',
  Google: 'google',
  OpenRouter: 'openrouter',
}

/** QB20-04..06: DeepSeek's observed type options and model checklist. */
export const DEEPSEEK_TYPE_OPTIONS: readonly string[] = ['按量付费']
export const DEEPSEEK_MODEL_OPTIONS: readonly string[] = ['全选', 'DeepSeek-V4-Pro', 'DeepSeek-Flash']

/** QB20 openai-compatible: the observed api-type options. */
export const OPENAI_COMPATIBLE_API_TYPES: readonly string[] = ['Chat Completions API', 'Responses API']

export function providerForVariant(variant: string): ModelProviderId {
  if (variant.includes('openai-compatible')) return 'openai-compatible'
  if (variant.includes('anthropic-compatible')) return 'anthropic-compatible'
  if (variant.includes('.deepseek') || variant === 'models.discard.open') return 'deepseek'
  return 'aliyun'
}
