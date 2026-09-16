# 2026-09-16 · 138 catalog 与 89 产品意图必须是两个分母

关联：[ADR-0096](../../../adr/ADR-0096.md)、[P-30](../../../pitfalls-playbook.md#p-30--一个目录有两份来源checker-只读其中一份却报告全量通过)

## Problem

真实 Red 不是“138 里坏了一条”，而是 verifier 根本没有 138 的分母：旧命令只读取
`fullstack-mapping.json`，打印 `70/70 全项通过` 并退出 0；`fullstack-extra.json` 的 68 条即使缺失或损坏，
也不会进入这条结论。

另一个独立问题是 89 项产品选择起初没有版本化 exact set。当前 live preset 有 89 个唯一 ID、覆盖 M00–M13，
但“当前文件长什么样”不是“产品批准了什么”。工程没有反推；产品 owner `lute` 随后明确确认该候选集合及
`4ebfa9f…` 指纹，才允许把它物化为批准清单。

## Decision

- `build-fullstack-catalog.mjs` 暴露纯合并函数，在构造 canonical set 前检查最终 install ID、来源引用、
  精确重复与归一化碰撞；manifest 是 rows 的确定性投影。
- `fullstack-contract.mjs` 对 mapping 与 extra 使用同一逐项路径：source、manifest、live `SKILL.md`、
  frontmatter、正文、全 artifact 可读性、symlink 与资源语法。Python 用 `compile()` 而非 `py_compile`，避免验证写入 pyc。
- `verify-fullstack.mjs` 只负责 CLI 与历史 preset 副本的环境分型；catalog 文本、JSON 与根 gate 共用同一 audit。
- `manifest/agent-fullstack-whitelist.json` 保存 owner/decisionRef/reason/scope、集合语义和 exact 89 IDs；
  `setSha256` 从排序后的集合逐行重算。runtime 比较同时给出 missing、unexpected、duplicate，并用 catalog `nodeId`
  逐项对账 M00–M13 归属；不把展示顺序升级为未批准契约。
- root gate 把 catalog 138 与 whitelist 89 分成两项；`verify-agent-fullstack.mjs` 再验证 live materialization 与 approved set 全等。

## Alternatives considered

- 保留 mapping/extra 两个循环：未来字段变化必然只改到一边，否决。
- 用 `Set.size === 138` 和 `array.length === 89`：同数替换和重复项可以绕过，否决。
- 把 whitelist 问题混进 catalog 一个布尔值：catalog 绿会遮住产品批准缺失，否决；两个分母必须独立。
- 先复制 live 89 再请 owner 追认：这会让审批变成对既成事实盖章，否决。

## Consequences

- catalog 当前读数为 `expected=138 / discovered=138 / checked=138 / skipped=0 / failed=0`，来源拆分为 70 + 68。
- contract 定向 suite 19/19，live integration 自测覆盖同数替换与节点错挂；包 typecheck 通过。包总测试随本卡与 QG-011
  增至 113 项，README 数字同步由测试守住。
- 根门禁新增 `fullstack-catalog`、`fullstack-whitelist` 与共用的 `fullstack-contract-selftest`；旧 `skill-lines`
  仍保留 CLI 级消费，避免判据写了却没跑到。
- 最终本地根门禁：quick `67/68`、full `74/75`，两者 `failed=0`；唯一非 pass 是 `live-presets`
  对 159 个 disabled 行的 typed skip。这里是本地证据，不替代 QG-007 的远端 required CI。
- 产品批准集合为 89 项，其中 mapping 52、extra 37；工程 reviewer 抽查两侧各 5 项，均能回到具体 sourceRef。
- invocation flag 的**存在与布尔类型**属于 catalog 契约；哪些技能允许模型自动调用仍由技能文件状态决定，未借本次 ID 审批偷渡 DEC-009。
- 本轮没有写入 live/profile、没有重启 DSH、没有打包 DMG。manifest 在工程验收阶段仅是工作树中的
  untracked 文件；本 Note 与 manifest 由随后获授权的同一 checkpoint 纳入 Git，不能把提交前的本地存在误报成更早已固化。
