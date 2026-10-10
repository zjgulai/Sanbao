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

7. **最后一步（需单独授权）**：点发送 → 真实模型回复 → 收脱敏 session/operation 读数。

## 已知边界与风险

1. `organizationId` 草案取 `organization:sage`；若 Logto token 的 `organization_data` 与单成员语义冲突（界面选择被拒），以真实报错码定位（见 WT-02B.2B 就绪清单报告）。
2. 策略含全 16 项投影读操作（内测便利）；生产策略应另行收窄。
3. 发送后首回合若观察器未及收口，第二次发送会被 active-attempt 拒绝——reconcile 兜底车道进行中（ADR-0293 备选表登记）。
4. 构建根已迁出 iCloud（ADR-0292）；本手册所有命令均不受同步干扰。
