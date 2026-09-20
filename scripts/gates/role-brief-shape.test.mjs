/**
 * `role-brief-shape` 判据的反向自测（ADR-0142 / P-03：判据自己也要被证伪）。
 *
 * 立的规矩：**每个用例都要能在「判据退化成恒真桩」时变红**。
 * 下面每条注释都点名它挡的是哪种退化。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { judgeRoleBriefShape } from './role-brief-shape.mjs'

/** 真机形状的三条样本（取自 50 张卡的实测写法，逐字）。 */
const LIVE_SHAPED = [
  { id: 'agt-001', description: '【经营管理·经营与组织】把GMV目标转为可执行的业务优先级和资源方案（标准产物：目标与资源决策包）' },
  { id: 'mgt-001', description: '【决策权平面·管理层】在已批准的企业约束内，把全局目标转为跨域取舍、优先级排序和资源再分配（标准产物：全局组合决策包）〔管理层·评估载体·未授权Shadow〕' },
  { id: 'agt-004', description: '【经营管理·经营与组织】支持人才、培训、绩效、编制和行政协作（标准产物：能力矩阵与组织调整建议）' },
]

test('真机形状：三条样本都能剥出职责，无违规', () => {
  const { violations, checked } = judgeRoleBriefShape({ cards: LIVE_SHAPED })

  assert.deepEqual(violations, [])
  assert.equal(checked, 3)
})

test('上游换成无【】的写法 → 判红并点名是哪张卡', () => {
  // 挡的退化：判据写成恒真桩（永远返回 []）——那样「上游换了写法、名片开始显示整句」
  // 这条永远不会响，而它正是本判据存在的唯一理由。
  // 样本结尾的句号是**故意留的**：只清一个句号也算「改了原文」，若判据写成
  // `cardBrief(d) === d`，这条就漏了——名片照样显示整句。
  const { violations } = judgeRoleBriefShape({
    cards: [...LIVE_SHAPED, { id: 'agt-999', description: '负责跨境店铺的日常运营，跟进订单与库存。' }],
  })

  assert.equal(violations.length, 1)
  assert.match(violations[0], /agt-999/)
  assert.match(violations[0], /原样显示整句/)
})

test('只清标点不算剥动（P-46 同族：兜底把「规则失效」伪装成合法值）', () => {
  // 挡的退化：判据写成「cardBrief 改了原文就行」。残句标点、结尾空格都能满足它，
  // 而卡片上显示的仍是整句——「文字变多悄悄回来」正是这条门禁唯一要挡的事。
  const { violations } = judgeRoleBriefShape({
    cards: [{ id: 'agt-995', description: '负责跨境店铺的日常运营，跟进订单与库存。 ' }],
  })

  assert.equal(violations.length, 1)
  assert.match(violations[0], /agt-995/)
})

test('上游换了前缀但结构仍在（去【】改 {}、保留（标准产物：…））→ 不误报', () => {
  // 判据不能只认「【】被删掉」这一种形状：只要圆括号那条结构删除还在命中，
  // 名片就仍被剥短，不该红。防的是把判据写成对单一写法的硬编码（P-05 的变体）。
  const { violations } = judgeRoleBriefShape({
    cards: [{ id: 'agt-994', description: '{经营管理·经营与组织} 把GMV目标转为可执行的业务优先级（标准产物：目标与资源决策包）' }],
  })

  assert.deepEqual(violations, [])
})

test('【】里什么都没有（删完为空、回落原文）同样判红', () => {
  // 挡的退化：判据只看「有没有去掉【】」，不看**结果是否还是原文**。
  // cardBrief 的兜底是「删空了就返回原文」，只比对删除动作会放行这种卡。
  const { violations } = judgeRoleBriefShape({ cards: [{ id: 'agt-998', description: '【经营管理】' }] })

  assert.equal(violations.length, 1)
  assert.match(violations[0], /agt-998/)
})

test('空射程必须判红，不许与「通过」同形（P-02）', () => {
  // 挡的退化：0 张卡时返回 []（= 通过）。一张都没量到时说合格，是假绿最便宜的路径；
  // 正规的「没东西可量」由调用方在根不存在时报**跳过**（那次会带上原因）。
  const { violations, checked } = judgeRoleBriefShape({ cards: [] })
  assert.equal(checked, 0)
  assert.equal(violations.length, 1)
  assert.match(violations[0], /空射程不是合格/)

  // 只有 degraded 卡（description 为空）也一样：它们不在射程内，射程就是空的。
  const degradedOnly = judgeRoleBriefShape({ cards: [{ id: 'agt-997', description: '' }] })
  assert.equal(degradedOnly.violations.length, 1)
})

test('核对张数只数带描述的卡（空描述的 degraded 卡不进分母）', () => {
  const { checked } = judgeRoleBriefShape({
    cards: [...LIVE_SHAPED, { id: 'agt-996', description: '' }],
  })

  assert.equal(checked, 3)
})
