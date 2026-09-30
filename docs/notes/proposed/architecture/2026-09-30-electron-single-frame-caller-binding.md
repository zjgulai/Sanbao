# WT-02D.0.1 single-frame caller-binding preflight

- 日期：2026-09-30
- 状态：revision 40 已执行；结论 PASS（预检局部）；production route 未迁移
- 决策：[ADR-0177](../../../adr/ADR-0177.md)
- 相关：[ADR-0174](../../../adr/ADR-0174.md)、[ADR-0175](../../../adr/ADR-0175.md)、[ADR-0176](../../../adr/ADR-0176.md)、[IPC/preload preflight](2026-09-30-electron-ipc-caller-binding.md)

## Problem

ADR-0176 证明 revision 39 的 IPC/preload candidate 存在 top-bridge bypass：same-origin child 可调用 `top.sageIpcProbe.beginOperation()`，而 main 观察到的 `senderFrame` 仍是合格的 current main frame。revision 40 因此需要回答：若把候选不变量改为「Sage privileged renderer 禁止 nested browsing context；出现 child 即污染当前 document generation，直到 clean top cross-document reload」，main-owned 的 frame 观察、navigation generation 状态机与 entry / durable barrier 双重核验能否在同一 pinned Electron 下对该反例 fail closed，同时保持干净单帧 baseline 的可用性。

## Decision

采用 ADR-0177 定义的 `WT-02D.0.1-SINGLE-FRAME-PREFLIGHT`，按八文件 single-frame preflight 执行，并接受上述帧禁用不变量为本票候选不变量。本 Note 只拥有测试方法与实际事件矩阵；规范后果与后续边界以 ADR-0177 为唯一事实源。

probe 由外层 Vitest 启动独立 Electron binary，显式删除 `ELECTRON_RUN_AS_NODE`，把 user data、session data、crash dumps 与 logs 放在父测试拥有的临时根。单一非持久化 trusted Session 注册真实 `dsh-app` protocol handler。两个窗口（counterfactual = control、candidate）保持 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webSecurity=true`、`nodeIntegrationInSubFrames=false` 与 `webviewTag=false`。

preload 是独立 CommonJS 文件，只在 `process.isMainFrame` 时向 main world 公开两个冻结方法：`readProjection(caseId)` 与 `beginOperation(caseId)`；main world 没有 `require`、`process`、`send`、`invoke`、`on` 或 raw `ipcRenderer`。该 guard 只是表面收缩，caller authority 全部由 main 判定。

candidate 合同的组成：

- main 以 expected WebContents、Session、live current main frame、exact `dsh-app://app` origin、frame parent/top 关系与 event process/frame ID 一致性建立 platform binding；
- main-owned document generation 状态机：`frame-created`（非 main）、`will-frame-navigate` / `did-start-navigation` / `did-frame-navigate`（非 main）、`will-attach-webview`、非 owned 顶层导航、`did-fail-load`、`render-process-gone`、`destroyed` 均把当前 generation 标记 contaminated 并取消 accepted operations；
- 只有 main-owned（probe 发起、URL 精确匹配）的 top cross-document navigation 才 commit 新 generation，且仅当 frame tree readable、只有 current main、导航窗口内未见过 child、origin 精确时才 clean；same-document navigation 与 child 移除均不洗白；
- 每次 IPC 入口与 synthetic durable-effect barrier 都重新检查 single-frame 事实与 generation 一致性。

control 窗口（counterfactual）刻意不启用 single-frame 判定，用于证明 revision 39 的 top-bridge bypass 在本批环境里仍然真实存在（harness 自证），而不是被本批改动悄悄消除。

实际运行环境：

| 字段 | 读数 |
| --- | --- |
| `process.type` | `browser` |
| Electron | `43.3.0` |
| Chromium | `150.0.7871.212` |
| child `ELECTRON_RUN_AS_NODE` | 不存在 |
| 窗口安全设置 | `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webSecurity=true`、`nodeIntegrationInSubFrames=false`、`webviewTag=false` |
| preload surface | `readProjection` / `beginOperation`；frozen；无 generic IPC |
| CSP | 顶层 strict（`frame-src 'none'` 等）/ adversarial（允许嵌入 child，模拟被攻破页面）；可嵌入子页单独使用 `frame-ancestors 'self'`，否则子页加载会被自身 `frame-ancestors 'none'` 以 `ERR_BLOCKED_BY_RESPONSE` 拦截 |

实际事件矩阵：

