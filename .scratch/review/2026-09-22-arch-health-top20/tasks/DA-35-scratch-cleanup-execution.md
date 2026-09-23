# DA-35 · .scratch 45 项清场执行（DA-13 落地）

- 优先级：P1
- 状态：`open`
- 依赖：DA-04 已 done（「先查承诺」顺序机制已落地）
- 估算：L
- 来源：DA-13（open）；2026-09-22 实测 `.scratch` 顶层 45 个目录（含本批工单目录，须排除）

## Problem

DA-13 立项清场 .scratch（第一批时 42 项，现 45 项），依赖的 DA-04（清场清单「先查承诺」机制）已完成。
清场规则：每个待清目录先查有没有**未关闭的承诺**（引用它的工单、未结算的 TODO、被 docs 链接），
再决定归档（`~/project/_archive/Magpie-Horch-<日期>/`，归档索引 README 逐项列来源去向）或删除。

## 动作

1. 盘点 45 项分类：**活跃**（2026-09-20 第一批、本批 2026-09-22——不动）/
   **spec 引用**（`.scratch/lute-refactor/spec.md` 被 AGENTS.md 链接——须先迁家再清）/
   **历史工作流**（已完成或废弃的执行目录）；
2. 历史项逐项过 DA-04 顺序：查承诺 → 有承诺的先结算/迁移 → 归档（不直接删）；
3. 归档索引 README 写齐来源去向；`.scratch` 顶层只留活跃项；
4. spec.md 的迁家：目标家定后更新 AGENTS.md 链接，过 docs-link-integrity。

## 验收

- `.scratch` 顶层只剩活跃目录；归档目录索引完整；
- `gate:docs-link-integrity` 绿（无死链）；
- 每项归档有「承诺检查结论」一行记录（有/无、是什么）。

## 本轮只读盘点（2026-09-23）

实跑 `node scripts/cleanup-inventory.mjs <.scratch 顶层目录逐项参数> --json`：
44个目录，26个 protected、18个 suggested；另 git 跟踪文件分布于41个顶层工作流。
这三个分母不同，不沿用45或42的历史数量。

工具的18个建议候选：codex-ui-ux-rollout、theme-triad-live、p2s-card-generation、
p2s-parse-audit、capability-hub-pages、compaction-hardening、release-surface-migration、
`lv tcac gate`、pre-merge-stash、sanbao-experience、dmg-repack-pipeline、preset-lint-repair、
xmind-agent-skills、dsh-native-skill-driver-doc、vod-route-hardening、sensitivity-analysis、
clean-checkout-protocol、release-tag-gap。

**本轮不执行归档**：suggested 只表示工具未找到它覆盖的承诺/代码引用，
不代表可删。capability-hub-pages、pre-merge-stash、sanbao-experience 有其他会话
未跟踪工作，明确排除；review 和 lute-refactor 等被保护目录继续保留。
其余候选须再查未关闭 TODO 和文档引用，并由用户确认逐项移出范围后才能移动。
未删除、移动任何目录，也未改 AGENTS.md。

## 注意

- 本批与第一批工单目录**绝不在清场射程内**；
- `.scratch/lute-refactor/spec.md` 是 AGENTS.md 常驻链接——先迁家后清，顺序反了会造死链；
- 归档出工作树（ADR-0013 档），不留在仓库。

## 引用清零（2026-09-23，R7 前置）

精确复查（`.scratch/<dir>` 带前缀模式；首次复查的 compaction-hardening 三处命中是
Note 文件名 `context-compaction-hardening.md` 的假阳性）。真实引用 4 处，已全部改写为
归档去向（`~/project/_archive/Magpie-Horch-20260923/<dir>/`，ADR-0013 档，纯文本非链接）：

| 目录 | 原引用方 | 处置 |
| --- | --- | --- |
| p2s-card-generation | 2026-09-12-paper2skills-fence-candidates.md | 对账脚本指向归档路径 |
| p2s-parse-audit | 2026-09-12-paper2skills-parse-defects.md | 取证目录指向归档路径 |
| compaction-hardening | 2026-09-12-context-compaction-hardening.md（备份四件套） | 备份指向归档路径 |
| preset-lint-repair | 2026-09-11-preset-lint-and-profile-files-sync.md（spec 指针） | spec 指向归档路径 |

其余 11 个候选零引用。**15 个候选的归档清单待用户逐项拍板**（归档批次名
`Magpie-Horch-20260923` 已随引用改写锁定）。

## 执行记录（2026-09-23，R7 收口）

用户拍板：15 个候选全归档。移前检查：15 目录均无 09-23 当日文件活动
（mtime 09-11~09-20）；51 个 git 跟踪文件随目录移出（提交删除 57 个路径）。

- 归档批：`~/project/_archive/Magpie-Horch-20260923/`（索引 README 逐项列来源/
  去向/承诺检查结论；刻意未归档的 3 个他会话目录也已列入索引）；
- 引用面：4 处 docs 引用已先行改写为该归档路径（见上节），docs-link 无死链风险；
- 本卡验收：`.scratch` 顶层只剩活跃目录；归档索引完整；git 删除提交随本卡同批。

结论：`.scratch` 清场完成——顶层 44→29 个目录（26 个 protected 活跃 + 本批与第一批
工单目录 + 3 个他会话在用的未跟踪目录）。DA-13 的 .scratch 清场线随本卡收口。
