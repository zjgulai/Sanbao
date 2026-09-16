# Workstream 02 · 门禁真实性、CI 与远端保护

## QG-001 · 统一 pass/fail/skip 三态与空射程语义

- 优先级：P0
- 估算：M
- 依赖：BASE-001
- 可并行：可与 REL-001、SEC-RT-001/002/004 并行

### 目标

所有 gate 只能给出 pass、fail、skip；“没有测到”不得显示为 `ok`。

### 范围

- gate check 返回结构、summary、CLI 退出码。
- catalog、profile、live、release 等已有空射程分支。
- 发布或严格 CI 使用的 `--require-no-skip`。

### 非范围

- 本卡不改变各业务 checker 的具体判据。
- 不把所有可选环境变成 CI 必装依赖。

### TODO

- [x] 记录当前存在 `passed:true` 但实际没有测量对象的全部路径。
- [x] 定义统一 result schema：status、expected、discovered、checked、skipped、failed、reason。
- [x] 必备治理文件缺失为 fail。
- [x] 可选环境整体不存在为 skip。
- [x] 环境已存在但 expected>0 且 checked=0 为 fail。
- [x] expected 必须等于 checked + typed skipped + failed。
- [x] summary 中 skip 与 pass 分开计数。
- [x] 增加 `--require-no-skip`，任何 skip 非零退出。
- [x] 为旧 checker 提供一次性迁移适配，但不永久保留两种含义。

### 自动验收

- [x] 必备文件缺失 → fail。
- [x] 可选环境缺失 → skip。
- [x] 环境存在但测量为 0 → fail。
- [x] skip 不计入 pass 数。
- [x] strict 模式遇 skip 返回非零。
- [x] CLI JSON/文本输出都能追溯“测了什么、没测什么”。

### 人工验收

- [x] 随机抽 5 个 gate，仅看输出即可解释射程与结论。

### 失败边界

不得为保持绿色将 fail 改成 skip；若统一 schema 迁移未完成，先不启用 required check。

### 2026-09-16 本地证据

- Red：旧 CLI 对 `--json`、`--require-no-skip` 均返回用法错误 2；catalog/profile/skill/staging 审计发现多条空射程 pass。
- Green：canonical schema 自测 14/14；`test:gate` 398/398；quick JSON 可解析，正式 quick 为 65 checks 中
  64 pass、1 typed skip、0 fail，正式 full 为 72 checks 中 71 pass、1 typed skip、0 fail，且对象级守恒。
  strict 对同一 skip 返回 1。文本随机抽样能直接看到每项五个计数与原因。
- 边界：旧 checker 仍经集中 adapter 按一个 gate 单元记账；其业务对象分母由 QG-003/004/005 等卡独立迁移。
  并行启动三份完整 quick gate 曾触发既有共享 fixture 干扰，归 QG-006B，不在本卡冒充解决。

## QG-002 · live-presets 全量判据

- 优先级：P0
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-003..005 并行

### 目标

每一条真实 preset row 都进入 checked、明确 disabled 或 failed 之一。

### TODO

- [x] 固化当前 53 个 preset 中 checker 报告 1,590 rows、另有 52 条裸 `dsh-skill-subset` 未进入分母的 Red 证据；数字只作迁移基线，实施时必须重采而非写死。
- [x] 优先复用宿主真实 parser/resolver；若不能复用，建立受控 YAML scalar/row 解析契约。
- [x] 覆盖裸包名、scoped package、路径、`file:`、`cordis:` 和占位符。
- [x] 未知 dynamic expression 不能自动当 disabled。
- [x] 输出 discovered/checked/disabled/failed。
- [x] preset 根整体不存在为 skip；根存在但应有文件缺失按契约 fail。
- [x] 不修改任何用户 preset。

### Red/Green 验证

- [x] Red：最小 fixture 只放一条裸包名时，旧 checker 的 `discovered/checked` 仍为 0 或保持绿色。
- [x] Green：同一 fixture 修复后必须得到 `discovered=1`、`checked=1`；当前仓库满足 `discovered = checked + disabled + failed`，52 条裸包全部有逐条结果。

### 负例

- [x] 裸包名不存在、重复、被注释伪装、缩进错误、未知动态表达式分别失败；合法显式 disabled 只能进入 typed disabled，不能进入 pass。