| 场景 | main / 状态机读数 | 结论 |
| --- | --- | --- |
| counterfactual（control 窗口，无 single-frame 判定） | same-origin child 调用 `top.sageSingleFrameProbe.beginOperation()`，main 的 expected WebContents / Session / current main frame / origin / process-frame ID 全部通过并创建 operation；窗口销毁后 operation cancelled、零 effect | revision 39 反例在对照窗口复现（harness 证据，非 candidate 失败） |
| trusted clean single-frame baseline | read / begin 均 allow（frameCount=1、onlyCurrentMain=true、未污染）；barrier allow；恰一个 operation completed、恰一个 effect | 局部通过 |
| parser 插入的 same-origin child | child 调 top bridge 到达 main，entry binding deny（统一 `unavailable`）；generation 以 `contaminated-generation-committed` 提交，未创建 operation | 局部通过 |
| 动态创建的 same-origin child | entry binding deny；未创建 operation | 局部通过 |
| `about:blank` child | child 可达 top bridge，entry binding deny；零 operation / 零 effect | 局部通过 |
| `srcdoc` child | 同上，deny | 局部通过 |
| `data:` opaque child | child 访问 `top` 抛 `SecurityError`，零 IPC、零 binding event | 局部通过 |
| `blob:` child | child 可达 top bridge，entry binding deny | 局部通过 |
| sandbox opaque（`sandbox="allow-scripts"` srcdoc）child | `SecurityError`，零 IPC | 局部通过 |
| nested（child of child） | 两个 descendant `frame-created` 事件（frameCount=3），最深 child 调 top bridge 被 deny | 局部通过 |
| early-call-then-remove ×8 | child 创建后立即调用并自删；每轮 deny；删除后 frame tree 回到单帧，但 generation 仍 contaminated、`ready=false` | 局部通过 |
| pending operation 后注入 child | 已 accepted 的 operation 在 barrier 前被 `non-main-frame-created` 取消，零 effect | 局部通过 |
| removed child 后的 top 调用 | frame tree 只剩单帧，但 sticky contaminated 使 entry binding deny | 局部通过 |
| same-document navigation（pushState）后的 top 调用 | 观察到 `same-document-navigation-observed`，不洗白，deny | 局部通过 |
| clean top cross-document reload | 新 generation 以 `clean-generation-committed` 提交；read / begin allow；恰一个 operation completed、恰一个 effect；旧 generation 的 cancelled operation 未复活 | 局部通过 |
| strict prevention 层（STRICT_CSP + deny `window.open` + `webviewTag=false`） | `window.open` 返回 null 且 main deny handler 计数 +1；webview 无 `getWebContentsId`；页面观察到 `frame-src` / `child-src` 与 `object-src` CSP violation；零 operation / 零 effect | 局部通过 |

最终 raw child 精确结果：

```text
outcome=pass
passed=true
exit=0
failures: []
harnessErrors: []
syntheticEffectCounter=2（trusted-clean-baseline、clean-top-reload-recovery 各一次）
```

cleanup 在结果分类前完成：2 / 2 IPC handlers 与 1 / 1 protocol handlers 被移除，最后一个 live window 被销毁，timersCleared 0，cleanup errors 为空。结果使用同步单记录输出，由 `pass=0`、`no-go=2`、`harness-fatal=1` 唯一决定 child exit code。

## 本批 harness 修复

断点恢复时 probe 已存在两处 harness 缺陷，均以真实红读数定位后修复：

1. 可嵌入子页（`/frame.html`、`/nested-parent.html`）复用 adversarial CSP 的 `frame-ancestors 'none'`，child 加载被 `ERR_BLOCKED_BY_RESPONSE` 拦截，counterfactual 无法复现 revision 39 反例（`harness-fatal`，exit 1）。修复为子页单独使用 `frame-ancestors 'self'` 的 embeddable CSP，并在矩阵中新增「embeddable CSP response 已下发」自证。
2. sticky-contamination 两个 case（child 已在更早 case 出现）被错误要求本 case 内存在 non-main `frame-created` 证据；该 tripwire 断言对它们不适用，修复为显式豁免清单。

## 最终验证命令

```text
pnpm --dir apps/sage-shell test test/electron-single-frame-caller-binding.spec.ts
pnpm --dir apps/sage-shell typecheck
```

结果：外层 test exit 0，1 file / 1 test passed。它独立断言 raw child 的 exit / outcome / 空失败清单、运行时与安全设置、control 窗口反例复现、全部 child 形态的 entry deny 与零 operation / 零 effect、opaque child 零 IPC、sticky contamination、pending operation 取消、clean reload 恢复、strict prevention 层、effect 计数、sequence 唯一性与 cleanup。

变异验证（负控）：将 probe 的 `markContaminated` 改为不置 `contaminated/ready`（污染不粘滞）后，raw child 转为 `outcome=no-go`、exit 2，外层 test 相应变红（期望 exit 0 收到 2）；另一变异（entry binding 忽略 single-frame 判定）被 lifecycle `ready` 检查吸收，属无效变异、不计为证据。恢复原 probe 后外层 test 回到绿色。绿色只表示上述 PASS 可重复且可证伪。

## Alternatives considered

- 把 same-origin descendants 归为与 top 相同的 caller principal：ADR-0176 已留作另票；本票选择更保守的帧禁用不变量，不隐式决定 principal 合并。
- 只靠 production CSP `frame-src 'none'` 防嵌 frame：本批 strict prevention 层只是并积层，CSP 绕过（如 blob/data/历史导航）不能替代 main-owned generation 状态机；且 production 页面 CSP 归属另一票。
- 只在 entry 检查 frame tree、不维护 sticky generation：removed-child 读数（frame tree 已单帧仍 deny）证明 tree-only 检查会在移除后重新放行，否决。
- 让 same-document navigation 也重置 generation：revision 39 已确认 same-document 不产生新 document；本批读数（`same-document-still-denied`）支持不洗白，SPA entitlement 治理不在本票。
- 用 preload `process.isMainFrame` guard 当 authority：只是表面收缩，ADR-0176 已证明不能证明 JavaScript caller。
- 回到 browser-fetch（ADR-0175 NO-GO）或升级 Electron pin：均不在本票射程。

## Consequences

- 帧禁用候选不变量在 pinned Electron 43.3.0 的 test-only probe 内取得完整正读数：所有 child 形态 fail closed，只有 clean top cross-document reload 恢复信任。
- 已证明的是 test-only transport / synthetic state-machine 语义与 main-owned frame 观察；未证明 production CSP / 导航图 / embedding 政策、真实 Adapter cancel、receipt、reconciliation、outcome recovery 或 production authorization。
- WT-02D.0.1 production skeleton、route migration、Application Service、Host narrow port、provider、store、Adapter、UI action 与真实副作用继续 blocked；production 采纳该不变量（production 页面 CSP、嵌入政策、UX 影响）必须另票确认。
- 当前 Host-owned route、production `src/**`、package / lockfile、Electron pin、vendor、legacy 与 release 保持原状；本批仍未暂存、未提交、未推送。
