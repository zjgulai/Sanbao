# 027 打包链：Setup.app 改名 + 补上它从未有过的图标

**类型**: 宽重构·迁移
**Blocked by**: 005, 026

## 目标
安装器改名，并修掉一个既存缺陷——它**至今完全没有图标**。

## 涉及层
- [ ] 打包层：`build-setup-app.sh:32-38` 名与可执行文件名
- [ ] 资产层：给它一个 squircle 图标（复用 005 的生成器）
- [ ] 文案层：`install.sh:417` 收尾「重启 DSH Desktop」→「重启三宝」
- [ ] 判据层：`codesign --verify --deep --strict` 对 Setup.app 通过

## 验收标准
- 真机：安装器在 Finder 里有图标且形状合规（hasAlpha yes）
- 安装收尾提示说产品名，不再说 DSH Desktop
- `sign-and-dmg.sh:163` 的 Setup.app 签名校验绿

## 追溯
- 规格：`docs/specs/2026-09-19-sanbao-brand-reskin.md`
- 射程：`.scratch/sanbao-reskin/surface-map.md`
- 计划：`.scratch/sanbao-reskin/plan.md`
