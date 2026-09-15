# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/markdown-to-html.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

把 Markdown 文档转成 HTML：给出 marked、pandoc、gomarkdown 三条工具链的用法与配置，以及 Jekyll、Hugo 模板系统的转换路径与安全注意项

要写 md 转 html 的脚本或接静态站点模板时，照它选工具

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 把这批 md 文件转成 html，给我一个脚本

触发词：markdown 转 html、md 转 html、渲染 markdown、静态站点模板、pandoc、hugo

**何时不用**：只做 Markdown → HTML 的转换、渲染与模板接入，不负责 Markdown 文档写什么：写文档本身用 markdown-mermaid-writing，要出印刷级 PDF 用 minimax-pdf

### 1.3 内置资源

- `references` —— 15 个文件
- `(根目录)` —— 1 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/markdown-to-html/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/markdown-to-html.zip` |
| SKILL.md 原文 sha256 | `a51376b7c8e88e009c60f20af5b9c1157d4e5c3b40dd62f43abc0e873381e0e4` |
| 许可证 | internal-only（依据：无 LICENSE 文件且 frontmatter 未声明） |
| 入库文件数 | 16 |
| 安装时间 | 2026-09-15T10:23:36.675Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=markdown-to-html
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
