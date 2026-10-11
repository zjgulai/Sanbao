# 真机会话走查手册（内测 v3 DMG）

- 日期：2026-10-11
- 状态：就绪（策略草案与种子脚本已实证；执行需要用户在场登录与清单确认）
- 相关：[ADR-0292](../../../adr/ADR-0292.md)、[ADR-0293](../../../adr/ADR-0293.md)、[内测 DMG 记录](2026-10-05-sage-internal-dmg.md)、[DMG-06 v3 证据](evidence/2026-10-11-dmg06-v3-acceptance-result.json)

## 目标

在真实安装的 Sage.app 上走通「登录 → 选择事项（选择流 ensure 进入工作修订）→ 输入首条消息」。**止步于不发送**——真实模型调用需要单独授权，留作最后一步。

## 前置清单（用户侧）

1. 安装 v3 DMG：`~/project/Sage_hub/Sage/packaging-sage/release` 已迁出仓外的旧件不再使用；现行 DMG 在 `~/.sage-packaging/release/Sage-0.1.0-internal-arm64.dmg`（sha256 `052c3970…`）。挂载 → 拖入 `/Applications`。
2. Logto Native 应用 `cmg2ty121m1tlsd0fgiuv` 的 redirect allowlist 仍含 `http://127.0.0.1:3000/callback`（ADR-0183 时已配，请复核）。
3. 测试账号设置 Name（否则界面显示名为空）。
4. 登录窗口期 3000 端口空闲。
5. 确认单成员语义（instance-operator：任何通过该 IdP 的登录视为本实例操作者）。

## 步骤

1. **首启一次再退出**（让 app 建立专属数据根 `~/Library/Application Support/Sage`，权限 0700）。随后完全退出（Cmd+Q）。
2. **写入策略文件**到 `~/Library/Application Support/Sage/organization-policy.json`（首启之后写——pristine 门禁要求首启前该根不存在）。内容（草案，待你点头后使用）：

```json
{
  "schemaVersion": "sage.organization-policy.v1",
  "organizationId": "organization:sage",
  "policy": { "identity": "policy:local", "version": "1" },
  "validFrom": "2026-10-11T00:00:00Z",
  "expiresAt": "2027-10-11T00:00:00Z",
  "membership": { "mode": "instance-operator", "roleRefs": ["role:owner"] },
  "grants": [
    { "roleRef": "role:owner", "operation": "matter.read", "actionScope": "matter.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "state.read", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "workspace.files.list-candidates", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "workspace.files.create-reference", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "workspace.files.use-reference", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.attempt.status", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.stream.follow", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.history.list", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.history.detail", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.anchors.read", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.anchors.locate", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.terminal.read", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "search.query", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "artifacts.observe", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "artifacts.open", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "artifacts.retry", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "edit-drafts.create", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "edit-drafts.diff", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "run-log.read", "actionScope": "projection.read", "effectClass": "local-read", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.prepare", "actionScope": "session.prepare", "effectClass": "local-write", "requiresDecision": false },
    { "roleRef": "role:owner", "operation": "session.send", "actionScope": "session.prompt", "effectClass": "external-write", "requiresDecision": false }
  ]
}
```

3. **种入走查事项**（app 保持退出；存储要求独占）：

```bash
cd apps/sage-shell && ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron \
  ../../packaging-sage/scripts/session-demo-seed.mjs
```

（脚本幂等：已存在即零写入。存储边界要求数据根 0700 与规范物理路径——脚本已处理 realpath。）

4. **启动 app 并登录**：系统浏览器完成 Logto 登录，界面收敛为已登录。
5. **选择事项** → 打开「真机会话走查：首条消息的工作事项」→ 触发 `/.sage/context/select` → 选择流 ensure 进入工作修订。
6. **验证（不发送）**：检查数据根 store 出现第二条 `revision-entered`（`revision:sage.<uuid>`）：

```bash
sqlite3 "~/Library/Application Support/Sage/data/business-matter/business-matter-v1.sqlite3" \
  "SELECT event_type FROM business_matter_events ORDER BY rowid;"
```

期望末段出现 `revision-entered`（ensure authored）。输入首条消息但**不点发送**。

7. **最后一步（需单独授权）**：点发送 → 真实模型回复 → 收脱敏 session/operation 读数。发送后同时观察（ADR-0298）：回复文本**逐步出现**（流式）、视区随输出推进、停止按钮全程可用；回复完成后 live 文本由 durable 文本替换；中途切换事项再切回，流式订阅不串台。

## 新装面回看（R2–R14 已装面的一次性覆盖）

