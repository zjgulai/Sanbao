# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/github-gem-seeker.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

先搜 GitHub 上经久经考验的开源项目而不是自己写，按 stars 与维护度分四级选型并直接解决问题

格式转换、下载、抓取这类成熟问题别自己造轮子

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 帮我把这批 MKV 批量转 MP4，先找现成工具

触发词：找开源方案、GitHub 搜索、别重复造轮子、选开源库、gem seeker

**何时不用**：用于问题通用、开源已有成熟解的场景；需求本身不清晰或属于业务专有逻辑时先澄清需求，装插件与做安装前评估用 dsh-plugin-acquire

### 1.3 内置资源

- `(根目录)` —— 1 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/github-gem-seeker/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/github-gem-seeker.zip` |
| SKILL.md 原文 sha256 | `05042dca5df6d1af0ced96a3212e8e5699b1218021073bf60c060e311e453964` |
| 许可证 | internal-only（依据：无 LICENSE 文件且 frontmatter 未声明） |
| 入库文件数 | 1 |
| 安装时间 | 2026-09-15T10:24:04.442Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=github-gem-seeker
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
