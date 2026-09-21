# DA-06 · observer 乒乓最小探针：单例计数进可执行判据

- 优先级：P0
- 状态：`done`（2026-09-21 结算，随本批提交入库）
- 依赖：无
- 估算：M
- 来源：docs/pitfalls-playbook.md P-52；报告 TOP20 #6

## Problem

P-52 诚实划界原文：「observer 乒乓**没有专属门禁**拦（运行时竞态无法静态判出），目前靠共享层不变量注释 + 技能内签名卡，这是缺口不是成绩。」
事故教训：三方诊断 40 小时，其中一位助手拿对了机制类别但没去数 `document.querySelectorAll('[data-dsh-workbench-container]').length`——`=== 2` 一个读数就能暴露挂载竞态；「探针代码内打点同样被饿死」导致「探针没输出」被误读成「代码没执行」。

## 动作

1. 把「关键单例元素计数」固化为**可执行探针**（旁路通道：铸 cookie + 独立 Chrome + 预启用 Debugger，见 `~/.agents/skills/dsh-desktop-diagnostics/SKILL.md`），至少覆盖 workbench 容器与已知单例 marker；
2. 探针进 `scripts/acceptance/` 家族（或技能内脚本目录），并在实况验收路径中被复用；
3. 把「单例计数」写进共享层 observer 不变量注释的读数指引（改 observer 前先数单例）。

## 验收

- 重复挂载场景下探针能报出 `count === 2`（用可控夹具制造）；
- 探针在应用正常态读数为 1 且退出码 0；
- 探针本身登记进 dead-instruments 登记簿（防退化），并有「读不到 → 明确报错而非静默」。

## 注意

运行时竞态无法静态判出是设计性边界——不要把「不可能全静态」当借口不落最小机制。
