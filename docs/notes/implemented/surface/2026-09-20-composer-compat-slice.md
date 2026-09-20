# 对话框兼容替换切片（Sanbao 自有输入区渲染段 + 两字文案）

- 日期：2026-09-20
- 相关：[ADR-0008](../../../adr/ADR-0008.md)（基座只 pin 不改）、[ADR-0019](../../../adr/ADR-0019.md)（官方 UI 改写锚禁钉哈希）、[ADR-0139](../../../adr/ADR-0139.md)（自有 Electron 薄壳四落点）、[ADR-0136](../../../adr/ADR-0136.md)（Sanbao 品牌源）
- 制品：`apps/lute-shell/src/host/composer-adapter.ts`、`apps/lute-shell/src/host/composer-view.ts`（渲染段 + CSS）、`apps/lute-shell/test/composer-{adapter,view}.spec.ts`、`apps/lute-shell/test/fixtures/{conversation,agent-preset}-client.js`（真包构建产物副本，署名在 `apps/lute-shell/THIRD_PARTY_NOTICES.md` §4）、`apps/lute-shell/scripts/{preview,composer-acceptance}.mjs`

## Problem

用户要求对话框与其周边「发生变化，原有对话框组件可以直接替换掉」，并把可见文案压到两字级别
（点名：本地兼容性测试 / 无项目 / 标准模式 / 工作区内修改）；同时要求能力必须真实——不能因为换皮
丢掉审批、停发、排队、草稿、附件、输入法这些行为。

两处硬约束让「重写一个输入框」不可行：官方对话框是 `@deepseek-ai/dsh-client-ui-conversation` 里
InputBar 的**渲染段**，它的闭包里同时握着 keyboard、editor、附件、审批、队列原语；而基座
（`vendor/dsh-desktop`）按 ADR-0008 只 pin 不改，也不能按哈希钉锚（ADR-0019）。

## Decision

在**薄壳出站面**（宿主 `/plugins/` 响应）做模块级适配，不改基座、不写补丁：

- **按模块边界定位**：`window.__ModuleLoader__.load({` + `id: "@deepseek-ai/dsh-client-ui-conversation"`，
  只替换 InputBar 的 render 段（从 `const primaryStops = …` 到 `//#endregion`），其余闭包原样保留；
  第二处适配 `@deepseek-ai/dsh-client-ui-agent-preset` 的座位标签。锚点**缺失或歧义一律抛错**
  （`replaceOne` 断言命中恰好一次），绝不静默回退旧 UI。
- **锚是代码形态不是哈希**：上游一改这几行，适配器报错（可见红），而不是悄悄退回旧对话框。
- **两字文案契约**：底行 chip 无值时回退「项目」；权限标签 只读/可改/全权；预设座位 标准/PTC/极简/创造；
  占位符「输入」；模型位（夹具名）「测试」。**完整名称保留在 aria/title/菜单**（模型菜单第二层仍见
  「本地兼容性测试（非真实模型）」）。改这五个词必须同批改 `scripts/composer-acceptance.mjs` 的断言。
- **填掉「无项目」死路**：未选会话时说第一句话，自动 POST `/.sanbao/session-directory` 取目录并建会话；
  失败则渲染 `role="alert"` 错误带「重试」，不静默。

## Alternatives considered

- **重写输入机**（自研 contenteditable/keyboard/审批/队列）：被否——能力必须真实，重写等于复制一个更差的实现。
- **打补丁改上游 bundle 本体**：被否——ADR-0008 基座只 pin 不改；且关机态改 app 内 client bundle 会触发 combo rev 白屏。
- **按哈希/行号钉锚**：被否——ADR-0019 明令禁止（升级即失效）。
- **只改可见文案、aria 跟着缩写**：被否——可访问名称与能力描述必须完整，这是用户点名的底线。
- **fixtures 只留一份**：选了两份（官方与自有 bundle 各一），因为适配器要同时吃两种形态；两份都在
  `THIRD_PARTY_NOTICES.md` §4 登记并留红测防漂移。

## Consequences

- 应用内可见对话框为 Sanbao 自有渲染，官方行为（审批/停发/队列/草稿/附件/IME）因闭包未动而保留。
- 适配器是「锚点驱动」的脆弱面，但脆弱是**显性**的：上游一漂移就报错，不会静默降级。
- `pnpm run preview` 是预览一条命令（先物化 → 写预览补丁 → 起隔离 Electron）；改 `lib/` 后必须重跑物化，
  否则宿主跑的是旧副本。
- 未闭口：真实付费模型验收未做（本机无 provider 凭证，模型位是本地夹具）；Worker 内附件上传失败重试分支
  未做实机；与三主题代码同树联调**未复跑**（本切片验收是在没有主题代码的隔离 worktree 上做的）。

## 证据（2026-09-20，隔离 Electron + CDP）

| 项 | 读数 |
| --- | --- |
| 壳单测 | 79/79（12 文件，含后续切片的组合包用例） |
| 类型 / 构建 | `tsc` 干净、build 通过 |
| 实机 | 26/26（`node scripts/composer-acceptance.mjs`：审批拒绝/允许、停发、排队、草稿恢复、窄窗无溢出） |
| 文案 | 底行 项目/标准/可改、模型位「测试」、占位符「输入」；aria/title 保留全名 |
| 漂移防线 | 两份 fixture 副本有改名/漂移红测；锚点歧义走抛错路径 |
