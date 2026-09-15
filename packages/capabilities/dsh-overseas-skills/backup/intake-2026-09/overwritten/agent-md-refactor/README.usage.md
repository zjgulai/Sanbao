# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/agent-md-refactor.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

把臃肿的 AGENTS.md、CLAUDE.md 按渐进式披露重构：找矛盾、留必需、归类、建链接文件结构、标可删除项，把根文件压到 50 行以内

AGENTS.md 越写越长时，把它拆成根文件加若干链接文档

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 我的 CLAUDE.md 太长了，帮我拆分重构

触发词：重构 AGENTS.md、CLAUDE.md 太长、拆分 agent 指令、渐进式披露、指令文件整理

**何时不用**：用在已有指令文件已经臃肿、要做结构拆分时；从零学怎么写 agent 文档用 writing-for-agents，README 这类项目门面文档用 crafting-effective-readmes

### 1.3 内置资源

- `(根目录)` —— 2 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/agent-md-refactor/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/agent-md-refactor.zip` |
| SKILL.md 原文 sha256 | `f20e68b59875ba43cd2680519cf5e77f6c55b51330b927394291f8f11478c21e` |
| 许可证 | MIT（依据：实测 LICENSE 文件或 frontmatter 声明） |
| 入库文件数 | 2 |
| 安装时间 | 2026-09-15T10:23:37.455Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=agent-md-refactor
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
