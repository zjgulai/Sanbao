---
title: VF-1 主题重定值：Sage token 落 Qoder 0.4.4 mint 实测值 + 复刻锚定合同 + 已知偏离清单
doc_type: architecture
module: sage-shell
topic: vf1-theme-rebase
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# VF-1 主题重定值：Qoder 0.4.4 mint 实测值落地（ADR-0335）

对应决策：[ADR-0335](../../../adr/ADR-0335.md)。对应票据：[视觉保真票](../../../plans/2026-10-12-qoder-visual-fidelity-tickets.md)（VF-1）
用户裁决（2026-10-13）：**B——保复刻改合同**。token 落 Qoder 原值，合同改复刻锚定断言，偏离透明化留 VF-4。

## Problem

Sage 原 19 token 是自造绿色系（brand `#166642` 等），与 Qoder 视觉无关。VF-0 已提取 Qoder 0.4.4 完整 token 面与真机截图；本批把 light/dark 两主题重定值为 Qoder 实测。落值后发现：Qoder 原值过不了 Sage 既有的全矩阵对比度合同（正文 ≥4.5、非文字 ≥3），复刻与可访问性 gate 冲突。

## Decision

按用户裁决 B 实施：

1. **D1 token 值锚定 Qoder 实测**：light = mint-light（画布 `#f9f9f9`=bg-elevated、侧栏 `#dff1ea`=accent 18% 叠白、选中面 `#cfe0d9`=accent 28% 叠白、brand=`#4fa98f`=真机主按钮色）；dark = mint-dark 实测 + 结构推导（侧栏 `#1a251c`=mix(brand 12%, bg-layout)、hover `#1e2f21`）。派生关系记录于 ADR。
2. **D2 合同改复刻锚定**（`theme-tokens.spec.ts`）：废除全矩阵 ≥4.5/≥3 断言；改为 (a) 15 token × 双主题 == 锚定值逐项断言（防漂移）；(b) 对比度仪器保留且断言「偏离集合 == 已知偏离集合」（值一动集合就变，强制同提交改账本）。
3. **D3 偏离透明**：下表是全部已知 WCAG 偏离，均为 Qoder 原样继承；VF-4「超越」批以逐用法分析决定是否修正。

## 已知偏离清单（Qoder 原样继承，非 Sage 新增）

| 对 | light 比值 | dark 比值 | Qoder 用法 | WCAG 判 |
|---|---|---|---|---|
| divider 细线 × 5 面 | 1.0–1.2:1 | 1.0–1.2:1 | 1px 装饰分隔线 | 装饰性豁免争议，从严不达 |
| border 控件边 × 5 面 | 1.0–1.4:1 | 1.2–1.5:1 | 输入/卡片描边 | 非文字组件边界，不达 3:1 |
| faint 三级文字 × 5 面 | 2.8–3.8:1 | 3.3–4.4:1 | 辅助说明文字 | 不达 4.5:1 |
| muted on overlay（选中面） | 4.44:1 | — | 选中行次级文字 | 差 0.06 达标线 |
| brand/success/warning on 浅面 | 1.6–2.8:1 | 达标 | 图标/强调 | 非文字，不达 3:1 |
| focus on overlay | 2.78:1 | — | 焦点环在选中面 | 不达 3:1 |
| danger on overlay | 2.89:1 | — | 危险色在选中面 | 不达 3:1 |
| 白字/主按钮（实测 `#fdfdfd` on `#4fa98f`） | 2.79:1 | dark 侧达标 8.15:1 | 主按钮前景 | 连大文本 3:1 都不达——Qoder 自身缺陷 |

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| A 调值保合同（divider→`#727a74`、brand→`#4b6f5a` 等更深档） | 否决（用户裁决）：像素即偏离，「先复刻」从一开始就不像；VF-2/3 全部建立在偏移基线上。 |
| 静默放宽阈值不改断言结构 | 否决：pitfalls「用纪律守只有机制能守住的东西」——无机制的放宽就是绿灯漂移。D2 的锚定+偏离集合断言是机制。 |
| 三主题（沿用旧 2026-09-20 计划） | 否决：旧计划属旧壳，与 Sage 无关（票据明文切割）。 |

## Consequences

- light/dark 双主题视觉基线 = Qoder 0.4.4 mint 系；后续 VF-2 几何精修、VF-3 视觉验收都以此为锚。
- 可访问性责任移交「偏离清单 + VF-4 收口」；若有无障碍投诉入口，本清单是第一响应面。
- 合同断言的锚定值将来**只随显式复刻基线升级而改**（如 Qoder 版本跟进批），随手改值会被锚定断言拒绝。

## Verification

真实运行（2026-10-13）：

- tsc 0 错；`theme-tokens.spec.ts` 9/9（含新锚定断言与偏离集合断言）。
- 主题射程全回归 31 文件 319/319（product-app 全部 + display-theme + theme-tokens）。
- 全量 suite 的 133 个既有失败经 stash 对照证实为并行凭据批（ADR-0334）环境性失败，与本批无关。
