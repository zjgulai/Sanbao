# 桥的服务面与流式收束：基座声明对照发现的名字错配

## Problem

工单 012 写入半边（rename / delete / reorder）按 ADR-0203 的规矩要"先读基座声明再写适配"。逐字对照
`@deepseek-ai/dsh-api-workspace-controller` / `@deepseek-ai/dsh-api-settings-controller` 的
`declare module '@deepseek-ai/cordis'` 时发现两处**已上线代码**的错配：

1. 桥消费的服务名 `workspaceRegistry` / `directoryPicker` 在基座里**不存在**。真实 owner 是
   `workspaceController` / `directoryPickerController`：前者有 `follow(signal)`，而域名册
   `WorkspaceRegistry` 根本没有 `follow`，其 `create` 还是位置参数 `create(path, title?)`。
2. `pick(signal)` / `follow(signal)` 是**取消参数方法**——不传 signal，`follow` 第一步
   `signal.throwIfAborted()` 直接抛。

后果是"每个端点在生产里答 `bridge-provider-unavailable`"，而单元替身不看名字、浏览器读数走 fetch 桩，
五条机器判据与 §1.6 都照不到这一类。

同一轮还发现第三个问题：即便名字接对，`follow` 世代**永不自己结束**（`while (!closed && !aborted)`），
而消费链同步等终局应答 —— 真实链路上每次状态读取会挂满 10s 超时，列表恒"未核验"。

## Decision

- **服务面取自声明**（ADR-0205）：owner 名与请求对象逐字对齐基座 `lib/types`；请求对象多成员即拒；
  `pick`/`follow` 的 `AbortSignal` 由桥创建并在同一 `finally` 里 `abort`；基座 `RemoteError`
  仅按结构标记映射到 Sage 自己的拒绝码，消息文本不过桥；近名服务必须答 `bridge-provider-unavailable`
  并有断言。消费登记表同步改成真实 owner 名。
- **流式读有界收束**（ADR-0206）：每等一帧最多 `BRIDGE_STREAM_QUIET_MS = 150`，窗口内无新帧以
  `ok:true { frames }` 收束；收束路径统一 `abort`；不引入长期订阅缓存，重连仍以新 baseline 对账。

## Alternatives considered

- 保留旧名加别名：名字双份、家谱双份（P-07），否决。
- 用域名册自己实现 follow/pick：Sage 重造基座已有 owner（去重/排序/隐档语义），否决。
- signal 做成可选、失败退回无参：把契约错误咽成"偶尔不可用"，否决。
- 只读第一帧当快照：增量分支成死代码（"写了但从没跑到"），验收"增量不乱"失去对象，否决。
- 长开订阅 + 缓存 + 失效规则：引入订阅生命周期与列表第二个家，超出本票，否决。

## Consequences

- 桥的每个消费点从此都必须能指名基座声明文件；名字错配有断言挡（近名 → `bridge-provider-unavailable`）。
- 三处真实缺陷同批修掉：服务名、signal 契约、流式永挂（前两者见于旧票，第三者为本轮发现）。
- 已知未闭：真实 Host 端到端未跑（本票不启动 Host）、150ms 未做真机标定；二者都记入 ADR 后果段。
- `apps/sage-shell/src/host/bridge-endpoints.ts` 与 `scripts/gates/sage-service-consumption.json` 是本决策的两个落点。
