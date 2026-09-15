# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/graphql-architect.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

按领域建模设计 GraphQL schema，覆盖 Apollo Federation 联合图、DataLoader 防 N+1 与订阅安全

设计 GraphQL 接口时，把 N+1 与查询复杂度处理好

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 帮我设计这套 GraphQL schema，要支持联合图

触发词：GraphQL、设计 schema、Apollo Federation、DataLoader、GraphQL 订阅

**何时不用**：REST/OpenAPI 方向的接口契约设计用 api-designer，本技能只覆盖 GraphQL 的 schema 优先范式，不产出 OpenAPI 规范

### 1.3 内置资源

- `references` —— 6 个文件
- `(根目录)` —— 1 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/graphql-architect/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/graphql-architect.zip` |
| SKILL.md 原文 sha256 | `0a4e1eb5f4a3f1e4f127339c781005c91691e5046e48cc3b1de5d7b5b2adb1c8` |
| 许可证 | MIT（依据：实测 LICENSE 文件或 frontmatter 声明） |
| 入库文件数 | 7 |
| 安装时间 | 2026-09-15T10:23:33.293Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=graphql-architect
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
