# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/clickhouse-architecture-advisor.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

按工作负载形态给出 ClickHouse 架构决策：摄取、时序分区、富化 join 与预聚合

ClickHouse 选型定了，接下来怎么建表分区摄取

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 这个实时风控场景用 ClickHouse，帮我定架构

触发词：ClickHouse 架构、ClickHouse 选型、实时摄取、时序分区、预聚合、OLAP 建模

**何时不用**：非 ClickHouse 的通用数仓选型或其它列存引擎不在本技能范围，它假定引擎已定为 ClickHouse 并按工作负载给架构决策

### 1.3 内置资源

- `rules` —— 5 个文件
- `(根目录)` —— 4 个文件
- `examples` —— 4 个文件
- `mappings` —— 1 个文件
- `schemas` —— 1 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/clickhouse-architecture-advisor/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/clickhouse-architecture-advisor.zip` |
| SKILL.md 原文 sha256 | `edaba60acfe951828102707e6746e2e8abef583aeb4d1cca8ab307c9fb8d13ae` |
| 许可证 | Apache-2.0（依据：实测 LICENSE 文件或 frontmatter 声明） |
| 入库文件数 | 15 |
| 安装时间 | 2026-09-15T10:23:34.014Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=clickhouse-architecture-advisor
SKILL="$HOME/.dsh/skills/$NAME"
PKG="$HOME/project/Magpie-Horch/packages/capabilities/dsh-overseas-skills"

# 备份（回滚就靠它；用 ditto，实测 cp -R 会拍平带资源分支的目录）
ditto "$SKILL" "$SKILL.bak-$(date +%Y%m%d-%H%M%S)"

# 刷新来件后重跑（覆盖安装，含汉译注入）
node "$PKG/scripts/intake-install.mjs" --skills "$NAME" --force
node "$PKG/scripts/verify-fullstack.mjs"

# 回滚
rm -rf "$SKILL" && mv "$SKILL.bak-<时间戳>" "$SKILL"

# 卸载
rm -rf "$SKILL"
```