### 证据层级

- [x] L1 parser fixture 证明 row 分类；L2 临时 preset 树 mutation 证明 gate 判别力；L3 当前仓库只读全量清单证明分母。真实用户 profile 扫描仅是 live acceptance，不替代 L1/L2。

### 自动验收

- [x] 解析分母等于真实 `name:` row 数。
- [x] 当前裸包名不再漏检。
- [x] 删除裸包、缺文件、错误路径、未知表达式都有负例。
- [x] 占位符出现在非注释配置中会失败。
- [x] 零射程明确 skip。

### 人工验收

- [x] 只读扫描当前 53 presets，按每种 row 形态抽样核对。

### 退出条件

- [x] 当前 53 个 preset 的每条 row 都有稳定 ID、分类和结果，且任何移除/替换一条裸包的 mutation 都会让 gate 非零退出。

### 失败边界

解析不确定时必须 fail 或 typed skip；不保留 permissive fallback。

### 2026-09-16 本地证据

- L1/L2：live-presets、canonical 与调用方定向 suite 57/57；删除一条裸包、替换成另一个仍可解析的包，
  resolver 可保持绿色而 identity inventory 必红。缺文件、坏缩进、重复 ID、未知 dynamic、六类 specifier 均有负例。
- L3：真实用户根只读重采 53/53 个文件、1,642 rows；1,483 checked、159 platform-disabled、0 failed；
  52 条裸 `dsh-skill-subset` 全部有 stable ID 与结果，per-preset inventory 完全匹配。
- 抽样：真实数据覆盖 builtin、scoped/bare package、nested group 与平台 disabled；当前真实根没有相对/绝对/file row，
  这三类由 L1 fixture 验证，不虚构 live 样本。真实 `~/.dsh` 没有任何写入或 mutation。

## QG-003 · plugin-entry 契约闭合

- 优先级：P0
- 估算：M/L
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-002、004、005 并行

### 目标

候选插件的真实入口、`apply`、service 使用和 `inject` 声明形成完整、可解释的契约。

### TODO

- [ ] 固化当前“21 checked / 23 candidates 仍绿”的 Red。
- [ ] 从 manifest `main`/`exports`/DSH entry 解析真实入口，不硬编码 `lib/index.js`。
- [ ] 候选分类为 plugin、library、typed skip、无法判断；无法判断不静默继续。
- [ ] 入口缺失、不可解析、缺 apply、service→inject membership 不一致均有明确结果。
- [ ] 处理 re-export、多行声明和 type-only 情形。
- [ ] 避免注释/字符串导致 ctx property 假命中；没有新增 dependency 许可时优先最小 parser 或已有工具。
- [ ] remediation 文案必须只承诺 checker 真正检查的内容。

### Red/Green 验证

- [ ] Red：保留当前“23 candidates 中仅 21 checked 仍退出 0”的最小重放，并分别指出被静默跳过的阶段。
- [ ] Green：先把候选分解为 `pluginExpected + library + typedSkip`；对 plugin 集合强制 `checked === expected`，总体强制 `candidateTotal === pluginExpected + library + typedSkip`，任何入口缺失都不能从分母消失。

### 负例

- [ ] 删除 `main`/`exports` 指向的入口、制造悬空 re-export、移除 `apply`、访问未声明 service、伪造注释/字符串命中，均得到确定的非零退出。

### 证据层级

- [ ] L1 manifest/entry resolver fixture；L2 临时 package mutation；L3 当前全部 candidate 清单。只有 L1/L2 通过后才允许把 L3 接入 required gate。

### 自动验收

- [ ] missing/malformed entry 判红。
- [ ] 访问 service 但 inject 列表没有该 service 判红。
- [ ] library 与合法 re-export 被正确分类。
- [ ] 当前 23 个候选全部得到解释，不能只显示 21/23。
- [ ] checker 规则、测试用例和错误修法一致。

### 人工验收

- [ ] 抽查一个 host plugin、一个纯库、一个跨文件导出包。

### 退出条件

- [ ] 当前候选没有 unexplained omission，plugin 的 `checked/expected` 全等，且 missing-entry 与 service/inject mutation 都稳定非零退出。

