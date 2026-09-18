/**
 * Composer 预填的包内接线。
 *
 * `prefillDraft` 的实现在 `./prefill-draft.ts`——那是 `shared/client/prefill-draft.ts`
 * 的生成副本（ADR-0009：一份事实只有一个家）。它同时被能力命令面板消费，所以通道
 * 探测、失败上报、无 DOM 兜底这些契约写在共享源里，本文件只留岗位矩阵自己拥有的
 * `prefillPrompt`（这句话的语义属于 hero 供给卡，不属于共享层）。
 *
 * re-export 而不是让调用方直接 import 副本：`index.ts` 与 `tests/prefill.spec.ts`
 * 的历史入口是这里，保持入口不变，事实仍只有一个家。
 * @module dsh-role-matrix-local/client/prefill
 */
export { prefillDraft } from './prefill-draft.ts'
export type { PrefillOutcome } from './prefill-draft.ts'

/**
 * The sentence a capability card prefills.
 *
 * It names both levels the surface shows — the platform skill that will run and
 * the material business skill it serves — so the user can see the click did what
 * the card said it would, and can finish the sentence with their own subject.
 * @param skillLabel - the platform skill's display name.
 * @param groupName - the material business-skill name the card sits under.
 * @returns the prompt text.
 */
export function prefillPrompt(skillLabel: string, groupName: string): string {
  return `请用「${skillLabel}」完成「${groupName}」任务：`
}
