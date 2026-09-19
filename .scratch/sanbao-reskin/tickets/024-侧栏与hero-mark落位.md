# 024 logo 落位：侧栏品牌座与 hero 的 mark

**类型**: 宽重构·扩展
**Blocked by**: 005, 007

## 目标
按供体使用规范把 mark 落到两个纵向位，几何与留白照抄其规范而非自行编排。

## 涉及层
- [ ] 资产层：mark 由名源生成的占位标产出（RGBA 透明底）
- [ ] UI 层：侧栏 28×25 容器 `contain` 等比居中 + 17px 字标；hero mark 34
- [ ] 规范层：四周留白 ≥ 一个主笔画宽度、缩放保持比例、不加边框、主题切换只改色不换轮廓
- [ ] 测试：几何与留白断言

## 验收标准
- 真机侧栏与空会话 hero 的 mark 尺寸、留白、居中断言通过
- 明暗两色道下图形轮廓一致（只换色不换形）
- 面板几何与换皮前逐字节同形（承载未动）

## 追溯
- 规格：`docs/specs/2026-09-19-sanbao-brand-reskin.md`
- 射程：`.scratch/sanbao-reskin/surface-map.md`
- 计划：`.scratch/sanbao-reskin/plan.md`
