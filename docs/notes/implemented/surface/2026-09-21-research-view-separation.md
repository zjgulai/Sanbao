# ResearchView 职责拆分：DA-07 首片

## Problem

[DA-07](../../../../.scratch/review/2026-09-20-deep-analysis-top20/tasks/DA-07-source-hotspot-split.md) 的首个热点
把资料库协调、路由请求、计划变更、进度订阅/轮询与三个工作区页面塞进同一文件。缩短包装文件不是目标：
异步生命周期须有独立行为测试，原视觉检查也不能随着文件变小而失去射程。

本片只处理 ResearchView，不处理 wanzh、investigation 或 gate。拆分决策编号：[ADR-0155](../../../adr/ADR-0155.md)。

**范围订正**：SOURCE 拆分的保真结论不适用于整个出货 diff；补建激活了旧 bundle 尚未包含的已有行为。
用户已批准将产物同步及终审三项修复单列为 [ADR-0156](../../../adr/ADR-0156.md)，
其基线、处置与最终 RED/GREEN 输出统一见[产物同步 Note](2026-09-21-deepresearch-artifact-sync.md)。

## Decision

- `use-research-library.ts` 持有资料库状态、250ms 搜索、路由清理、严格较新的列表覆盖规则、创建/删除协调。
- `use-research-workspace.ts` 持有草稿、原有 reset 依赖、进度订阅、running-only 2500ms 单 effect 内不重叠轮询，
  以及保存、先保存再确认、停止/恢复/写报告。`useReportExport` 在 ReportPane 内调用，保持该 pane 的挂载边界，
  只迁移原有剪贴板与提示定时器，不增加清理或改变失败语义。
- `research-view-model.ts` 持有纯视图类型、投影/格式化与导出字符串；不持有 API、React 或浏览器副作用。
  原样搬迁是拆分时点的决定；HTML 与删除依赖的后续行为修复归上述 ADR-0156。
- `ResearchWorkspace.tsx` 收工作区及展示 pane；`ResearchComposer.tsx` 保留本地表单/submit 状态；
  `ResearchView.tsx` 留资料库、ProjectCard、DeleteConfirmDialog，调用方与 `ResearchViewApi` 原样不动。
- 显式内部 import，不加公共 export、store/class 或转出口兼容层；源码拆分仅调整 `tsconfig.client.json` 的 files 列表。
- 新增实际调用 hooks 的测试，使用真实 React state/fake timers，只在远程与剪贴板边界用替身。
  视觉 source 检查读取三份 TSX 和含 HTML 模板的 model，不删断言。
- DA-07 构建补片不再改源码拆分：`build` 接通 `tsc -b --pretty false && tsdown`，
  `tsdown.config.ts` 使用包内 `build/tsdown.client.ts`，与 `dsh-newapp-local/build/` 的 preset、
  `web-platform.ts` 逐字一致；不引用不存在的上游路径，不修改 pinned base。
  声明 `tsdown@0.22.2`、`lightningcss@^1.32.0` 并锁定构建依赖；既有依赖不删除、不降级。
  保留 host 的 index/invariant 构建入口和 `clean: false`，不再生成或改写 Typert schema。
- `tests/build.spec.ts` 在包内临时目录执行实际 manifest 的 build 脚本，先去掉旧 client/host 入口与增量缓存，
  再验证新 bundle 的 loader 注册、五个拆分模块的 sourcemap/源码内容、全部非 client 导出的真实 Node 导入，
  以及五个 Typert 文件逐字节保留；不会把旧产物存在或源文件包含某符号当作构建成功。

## Alternatives considered

- **只搬 JSX、把所有协调继续留在大组件中**：不能独立证明请求/订阅清理，也没有降低职责密度。
- **引入统一 store 或稳定化全部 API 对象**：会改变原有 effect 重订阅/轮询重建行为，不属于无行为变更拆分。
- **顺便修 HTML 转义、轮询拒绝或提示定时器清理**：不混入拆分；HTML 后由用户明确批准的 ADR-0156 修复，其余仍保留。
- **继续只跑 tsc 或手工改 bundle**：无法证明出货客户端来自当前源码；使用已有本地插件 bundler 模式。
- **复制 vendor 上游构建器、修改 pin 或删除 host 入口以绕过构建**：均不采用；只同步现有本地 preset，保留两面产物。