8. **回合过程与产物（发送回合内）**：回复完成后看 footer「已完成 · 耗时 X · N 步」；展开「执行过程（N）」逐项（写入/编辑 · 文件基名 · 单项耗时）；有编辑项时展开「查看本次修改」核对红/绿行与「+A/-R」摘要；右侧出现产物卡时点「打开」→ 受控预览面板出现（地址栏/标签页为**已登记的不复刻项**，无此面属预期）；无产物时 rail 空态「尚无观察到产出物」属预期。
9. **上下文占用与核对入口**：composer 提示行出现「上下文 NN%」chip（宿主携带 contextPressure 投影时；缺席无 chip 属预期）；发送出现 outcome-unknown 时按「核对」路径观察不确定门行为（正常回合不触发）。
10. **任务监控页**：侧栏「运行模式」→ 步骤轴（执行中/空闲）+ 预算/设备/后台/上下文四「未知（reason）」行 + 回顾卡（「更新于」为日志时间戳；展开与产出/来源空态）；有 accepted 计划时「计划步骤」roster 显示 就绪/未就绪（阻断——不派发）标签。
11. **会话控制面（回合进行中/结束后）**：执行中出现「正在写入 <文件>… · Ns」live 行属预期；base 产生授权等待时出现授权卡（「允许一次/拒绝/撤回等待」——内测策略下应答预期为具名拒绝「授权应答尚未接通」，**属预期读数，不视为失败**）；模型排队卡（等待/重试/已就绪 + 服务计划延迟事实行）；暂停后发送 → 「待继续输入」列表出现且可编辑/移除；队列 occurrences 列表与「排队/插队/上下文」徽标。
12. **工作区文件菜单**：composer「添加上下文」→「工作区文件」→ 子菜单出现搜索框（获焦）与候选行（AGENTS.md 类真实文件）；输入过滤为本地行为（**过滤语义未在观察行验证**——只记录所见）；方向键 Left 空查询返回根、根层再 Left 回到输入入口；点行出现「选择文件作为上下文尚未接通」具名拒绝属预期。
13. **快捷外观**：账号菜单 → 「外观」→ 明暗模式/语言/字体风格/内容宽度 四项切换即保存（以设置页权威回读为准）；三项 N/A 面（主题色板/文字大小/界面缩放）**不应出现**，出现即缺陷。
14. **扩展管理/市场与 MCP 表单**：侧栏「扩展」→ 四标签（计数「—」）+ 插件/技能「添加」两项菜单（选项点击 → 具名「尚未接通」）；「市场」→ 三标签标题（发现 Skills/Plugins/Connectors）+ 排序/类别/搜索，「市场服务未接通（market-provider-unavailable）」具名态、**零条目**属预期；连接器标签内「添加 MCP」→ 表单（名称 0/50、传输菜单、HTTP/SSE/STDIO 字段集、JSON 示例、放弃确认）——「添加 MCP/预览导入」具名拒绝属预期。
15. **知识中心/站点两页**：双 tab 结构完好；数据区「知识库服务未接通（knowledge-store-unavailable）」「站点服务未接通（sites-store-unavailable）」具名态（**不出现**「还没有知识库/还没有站点」空列表文案）；知识页「创建知识库」→ 弹窗（0/50、范围说明、工作区菜单与 chips、名称空禁用）→ 填名勾选后就绪 → 「创建」具名拒绝；「全部工作区」筛选菜单两条（全部工作区 + 真实工作区名）。
16. **设置页与工作区页**：「账号与设置」→ 8 项外观 select + 「本机设置叶」11 行（连接/安全/工作区索引应为「已读」实值，其余「未核验（provider-not-wired）」，全部无写入口）；侧栏「工作区」→「新建工作区」表形状（未选择文件夹、创建禁用、图标/颜色默认选中）——**点「选择文件夹」会真实接入目录**（含系统目录选择弹窗）；如本次走查不想产生真实接入，只核验形状与禁用态即可，弹窗按取消验证「已取消目录选择」句。

17. **工具结果与集成终端（R15 新装面）**：
   - 「工具结果」区：回合含非写入类工具结果时出现「工具结果（N）」列表（标题 · 工具名——日志时间单位未钉住，不显示时间）；文本/键值/表格字段按形状渲染；不支持类型显示「不支持的结果类型（X）。」、被拒字段显示「未受理（code）。」；链接字段以「label（host）」纯文本展示（当前无点击打开——属预期）；读取不可用时显示「工具结果读取不可用（reason）——不据此断言无结果。」（**不出现**「暂无」类空态）。无工具结果时不出现该区，属预期。
   - 「集成终端」区（会话页下方）：出现「集成终端（只读运行观察：打开/关闭不影响执行；输出不进对话历史、不作产物）」；无会话时「还没有会话：没有终端可读。」；provider 缺席时「终端不可用（bridge-provider-unavailable）。」；有终端行时显示 名称 · 类型 + 「运行中/已退出（exitCode N）」；点「打开输出（只读）」→ 有界输出页 + 「只读运行观察（第 x–y 行 / 共 n 行）」注记，再点「关闭输出」收起——**区内零输入控件**（出现即缺陷）。
   - 产物卡不支持态：office 类型卡出现「原格式预览尚未接通」；binary 出现「不支持预览」；点「打开」后失败块给出同义句子（**不得**出现裸 code 原文）。
   - 独立窗口 chrome（点「独立窗口」后）：预览窗顶部为内嵌红绿灯（无原生标题栏），Sage 自绘文档（文本/图片/表格）的头行不被红绿灯遮挡；HTML 产物与 PDF 查看器不加预留（正文上缘即内容）——属**有意差异**，记录所见即可。多窗（同文件多窗/每文件一窗）为**已登记不复刻项**，不存在属预期。

## 已知边界与风险

1. `organizationId` 草案取 `organization:sage`；若 Logto token 的 `organization_data` 与单成员语义冲突（界面选择被拒），以真实报错码定位（见 WT-02B.2B 就绪清单报告）。
2. 策略含全 16 项投影读操作（内测便利）；生产策略应另行收窄。
3. 发送后首回合若观察器未及收口，第二次发送会被 active-attempt 拒绝——reconcile 兜底车道进行中（ADR-0293 备选表登记）。
4. 构建根已迁出 iCloud（ADR-0292）；本手册所有命令均不受同步干扰。
5. 「新装面回看」各条只记录**所见**：过滤语义、排队自然态（queued/retrying）、授权应答真实记录等未验收面不得由本次走查升格；视觉维（visualAcceptance）仍需人工回看记录，本手册不替代。
6. R15 面（工具结果/集成终端/窗口 chrome）同受第 5 条约束：工具结果的自然到达、终端真实输出、独立窗口的真实观感均待本走查与后续真机观察验证，本手册不替代。
