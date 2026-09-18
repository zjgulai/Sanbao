# 决策记录：能力中枢——五切片只读聚合与命令面板

- 日期：2026-09-19
- 状态：implemented（仓库侧；profile 装配与浏览器验收见「Consequences」的未运行项）
- 对应 ADR：[ADR-0128](../../../adr/ADR-0128.md)（D1–D5）、[ADR-0009](../../../adr/ADR-0009.md)
- 涉及包：`packages/surfaces/dsh-capability-hub-local`（新增）、`packages/surfaces/dsh-role-matrix-local`（prefill 收敛）、`shared/client/{lute-tokens,prefill-draft}.ts`（新增共享源）
- 归属计划：[docs/plans/2026-09-19-capability-hub.md](../../../plans/2026-09-19-capability-hub.md) S1+S2

## Problem

本机已发布五个能力切片，但**能力图谱被侧栏入口行切碎**：技能住扩展中心、MCP 工具住
万物互联、岗位住岗位矩阵、产品与业务系统住新应用抽屉。每个切片各自实现了搜索框、卡片
语法、空态与徽标，于是「我想干 X，从哪进」这个问题在整个产品里没有任何一个界面能回答
——用户必须先知道能力住在哪个入口，才能用那个入口的搜索框找它。

同时有两处工程债与这个缺口同源：

1. **间距与圆角没有体系**：行距 2px、卡 padding 14/18/20px、gap 6/8/10/16px、圆角
   8/10/12/999px 全是字面值散落在各包 CSS 里。平台没有 spacing/radius token 家族
   （`--dsw-alias-radius-*` 之类从未被官方定义，`theme-tokens` 门禁 baseline 已登记为
   幻觉 token），所以每个包只能自己写字面量。
2. **`prefillDraft` 只有一个家但即将有两个**：它是岗位矩阵 hero 供给卡的私有模块，而
   命令面板的「预填」动作需要同一条通道（`conversation.input.shell(id).actions.setDraft`
   ——含它的探测纪律、失败上报、以及「刻意不做 DOM 兜底」的论证）。第二个消费方出现即
   意味着两份实现。

## Decision

新增 `dsh-capability-hub-local`（surfaces 组），并把两件共享物提到 `shared/client/`：

**聚合层（D1）**：`catalog.ts` 并发 GET 七条既有路由（技能三线 / mcp-servers /
role-matrix list / newapp products / newapp systems），每切片一个纯函数 mapper
（`mappers.ts`）投影成统一的 `CapabilityItem`。路由清单的单一事实源是 `CAPABILITY_ROUTES`；
404 记 `missing`（包未安装是正常态）；单切片抛错只记自己的 `error`；取数只在面板打开时
发生一次 + 手动刷新，**刻意不轮询**（`/list` 已被胶囊组件每 2 秒轮询，不叠负担）。
缓存不落盘，`invalidate()` 在 dispose 时清。

**调度面（D2）**：`CommandPalette.tsx` 注册进 `shell.overlay`（id `capability-palette`,
order 10），`<dialog showModal()>` 承载，全文件零 z-index。Cmd/Ctrl+K 唤起（修饰键组合
在任何焦点下都生效）；`↑↓` 选择、`Enter` 执行、`Esc` 关闭；`role=combobox` +
`role=listbox/option` + `aria-selected`。搜索是子串 > tag 全等 > tag 子串 > 摘要 > 子序列
的评分（`search.ts`），单屏截断 50 条。

**执行（D3）**：`dispatcher.ts` 按 action type 分发到既有通道，全部先例可指：
`execute-skill` = skill-center 的 `executeSkillPrompt` 语义 + 草稿预填优先；
`prefill-draft` = 岗位矩阵 hero 的 `setDraft` 语义；`open-panel` = `dsh:view-change`
广播；`open-system` = POST slug（从不发地址）。预填不可用时降级剪贴板**并 console.warn
原因**；依赖抛异常时返回 `{ok:false, reason}`，不向 shell 的栈上抛。

