# WT-02D.0.1 Electron IPC/preload caller-binding preflight

- 日期：2026-09-30
- 状态：revision 39 已执行；结论 NO-GO；production route 未迁移
- 决策：[ADR-0176](../../../adr/ADR-0176.md)
- 相关：[ADR-0174](../../../adr/ADR-0174.md)、[ADR-0175](../../../adr/ADR-0175.md)、[browser-fetch preflight](2026-09-30-electron-caller-binding.md)

## Problem

ADR-0175 已证明当前 browser-fetch / custom protocol candidate 的 handler 没有 sender / frame identity，且已进入 handler 的请求不随 caller navigation、destruction 或 explicit renderer abort 可靠失效。revision 39 因此需要回答：固定 Electron 43.3.0 的 `IpcMainInvokeEvent.sender` / `senderFrame` 与 sandboxed preload，能否建立不可由 renderer payload 自报的 caller binding，并在 synthetic durable-effect boundary 前对 navigation、destroy、renderer crash 与 explicit cancellation fail closed。

API 存在本身不是可用性结论。probe 还必须检验 contextBridge 的实际可达边界：child 自身没有公开 API，不等于 child 无法借用 same-origin top window 的公开 API。若借用调用最终由 top preload 的 `ipcRenderer` 发出，main 观察到的 sender frame 可能仍是 top frame，这正是 revision 39 必须用真实 Electron 而非 mock 回答的问题。

## Decision

采用 ADR-0176 定义的 `WT-02D.0.1-IPC-PREFLIGHT`，并按真实读数作出 NO-GO 决定。本 Note 只拥有测试方法与实际事件矩阵；规范后果与后续边界以 ADR-0176 为唯一事实源。

probe 由外层 Vitest 启动独立 Electron binary，显式删除 `ELECTRON_RUN_AS_NODE`，把 user data、session data、crash dumps 与 logs 放在父测试拥有的临时根。两个非持久化 Session 都注册真实 `dsh-app` protocol handler。所有普通窗口保持 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webSecurity=true` 与 `nodeIntegrationInSubFrames=false`；另有且只有一个 adversarial test-only 窗口临时启用 `nodeIntegrationInSubFrames=true`，目的只是让 child preload 发出 direct raw IPC，以证明 main 的 `senderFrame` guard 会独立拒绝，而不是依赖页面纪律。

preload 是独立 CommonJS 文件，只向 main frame 公开三个冻结方法：`readProjection(caseId)`、`beginOperation(caseId)` 与 `cancelOperation(operationRef)`。main world 中 `require` / `process` 不可见，也没有 `send`、`invoke`、`on` 或 raw `ipcRenderer`。main 对每个 channel 独立校验 expected WebContents、Session、live current main frame、exact `dsh-app://app` origin、top / parent 关系，以及 event process ID / frame ID 与 `senderFrame` 的一致性；action 还保存 main-owned navigation generation，并在 synthetic effect 前 fresh recheck。

实际运行环境：

| 字段 | 读数 |
| --- | --- |
| `process.type` | `browser` |
| Electron | `43.3.0` |
| Chromium | `150.x`（outer oracle 固定 major） |
| child `ELECTRON_RUN_AS_NODE` | 不存在 |
| 普通窗口安全设置 | `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webSecurity=true`、`nodeIntegrationInSubFrames=false` |
| preload surface | `readProjection` / `beginOperation` / `cancelOperation`；frozen；无 generic IPC |

实际事件矩阵：

| 场景 | main / state-machine 读数 | 结论 |
| --- | --- | --- |
| trusted main-frame projection read | exact sender / Session / current main frame / origin / process-frame IDs 全部成立，返回固定 typed sentinel | 局部通过 |
| probe-only direct same-origin child IPC | 同一 WebContents / Session / origin，但 `senderFrame !== currentMainFrame`，main 返回统一 `unavailable`，未创建 operation | 局部通过 |
| same-origin child 借用 `top.sageIpcProbe.beginOperation()` | child 与 top 均为 `dsh-app://app`，child 确认可访问 top bridge；main 记录 current main frame allow，并创建 operation | **失败：top-bridge bypass** |
| forged extra field | exact input schema 拒绝；即使 sender 其他事实合格，也未创建 operation | 局部通过 |
| same Session / same origin / other WebContents | sender 不是 expected WebContents，read / action 均返回统一 `unavailable` | 局部通过 |
| different partition | 同 origin 但 WebContents 与 Session 均不匹配，未创建 operation | 局部通过 |
| other origin / opaque origin | expected WebContents / Session 仍在，但 origin 分别为 `dsh-app://other` / `null`，均拒绝 | 局部通过 |
| cross-document navigation before effect | main 观察 navigation、递增 generation、abort operation；fresh check 后 effect count 0 | 局部通过 |
| same-document navigation before effect | main 观察 `isSameDocument=true`、abort operation；fresh check 后 effect count 0 | 局部通过；这是 revision 39 已确认策略，不外推为所有 SPA entitlement 已治理 |
| WebContents destruction before effect | `destroyed` → controller abort → fresh deny；effect count 0 | 局部通过 |
| renderer process gone before effect | 单一 live BrowserWindow、最后一例触发 `forcefullyCrashRenderer()`；reason 为 `killed` / `crashed`，fresh deny，effect count 0 | 局部通过 |
| same-caller explicit cancel | cancel sender / frame / Session / generation 与 owner 一致；exactly-once cancelled，effect count 0 | 局部通过 |
| cross-caller explicit cancel | 真实 attacker 到达 cancel handler，binding deny 且返回与 unknown operation 同形；原 operation 随后只 dispatch 一次并完成 | 局部通过 |
| explicit cancel after synthetic dispatch | effect 已恰好一次；状态转 `outcome-unknown`，不冒充 cancelled、不重放 | 局部通过 |
| caller destruction after synthetic dispatch | 真实 `destroyed` 后仍为 `outcome-unknown`；effect 恰好一次，不重放 | 局部通过 |