## Consequences

### 已运行证据（2026-09-21）

包目录下执行；后续直接用该包 `node_modules` 中的 Node 入口，避免 pnpm 自动 bootstrap：

| 时点 | 命令 | 结果 |
| --- | --- | --- |
| 基线 | `pnpm run test --no-cache --configLoader runner` | 6 文件 / 52 tests passed，含 view 16/16；exit 0 |
| 基线 | `pnpm run typecheck`、`pnpm run build` | 均 exit 0，但增量缓存命中 |
| 基线补证 | `node node_modules/typescript/bin/tsc -b --force --pretty false` | 强制编译 exit 0 |
| RED | `node node_modules/vitest/vitest.mjs run tests/research-hooks.spec.tsx --no-cache --configLoader runner` | exit 1：hook 文件尚不存在，收集失败，未执行行为用例 |
| 首轮移植 | 同上 | 20 passed / 2 failed；测试 harness 的不稳定 onChange 与真实 caller 不一致，先修测试边界，不改生产语义 |
| 第二组 RED | 同上加 `-t useReportExport` | 3 failed：尚未导出 useReportExport |
| GREEN | `node node_modules/vitest/vitest.mjs run tests/research-hooks.spec.tsx tests/view.spec.tsx --no-cache --configLoader runner` | 25 hook + 16 view = 41 passed，exit 0 |
| 最终全包 | `node node_modules/vitest/vitest.mjs run --no-cache --configLoader runner` | 7 文件 / 77 tests passed，exit 0；原有 52 条全部保留 |
| 编译 | `node node_modules/typescript/bin/tsc -b --force --pretty false` | exit 0，更新既有 lib/types 产物并生成五组模块产物 |
| verify 等价命令 | `node --check lib/index.js && node --check lib/client.js && node --check lib/typert.host.js` | exit 0；旧 bundle 仅语法检查，不冒充新 bundle 验收 |
| ADR 账本 | `node scripts/gates/adr-agent-records.mjs --write` 后运行同脚本检查 | PASS，154 篇 / 33 篇有块 / 121 历史豁免 / 177 条 decision；豁免未增加 |
| 保真比对 | TypeScript AST 比较原/新函数体与协调块 | 36 个普通函数体逐字相同；library 原 30–125 / workspace 原 196–289 行协调块逐字保留 |
| 出货清单 | 现有 `auditPackageDelivery`，单包注入真实文件树 | checked 8，missing/unreadable 各 0，skip null；仅证明清单覆盖，不证明 bundle 新鲜 |

保留的基线告警：已安装 `dsh-client-ui-primitives/lib/index.js` 引用不存在的 `index.js.map`，
Vite 发 ENOENT 警告但测试未失败。没有观察到原 view 测试失败，实际数量是 **16**，不是预估的 17。

补充测试类型核验：单独 tsc 新测试曾报两个缺失 augmentation 前置及三处新测试类型错误
（route initialProps 推断过窄、delete 替身误用旧 view 测试的 `{ ok: true }` 而非实际 `{ deleted: true }`）。
修正新测试和预览替身；用 TypeScript API 加载原 client 项目的 files/options，额外加入新测试、仅在内存把
rootDir 放宽到包根并 noEmit，最终 **0 diagnostics**；未修改配置文件。随后再次全包 **77/77**。

环境例外：首次 `pnpm run` 意外执行自动 bootstrap，打印 `Already up to date` 与 supply-chain 检查；
未显式安装依赖，之后改用直接 Node 入口；不能据此声称依赖树逐字节未被该 bootstrap 写过。
依赖复用仅建 worktree 内 package/node_modules 软链，不修改原包源码。

