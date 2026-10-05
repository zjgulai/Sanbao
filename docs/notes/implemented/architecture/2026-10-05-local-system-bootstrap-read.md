# 本机系统入口：GET /.sage/bootstrap（T02）

- 日期：2026-10-05
- 决策：[ADR-0266](../../../adr/ADR-0266.md)
- 状态：T02 切片本地通过（聚焦/全量/门禁自测/实机）；独立复核结论见 Verification 末段。未提交、未推送。

## Problem

默认桌面在未登录、无事项语境时没有任何可读的服务事实：`/.sage/state` 被 projection-read admission 挡在 session+matter+读策略之后，账号入口只能写「身份状态未知」。T02 需要一个设备本机入口（身份状态、运行时状态枚举、初始显示偏好），且不能放宽既有读取策略、不能复用业务端点、不能绕过门禁发现。

## Decision

按 tickets 的 T02 精确范围实施：

1. 新路由 `GET /.sage/bootstrap`（唯一 local-system 类别，58→59）。响应为封闭 DTO：`{runtime:{status},auth:{status},display:{theme,density}}` —— 不返回姓名、凭据、session 引用、配置值、工作区或业务内容。
2. 专属 admission：纯内核 `appservice/local-system-admission.ts`（caller→frame→read→post-read freshness→value 校验，任一步失败回单一稳定拒码 `bootstrap-unavailable`）；main 侧 runner 把四步绑到请求级 callerBinding、ready/未污染 frame（锁 generation）、vault 状态与已保存显示偏好，并额外校验读中身份状态不得变化。无 runner 时组合返回同一稳定拒绝；caller 缺失在路由层 403、零 provider 调用。
3. 门禁登记：`scripts/gates/sage-route-authority.mjs` EXPECTED_ROUTES 59、新分类 local-system（policy/authority 模式各一）、逐行 `localSystemAdmission` 事实位；源码精确针＝kernel 导入、`bootstrapRead: createLocalSystemBootstrapRunner(options)` 装配行、runner 内 caller/读前帧/读后帧/身份移动四条语句，负向针＝不得出现 displayName/matterRef/workspaceRoot。自测新增四个具名突变（kernel 绕过、装配丢弃、读前帧放行、displayName 泄入）。
4. renderer：`client.ts` 以 exactKeys＋枚举双重封闭解析（未知键/非法枚举→unavailable），不显示未分类字段；账号行显示真实身份（signed-out→未登录），菜单提供登录/退出登录/设置入口——登录只在显式点击触发，logout 确认后立即重读 state 与 bootstrap（本地旧状态撤回）。

## Alternatives considered

- 提升 CB1 的公共语义（加 frame-ready）：不采用——CB1 是 59 条的公共维，提升即扩大既有面。
- 放宽 projection-read 在未登录读 state：不采用——违反 READ-01A（认证≠读权）。
- 复用 local-preference 面：不采用——无读入口且语义不同。

## Consequences

- 未登录主窗显示真实「未登录 / 运行时已连接 / requested theme+density」；全链外泄面收窄为一个封闭 DTO 与单一拒码（不区分失败原因，防枚举）。
- bootstrap 不改变任何既有 admission：`/.sage/state`、`/.sage/search` 在无语境时仍拒绝（有测试固定该事实）。
- OIDC 登录的完成路径、其后业务能力、T03 read-policy 及 T05/T06 真实消息链均未变化、仍需各自验收。

## Verification

证据目录：`.birdview/evidence/sanbao-desktop-t02-2026-10-05/`。

- 聚焦：local-system-admission.spec.ts（7）＋bootstrap-routes.spec.ts（10）＋route-authority-matrix.spec.ts（9）＋desktop-client/desktop-page/desktop-session（含账号菜单三用例）全绿；typecheck（tsc --build）exit 0。
- 全量：192 文件 / 1727 通过 / 1 skip / 0 失败（exit 0）；quick gate 27/27（objects 85/85、0 skip/failed）两跑均绿（服务端切片后与前端切片后各一次）。
- 门禁自测：`node --test scripts/gates/sage-route-authority.test.mjs` 31/31（四个 T02 具名突变各自可红；实现过程中以突变发现并修复了“读前帧检查只钉一半”的门禁弱点——两条 ready/contaminated 语句改为各自精确钉）。
- 实机（隔离根 /tmp/sage-desktop-t01-20261005，重建+materialize 后第二进程）：`desktop-live-check.mjs` exit 0 —— `GET /.sage/bootstrap` 返回 200 精确 DTO `{runtime:{status:'ready'},auth:{status:'signed-out'},display:{theme:'system',density:'comfortable'}}`、键集恰为 auth/display/runtime 且 auth 无 displayName；账号行显示「未登录」；`/.sage/state` 仍为诚实拒绝；writes=0、0 异常；截图 1440/660/320 已回看。
- 独立复核（2026-10-05，单次窄范围只读）：2 Important＋2 Minor，全部当轮修复并复跑——①门禁“字面量在场”可被前置 early-return 绕过（含泄漏偏好展开的变体，实测旧版仍 pass）→ 加结构判据（serviceJson 恰两处出口、成功出口必为内核值、拒码全字段源自内核、禁 `new Response(`、禁 vault.snapshot/identitySession/spread）＋自测新增两类绕过突变（各自具名红）；②服务端 DTO 验证器未校验键集（注释宣称闭合）→ 补齐 exactKeys（顶层与三个子对象，与 renderer 同构）；③logout 撤回可能被 retry 的 loading 守卫吞掉 → controller 新增 `withdraw`（epoch/sequence 双升、直接前台重读）＋jsdom 用例（loading 期撤回＋迟到读被 supersede）；④菜单内 `role="status"` 语义 → 移除。修复后：全量 1728 通过/1 skip、gate 27/27（objects 85/85）、实机 live exit 0 复跑。复核确认干净项：无 DTO 泄漏路径、admission 四检查无绕过、generation 单调无 ABA、403/405/path 精确先于 provider、自测与测试无恒真断言。
- 仪器备注：实机首跑曾见草稿文案翻倍一次，可由工具在同页二次运行未清稿解释；已给 `desktop-live-check.mjs` 增加确定性前置（起始清稿＋插入后等待值），最小复现两次均单份、复跑全绿。会话视图自身 320px 未涉及。
