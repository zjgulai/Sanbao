# 桥扩成受控方法：端点带类型，守卫一条没删

- 状态：implemented（隔离工作树 `qoder/ui-wiring`@`6654d75` 已实现并通过自验，未提交）
- 关联：工单 `docs/tickets/010-*`（仓外设计集）、[ADR-0203](../../../adr/ADR-0203.md)、[ADR-0198](../../../adr/ADR-0198.md)
- 说明：本 Note 覆盖 010 的**宿主侧桥面**（pick＋采纳端点及守卫）；采纳的 UI 入口与工作区列表是后续刀。

## Problem

010 要的两件基座能力都不是读：`directoryPicker.pick` 交互、`workspaceRegistry.create` 写。而 050 建的桥写死为只读（`READONLY_BRIDGE_ENDPOINTS`、ADR-0198 D4"不开写侧 RPC"）。用户选扩桥。

## Decision

- `protocol.ts`：`BRIDGE_ENDPOINTS: Readonly<Record<string,'read'|'interactive'|'write'>>`，三条目精确可见；`host/readonly-bridge.ts` 改名 `host/bridge-endpoints.ts`，`callReadOnly` 改名 `bridgeCall`，旧名不留别名。
- 守卫全保留（两端判存、活跃世代、纯数据、既有拒绝码），新增 `bridge-payload-invalid` 与 `bridge-path-invalid`。
- `directory/pick`：`pick()` 返回 `null` ⇒ `{ok:true,result:{path:null}}`（取消是事实）；返回相对路径/空串/含 NUL/超长/非字符串 ⇒ 拒绝。
- `workspace/create`：参数必须恰好 `[{path}]`；路径必须是可采纳的绝对路径；结果过纯数据判定（类实例会被拒）。
- `directoryPicker/createDirectory` **不入表**，并有断言钉住"它不在"。

## Alternatives considered

- 另起通道：否决（两套守卫两处登记）。
- 把写端点伪装成读：否决（骗守卫与读者）。
- 顺手加 createDirectory：否决（010 明确首版只采纳已有目录）。

## Consequences

- 桥面变大但性质可见；写端点扩项从此是需要评审的动作（ADR 里写明）。
- 改名必须让 050 的判据重跑：端点钉子已从"单条目集合"改为"三条目精确钉"，pick/create 的新用例补齐（取消、畸形路径、参数形状、类实例结果）。
- 已知未闭：采纳的幂等最终由基座 `workspaceRegistry` 决定，本票只保证桥不制造重复；UI 入口与列表未做。

## 追加：采纳链的消费半边（同一 ADR-0203，同批）

桥建好之后，010 的可见面才成立——本批把它接到产品面：

- **路由**：`POST /.sage/workspace/adopt`（`route-skeleton.ts`）。只认 POST，其余方法 405；它不是事项动作，不进 10 步管线。
- **顺序**：`src/main/workspace-adoption.ts` 先要 `directory/pick`，只有拿到路径才要 `workspace/create`。**取消时第二次调用根本不会发生**（不是靠一个 flag 跳过）——测试直接断言桥的调用序列只有 `directory/pick`。
- **三态**：`adopted`（带 workspaceId/path/title）／`cancelled`（"没有创建或记录任何工作区"）／`refused`（带机器码，界面按码查文案）。没有 provider 时是 `refused + workspace-adoption-unavailable`，不是"什么都没发生"。
- **投影**：`/.sage/state` 的 `workspaceAdoption` 槽带出最近一次尝试；`ServiceProviders` 因此从四个端口变五个（`appservice-composition` 的端口钉子同步改成五条目精确钉）。
- **界面**：能力面板新增"采纳已有目录为工作区"卡，**只有一个按钮**「选择已有目录」（断言按控件清点，不按字样搜——说明句里"没有新建目录的入口"是解释不是控件）。

实测（§1.6）：真实渲染产物在 Chrome 里逐态驱动，三态各出一句可读结论、按钮唯一、无横向溢出。
