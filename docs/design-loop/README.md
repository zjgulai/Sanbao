# 设计回路输入快照（design loop）

2026-10-06 收纳自 Sage 仓同级的 `Sage-ui-wiring-design` 目录（该目录自身不是 Git 仓库，无法记录 commit）。**本目录是该回路资料的本地权威副本**——异机交接后不再依赖原目录。

## 内容

- `tickets/`：001–050 工单、`LOOP.md` 执行合同、`README.md` 与 `attachments/`（050 的 patch 与最小夹具）。
- `specs/2026-10-02-uiux-sage-first-release-wiring.md`：US-001~226 首版规格。
- `adr/`：设计回路 ADR 0002–0006。
- `discussion.md`、`button-wiring-contracts.md`、`ui-wiring-matrix.md`、`source-state-wiring.csv`：讨论、按钮合同与状态矩阵快照。
- 判者（可执行）：`scripts/design-loop/verify_ticket.mjs`（默认对准本仓，用法见文件头）。

## 适用边界

- 链接已按收纳布局**机械重写**（211 条，转换脚本与映射规则在仓外恢复集 `fix-design-loop-links.py`）：`../Sage/...` → 仓内相对路径、`../Sanbao/repository-snapshot/apps/sanbao-prototype/...` → `../../vendor/sanbao-prototype/...`；**正文未改**，只改导航目标。翻译后全树 2561 条相对链接 0 坏链（与 `gate:docs-link-integrity` 同一判据）。
- 这些是**输入合同与历史证据**：工单的审批 / 执行状态与矩阵读数**不得**冒充现行验收；现行进度以 [tracked matrix](../specs/2026-09-27-sanbao-to-sage-ui-state-map.json) 与 [集成票据](../plans/2026-10-05-sanbao-in-sage-integration-tickets.md) 为准。
- 原目录中的 3 个 Python 核对器（`mece_states` / `verify_mece` / `verify_docs_consistency`）与设计仓根布局耦合，且其职能已由 `scripts/gates/sage-sanbao-state-matrix.mjs` 门禁承接，未随本快照收纳。
- 设计仓 `CONTEXT.md` 已随本快照收纳（`CONTEXT.md`）；它只描述本回路术语，不替代 Sage 根 CONTEXT.md。
