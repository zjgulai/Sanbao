# 025 logo 落位：tray 六档 + `ICON_PAIRS` 同片改

**类型**: 宽重构·扩展
**Blocked by**: 005, 024

## 目标
换掉菜单栏图标，并验证「双向门禁」在资产增删时的行为。

## 涉及层
- [ ] 资产层：彩色四档（16/20/24/32）取 mark；模板两档取纯黑带 alpha 版
- [ ] S-C：`brand-replay.sh:266-275` `ICON_PAIRS` 与资产集合**同一次提交**改
- [ ] 判据层：`brand-icons` 双向断言（多一个少一个都判红）+ alpha/形状判据
- [ ] 测试：`brand-icons-selftest` 突变测试仍红得起来

## 验收标准
- 真机菜单栏图标四档清晰、模板图在深浅菜单栏背景下都正确
- 故意多放一个资产文件，`brand-icons` 必须判红（证明双向性）
- `pnpm run gate` 绿

## 追溯
- 规格：`docs/specs/2026-09-19-sanbao-brand-reskin.md`
- 射程：`.scratch/sanbao-reskin/surface-map.md`
- 计划：`.scratch/sanbao-reskin/plan.md`