### 失败边界

语义检查不能可靠落地前，不接入硬门禁；但必须保留旧事故的精确最小防线。

## QG-004 · Profile sync 覆盖率与错误显式化

- 优先级：P0
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：中

### 目标

profile 整体不存在可以 skip；profile 已存在时，缺件、少测、坏 JSON、错误 entry 都必须失败。

### TODO

- [ ] 用 HEAD 实现重现 nested vendor 路径导致 0 个比较仍绿的 Red。
- [ ] 建立 expected managed set，保留完整 `packages/<group>/<package>` 相对路径。
- [ ] 输出 expected/checked/skipped/failed 和每个对象分类。
- [ ] 区分受管包、外部 `file:` 包和明确不出货包。
- [ ] manifest 读取/解析错误直接失败。
- [ ] profile 已存在但只命中部分受管包时失败。
- [ ] metadata、files、bundle、loadpoint 分别报告，不互相代替。
- [ ] candidate fix 必须针对 0/N、1/N、N-1/N 均有 mutation。

### 自动验收

- [ ] 0/N、1/N、N-1/N 分别失败。
- [ ] malformed manifest、缺 loadpoint、错误 main/exports/dsh/files 均失败。
- [ ] 只有 profile 根整体不存在才允许 skip。
- [ ] 随机修改一个嵌套 vendor package 能稳定打红。

### 人工验收

- [ ] 只读核对 desktop profile 的 expected/checked 明细和真实装载路径。

### 失败边界

不得用 exemption 掩盖 live profile 漂移；先区分仓库错误和外部 profile 错误。

## QG-005 · changedPackages 射程

- 优先级：P1
- 估算：S/M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：高

### 目标

正确识别 main 超前远端、staged、unstaged、untracked、rename 和 delete 涉及的 package。

### TODO

- [ ] 明确本地 base 选择优先级：优先解析当前分支 upstream，并以 `git merge-base HEAD <upstream>` 为 committed diff 基线；当前 main 的审计基线为 `origin/main`，不得使用 `main...HEAD` 自比较。
- [ ] CI 使用事件提供的 base SHA，并验证该对象已 fetch 且确为 merge-base 可达；shallow history 无法证明时失败。
- [ ] base 不可解析时 fail，不返回空集合。
- [ ] 纳入 staged、unstaged、untracked。
- [ ] rename/delete 同时映射旧、新 package。
- [ ] 根治理文件变更触发预定义的全局或相关检查。
- [ ] 当前 untracked Settings Shell 成为 fixture 正控，但测试不能操作真实文件。

### Red/Green 验证

- [ ] Red：当前 local HEAD 超前 `origin/main` 时，旧 `main...HEAD` 射程为空；新增 untracked package 也不进入结果。
- [ ] Green：committed 范围来自 `merge-base(HEAD, origin/main)..HEAD`，再与 staged、unstaged、untracked、rename/delete 集合求并集；每个输入都能追溯到命中的 package 或全局规则。

### 负例

- [ ] upstream 缺失、base SHA 未 fetch、shallow clone 无 merge-base、只有 untracked manifest、跨 package rename、已删除 package 分别覆盖；未知 base 必须非零退出。

### 证据层级

- [ ] L1 临时 Git repo 的提交图/工作树 fixture；L2 当前仓库只读对比 `origin/main`、local HEAD、dirty/untracked candidate；L3 CI event base 重放。三层不得互相替代。

### 自动验收

- [ ] main 直接提交且超前 origin 能识别。
- [ ] 全新 untracked package 能识别。
- [ ] rename/delete 能定位相关包。
- [ ] base 未知明确失败。
- [ ] 无改动才返回空集合。

### 人工验收

- [ ] reviewer 对一个“local HEAD 超前 upstream + staged + untracked + rename/delete”的临时 Git 图逐项核对命中来源，并确认无改动案例才返回空集合。

### 退出条件

- [ ] origin merge-base、local commits 与四类工作树变化均有 mutation 覆盖；只有被证明为空的完整并集才允许 `changedPackages=[]`。

### 失败边界

任何未知范围都不能退化成“无改动”。

## QG-006A · Mutation fixture 隔离基础设施

