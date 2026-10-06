# 050 · 预重构：Host 窄桥只读基座方法刀（S4，路线中立前置）

**Blocked by**: 无
**覆盖需求**: 无（工程前置，不主张 US 归属）
**接缝**: S4

## 目标

让 main 能在不经 renderer 的前提下对基座只读 RPC 发起一次窄调用并拿到归一结果，使后续只读票不再各自猜接口。

## 涉及层

- [ ] 数据层：帧协议新增 Node IPC 命令 bridge-call{callId,endpoint,payload} 与事件 bridge-result{callId,ok,result|code}；allowlist 为代码常量，首版只含 settings/describe
- [ ] 逻辑层：host 侧经 ctx.connection 既有 RPC 通道执行（基座证据：HostConnectionHandle.rpc.intercept('/api', matches, handler) 与 fetch.register(route)，types/rpc.d.ts:104-130；API_PATH='/api'）；未知 endpoint 与 host 未 ready 一律归一为 unavailable
- [ ] UI层：本票不新增界面；renderer 仍不得触达 /api*（routeRequest 现状 host/index.ts:67-74 保持拒绝，不放宽）
- [ ] 测试：用假 child/帧编解码断言 allowlist 生效与结果归一；负例=allowlist 外的 endpoint 与未 ready 时不得发出真实调用

## 验收标准（须给真实证据，未跑就写“未运行”）

- 窄调用在 host 未 ready 时返回 unavailable 且不产生副作用（有断言）
- allowlist 外的 endpoint 被拒绝，且拒绝发生在 host 侧而不是靠 UI 不显示（有断言）
- settings/describe 成功路径返回归一结果，凭据值只以状态形式出现、不回读秘密（有断言）
- renderer 侧路径无法构造 bridge 帧（协议层断言：bridge 仅存在于 Node IPC channel）

## 明确不做

不接任何写侧 RPC（prompt/follow/cancel/selectModel/settings.update/credentials.set/upload 全部不在本票）；不放宽 /api*、/.dsh/*、/.sage* 的 renderer 拒绝面；不改 vendor 与 pin；不新增第二身份真源

**备注**：证据锚点：src/protocol.ts（SHELL_HOST_PROTOCOL_VERSION=4、HostCommand 走 Node IPC 现仅 shutdown、MAX_CONTROL_PAYLOAD_BYTES）；src/host/index.ts:44-57 HostController 现仅 5 个方法；src/main/host-process.ts:88-115 ShellHostProcess（streamId pending/responseDecoder/readyPromise）；基座 dsh-api-settings-controller/lib/typert.host.js:213-226 证明 settings/describe 无参只读

**执行状态**：只看 [LOOP.md](LOOP.md) §6 的账本行。本票已于 2026-10-02 按你的授权**收回（parked）**——工作树里不含本票代码，实现＋测试＋回贴步骤存在 `attachments/050/`；恢复的前提是 `sage-product-boundary` 的 `ctx.get(` 路线由你定夺。
