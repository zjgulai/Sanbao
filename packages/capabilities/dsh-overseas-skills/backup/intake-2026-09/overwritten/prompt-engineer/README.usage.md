# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/prompt-engineer.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

设计与评测 LLM 提示词：选模式（zero-shot、few-shot、CoT）、写带人设与护栏的系统提示词、搭结构化输出 schema，并用测试集与指标衡量效果

要给新应用写提示词，或把现有提示词调准、调省 token 时用它

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 帮我优化这条提示词，并给出评测用例

触发词：提示词设计、prompt 优化、系统提示词、few-shot、提示词评测、结构化输出

**何时不用**：只处理提示词本身的设计、重构与评测，不做模型微调；把已有 agent 指令文件做结构拆分用 agent-md-refactor，写给人或 agent 读的文档用 crafting-effective-readmes / writing-for-agents

### 1.3 内置资源

- `references` —— 6 个文件
- `(根目录)` —— 1 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/prompt-engineer/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/prompt-engineer.zip` |
| SKILL.md 原文 sha256 | `1ab0f43e1c6d91501ffe2d432914b9f2b4462e071f4127c54536c186e36c4b81` |
| 许可证 | MIT（依据：实测 LICENSE 文件或 frontmatter 声明） |
| 入库文件数 | 7 |
| 安装时间 | 2026-09-15T10:23:37.731Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=prompt-engineer
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
