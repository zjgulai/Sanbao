# T13-A 治理四项裁决的落地：三族 N/A、读数入仓、入口重述、Registry 路线

- 日期：2026-10-10
- 决策：[ADR-0283](../../../adr/ADR-0283.md)
- 状态：已实施（矩阵三件套 + 首件验收读数入仓）；Registry 自证等价的实现属后续批次。

## Problem

T13-A 盘点浮出四项待 owner 裁决的治理问题：外观三族（文字大小/界面缩放/主题色板）在 Sage 无落点；`implementing→verified` 缺一条可复算、非 ignored 的证据路径（`.birdview` 被门禁禁止）；`appearance.entry` 与 `*.open` 族的观察语义对不上 Sage 真实形态（账号菜单入口、原生 select）；session.prompt 首方 Registry entry 的 provenance 路线未定（step 7 空集 unavailable）。

## Decision

1. 三族（`QDR.OBS04.appearance.{theme,text-size,ui-scale}.open`）落 `not-applicable` + `notApplicableDecisionRef=docs/adr/ADR-0283.md` + 逐行 rationale（缩放归平台 zoom 且有 200% reflow 验收；色板属未来新 ADR/新 DTO/新行）。
2. verified 证据政策：打包验收 `acceptance-result.json` 原样入仓 `docs/notes/implemented/packaging/evidence/`；行引用读数 + tracked spec + route matrix（applicationService 需已登记 routeRef）；截图不入 git；文件内 ps 命令行的机器路径为 sanctioned 历史证据例外。visualAcceptance 仍需人工回看记录，不随本政策。
3. `appearance.entry` 与 `*.open` 族语义重述（Sage 真实入口=账号菜单→外观与显示；弹层观察=控件存在+选项集+权威值+保存/回读）。
4. 首方 Registry entry 走自证等价路线（C2A 制品 attestation + 发布决策 + owner 审批；不宣称 C2C.5）。
5. 首次应用：8 条外观族行 `ui`/`applicationService`/`electronAcceptance` 升 `verified`；`hostIntegration`/`visualAcceptance` 保持 pending；summary 派生重算。

## Alternatives considered

- 扩 DTO 收编三族 / verified 只认代码测试 / 截图也入仓 / 等 bridge seam / 手工 entry——逐条放弃理由见 [ADR-0283](../../../adr/ADR-0283.md) 备选表。

## Consequences

- 矩阵首次出现 `not-applicable` 行与 verified 维度；`integrated` 仍 0。
- 验收读数开始入库（首件 `2026-10-10-dmg06-v2-acceptance-result.json`，15KB，机器路径原样）；保留规矩：每产品版本一份、旧版转 `archive/`。
- Registry step-7 路线已定，实现前 session.prompt 仍按设计 unavailable。

## Verification

证据（2026-10-10）：

- 矩阵：`node scripts/gen-sage-sanbao-state-matrix.mjs --check` 与 `node scripts/gates/sage-sanbao-state-matrix.mjs` 在编辑后 PASS（206 rows；source/prototype PIN 零改动；verified 行的全部 ref 均为 tracked 路径且带 kind）。
- 读数入仓：`docs/notes/implemented/packaging/evidence/2026-10-10-dmg06-v2-acceptance-result.json`（`sage.packaged-acceptance.v1 passed=true`，sha256 与 mounted/installed 树摘要绑定在文件内）。
- 门禁：`pnpm run gate` 读数见提交记录（矩阵门禁与 `-selftest` 在门禁内真实执行）。
