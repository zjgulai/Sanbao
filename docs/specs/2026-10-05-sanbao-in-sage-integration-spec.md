# Sanbao → Sage 206 状态集成规格

- 日期：2026-10-05
- 状态：执行基线
- 权威矩阵：[Sanbao → Sage UI state map](2026-09-27-sanbao-to-sage-ui-state-map.json)
- 执行票据：[Sanbao → Sage integration tickets](../plans/2026-10-05-sanbao-in-sage-integration-tickets.md)

## 1. 目标

把 Sanbao 的 59 个状态组、206 个页面状态逐一装配到 Sage 默认产品界面，并让每个需要业务能力的交互只经过 Electron main-owned Application Service、既有 authority/admission 和受控 capability port。最终目标是形成可复现构建、可在真实默认窗口验收、具备独立 DMG 发布前置证据的 Sage.app。

206 个 Sanbao 页面是视觉与交互范围，不是已完成证明。以下任一事实都不能单独把状态标成 `integrated`：网页可访问、原型 `window.__SANBAO_HOST__` 已接线、fixture 成功、旧 renderer 可显示、Application Service 返回 blocked/unavailable、截图存在、测试替身返回成功。

## 2. 固定输入与主键

矩阵的一一对应主键为 `sourceStateId`：

```text
catalog.states[].id
  = prototype ledger.state_id
  = legacy state map.states[].sourceStateId
  = initial candidate.state_id
  = tracked v2 matrix.states[].sourceStateId
```

固定来源：

| 输入 | 固定值 | 用途 |
|---|---|---|
| Sanbao commit | `b861d046013fb8bee9a1f3224ed0965efcf42111` | 源状态版本 |
| `src/catalog-data.json` | SHA-256 `9eaf593a5bdc214ec0d938951e7aaa6859111823c361a2719c736210276398d3` | 59 组、206 状态与 source truth |
| `evidence/wiring/ledger.csv` | SHA-256 `0244bd8b25cd2d9323b0f22e54123515cfa37ea8b08b45b4a24dc692e3a3a63e` | 仅记录原型接线事实 |
| v1 state map | 15 条显式复核、191 条默认复核 | 保留旧 UI-00 处置历史，不代表交付 |
| `.birdview/2026-10-05-sanbao-sage-integration-matrix.csv` | SHA-256 `27fc8d8bf509b553f1ad19fc5e3a022bce86ca6e8406ec02269aa9deeadfc93c` | 仅首次迁移 owner/status 候选；ignored、非证据、steady-state 不依赖 |

生成后的稳定主键摘要为 `a89ad30a082d23b67616a67402c734e781dae0094d1c6af12e061609e6df4698`。任何增加、删除、改名、重排或重复都会触发 gate；升级源版本必须作为独立、显式迁移处理，不能在普通状态更新时顺带吸收。

## 3. 四层事实

每一行必须同时保存四层，不得互相代替：

1. `source`：Sanbao catalog 的标题、组、页面、variant、source kind、trigger、exit、观察证据和注释。catalog 中 206 条 `implemented=false` 原样保留，它不是 Sage 完成标志。
2. `prototype`：prototype ledger 的 class、目标接线深度、原始 status 与归一状态；`countsAsSageIntegration` 永远为 `false`。
3. `legacyUi00Review`：旧 state map 的显式或默认处置，仅记录历史评审。
4. `delivery`：Sage 当下交付事实，包含 owner、适用性、五个验证维度、总集成状态、阻断项及不适用决策。

`delivery` 的五个维度为：

- `ui`：状态可由 Sage 默认产品入口触发和退出，数据不是 canned/fixture。
- `applicationService`：UI 使用已登记的 `METHOD /.sage/*` 路由，route ref 必须存在于 route authority matrix。
- `hostIntegration`：需要 Host/capability 的状态已通过同一受控执行连接及 admission，不绕过 main。
- `electronAcceptance`：真实默认 BrowserWindow 中完成输入、结果、拒绝/失效与重启检查。
- `visualAcceptance`：按状态逐项检查布局、主题、density、焦点、键盘、窄宽和必要可访问性。

维度状态使用 `pending | implementing | blocked | verified | not-applicable`；总状态使用 `pending | blocked | integrated | not-applicable`；适用性使用 `unreviewed | required | not-applicable`。

## 4. 完成公式

一行只能在下式全部成立时标记 `integrated`：

```text
applicability == required
AND ui.status == verified
AND applicationService.status == verified
AND hostIntegration.status == verified
AND electronAcceptance.status == verified
AND visualAcceptance.status == verified
AND 每个 verified 维度至少有一条 tracked、非 ignored、非 fixture 的验证证据
AND applicationService.routeRefs 至少包含一条 route authority matrix 中存在的精确 METHOD + path
```

`blocked Application Service + integrated`、`prototype wired + integrated`、ignored/fixture evidence 升格为 verified 均为硬失败。

若某行确实不适用，必须同时满足：`applicability=not-applicable`、`integrationStatus=not-applicable`、有 tracked `notApplicableDecisionRef`、有非空 rationale。原型 ledger 的 `n/a(...)` 不自动等于 Sage 的不适用决策。

## 5. 初始基线

首次迁移只固化可追溯事实，不把候选进度升级为验收：

- 206/206 行、59/59 组；ID、catalog、ledger 一一对应，重复 0、缺失 0、外部 ID 0。
- source kind：`observed=123`、`entry-observed=28`、`static-only=55`。
- prototype：`prototype-host-wired=44`、`prototype-entry-verified=2`、`honest-unwired=55`、`prototype-not-applicable=105`。
- legacy review：`explicit=15`、`default-unreviewed=191`；disposition 为 `adapt=13`、`defer=193`。
- owner：T01=4、T03=8、T06=16、T07=8、T08=7、T09=18、T10=51、T11=3、T12=17、T13=74。
- UI 候选状态仅保留 `implementing=4`、`pending=202`；Application Service 全部 `blocked=206`；其余验证维度全 `pending=206`。
- `integrated=0/206`；适用性全部 `unreviewed=206`。

这些计数全部由 206 行派生，`summary` 不允许手工维护。

## 6. 生成器与更新纪律

`scripts/gen-sage-sanbao-state-matrix.mjs` 有两个阶段：

- 首次导入：显式提供固定 Sanbao 根与 `--candidate`，从 v1 map、catalog、ledger 和 ignored 候选生成 v2。
- 稳态：tracked v2 自带 `delivery` overlay；`--check` 只校验 tracked matrix，`--check-source` 从 pinned catalog/ledger 重建并比较。稳态不能隐式读取 `.birdview` 或 sibling 工作树。

所有仓路径由 Git 根或参数解析；矩阵不得保存本机绝对路径、凭据、raw provider subject、session token 或业务敏感内容。更新一行时只改 `delivery` 的交付事实，source/prototype/legacy truth 由生成器保护。升级 pinned source 必须先更新本规格、生成器常量与相应负例，再重建矩阵。

## 7. 验证与发布边界

矩阵 gate 必须拒绝：行删除、重复/外部 ID、source/ledger 漂移、summary 篡改、wired 伪升 integrated、ignored/fixture 伪 verified、blocked service + integrated、未决策的 N/A、未知 route ref、缺失验证维度或证据。

矩阵 gate 当前由独立脚本提供；是否接入全局 `pnpm run gate` 是单独串行接点，在完成该接点前不得宣称已纳入全局门禁。206 行关闭也不自动等于 DMG 已签名、公证或发布；打包、签名、公证、安装/升级、第二进程和发布验收必须使用 Sage 自己的新发布链独立完成，旧 DSH DMG 结果不能代替。
