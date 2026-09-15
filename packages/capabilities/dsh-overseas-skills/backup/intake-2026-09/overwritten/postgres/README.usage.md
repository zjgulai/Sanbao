# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/postgres.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

按主题索引 PostgreSQL 的 schema 设计、索引优化、MVCC/VACUUM、WAL、复制、备份恢复与 PgBouncer 配置参考

在 Postgres 上碰到慢查询、连接打满或要调参时查它

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 这个 Postgres 查询很慢，帮我看看索引和连接池

触发词：PostgreSQL、Postgres、慢查询、索引优化、连接池、VACUUM

**何时不用**：管「某个 Postgres 实例的运维与调优」；写 SQL 语句本身、跨 Snowflake/BigQuery 等方言的查询用 sql-queries，数仓内的分层建模与增量刷新用 dbt-transformation-patterns

### 1.3 内置资源

- `references` —— 22 个文件
- `(根目录)` —— 1 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/postgres/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/postgres.zip` |
| SKILL.md 原文 sha256 | `f64f17253d3b74da106027701fc2f0ea385d4cdaf28ff80115265b9fd307c358` |
| 许可证 | MIT（依据：实测 LICENSE 文件或 frontmatter 声明） |
| 入库文件数 | 23 |
| 安装时间 | 2026-09-15T10:23:35.829Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=postgres
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
