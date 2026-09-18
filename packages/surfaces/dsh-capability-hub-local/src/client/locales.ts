/**
 * 命令面板文案。
 *
 * 自含字典（`navigator.language` 挑 zh/en）而非 locale 服务注册：面板是
 * shell.overlay 独立场，locale 服务缺席时也必须能用（它本身不做降级自报）。
 * 字符串量小（十余条）；若后续要进 family 的 NS 体系，迁移点是
 * `paletteStrings()` 一处。
 * @module dsh-capability-hub-local/client/locales
 */

/** 面板文案键。 */
export interface PaletteStrings {
  placeholder: string
  loading: string
  empty: string
  sliceError: string
  refresh: string
  hint: string
  kindSkill: string
  kindMcpTool: string
  kindRole: string
  kindProduct: string
  kindSystem: string
  availabilityDegraded: string
  availabilityDisabled: string
  availabilityAbsent: string
}

const ZH: PaletteStrings = {
  placeholder: '搜索能力：技能 / 工具 / 岗位 / 产品 / 系统…',
  loading: '正在读取能力目录…',
  empty: '没有匹配的能力',
  sliceError: '部分切片读取失败',
  refresh: '刷新',
  hint: '↑↓ 选择 · Enter 执行 · Esc 关闭',
  kindSkill: '技能',
  kindMcpTool: '工具',
  kindRole: '岗位',
  kindProduct: '产品',
  kindSystem: '系统',
  availabilityDegraded: '受限',
  availabilityDisabled: '已停用',
  availabilityAbsent: '未安装',
}

const EN: PaletteStrings = {
  placeholder: 'Search capabilities: skills / tools / roles / products / systems…',
  loading: 'Loading capability catalog…',
  empty: 'No matching capability',
  sliceError: 'Some slices failed to load',
  refresh: 'Refresh',
  hint: '↑↓ select · Enter run · Esc close',
  kindSkill: 'Skill',
  kindMcpTool: 'Tool',
  kindRole: 'Role',
  kindProduct: 'Product',
  kindSystem: 'System',
  availabilityDegraded: 'Degraded',
  availabilityDisabled: 'Disabled',
  availabilityAbsent: 'Not installed',
}

/**
 * 按 `navigator.language` 挑文案（无 window 环境回落 zh）。
 * @returns 当前语言的文案。
 */
export function paletteStrings(): PaletteStrings {
  if (typeof navigator === 'undefined') return ZH
  return navigator.language.toLowerCase().startsWith('zh') ? ZH : EN
}
