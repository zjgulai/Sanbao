# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/langchain-architecture.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

用 LangChain 与 LangGraph 设计 LLM 应用：状态图、记忆、工具集成与测试策略

搭 LangChain/LangGraph 应用时把 agent 状态设计对

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 用 LangGraph 帮我设计带记忆的 agent 架构

触发词：LangChain、LangGraph、AI agent、LLM 工作流、对话记忆、工具调用

**何时不用**：不用 LangChain/LangGraph 的 LLM 应用架构不在本技能范围；它给的是这两个框架的落地范式，不是通用的 agent 设计方法论

### 1.3 内置资源

- `(根目录)` —— 1 个文件
- `references` —— 1 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/langchain-architecture/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/langchain-architecture.zip` |
| SKILL.md 原文 sha256 | `0c8dcec1d171a00467eda176a0716866c5bf6c9e86fd0830a74dcabd626bc06a` |
| 许可证 | internal-only（依据：无 LICENSE 文件且 frontmatter 未声明） |
| 入库文件数 | 2 |
| 安装时间 | 2026-09-15T10:23:34.219Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=langchain-architecture
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
