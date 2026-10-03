# Ticket 045：身份显示与用户菜单共用同一份 main 权威投影

- 状态：proposed（隔离工作树 `qoder/ui-wiring`@`a7cf7b2` 已实现并通过自验，未提交、未经用户验收）
- 关联：工单 `docs/tickets/045-*`（仓外设计集）、US-206~US-208、FW-038、[ADR-0174](../../../adr/ADR-0174.md)、[ADR-0184](../../../adr/ADR-0184.md)、[ADR-0163](../../../adr/ADR-0163.md)
- ADR：**不在本工作树 mint**。主仓 ADR 已到 0196 且仍在前进，提前编号必撞号；验收翻绿后再按当时下一号登记。

## Problem

身份投影在生产里已经成立，但界面上只有一个消费点，且它对"身份还没核验完"的表达是空的：

1. `service.auth{status,displayName}` 由 Electron main 注入（`src/main/app-service.ts` 的 `authSnapshot`，取 `token-vault` 的快照），是这条事实唯一的真源；renderer 侧只有 RUNTIME 卡里的一行 `#auth-name` 在吃它。规格要的"用户菜单 / 个人资料页"（US-206、US-208）在界面上无处可达。
2. 旧 `renderAuth` 对三种非 signed-in 情形的表达不一致：signed-out 把名字清空（`''`），pending 写 `正在登录…`。空单元格既不是"未就绪"也没说原因，违反 US-207"未登录或不可核验时显示未就绪与原因"；而"清成空"与"留着上一次的名字"之间的差别，全靠一行三元表达式维持，没有任何断言挡住缓存身份。
3. `#logout` 只有一个隐藏按钮，没有菜单入口，也没有资料页入口；三处若各写一份可见性判断，就是同一事实三个家（P-07）。

## Decision

不改投影、不加端口、不碰 main 的 options 形状；只在产品面把"一份投影 → 所有入口"做成机制：

- `component-renderer.ts` 新增 topbar 用户菜单（`#user-menu` + 折叠面板 `#user-menu-panel`）与"个人资料"视图（nav 页签 `#view-profile` + `#panel-profile`），并在其中放 `#profile-identity`、`#profile-status-note`、`#profile-logout`。所有身份节点统一挂 `data-identity-label`，所有登出节点统一挂 `data-logout-entry`；RUNTIME 卡原有的 `#auth-name`/`#logout` 一并归入这两个族，不再单列。
- `renderer.ts` 的 `renderAuth` 先算出**一个** `identityText`，再 `identityLabels.forEach(...)` 写入整族；登出可见性同样按族一次设定。语义：signed-in 且有非空显示名 ⇒ 显示名；pending ⇒ `未就绪：登录中`；其余 ⇒ `未就绪：未登录`。资料页另给一行 `#profile-status-note` 说明原因。
- 登出入口的行为不变（`POST /.sage/logout` 后重读状态），只是从"一个按钮"变成"整族按钮共用同一段处理"。菜单不声称会话已销毁——销毁与否由下一次投影读数说明。

## Alternatives considered

- **给每个入口各自的取值代码**（3 处 `if (status==='signed-in')`）：正是 US-208 禁止的"两处各存一份值"，也是 P-07。否。
- **新增 `GET /.sage/identity` 独立路由**：同一事实第二个家，且扩大 main 的业务路由面（ADR-0184 只让 `/.sage/*` 终止于既有四面）。否。
- **在 renderer 里缓存最近一次显示名以便"登录后立即显示"**：US-207 明令不显示历史缓存身份；登出后残留名字是这类缓存的必然产物。否。
- **signed-out 继续留空单元格**：文案上是"没有内容"，语义上把"未登录"和"还没读到"混成一个，消费侧无法区分。否。
- **把用户菜单做成组织/岗位入口**：组织岗位属后置治理面（§7.1/§7.2），本票只做身份显示与登出。否。

## Consequences

- 正向：一份投影与一个入口族之间是机制绑定而非约定；"两处同值""登出后不留名""未就绪不放占位名"各有断言，且 5 条突变（只写首个节点、族查询失效、登出常驻、signed-out 回落成占位名、原因行为空）全部具名红。
- 浏览器实测（把渲染出的文档在 Chrome 里打开、改 `fetch` 桩驱动真实 `refresh()`）确认：signed-in 时三处身份节点同为一名，pending/signed-out 时同为未就绪且登出入口全部收起，页签与菜单开合正常，1440 与 660 宽均无横向溢出。**这一步抓到两条测试结构上抓不到的缺陷**：资料页说明文案有一处语法断裂（"也不可核验时回填占位名"，已改为"不可核验时也不回填…"）；`#profile-status-note` 与上一行贴死（补了行距）。DOM 桩只读 `hidden/textContent`，样式与文案成不成句它一概不知。
- 代价：身份文案现在集中在 `renderAuth`，新增入口必须复用 `data-identity-label`；否则会出现"新节点没被写入"的静默空白——已由"只写首个节点"这条突变的红给出信号。
- 顺带发现的**既存缺陷（本票未改，登记待办）**：
  ① 四个既有 tabpanel 的 `aria-labelledby` 指向 `view-overview` 等 id，而页签按钮从未带 id（只有本票新增的 `#view-profile` 有），属可访问性悬空引用；`docs-link-integrity` 不管页内锚点，现有门禁不拦。
  ② ≤680px 时 `.sage-footer { display: block }` 让页脚两段文字贴成一句（"…product surface本页不发送信息…"）。两者都不是本票引入的，是否并成一票小修由用户定。
- 已知边界：`service.auth` 只到"显示名 + 状态"，不含组织、岗位、grant；这些仍按 ADR-0163/0164 留在后置面，本票不从显示名推断任何授权事实。