- 优先级：P0 基础设施
- 估算：M
- 依赖：BASE-001
- 可并行：初期可与 QG-001 设计并行；每个 mutation task 落地前必须先接入

### 目标

让所有 mutation test 只操作注入的临时 repo/home/profile，不再通过改真实根 `package.json` 或固定仓库路径制造 Red。

### TODO

- [ ] 清点会临时改根 package.json 或创建固定 mutant 路径的测试。
- [ ] 将 mutation fixtures 全部迁到 `mkdtemp` 临时 repo/home。
- [ ] checker 接收显式 repo root/profile root，避免测试触碰真实路径。
- [ ] fixture setup 采用 prepare/commit；半失败只删除自己的临时根。
- [ ] 为每个 checker 保留合法、单点 mutation 和 checked=0 三类校准 fixture。

### Red/Green 验证

- [ ] Red：记录现有测试覆写根 `package.json`、使用固定 mutant 路径或共享 profile root 时可互相污染的最小证据。
- [ ] Green：每个 case 独占 `mkdtemp` repo/home/profile，checker 只接收显式 root；fixture 不需要恢复真实文件即可结束。

### 负例

- [ ] fixture setup 半失败、cleanup 抛错、测试自身 assertion 抛错均不得创建或恢复真实仓库文件。

### 证据层级

- [ ] L1 fixture 生命周期单测；L2 每个 QG mutation suite 只读真实 repo 的契约检查。仅 finally cleanup 日志不算隔离证明。

### 自动验收

- [ ] 仓库内不出现固定 mutant 残留。
- [ ] 临时 fixture 能重现 QG-002..005 的所有 Red。
- [ ] QG-010..012 的校准 fixture 同样不读取或修改真实 live/profile/AX 状态。

### 人工验收

- [ ] 抽查临时根路径与清理 ownership，确认不包含项目根或真实 HOME。

### 退出条件

- [ ] QG-002..005、QG-010..012 的 mutation 全部迁出真实工作树并使用显式依赖注入。

### 失败边界

不得继续通过修改真实 package.json 或固定仓库路径制造 mutation。

## QG-006B · 聚合并发、中断与零副作用证明

- 优先级：P0 收口
- 估算：M
- 依赖：QG-006A、QG-002..005、QG-010..012
- 可并行：否；在进入 CI 前聚合收口

### 目标

证明门禁在成功、失败、SIGTERM 和并发运行下均不改变真实仓库，且多个 fixture 不会通过共享名称、端口、HOME 或 profile 相互污染。

### TODO

- [ ] 定义机器可读 before/after snapshot：tracked content hash、untracked 全量清单、porcelain v2、必要时进程/端口残留。
- [ ] 在正常、assertion failure、checker non-zero、fixture setup failure、cleanup failure、SIGTERM 六条路径比较 snapshot。
- [ ] 两个完整 gate test 进程并发至少 10 轮；临时目录、端口、文件名和 HOME 全部独立。
- [ ] 失败时保留任务专属证据，但不把 evidence 写回被测 repo。
- [ ] CI job 前后复用同一 snapshot contract。

### Red/Green 验证

- [ ] Red：使用共享固定 fixture name 或故意中断旧 harness，证明聚合检查能捕获残留/覆盖。
- [ ] Green：六条结束路径与 10 轮并发都输出 `before_digest == after_digest`；任一不等立即非零。

### 负例

- [ ] 两进程同名 package、端口冲突、一个进程 SIGTERM、cleanup 自身抛错、测试 assertion 抛错，均不得留下仓库内文件或恢复他人状态。

### 证据层级

- [ ] L2 本地聚合并发/中断；L3 独立 CI runner 前后 attestation。L2 不能替代 L3。

### 退出条件

- [ ] 正常、失败、SIGTERM 前后工作树一致；并发 10 轮稳定；CI 能独立复算同一 attestation。

### 失败边界

若 before/after 已受并发人类任务影响，必须在 clean clone 重跑；不能通过忽略未知路径让结果变绿。

## QG-007 · 可复现 CI workflow

- 优先级：P0
- 估算：M/L
- 依赖：QG-001..005、QG-006A、QG-006B、QG-010..012
- 外部状态：创建 workflow；若推送需用户明确授权
- 可并行：workflow 设计可与 release hardening 并行

### 目标