关键反例的因果链是：

```text
same-origin child confirms top bridge is reachable
→ child calls top.sageIpcProbe.beginOperation()
→ top preload closure calls ipcRenderer.invoke()
→ main observes expected WebContents / Session / current main frame / dsh-app://app
→ main allows and creates an operation
```

这不表示 child 自己获得了 `ipcRenderer`，也不表示 Electron 的 `senderFrame` 字段错误；它表示该字段归属实际发送 IPC 的 top preload context，不能证明调用 top 公开函数的 JavaScript caller 也是 top document。只看 direct child raw IPC rejection 会漏掉这一反例。

最终 raw child 精确结果：

```text
outcome=no-go
passed=false
exit=2
failures:
  - same-origin-subframe-top-bridge: child access to the top bridge did not fail closed
  - same-origin-subframe-top-bridge: child top-bridge call was allowed by main
  - same-origin-subframe-top-bridge: child top-bridge call created an operation
```

cleanup 在结果分类前完成：3 / 3 IPC handlers 与 2 / 2 protocol handlers 被移除，最后一个 live window 被销毁，open step timer 为 0，cleanup errors 为空。结果使用同步单记录输出，并由 `pass=0`、`no-go=2`、`harness-fatal=1` 唯一决定 child exit code，避免最后窗口关闭把失败误报成 exit 0。

最终验证命令：

```text
rtk pnpm --dir apps/sage-shell test test/electron-ipc-caller-binding.spec.ts
```

结果：外层 test exit 0，1 file / 1 test passed。它独立断言 raw child 的 exit / outcome / exact failures、runtime 与安全设置、direct sender 正负矩阵、top-bridge bypass、lifecycle causal order、synthetic effect counter、cancel ownership、post-dispatch 状态、sequence uniqueness 与 cleanup；绿色只表示上述 NO-GO 可重复。

## Alternatives considered

- 只测 child main world 没有 `sageIpcProbe`：不能覆盖 child 访问 same-origin `top.sageIpcProbe`，否决。
- 在 preload 只加 `process.isMainFrame`：能限制每个 frame 自己的公开面，不能识别谁调用了 top window 上的函数，否决为完整修复。
- 只信 main 的 `event.senderFrame === sender.mainFrame`：该条件在 bypass 中真实为 `true`，不能证明 JavaScript caller，否决。
- 把 same-origin descendants 直接归为 top caller：可能是合法产品策略，但会改变 caller principal 与 frame / embedding 合同，留给新决策。
- 用 CSP / frame policy 保证没有 production 同源 child：可能收窄攻击面，但需要 production 页面、导航、嵌入和回归门的独立计划；revision 39 不假设。
- 暴露 raw / generic IPC：扩大权限面且不解决 caller provenance，否决。
- 回到 browser-fetch 或本批升级 Electron：前者已由 ADR-0175 判定 NO-GO；后者需要独立 pin / compatibility / rollback，均不在本票执行。

## Consequences

- current-pin IPC event 的 direct sender identity 与 main-owned lifecycle / cancellation registry 均获得真实局部证据，但 IPC/preload candidate 的 main-frame-only caller 合同整体未通过。
- WT-02D.0.1 production skeleton、route migration、Application Service、Host narrow port、provider、store、Adapter、UI action 与真实副作用继续 blocked。
- 已证明的是 test-only transport / synthetic state-machine 语义；未证明真实 Adapter cancel、receipt、reconciliation、outcome recovery 或 production authorization。
- 下一票必须先决定 same-origin caller principal、是否禁止 frame、是否改变 bridge / renderer 拓扑或是否评估其他 transport；不能在 implementation 中隐式决定。
- 当前 Host-owned route、production `src/**`、package / lockfile、Electron pin、vendor、legacy 与 release 保持原状；本批仍未暂存、未提交、未推送。
