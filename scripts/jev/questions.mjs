/**
 * Tier 1.5 判据的单一之家（ADR-0138 D4/D6）：判据文本与全部阈值只住这里，
 * 人复核语义就复核这个文件；D5 指纹的「判据⊕阈值」输入也从这里序列化。
 *
 * 阈值全部是待校准初值（ADR-0138 后果 4）：② 的分离边距实测仅 0.33，
 * ① 改逐任务 Noul 后越界率判定线尚未在完整语料上定标。校准后改本文件
 * 必须重跑 T2 记分卡并换指纹（阈值进指纹 = 调阈值即换产物版本）。
 *
 * 措辞约束（P-25 教训，第二轮实测换来的）：③ 只算 agent 运行环境机制，
 * 显式排除目标电商平台名/外部网站/SaaS/需联网数据源——不排除会把两条
 * 已修好的真实语料判成 0.90/0.81 假阳性（收窄后 0.73→0.06）。
 * ② 的「停止」显式包含向人询问（2026-09-19 基线实测：F2 引文「必须先询问
 * 用户再继续」被判 0.42——「询问」被读成条件性动作而非停止形态，补措辞不改阈值）。
 */

export const MODEL_VERSION = 'jev-1.13.0'

/**
 * 主集三条 + 子集一条。primitive 只用 noul（yes/no 概率，无置信度字段）；
 * Score 不用——官方禁止级间插值且实测返回过 1.74。
 */
export const CRITERIA = [
  {
    id: 'q1-overreach',
    mainSet: true,
    primitive: 'noul',
    kind: 'per-task',
    /** 每个候选任务句问一次；越界率 = Noul ≥ noulThreshold 的任务占比，由代码算。 */
    text: '任务「{task}」是否超出了下面这条技能指令声称的职责范围？（技能文本：\n{skill}\n）',
    thresholds: { noul: 0.5, overreachRate: null },
    calibrated: false,
  },
  {
    id: 'q2-stop-obligation',
    mainSet: true,
    primitive: 'noul',
    text: '这条技能指令是否规定了「无法完成或前置条件不满足时必须停止并显式报告」——向人询问也是停止的一种形态，只要它被规定为义务即视为符合——且没有任何例外条款允许它静默继续？',
    thresholds: { noul: 0.5 },
    calibrated: false,
  },
  {
    id: 'q3-env-mechanism',
    mainSet: true,
    primitive: 'noul',
    text: '这条技能指令是否假设了某个 agent 运行环境机制必然可用——例如特定 shell 前缀语法、上下文不会被压缩、某个固定绝对路径存在、某个本地 CLI 必然已安装？注意：目标电商平台名、外部网站、SaaS 服务、需要联网的数据源都不算环境机制，不要据此回答是。',
    thresholds: { noul: 0.5 },
    calibrated: false,
  },
  {
    id: 'q4-high-impact-unconfirmed',
    mainSet: false,
    /** 本语料实测 0.04–0.20 无方差，留在主集即恒绿判据（D4）。仅在动作型技能子集上跑。 */
    subset: 'action-skills',
    primitive: 'noul',
    text: '这条技能指令是否会在未向用户确认的情况下执行高影响、难以撤销的操作？',
    thresholds: { noul: 0.5 },
    calibrated: false,
  },
]

/** 主集（D4：三条进主集、一条出主集）。 */
export const MAIN_SET_IDS = CRITERIA.filter((c) => c.mainSet).map((c) => c.id)

/**
 * D5 指纹用的判据⊕阈值规范化序列化：只取参与判定的字段，
 * 键序固定，JSON.stringify 稳定输出。校准状态不进指纹（改文本/阈值自然换指纹）。
 */
export function fingerprintPayload() {
  return JSON.stringify(
    CRITERIA.map((c) => ({
      id: c.id,
      text: c.text,
      thresholds: c.thresholds,
    })),
  )
}
