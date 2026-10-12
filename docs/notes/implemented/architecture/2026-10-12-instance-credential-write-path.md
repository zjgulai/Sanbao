---
title: 实例凭据写入路径：/.sage/credentials 三段语法，值写穿不回显（ADR-0334）
doc_type: architecture
module: sage-shell
topic: instance-credential-write-path
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# 实例凭据写入路径：/.sage/credentials 三段语法，值写穿不回显（ADR-0334）

## Problem

v9 走查实证内测最后一处环境依赖：`DEEPSEEK_API_KEY` 只能从启动环境导出（缺失 → `MISSING_CREDENTIAL` 错误回合）。ADR-0333 D4 把「宿主凭据写入路径」登记为票级后续批。dsh 凭据服务（`credentials-local`）提供 `describe`（无值槽位）与 `set`（写文件层＋热应用），但 Sage 面从未接线。

## Decision

按 [ADR-0334](../../../adr/ADR-0334.md) 实施六项决策：

1. `/.sage/credentials`（POST JSON）三段语法：键集精确、name 大写 env 名、value 8–512 trim 无控制字符；越界 400 于路由层。
2. 值写穿不回显：describe 只有 `{configured, source, writable}`；set 应答只有 `{state:'saved', name}`。
3. main port `createCredentials`（`src/main/instance-credential.ts`）：未登录/越界名 → 具名拒绝且零 bridge 调用。
4. host seam：名单白名单 `['DEEPSEEK_API_KEY']`、值语法复检、env 来源（`writable:false`）set 具名拒绝 `bridge-credential-readonly-source`。
5. 模型页「实例 API Key」卡：状态行＋密码输入＋保存＋通知；成功清空并重读，拒绝保留输入具名原因。
6. route 矩阵按 protected-effect 登记 bypass（bespoke admission 非 family 成员）；门禁 pin 语法/身份门/单一调用点/unavailable-first 默认。

## Alternatives considered

见 ADR-0334 备选表（local-preference 归族、新建 family、env 允许覆盖、renderer 直连、回读富状态——逐条裁决）。

关键一票：**不把密写归入 local-preference**。该 route 与展示偏好同目录会低估爆炸半径（凭据决定真实计费调用）；按矩阵既有词汇登记为 protected-effect bypass，让审计面显式看见「有具体门、但不在注册 family 内」。

## Consequences

- route 分母 62→63；protected-effect 39；bypass 17（direct 11）；gate 基线、matrix spec、gate test 同步。
- bridge 表 39→41；逐行守卫（host-readonly-bridge 全表 pin + protocol 每行 guard）自动覆盖新行。
- 走查前置第 6 条可删除：无 env 启动 → 登录 → 界面保存 key → 真实模型回合（本批装机实测，见 Verification）。
- 后续批：模型编辑器真校验/保存（ADR-0333 剩余）；`unset` 未开（未请求）。

## Verification

真实运行（2026-10-12/13）：

- `pnpm run build`（apps/sage-shell）：tsc 0 错，bundle 写出。
- 新增 spec：`test/instance-credential.spec.ts` 13 例（port 身份门/白名单/describe 映射/写穿/形状防御/拒绝码映射 + route 语法 15 非法体、405/415、unavailable-first 默认）；`test/product-app/desktop-settings-credentials.spec.tsx` 10 例（卡渲染/保存流/拒绝保留/身份/来源/控制器映射/400 具名）；host 侧 8 例（describe、名单、写穿不回显、语法、readonly-source、缺 provider、**receiver 绑定回归**）入 `test/host-readonly-bridge.spec.ts`。
- 门禁：`node --test scripts/gates/sage-route-authority.test.mjs` 59/59；全量套件 2128 通过（1 skip）；`pnpm run gate` 退出 0（连续两次）。
- **装机实测（staging Sage.app，scratch root，刻意不导出 `DEEPSEEK_API_KEY`）**：
  1. 未登录 describe/set → `credential-identity-unavailable`，凭据文件零写入（`grep -c DEEPSEEK` = 0）。
  2. 登录（Logto）→ 模型页实例 API Key 卡：状态「未配置」；占位值保存 → 「已配置（来源：本机凭据文件）」+「已保存；值不回显。」；输入清空；DOM 无值；凭据文件落值。
  3. 退出重启 → describe 仍 `configured:true, source:'file'`（持久性实证，零 env）。
  4. 用户经界面卡保存真实 key → 关联工作区 + `context/select`（ensure 进入工作修订）→ `session/send` `accepted` → **真实模型回合 `turn/end: completed`**（含 provider 侧会话标题调用，均无 env），回复逐字：「本仓门禁命令是 `pnpm run gate`（提交前）与 `pnpm run gate:full`（推送前），二者只跑 Sage BASE allowlist，退出码即契约。」
  5. 应用日志零 `sk-` 泄漏（stdout/stderr grep = 0）。
- 实测中修出两个真缺陷（已回归）：host 方法抽取丢失 `this`（`bridge-provider-failed` 根因，receiver 绑定 spec 钉住）；renderer 把 400 语法拒绝误报为「未能送达」（真拒绝进具名映射）。
- v14 DMG 验收记录另见 packaging note。