### 构建缺口补片证据（2026-09-21）

包目录 `packages/capabilities/dsh-deepresearch-local/` 下执行：

| 命令 / 判据 | 结果 |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run tests/build.spec.ts --no-cache --configLoader runner`（修复前） | RED，1 failed；实际 tsc build exit 0，但 `build must emit lib/client.js from source` 断言失败 |
| 同一命令（接通本地 preset 后） | GREEN，1 passed；真实构建、factory 注册、五模块映射、host 导入与 Typert 保留均通过 |
| `npm run build` | exit 0，tsdown 0.22.2 / rolldown 1.1.5；生成 client.js 420.62 kB、map 796.85 kB、index.js 110.39 kB、invariant.js 0.59 kB |
| 连续两次真实 build 的 SHA-256 比较 | client.js / client.js.map / index.js / invariant.js 四文件完全一致 |
| `node node_modules/typescript/bin/tsc -b --force --pretty false` | exit 0，非缓存命中 |
| `node node_modules/vitest/vitest.mjs run --no-cache --configLoader runner` | 8 文件 / 78 tests passed，原有 77 条全部保留 |
| `node --check lib/index.js && node --check lib/client.js && node --check lib/typert.host.js` | exit 0，检查此次重建产物 |
| 实际 lib 的 VM loader 注册与 map/源码内容比对 | factory id 为 `@deepseek-ai/dsh-deepresearch`；五个拆分模块均在 map 中且 sourcesContent 等于当前源码；client/map source 路径不含本机绝对路径 |
| 实际 lib 的动态 import 与构建前 SHA-256 比对 | `.`、`./invariant`、`./types`、`./typert`、`./remote` 均可导入；五个 Typert 文件未改 |
| `pnpm install --lockfile-only --frozen-lockfile --ignore-workspace`（store/state 均限定包内 `.tmp/build-tools/`） | exit 0；408 条锁记录通过 supply-chain 校验 |
| 锁文件新旧 YAML 对比 | 只新增 2 个直接构建依赖及 53 组 packages/snapshots；所有原有 importer、版本、integrity 和依赖边不变 |

上表构建补片时点 client.js SHA-256：`5ef913dc9368c2a6f7ffbb987c109ecc8cbb8743de473301e8dbdb0fe2c458d1`（不是终审修复后的最终哈希）。
Host 与 Client 都同步了既有源码和旧产物的存量行为差异；该同步不属于无行为变更拆分，
完整差异基线及最终哈希归[产物同步 Note](2026-09-21-deepresearch-artifact-sync.md)。
保留 preset 的 external/noExternal 弃用告警与 zod 内联提示；
测试保留上文记录的 primitives 缺 map 告警，没有静默放宽校验。

安装隔离：先把指向 main 的 package/node_modules 软链替换成 worktree 内独立拷贝，内部无绝对软链。
整包 `pnpm add -D tsdown@0.22.2 lightningcss@^1.32.0 --lockfile-only` 因 worktree 缺既有 vendor tarball 而失败；
未修改 pin 或复制上游。改在包内 `.tmp/build-tools/` 安装真实编译器，再把其锁定记录增量合入包锁文件并做 frozen 校验。
临时工具链接只在本 worktree 内，shipping 配置只使用声明的 `tsdown`/`lightningcss`，不依赖临时路径。
**完整从零安装未验证**：仍须先具备 manifest 原已声明的 vendor tarball；不能把 lockfile-only 成功当全量安装成功。

### 剩余验收边界

- 包内不存在 `validate-build` 脚本；本补片由现有 Vitest suite 中的实际构建回归覆盖，不虚构该命令通过。
- 全仓 quick/full 已运行但未通过，具体隔离环境缺口与浏览器补证见下文；真实 DSH 集成仍未验证，本卡只部分结算。
- 协调者的 `127.0.0.1:4177` 同时提供 source 与实际 bundle 的隔离预览；Remote/slot 适配器是内存夹具，不冒充宿主集成。

### 独立发现的处置边界

- HTML 导出注入已在明确批准的 [ADR-0156 修复波次](2026-09-21-deepresearch-artifact-sync.md) 修复；同批还处理删除依赖与产物层级精度，不再列为未修项。
- 进度 get 轮询为 `.then(...).finally(...)`，没有 rejection handler，网络拒绝可能成为未处理拒绝。
- 不重叠保证仅限单个轮询 effect 生命周期；原 `[api, applyLatest, project.id, project.runState]` 依赖保留，
  API 对象换身份会清理旧 effect 并立刻发起新 get。不能把局部 inFlight 宣称为跨 effect 的请求互斥。
- 导出提示定时器原本不在卸载时清理，列表 refresh 原本没有 request-generation 守卫，保持不变。

### 协调者浏览器入口

临时预览：`.scratch/da-07-preview/serve.mjs`（`node .scratch/da-07-preview/serve.mjs`），
地址 `http://127.0.0.1:4177/`；HTML HTTP 200 已实测，TypeScript parser 沿静态 import/export 图
读取 46 个模块，失败 0、未截断；这只是模块可供给证据，未宣称浏览器渲染通过。
使用实际 ResearchView/已安装 UI primitives，API 全部在内存，样本无外链，不触及 app/profile；
主题变量是近似预览值，不能当三主题集成证据。

