# WT-02D.0.1 Electron caller-binding preflight

- 日期：2026-09-30
- 状态：revision 38 已执行；结论 NO-GO；production route 未迁移
- 决策：[ADR-0175](../../../adr/ADR-0175.md)
- 相关：[ADR-0174](../../../adr/ADR-0174.md)、[Application Service 边界](2026-09-30-application-service-boundary.md)

## Problem

ADR-0174 要求 Electron main 用 caller 不能在 body 或 header 中自报的 transport / sender 事实绑定调用方，且在事实缺失、过期或不可验证时 fail closed。当前固定 Electron 43.3.0 的 `protocol.handle()` handler 只接收标准 `Request`；`Session.webRequest.onBeforeRequest()` 可以观察 `webContents`、`webContentsId`、`frame` 与 `resourceType`，但同一 webRequest event 只保留最后注册的 listener。

因此不能从 API 名称、最新文档或 Node-mode 单测推断当前 browser-fetch route 已满足 caller binding。预检必须在真实 Electron browser process、真实 hidden `BrowserWindow`、显式 Session 与 custom protocol 中回答两个问题：入口 gate 能否在 handler 前区分 caller；caller 在放行后导航或销毁时，handler 能否得到可靠的失效信号。只证明前者不足以支撑未来有副作用的 Application Service。

## Decision

采用 ADR-0175 定义的 `WT-02D.0.1-PREFLIGHT`，并以隔离 probe 的实际读数作出 NO-GO 决定。本 Note 只拥有测试方法与实际读数；NO-GO 的规范后果以 ADR-0175 为唯一事实源。

