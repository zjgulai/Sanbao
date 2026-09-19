/**
 * 名片上的一句话职责：从官方 `description` 里取出**职责那一段**。
 *
 * 官方 description 的既有形状（50 张卡实测，41–107 字符）：
 *
 *   【平面·责任域】职责陈述（标准产物：…）〔管理层·评估载体·未授权Shadow〕
 *
 * 名片上【平面·责任域】是版面上方的分区标题、标准产物是详情里的一行，两者再抄一遍
 * 只是把同一句话说了三遍。这里只做**删除**（不去改写、不截断成新句子）：
 *   - 去掉一个前导【…】；去掉一个结尾的〔…〕；
 *   - 遇到第一个中文/英文圆括号就停下（其后是产物清单等补充说明）；
 *   - 去掉结尾残留的标点。
 * 如果删完什么都不剩（上游换了一种 description 写法），**原样返回**——一张没有职责的
 * 名片比一张职责略长的名片差得多。真正的长度上限交给 CSS 的两行截断。
 */

/** 前导方括号标签（【经营管理·经营与组织】）。 */
const LEADING_TAG = /^\s*【[^】]*】\s*/
/** 结尾的方括号尾注（〔管理层·评估载体·未授权Shadow〕），可能紧跟产物括号之后。 */
const TRAILING_TAG = /\s*〔[^〕]*〕\s*$/
/** 职责与补充说明的分界：第一个圆括号（半角或全角）。 */
const PAREN = /[（(]/
/** 结尾残留的标点（中英逗号/句号/分号/顿号）。 */
const TRAILING_PUNCTUATION = /[，,。.；;、\s]+$/

/**
 * 取名片用的一句职责。
 * @param description - 官方 preset.yml 的 description 原文。
 * @returns 职责那一段；无法安全删除时返回原文（去首尾空白）。
 */
export function cardBrief(description: string): string {
  const original = description.trim()
  let text = original.replace(LEADING_TAG, '')
  const tail = text.search(PAREN)
  if (tail >= 0) text = text.slice(0, tail)
  text = text.replace(TRAILING_TAG, '').replace(TRAILING_PUNCTUATION, '').trim()
  return text === '' ? original : text
}