由独立 runner 在 PR/main 上执行门禁，不能依赖开发者本机结果。

### TODO

- [ ] 根据实际 gate 依赖拆 portable contract job 和 macOS host job。
- [ ] PR 至少运行 quick；合并前/主分支运行 full 或等价 required matrix。
- [ ] 锁定 Node/pnpm/依赖安装方式和缓存 key。
- [ ] 可选 profile/live 环境缺失明确 skip，不能算 live accepted。
- [ ] job 前后断言无非预期工作树 diff。
- [ ] 设置 timeout、并发取消、日志/artifact retention。
- [ ] 安全测试使用 fake secrets 和本地 mock。
- [ ] 先在非 required 状态连续绿，再进入 QG-008。

### Red/Green 验证

- [ ] Red：根仓库无可验证 workflow run 或 PR 不触发目标 checker 时，不得引用本机 gate 结果宣称 CI 已建立。
- [ ] Green：clean runner 上 PR 与 main 各有一次可追溯 run，检查名、commit SHA、命令、pass/fail/skip 统计和 artifact 均完整。

### 负例

- [ ] 故意破坏一个 138 catalog item、一个 bare preset、一个 plugin entry、一个 intake accounting invariant；对应 job 必须非零，且 `continue-on-error`、路径过滤或缓存不能吞掉失败。

### 证据层级

- [ ] L1 workflow 静态校验；L2 fork/受控 PR run；L3 main required run。开发机日志只能作为诊断，不是 CI 证据。

### 自动验收

- [ ] 故意破坏一个契约的 PR 出现红检查。
- [ ] clean runner quick/full 可重复。
- [ ] 输出 pass/fail/skip 统计。
- [ ] 测试后 `git diff --exit-code`。
- [ ] workflow 不访问真实用户 profile、凭证或客户数据。

### 人工验收

- [ ] 运行一个受控绿 PR 和一个红 PR，错误能定位到 checker 与 remediation。

### 退出条件

- [ ] 新门禁在独立 runner 连续稳定通过，全部负例均能阻断；检查名冻结后才进入 QG-008。

### 失败边界

runner 不稳定时先解决稳定性，再设置 required；不得长期忽略失败或配置 continue-on-error。

## QG-008 · Branch ruleset、required checks 与 tag 保护

- 优先级：P0
- 估算：S
- 依赖：QG-007 至少有稳定检查名和一次成功运行
- 外部状态：会改变 GitHub 仓库设置，必须单独授权
- 可并行：可与 REL-004/005 并行

### 目标

`main` 和发布 tag 不能绕过已建立的检查。

### TODO

- [ ] 明确 PR review 数量、required checks、管理员 bypass/break-glass owner。
- [ ] main 禁止 force push/delete，要求 PR 和 required checks。
- [ ] 保护 `v*` tag，禁止重写。
- [ ] 保存 ruleset 配置快照和恢复 SOP。
- [ ] 建立只读 API audit，文档不再声称不存在的保护。

### Red/Green 验证

- [ ] Red：API 未返回目标 ruleset/required checks，或返回规则未覆盖 `main`/`v*` 时，审计必须失败。
- [ ] Green：API 快照与声明的 review 数、required check 名、bypass actor、force-push/delete 和 tag 规则全等。

### 负例

- [ ] 删除一个 required check、改检查名、添加宽泛 bypass、允许 tag rewrite、API 权限不足分别失败；权限不足不得解释成“未配置所以通过”。

### 证据层级

- [ ] L1 ruleset schema fixture；L2 仓库 API 只读快照；L3 受控红 PR/tag rewrite 演练。配置文档本身不是保护证据。

### 自动验收

- [ ] API 断言 ruleset 与 required checks 精确匹配。
- [ ] 红检查 PR 不可合并。
- [ ] tag rewrite 被拒绝。
- [ ] bypass 使用留下审计记录。

### 人工验收

- [ ] 受控演练一次阻塞、一次正常合并和一次 break-glass。

### 退出条件

- [ ] API 全等审计通过，红 PR 与 tag rewrite 均被远端拒绝，break-glass 仅限指定主体且留下审计事件。

### 失败边界

误阻塞时只调整具体规则，不整体关闭保护。

## QG-009 · 门禁与发布 ownership

