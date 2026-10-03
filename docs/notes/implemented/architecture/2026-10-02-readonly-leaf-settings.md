# 046 叶子设置页：注册表 + 来源标注 + 零写入口

> 决策与规则见 [ADR-0215](../../../adr/ADR-0215.md)。

## Problem

046 要把 11 张叶子设置页首版做成只读呈现，其中只有三项有 main 手里的真事实（连接=Host 启动观察、
安全=实例策略、索引=工作区折叠）；其余 8 项没有 provider。验收还点名索引页不得触发全量扫描（D-090）。

## Decision

- `SETTINGS_LEAF_IDS` 即 11 页唯一名单；每行 `{title, source, note}`，未接线行以"未接线"起句并给原因
  （不改写成停用）。
- `SettingsLeaf.writeEntry` 恒 null、本版无写端口；面板切片级断言零 button/input/select。
- 来源取自 host 快照 / 实例策略文件 / follow 折叠观察；"折叠没读到"与"0 个工作区"分开说。
- 索引只读折叠；源码与 wiring 切片零 `workspaceFiles`/`readdir`/`scandir`，fold 与其它工作区读同源。
- 11 页放独立"设置（只读）"面板，与 026 后置族分区。

## Alternatives considered

- 禁用（disabled）开关：就是"看起来能改"，否决。
- 索引页扫目录树给真数：D-090 明禁，否决。
- 未接线写成"暂不可用/已关闭"：把没来源写成产品状态，否决。
- 并入 026 面板：来源与治理路径不同、会模糊 026 的零控件边界，否决。

## Consequences

- 三条验收各有机器断言（11/11 来源、零写入口、零扫描词汇 + fold 同源）。
- 已知未闭：8 页无真实 provider（治理写面 §7 后置）；真机未跑。
