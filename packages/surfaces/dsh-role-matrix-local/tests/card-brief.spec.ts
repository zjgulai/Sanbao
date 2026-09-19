/**
 * 一句话职责的判据。
 *
 * 真值取自 50 张卡的**实测写法**（`~/.dsh/.agent-presets/agt-*`），不是从规则反推的
 * 形状——判据的形状必须来自数据，否则它只证明自己内部自洽。
 */
import { describe, expect, it } from 'vitest'
import { cardBrief } from '../src/client/card-brief'

describe('cardBrief', () => {
  it('去掉前导【平面·域】与（标准产物：…），只留职责', () => {
    expect(
      cardBrief('【经营管理·经营与组织】把GMV目标转为可执行的业务优先级和资源方案（标准产物：目标与资源决策包）'),
    ).toBe('把GMV目标转为可执行的业务优先级和资源方案')
  })

  it('去掉结尾〔…〕尾注（管理层卡的写法）', () => {
    expect(
      cardBrief(
        '【决策权平面·管理层】在已批准的企业约束内，把全局目标转为跨域取舍、优先级排序和资源再分配（标准产物：全局组合决策包）〔管理层·评估载体·未授权Shadow〕',
      ),
    ).toBe('在已批准的企业约束内，把全局目标转为跨域取舍、优先级排序和资源再分配')
  })

  it('没有「（标准产物」时只去前导标签，其余原样保留', () => {
    expect(cardBrief('【数据与Agent平台·平台能力】维护技能库与装配清单')).toBe('维护技能库与装配清单')
  })

  it('长职责整句保留（截断交给 CSS 两行，不在数据层改写成另一句话）', () => {
    const long =
      '【经营管理·经营与组织】维护场景分类、主岗位选择、Skills装配、阶段门禁和异常规则，为模型外Case Control提供可版本化制度并推动异常闭环（标准产物：场景规则、装配决策依据、Case状态与自治异常分析）'
    expect(cardBrief(long)).toBe(
      '维护场景分类、主岗位选择、Skills装配、阶段门禁和异常规则，为模型外Case Control提供可版本化制度并推动异常闭环',
    )
  })

  it('删完为空时原样返回（宁可长一点，也不要空职责）', () => {
    expect(cardBrief('【经营管理】')).toBe('【经营管理】')
    expect(cardBrief('（标准产物：x）')).toBe('（标准产物：x）')
    expect(cardBrief('')).toBe('')
  })

  it('半角圆括号同样按分界处理；没有括号时去掉结尾标点', () => {
    expect(cardBrief('【A·B】支持人才、培训、绩效(artifact: matrix)。')).toBe('支持人才、培训、绩效')
    expect(cardBrief('【A·B】支持人才、培训、绩效。')).toBe('支持人才、培训、绩效')
  })
})