- 优先级：P2
- 估算：S
- 依赖：QG-007

### 目标

降低 26 个受管单元、持续增长的 gate registry 和高密度发布脚本集中在单一维护者上的 bus-factor 风险；数量由注册表生成，不在计划中写死。

### TODO

- [ ] 为 gate、packaging、profile/runtime、security、product UX 指定 primary 与 fallback owner。
- [ ] 记录 required review 范围和紧急接管流程。
- [ ] 安排定期发布/回滚/恢复演练。
- [ ] owner 只代表审查责任，不替代自动验收。

### 自动验收

- [ ] ownership registry 覆盖每个 P0 gate/release step，primary/fallback、review scope 和 runbook 链接缺一即失败。

### 人工验收

- [ ] 第二位维护者可按文档完成一次 dry-run、一次已知故障定位和一次恢复演练。

## QG-010 · Fullstack 138 条全量验证与 89 项产品 whitelist 全等

- 优先级：P0
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-002..005、QG-011/012 并行
- 状态：本地 L1/L2/L3 实现与验收完成；本 checkpoint 纳入 Git，QG-007 远端 required check deferred

### 目标

`verify-fullstack.mjs` 同时验证 mapping 70 条与 extra 68 条形成的 138 条完整 catalog；产品出货选择由受版本控制的 89 项唯一 whitelist 决定，不能靠“非空、无重复、是子集”或计数相等假绿。

### 范围/非范围

- 范围：`fullstack-mapping.json`、`fullstack-extra.json`、fullstack manifest/目录、受版本控制的产品 whitelist、`verify-fullstack.mjs` 及其 fixture。
- 非范围：本卡不重新决定哪 89 项应当出货；产品意图变更需独立 Note/审批，不能借修 gate 偷换名单。

### TODO

- [x] 将 70 mapping 与 68 extras 解析为带来源的 canonical set，先拒绝跨源重复、悬空项与 ID 归一化碰撞，再得到 expected 138。
- [x] 对 138 条逐项执行相同的存在性、metadata、入口、来源与产物契约，输出每项 result；禁止只遍历 mapping。
- [x] 把 ADR-0091 已批准的 89 项产品意图物化为受版本控制的唯一 whitelist manifest，并记录 owner/reason，不从当前安装结果反推。
- [x] 强制 whitelist 与 canonical approved set 做双向集合全等，并强制其为 138 catalog 的子集；输出 missing、unexpected、duplicate，而非只验 count。
- [x] gate summary 同时给出 `catalog expected=138/checked=138` 与 `whitelist expected=89/checked=89`，数量变化必须伴随同提交的产品决策与 fixture 更新。

### Red/Green 验证

- [x] Red：旧 checker 真实输出 `70/70 全项通过`；68 extras 未被逐条验证。当前运行时选择仍只证明 14 节点非空/unique/属于 138 的子集，不证明它与受版本控制的批准 89 项全等，任意合法子集可假绿。
- [x] Green：当前快照 138 条全部有逐项结果，canonical whitelist 与批准 89 项双向差集均为空，`checked === expected`；实现没有把 138/89 写成永久魔数，数字来自版本化清单。

### 负例

- [x] 删除/损坏一个 extra、在 mapping/extra 制造重复、删一项再补任意项维持 138、提交任意合法子集、在 whitelist 用未批准项替换批准项维持数量、重复一项维持数组长度、保留旧批准指纹但改集合，均由临时 fixture 判红。

### 2026-09-16 实施记录

- catalog：canonical `138/138 = mapping 70 + extra 68`，逐项 result 与根 gate 已接入。
- whitelist：owner `lute` 明确签核 exact 89 与 `4ebfa9f…` 集合指纹后物化 canonical manifest；root `89/89`，live runtime `89/approved 89`、14/14 节点、节点错挂 0、双向差集为空。
- 本地验收：package `113/113`；root quick `67/68`、full `74/75`，两者 `failed=0`，唯一非 pass 为 `live-presets` 的 159 个 disabled typed skip。manifest 在工程验收阶段尚未 commit；由本 checkpoint 与实现、测试和决策记录一并固化。
- scope：批准仅约束 preset composition；顺序不构成契约，invocation policy 与发布授权未被本卡吸收。

