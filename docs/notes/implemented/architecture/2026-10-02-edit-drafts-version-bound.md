# 027 事项修改稿：版本快照、内容 Diff、独立回写

> 决策与规则见 [ADR-0225](../../../adr/ADR-0225.md)。

## Problem

FW-028/US-140~145：MECE 核对发现"事项修改稿与回写"有 D-009/010/053 既有决定却从未进入功能
接线（最大真漏）。要求：修改稿基于共享文件的某一版本生成、界面不称"共享文件已更新"；Diff 按
所依据版本比较、不依赖 Git；下载/导出不产生回写；回写=独立具名动作、需单独确认并预览影响、
首版不自动回写；Git 提交/推送/分支与 Worktree 写操作无入口；文件修改类工具活动只显示受控修改
信息与目标版本、不透传原始 payload。验收三条：生成后源文件保持未变；回写卡显示目标版本与影响、
未确认不写入；界面无 Git 入口。

基座事实（`dsh-api-workspace-files` 声明）：动词全集 = read/readBytes/readAll/readRelated/stat/
list/changes——**无写动词**；`version` 是不透明新鲜度令牌（永不解析）。

## Decision

- `main/edit-drafts.ts`（纯模块，复用 013 桥解析）：从引用生成——stat（引用版本必须等于现版本）
  + read 一页（≤400 行，未读完整拒）；记录 `basedVersion/basedText（不出 main）/proposedText`；
  视图 13 键受控（无 root/absolutePath/basedText/payload）。
- Diff：Sage 行级 LCS（两侧同用线尾规则；超预算退整替），每次重 stat 并标注
  basedVersion/currentVersion/sourceChanged；源变不回退基准、不自动合并（D-010 后置）。
- 回写：`prepare-writeback` 铸单卡（对象/动作/目标版本/当前版本/影响/费用 unavailable/
  not-yet-happened），凭据骑 025 的共享 `ActionConfirmationStore`；执行序 fresh-stat（源变→拒
  +retire，旧字节还原也不复活）→端口存在性（缺席 not-ready 不消耗）→consume →`executeWriteback`
  端口（唯一写入路径；生产不接线）。只有回执 written；抛错 unknown。
- 路由 `/.sage/edit-drafts/{create,update,diff,prepare-writeback,writeback}` 精确体；证据 S5：
  临时目录真字节（stat 真 mtime/size、read 真内容、假执行器写真字节）。

## Alternatives considered

- 直接改写源：否决（先稿后写；基座无写语义，main 不得绕过 base scope 写用户文件）。
- Diff 靠 Git / 源变自动合并：否决（D-053 点名非 Git 依赖；D-010 合并未契约化）。
- 回写走 `/.sage/actions` 流水线：否决（不在 Registry 动作面；独立具名动作）。
- 确认先消耗：否决（生产无端口会白烧卡）。
- 视图带源快照：否决（diff 在 main 算，快照不外漏）。

## Consequences

- 判者五项＋电池读数见 LOOP.md §6 本票行；验收三条各有机器断言；负空间（无 Git/下载/导出入口、
  五枚控件钉死、无 payload 字段）落为扫描断言。
- 测试面：S5 真字节（每步前后源文件 base64 不变；确认后假执行器写真字节；旧 mtime 还原不复活
  旧卡）；S1 路由（精确体、unwired 各码、凭据一次性）。
- 已知未闭：回写端口生产未接线（not-ready 诚实，等基座写 seam）；D-010 合并/冲突后置；真机未跑。