**token（D4）**：`shared/client/lute-tokens.ts` 幂等注入 `--lute-space-{1..5}` /
`--lute-radius-{row,card,chip}` / `--lute-brand` / `--lute-brand-line`。数值是既有读数的
收敛而非新发明。注入判据是 `style[data-lute-tokens]` 锚（写一次后不再满足写条件——
P-52 的教训）；消费方不得在 dispose 时移除该标签。面板 CSS 的颜色仍只写
`var(--dsw-alias-*, <亮色真实读数>)`，字体用官方 font shorthand，品牌绿只出现在焦点光环。

**prefill 收敛（D5）**：实现移到 `shared/client/prefill-draft.ts`；岗位矩阵
`src/client/prefill.ts` 改为 re-export 生成副本 + 保留自己拥有的 `prefillPrompt`，
调用方与测试的历史入口不变（`index.ts` 与 `tests/prefill.spec.ts` 零改动）。

## Alternatives considered

见 [ADR-0128 备选方案表](../../../adr/ADR-0128.md#备选方案)。此处只记两条实现层的取舍：

- **controller + inject face 而不是组件内取数**：组件只见 `{ controller }`（四 share 之外
  无自造面），fetch、会话查找、`conversation` 服务读取全部留在 apply 闭包。这样组件测试
  不需要 mock ctx，也符合「组件永不见 ctx」的纪律。
- **文案用自含字典而不是 locale 服务注册**：面板是 shell.overlay 独立场，locale 服务缺席
  时也必须能用；字符串只有十余条，迁移点是 `paletteStrings()` 一处。这是有意的偏离，
  不是遗漏——若后续要进 family 的 NS 体系，改这一个函数。

## Consequences

**已运行的验收（真实输出）**：

- `pnpm run typecheck`（capability-hub）：通过，无输出。
- `pnpm run test`（capability-hub）：**46 passed / 46**（mappers 契约冻结、catalog 聚合
  与缓存、search 评分与默认视图、dispatcher 分发与降级出声）。
- `pnpm run typecheck` + `pnpm run test`（role-matrix，prefill 收敛的回归面）：通过，
  **126 passed / 126**。
- `pnpm run build`（capability-hub）：`lib/index.js` + `lib/client.js` 44.58 kB
  （CSS Modules 已内联，`luteDesignTokens` 与 `shell.overlay` 在产物中可检出）。
- `node scripts/sync-shared.mjs`：23 个生成副本与 `shared/` 一致。
- `node scripts/gen-catalog.mjs`：目录墙已重生成（新包入册）。
- **profile 装配已完成**：vendor 镜像 + `file:` 依赖 + `dsh.profile.bundles` 行 + 装载点
  （`node_modules/dsh-capability-hub-local`，tmp+mv，`cmp` 逐字节核对一致）。注意：profile
  的 `pnpm install` **被一处既有缺陷挡住**——`dsh-theme-local` 等 5 个包把 `@deepseek-ai/*`
  声明为 `file:../../../vendor/dsh-desktop/vendor/dsh-runtime/*.tgz`，该相对路径在仓库布局
  成立、在 profile 镜像布局解析成不存在的 `vendor/vendor/...`，于是 profile 内 install 无法
  解析依赖树。装载点按 hoisted linker 的等价形态手工物化（只新增目录，可逆）；该缺陷登记
  为待办，未擅自改那 5 个包。
- **三次重启的启动三件套**（P-52 纪律）：每次 run 标记之后 **0 条 watchdog、0 次 recovery
  attempt、0 条 boot failed**；`startup.run.completed` 的 `rendererStatus: healthy`
  （9.6–12.0s）；渲染进程 CPU 0.2%。
- **浏览器验收**（铸 cookie + 独立 Chrome + CDP，凭证全程进程内、不落任何上下文）：
  - 七条路由实测全 200：overseas 28 组 / fullstack 14 组 / generic 8 组 / mcp 4 服务器 /
    roles 4 平面 / products 2 卡 / systems 31；mapper 对真实 payload 产出 **561 条**
    （技能 377：ready 161 / disabled 201 / absent 15；工具 101 提示词全唯一；岗位 50；
    产品 2；系统 31）。
  - Cmd/Ctrl+K 唤起 `<dialog>`：`role=combobox` 输入 + `role=listbox` 列表，中文文案与
    提示行正确；Esc 关闭（dialog 原生 cancel 语义）。
  - 默认视图 42 条、五个切片全可见（技能 10 / 岗位 10 / 产品 2 / 系统 10 / 工具 10），
    停用与未安装徽标正确渲染。
  - 查询「选品」→ 50 条（系统 1 + 技能 49），标题子串命中排最前；查询「趋势时机」→ 1 条。
  - **Enter 端到端**：面板关闭且真实 Lexical 输入框出现 `使用技能 /trend-stage-timing-analyzer`
    （setDraft 通道生效）；本包 console 零告警（happy path 不发声，符合设计）。
  - 页面零与本包相关的 console 错误/异常。
- `pnpm run gate`：**95/99 通过，1 项失败**——`profile-bundle-sync` 报 **newapp 的既有
  装载点漂移**（`lib/index.js`，与用户未提交的 `reachability.json` 同源；按用户裁决不动它）。
  其余含 `plugin-entry-contract`（apply 型 22 个全绿）、`package-files-coverage`（132 个对象
  全绿）、`profile-metadata-sync` / `profile-files-sync`（25/25）、`package-identity`、
  `catalog-fresh`、`adr-index`、`adr-note-links`、`changed-packages` 均通过。

**验收中抓到并修复的两个真缺陷**（浏览器验收的价值所在）：

1. **默认视图被取数顺序劫持**：`Promise.all` 的返回顺序决定了信息架构，首屏 50 条全是
   MCP 工具、技能一条不见。修为 `search.ts` 的 `defaultView`：按切片优先级分块、每块封顶
   10 条，保证五个切片都在单屏内可见；回归测试锁定。
2. **降级静默（仪器假绿）**：无当前会话时预填静默走剪贴板，而 `writeText` 的 promise 被拒
   后无人处理，函数却返回 `ok:true`——点击毫无可见效果而日志一片干净。修为 `dispatchAction`
   异步化：剪贴板成败如实进返回值，无会话也出声；回归测试锁定。这正是总账「仪器假绿」条目
   的同型缺陷，S3 批次里登记进总账。

**未运行 / 已知残差（诚实登记）**：

1. **Electron 渲染器内的验收未做**：上述浏览器验收走的是同一 webserver 的浏览器客户端；
   桌面壳（ExtendedFrame）内的面板表现（顶栏 drag 区、rightbar 轨道交互）未单独验证。
2. **插件 client bundle 改动必须重启应用**：实测宿主在引导期对插件字节做快照
   （`/plugins/??…&rev=<引导期哈希>`），改 `lib/client.js` 后 Cmd+R **不生效**——与诊断技能里
   「loader 包装的 client.js 可 Cmd+R 重载」的通用说法不符，已按实测修正生效语义；该差异
   值得回写诊断技能。
3. **每工具示例口令未下发**：`business-meta.js` 的 26 条手写 example（如「店铺里有哪些
   商品？」）被 `staticToolMetaFor` 丢弃，只留服务器级 example；mapper 已合成工具专属提示词
   并前向兼容 `tool.example`。暴露该字段需改 `dsh-wanzh-hulian`，登记为后续项。
4. **停用技能仍可经面板执行**：面板如实显示「已停用」徽标但不阻断执行（预填后模型不会自动
   调用）。是否阻断是产品决策，未擅自定。
5. **官方 `/` 命令浮层与能力面板并存**：验收截图显示官方 popupSelect 也在展示技能命令；
   两个能力入口的关系（合并/分工）是 S4 的设计议题。另观察到会话草稿跨页面加载持久化
   （服务端会话草稿），预填的可见性因此不依赖当前页面实例。

**后续动作**：S3 把 workbench 面板迁到 `main` keyed slot（research/14 已证可用）后，
dispatcher 的 `open-panel` 从 `dsh:view-change` 换成 `selectPanel`——只此一处；
S4 的 hero 橱窗给面板补可见入口（hero 是命令面板的静态投影，共享同一份目录）。