### 证据层级

- [x] L1 set/parser fixture；L2 临时 catalog/whitelist mutation；L3 当前版本化清单全量报告。运行时已安装技能清单只做 live acceptance，批准名单来自 owner 明确签核。

### 自动验收

- [x] 138 条逐项验证且无 unexplained skip；89 项 whitelist 双向集合全等。
- [x] 每个负例断言具体 missing/unexpected/duplicate ID 与非零退出码或 fail result。
- [x] `gate.mjs` 汇总保留两个分母，不把 catalog pass 与产品 whitelist pass 合并成一个布尔值。

### 人工验收

- [x] 产品 owner 对 exact 89 集合与指纹签核；工程 reviewer 抽查 mapping/extra 各 5 项，均能回到具体 sourceRef。

### 退出条件

- [x] 68 extras 不再是 verifier 盲区，89 项不能以等数量替换绕过；两组 mutation 已进入本地 root quick/full gate。
- [ ] QG-007 将两组 mutation 设置为远端 required CI；本地 QG-010 结果不冒充该远端证据。

### 失败边界

任何 138/89 变化在缺少产品决策时保持 fail；不得自动吸收新目录或用 live 安装现状更新 whitelist。

## QG-011 · Third-party intake accounting 闭合与非零退出

- 优先级：P0
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-010/012 并行
- 状态：本地实现与 E1/E2/E3 验收完成；QG-007 远端 required check deferred

### 目标

`build-third-party-intake.mjs` 的 source、imported、skipped、already-installed 分类互斥且守恒；所有 accounting error 必须在任何成功输出/写入之前导致非零退出。

### 范围/非范围

- 范围：intake builder 的分类、去重、问题汇总、`--check` 退出码和输出文件原子性。
- 非范围：不借本卡重新选择第三方技能，也不修改上游内容信任政策。

### TODO

- [x] 先读取并规范化每个 source 的 upstream ID set，再建立 imported/skipped/already-installed 三个互斥 set；同一 ID 跨集合出现即失败。
- [x] already-installed 作为独立终态，不再追加到 `skip` 后重复计数。
- [x] 守恒式按唯一 ID 计算：`upstream = imported union skipped union alreadyInstalled`，并分别报告 missing、unexpected、overlap、duplicate。
- [x] 将所有结构、来源和 accounting 检查放在成功消息与写文件之前；最后统一 `problems.length > 0 => exit 1`。
- [x] `--check` 全路径只读；生成模式只在零问题后以同目录临时文件 + fsync + rename 原子替换，失败不留下半更新 intake。

### Red/Green 验证

- [x] Red：旧 `--check` 在 `69→72`、`37→66` accounting error 下仍打印成功并退出 0；目标文件 SHA-256 不变，证明是假绿而非写入副作用。
- [x] Green：同一批样本重采为 `pm 69=63+3+3`、`mp 37=5+3+29`，无 overlap；任一后置 accounting problem 都在打印成功或写入之前非零退出。

### 负例

- [x] imported/skip overlap、already-installed 重复、漏一个 upstream、加入未知 ID、重复 source ID、坏 JSON、后置才发现的问题分别断言非零；维持总数相同的“删一补一”也必须失败。

### 证据层级

- [x] L1 纯集合 accounting 单测；L2 临时 intake 生成与 `--check` mutation；L3 当前版本化第三方 intake 的只读守恒报告。这里没有把上游 URL 可访问性、commit/blob provenance 或 live 安装冒充为完成。

### 自动验收

- [x] 每个 source 输出唯一 upstream/imported/skipped/already-installed 数量和双向差集。
- [x] 任一 `problems` 非空时退出码非零、无成功文案、目标文件 hash 不变。
- [x] 正常生成后立刻 `--check` 幂等且零 diff。

### 人工验收

- [x] reviewer 抽查两个 source 的 10 个 ID：pm/mp 各 5 个，覆盖 imported/skipped/alreadyInstalled，`sampled=10 failed=0`，均能从 upstream 唯一追到终态与原因。

### 退出条件

- [x] accounting 守恒、分类互斥、所有错误非零退出，并已进入本地 root quick/full gate。
- [ ] 由 QG-007 把该 checker 设置为远端 required check；这不是本地 QG-011 结果可替代的证据。