流程：资料库搜索/过滤/列表切换 → 计划样本编辑 →「下一次写操作失败」后保存确认草稿保留 →
重试确认调查 → 停止/继续 →「推送下一阶段」→ 写报告 → 三步导航 → 删除取消/确认 →
发起研究/展开上下文。深链入口 `/?project=preview-plan`；刷新复原样本。

### 协调者验收补证（2026-09-21）

Chrome DevTools MCP 实际操作 source 预览：修改目标→模拟写失败（草稿保留、按钮恢复）→重试确认→调查→
停止/继续→阶段推送→报告→删除取消/确认→返回资料库；另验搜索空态、创建新计划、列表/网格/阶段过滤、
深链恢复、空问题提交禁用及展开研究背景。设备模拟的 `innerWidth=390` 与文档 `scrollWidth=390` 一致，
弹窗左右边界 8/384px；预览 favicon 404 修正后控制台无 error/warn。主题 token 为预览近似值，未验证产品三主题。

`?bundle=1` 使用实际 `lib/client.js`，只提供 React/UI 模块表与内存 Remote/slot 适配器，执行真正的 factory/apply
及 overlay。factory id 为 `@deepseek-ai/dsh-deepresearch`、apply 完成、三份 CSS 注入、overlay 出现；
实际点击确认计划→停止→恢复→推送阶段→撰写报告，报告正文可见，hash 路由为 `#deepresearch/preview-plan`，
390px 无横向溢出且控制台无错误。这是 **bundle 的隔离浏览器验收**，不是 DSH Desktop 实机集成。

协调者独立复跑全包 **78/78**、强制 tsc、`npm run build`、`npm run verify` 均 exit 0，保留前述依赖告警。
五个拆分模块的 sourcemap `sourcesContent` 均等于当前源码；证据保存在临时预览目录的
`artifact-evidence.json` 与 `browser-evidence.json`（不作为出货文件）。

全仓 quick：109 pass / 4 skip / 10 fail；full：113 pass / 6 skip / 12 fail，均 exit 1。
失败面包括隔离 worktree 未初始化 vendor 基座、其他包依赖/构建物缺席、真实 profile 与工作区修改未同步、
并发见证及对象库临时包；不删除其他会话文件、不改 pin、不降低判据。full 中 CI 契约及自测、发布自测、
feed 及自测、package-files-coverage、changed-packages、node-interpreter、shared-sync、ADR、pitfalls 均通过。
full 首轮更新包缺 tsc；随后在此 worktree 按锁文件离线安装，更新包 typecheck exit 0、28/28 测试通过；
该补验不覆盖原全仓失败，整仓门禁仍未通过。