探针使用当前安装的 Electron binary 启动独立 browser process，显式删除 `ELECTRON_RUN_AS_NODE`，把 user data、session data、crash dumps 与 logs 放入父测试拥有的临时目录。两个非持久化 Session 都注册真实 `dsh-app` handler 与各自唯一的 `onBeforeRequest` listener；页面使用 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webSecurity=true`，不启动 Sage product main、Host、Adapter、store 或外部网络。每次 gate callback 有 exactly-once 记录，所有请求和子进程均有有界 watchdog。

实际运行环境：

| 字段 | 读数 |
| --- | --- |
| `process.type` | `browser` |
| Electron | `43.3.0` |
| Chromium | `150.0.7871.212` |
| Node | `24.18.1` |
| child `ELECTRON_RUN_AS_NODE` | 不存在 |
| trusted / different Session | 两个不同的 in-memory partition，均确认 handler 已注册 |

实际事件矩阵：

| 场景 | gate 读数 | handler / caller 读数 | 结论 |
| --- | --- | --- | --- |
| trusted main-frame fetch | `seq=1`，live expected WebContents / Session / current main frame / exact origin / `xhr`，callback 1 次 allow | `seq=2` handler 1 次，renderer 收到 exact 200 sentinel | 局部通过 |
| same-origin subframe | `seq=3`，同 WebContents 但不是 main frame，callback 1 次 cancel | handler 0，renderer reject | 局部通过 |
| same-Session same-origin other window | `seq=4`，live main frame 但不是 expected WebContents，callback 1 次 cancel | handler 0，renderer reject | 局部通过 |
| opaque sandboxed frame image | `seq=5`，`frameOrigin=null`、`resourceType=image`，callback 1 次 cancel | handler 0，image reject | 局部通过 |
| `Session.fetch` with forged `Origin` | `seq=6`，无 WebContents / frame、`resourceType=other`，callback 1 次 cancel | handler 0，fetch reject | 局部通过 |
| main-frame navigation to protected route | `seq=7`，`resourceType=mainFrame`，callback 1 次 cancel | handler 0，navigation reject | 局部通过 |
| different partition / real handler | `seq=8`，different Session listener 实际观察，caller 不是 expected WebContents，callback 1 次 cancel | different Session handler 0，renderer reject | 局部通过；不是“未注册协议”的假绿 |
| trusted request then caller navigation | `seq=9` gate allow → `seq=10` handler entered → `seq=11` abort observation | 2 秒内 `Request.signal.aborted=false`；renderer 3 秒内无终态 | **失败** |
| trusted request then WebContents destruction | `seq=12` gate allow → `seq=13` handler entered → `seq=14` abort observation | 2 秒内 `Request.signal.aborted=false`；renderer 3 秒内无终态 | **失败** |
| trusted request then explicit `AbortController.abort()` | `seq=15` gate allow → `seq=16` handler entered → `seq=17` abort observation | renderer 收到 `AbortError`，但 2 秒内 handler `Request.signal.aborted=false` | **renderer 对照成立，handler 传播失败** |

所有十个 gate event 的 callback 都恰好调用一次；六个取消负例都实际观察到 gate event、cancel decision、handler count 0 与有界 caller failure。显式 abort 对照证明 renderer 的 controller 已执行并收到 `AbortError`，但 handler signal 仍未传播；navigation / destruction 的同类失败也已重复出现。因此结果不是 CORS、CSP、错误 Session、handler 未注册或 renderer 没有实际 abort 造成的假绿。

最终验证命令：

```text
rtk pnpm --dir apps/sage-shell test test/electron-caller-binding.spec.ts
```

结果：外层 test exit 0，1 file / 1 test passed。这个绿色结果的断言是：原始 probe 必须以 `outcome=no-go`、`passed=false`、child exit 2 结束，失败必须精确为 navigation、destruction 与 explicit renderer abort 三项 `Request.signal` 未传播，并且完整正负事件矩阵与上述顺序一致。夹具异常另以 `outcome=harness-fatal`、child exit 1 表达；原始 NO-GO 不再以进程码 0 假绿。外层绿色不把 transport 判为通过。

第一次夹具运行曾因若干负例缺少局部 deadline 在 20 秒自超时；补齐临时数据根、两个 Session 的真实 handler、请求级 AbortController 与局部 watchdog 后，完整 probe 在约 7 秒内稳定结束。随后两次独立运行都得到同一组 caller-lifecycle 失败，故按计划停止继续补丁，不切换 transport 或 dependency pin。

## Alternatives considered

- 只保留入口时的同步 gate：不能覆盖放行后到业务副作用前 caller 导航或销毁的竞态，否决。
- 用 `Origin`、`Referer`、body、query 或 custom header 代替 sender：无法证明具体 live window / frame，否决。
- 用 URL nonce、事件顺序或时间窗口关联 gate event 与 handler `Request`：调用方可影响 URL，当前 API 也没有给出不可伪造的一一关联，否决。
- 在本批实现异步 barrier 或更多 webRequest listener：无法消除 callback 放行后的竞态，且第二 listener 会替换第一 listener，否决。
- 改用 IPC / preload sender binding：可能提供原生 sender identity，但会改变 transport、权限面与 renderer 合同，留给新计划。
- 升级 Electron 获取不同 API / lifecycle 行为：需要独立 pin 变更、兼容验证与回滚，留给新计划。
- 继续写 `.0.1` skeleton：安全前提没有成立，否决。

## Consequences

- 预检提供了 Electron 43.3.0 的可重复事实：入口 cancellation gate 局部可行，`protocol.handle` 的 `Request.signal` 对已测 navigation、destruction 与 explicit renderer abort 均不可依赖。
- 测试保留为 NO-GO regression evidence；以后 pin 或 transport 改变时，必须显式更新决策，不能把旧读数静默翻成 PASS。
- production 单一 listener owner、import firewall、route migration、Application Service、Host narrow port 与 rollback 都没有在本批实现。
- 当前 Host-owned route、UI、provider、Adapter、store、真实 action、package / lockfile、Electron pin、legacy 与 release 保持原状。
- 下一步只有在新 Birdview 计划和用户确认后，才能评估 IPC / preload、独立 Electron pin 升级或其他 main-owned transport。
