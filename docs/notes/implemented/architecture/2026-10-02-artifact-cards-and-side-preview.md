# 015 产物卡与侧面预览：线索核验成卡、非特权容器、版本冻结

> 决策与规则见 [ADR-0218](../../../adr/ADR-0218.md)。

## Problem

FW-004/005 要求产物"点击才在侧面打开"：卡片只在版本就绪时更新，点击才按准确版本读取并由 main 加载
预览；迟到结果不覆盖、关闭不复活；内容失效失败+同版本重试；HTML 走已定离线容器与帧禁用不变量；
Office 后置为文件卡。基座证据：`workspaceFiles` 的 read/readBytes/readAll/stat/changes（观测非增量、
OS 不监听），ADR-0178 D3 把嵌内容合同点名留给"具体 UI 票"——就是本票。

## Decision

- 卡片=线索核验：changes 帧逐条 stat 核验（版本一致才 ready），不一致=未能核验、缺失=观察时不存在、
  目录/dotfile 不产卡；投影零机器路径；卡片措辞是候选而非验收；turn-end 边沿触发一次有界观察。
- 内容端口：桥加 readBytes（offset/length 与 read 的 offset/limit 分开校验）与 readAll（超限明确
  too-large 不截断）。
- 容器：`preview-window.ts` 落地 ADR-0178 D3/设计 ADR-0001——独立非持久 session、无 preload/特权
  IPC、仅内存 sage-preview:// 可读、其余请求取消、导航/弹窗拒绝；HTML 离线交互；容器只在通过的
  open 创建、close 销毁（卡片出现零容器）。
- 守卫：open 领代、stat/read/load 各验代；close 先代++；迟到一律 superseded，不覆盖不复活。
- 版本冻结：打开只读卡片版本；他版本=artifact-version-changed（retryable），重试同记录同版本；
  永不静默切最新、永不重跑生成。
- Office 打开即拒且卡片写"无内置预览/不自动转换/不把可下载写成可预览"；binary 标不支持。

## Alternatives considered

- 帧直接成卡不 stat：观测≠就绪，版本未核验的"就绪"是谎报——否决。
- privileged renderer 内 iframe：ADR-0178 D3 明禁——否决。
- file:// 或 data: 载入预览：本机文件可达面/不可控——否决（内存 scheme + 请求取消）。
- 复用隐藏容器：合同要求关闭回收，且隐藏页会存活——否决。
- 重试读最新版本：US-035 点名同版本重试——否决。

## Consequences

- 五条验收机器断言齐（零容器创建、迟到不覆盖/不复活、close 回收、版本失败+同版本重试、Office 词表）。
- 桥面 21→24；新增 `preview-window.ts`（Electron；本 loop 不启动 app，容器逻辑由注入替身全测）。
- 全量 902→925（015 新增 23 条）；gate 25/25。
- 已知未闭：真机 Electron 未跑（容器/协议/导航拒绝为接线代码+替身）；CSV 表格化=016；HTML 相对资源
  闭包与容量承诺（US-041）=016/专票；预览进程失效恢复合同待另票。
