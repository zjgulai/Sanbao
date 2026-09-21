# DA-03 · 入库面占位化收口：写入者直写占位符，或加一条读入库面的判据

- 优先级：P0
- 状态：`done`（2026-09-21 结算，随本批提交入库）
- 依赖：无
- 估算：M
- 来源：docs/pitfalls-playbook.md P-48；报告 TOP20 #3

## Problem

P-48 原文：「**入库面的占位化仍是流程，无强制**。判据只覆盖出货链，所以这条不是假绿，但它也不是被拦住的。」
实测（2026-09-18）：跑一次受认可的入库命令后，`manifest/intake-provenance.json` 的 `_meta.from` 从 `__SKILL_INTAKE_SOURCE__` 被还原成构建机绝对路径（`/Users/lute/…/Downloads/skills`），`sourceUnit` 与 `runtime-deps.json` 的 `venvPython` 同样——退出码 0、输出全绿、diff 里只像「新增了一条技能」。

## 动作

1. 首选修法：让写入者（`intake-install.mjs`、`scan-runtime-deps.mjs` 等）**直接写占位符**（环境值只在运行期读取处解析）；
2. 备选修法（若 1 有兼容性障碍）：新增一条门禁读**入库面**——`manifest/intake-provenance.json` 与 `manifest/runtime-deps.json` 中出现构建机路径（`$HOME`、`/Users/`）即判红；
3. 与既有 `rewrite-build-paths.mjs`（出货链已闭）划清射程，避免双写。

## 验收

- `grep -c "$HOME" packages/capabilities/dsh-overseas-skills/manifest/{intake-provenance,runtime-deps}.json` 两次输出为 0，且该断言由门禁自动执行；
- 重跑一次入库命令（受控样本）后两份文件**不出现**构建机路径；
- 负例：手工把路径写回，门禁判红并点名文件行。

## 注意

注意「受认可的命令会把环境事实写进已提交文件」这一形状本身要先问「谁在读它」；改完同批更新 P-48 段落。
