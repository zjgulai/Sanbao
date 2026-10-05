# Sage.app 打包决策包（P0-3B / P1 输入）

- 日期：2026-10-05
- 状态：proposed（待用户裁决；裁决后按档位开 P1 施工批）
- 关联：[Sage 自有桌面端执行方案](../../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)（P0-3B / P0-4 / P0-6 / P1 原文）、[ADR-0159](../../../adr/ADR-0159.md)（产品决策）、ADR-0131（旧链签名身份先例：本机自签、无 notarization）、ADR-0056/0057/0058（旧发布链，仅作对照，不套用）

## Problem

用户问「现在能不能打 sage.app 的 DMG」。盘点结论：**不能**，且三条阻断分属不同性质：

1. **P0-3B 打包输入未定（用户决策，不能臆定）**：执行方案原文要求先指定「Sage 的精确反向域名 Bundle ID、Apple Team / Developer ID 归属」，明确标注「这是 P1 打包输入，不能臆定」。当前仓库、pin、seed 中均无这些值。
2. **P1 链不存在且明文「另批确认」**：Sage 专属的 assemble、安装、签名、公证、更新与回滚链「尚未建立」（AGENTS.md 原文），且方案要求「不套用 DSH Desktop.app 命名、安装器或 feed 假设」。现存的 `packaging/`（assemble.sh / sign-and-dmg.sh / installer / release feed / SOP）全部属于旧 DSH Desktop→Sanbao legacy 线，其门禁（dmg-layout、update-feed）只保证它自己那条链不腐化——不得当作 Sage 发布证据（docs/architecture.md §0 同款措辞）。
3. **P0-4 资产发行门未完成**：公开分发 DMG 前需要通过「公开资产权属 / 商标 / 视觉发行门」；P0-6 并明文「内部版不打 DMG」。

## 待用户裁决的输入（逐项，可直接答）

| # | 输入 | 说明 / 建议 |
| --- | --- | --- |
| ① | **Bundle ID** | 反向域名形式，如 `com.lute.sage`；一旦定下 TCC / 数据目录 / 更新身份全挂其上，改名成本=重跑脚本而非断链（ADR-0131 D3 旧链实测同型）。 |
| ② | **签名身份** | 二选一：**A 本机自签**（先例 ADR-0131：本机自签证书、无 notarization；零外部凭据）／**B Developer ID**（需你的 Apple Developer Team 归属；凭据仍只在本机钥匙串，不进仓库）。 |
| ③ | **分发目标** | 仅本机/内测（不公证、可先过 P0-4 之外）／未来公开下载（必须 P0-4 资产门 + notarization + 更新 feed）。 |
| ④ | **版本起点** | Sage.app 自有版本号（如从 0.1.0 起），与旧 DSH 2.x / LUTE 线无关。 |

## P1 范围三档（选一档即开施工批）

| 档 | 形态 | 差量清单 | 前置 |
| --- | --- | --- | --- |
| **A. 本机自用 app（最小）** | `Sage.app`（unsigned 或 adhoc），双击可跑 | 新 `packaging-sage/` 命名空间：`assemble`（electron pack → .app，Info.plist 品牌字段、A StarSail/Sage 图标 Iconset、CFBundle 名与 Bundle ID）＋seed materialize 进 `Resources` ＋首启数据根隔离（SAGE_ROOT，docs/gates 已有数据隔离门可复用） | ①④ + 「另批确认」一句 |
| **B. 本机自签 + 本地 DMG** | A + 本机自签证书 + DMG 骨架（卷布局/安装指引/品牌） | A 全部 ＋ `ensure-signing-identity`（Sage 新版，重写不抄旧）＋ entitelements/hardened runtime 决策 ＋ DMG 布局脚本 ＋ 安装指引（INSTALL-GUIDE 风格，新写）；不公证 | ①②A③本机 + P0-4 不拦（内部） |
| **C. 可分发链** | B + notarization + 更新 feed + 回滚 + 迁移 | B 全部 ＋ notarize（或用 Developer ID）＋ 更新 feed（沿用 ADR-0058 机制的**新版本命名空间**）＋ 回滚/同号归档（ADR-0057 同型纪律）＋ 旧资料迁移指引 | ①②B③公开 + **P0-4 资产发行门** |

## 与现状的接口（已就绪、可复用）

- 运行时装配已具备：`apps/sage-shell` Electron 基线＋`materialize`（seed → 受信 generation）＋ `sage-data-isolation` / `sage-base-path-hygiene` / `sage-shell-pin` 等门禁可直接约束打包链的新文件。
- 承载面（ADR-0262）已证明「非特权面＋真桥」可行；打包不改变其形态。
- 旧 `packaging/` 与 `release/`（约 7.2 GiB）按执行方案台账 `retain`，Sage 新链与其物理隔离即可，不删不迁移。

## Alternatives considered

- 直接套用旧 `sign-and-dmg.sh` / installer / feed：**否决**——执行方案明文「不套用旧命名、安装器或 feed 假设」；且旧门禁只保证旧链自洽。
- 跳过签名先出 unsigned DMG 对外：否决——macOS Gatekeeper 体验损坏 + 违反 P0-6/P1 纪律。
- 继续搁置打包、先推进 P0-5：可行但不是当前用户目标；且 A 档成本低、不依赖 P0-5 完成（unavailable-first 产品在打包下同样诚实）。

## Consequences

- 用户答齐①-④并点档：当批产出＝新 `packaging-sage/`（A/B/C 对应差量）＋ADR＋Note＋门禁（打包链自己的静态判据）＋一次真实「冷启动 app → 非特权面 → fixture/壳桥」实机验收（实机批次照旧单独确认）。
- 未答齐前保持零改动的现状；本 Note 不含任何施工授权。