### 实施与验收记录（2026-09-16）

- 定向回归：`node --test packages/capabilities/dsh-overseas-skills/test/build-third-party-intake.spec.mjs`，12/12 通过。
- 包级回归：`pnpm --dir packages/capabilities/dsh-overseas-skills test`，94/94 通过；README 计数已从 82 同步为 94。
- 根 quick gate：64/65，唯一 `live-presets` typed skip；objects `1813 expected / 1654 checked / 159 skipped / 0 failed`。
- 根 full gate：71/72，唯一 `live-presets` typed skip；objects `1820 expected / 1661 checked / 159 skipped / 0 failed`。
- 首轮 root gate 暴露新 checker 缺 `reason`/`typedSkips` 的 schema Red；只补齐 canonical 适配并增加断言，没有放宽 gate schema。
- 未执行：联网重取、不可变 commit/blob/license provenance、真实 `~/.dsh` 安装或 promotion、远端 CI/ruleset、DMG/Release；分别留给 SEC-RT-002/DEC-009、QG-007 与发布批次。

### 失败边界

无法确定某 ID 归属时保持 fail，不得放入 ignored/other 让等式表面成立。

## QG-012 · Settings AX 校准使用独立锚

- 优先级：P0（live acceptance 判别力）
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-010/011 并行

### 目标

`settings-shell-live.mjs` 的 zoom/坐标校准与被验收控件使用不同证据，避免“用按钮高度算 zoom，再除回按钮高度”恒等式假绿。

### 范围/非范围

- 范围：AX snapshot 解析、独立 calibration anchors、容差、instrument unavailable 语义和隔离 fixture。
- 非范围：不在本卡改变 Settings UX 尺寸规范，也不把 macOS live acceptance 伪装成 portable CI。

### TODO

- [ ] 固化当前 `zoom = medianButtonHeight / 40` 且 `buttonCss = medianButtonHeight / zoom` 恒为 40 的代数与 fixture Red。
- [ ] 选择不包含目标按钮尺寸的独立锚：例如同一窗口 AX bounds 与独立取得的 CSS viewport，或两个预先声明且不参与目标断言的 calibration anchors；决策写入 Note。
- [ ] 校准样本与验收样本集合必须不相交，并输出 anchor IDs、原始值、scale、残差、容差和目标测量值。
- [ ] 独立锚缺失、残差超限、样本不足、窗口错配或 AX 权限不足时 typed skip；正式 `--require-no-skip` 下失败。
- [ ] fixture 注入 snapshot/root，不读取或改写真实用户 AX/profile 状态；与 QG-006A/QG-006B 的隔离和并发契约一致。

### Red/Green 验证

- [ ] Red：只改变目标按钮真实高度时，旧公式仍报告 40 并通过。
- [ ] Green：固定独立 scale 后改变目标按钮高度会失败；只改变独立、合法的整体 zoom 时目标 CSS 尺寸仍在容差内。

### 负例

- [ ] 目标按钮高度偏差、anchor 缺失、两个 anchor 比例冲突、窗口取错、零/负尺寸、AX permission denied 和 instrument timeout 均有确定 fail/typed skip；不得返回 pass。

### 证据层级

- [ ] L1 几何/容差纯函数单测；L2 合成 AX snapshot mutation；L3 受控 macOS Settings 窗口 live run。L1/L2 证明判别力，L3 才证明具体宿主行为。

### 自动验收

- [ ] 至少两个不依赖目标按钮的 calibration signals 一致，目标尺寸 mutation 能稳定打红。
- [ ] checker 输出原始/校准值和判定依据，instrument unavailable 在 strict 模式非零。
- [ ] 并发运行不共享 snapshot 或窗口选择状态。

### 人工验收

- [ ] 在两个 zoom/显示缩放条件下各做一次真实 Settings 检查，并人工确认选择的是目标窗口与目标控件。

### 退出条件

- [ ] 代数恒等式路径被移除，目标控件与校准锚证据独立，负例进入 host CI 或发布前 live gate；未运行 live 时只允许报告“instrument verified, live unverified”。

### 失败边界

无法获得独立锚时不得放宽容差或复用目标尺寸；保持 typed skip/strict fail，等待宿主提供可验证信号。
