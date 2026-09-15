# README.usage.md · 本地安装与使用说明

> 本文件由 `dsh-overseas-skills/scripts/intake-install.mjs` 在入库时生成
> （SOP §12.9：AI 全栈线的溯源放这里，不进 frontmatter）。
> 上游 `SKILL.md` 正文经管线注入汉译（`staging/translations/pnpm-upgrade.body.md`），资源文件保真。

---

## 一、使用方法

### 1.1 它是什么

按九步升级 pnpm 工具链：查 registry 版本与完整性、预检 CI 引导路径、对齐 packageManager

要升 pnpm 版本并同步 CI 固定版本时按它走

### 1.2 怎么触发

在任意会话直接说人话，模型按 `SKILL.md` 自动路由。例如：

> 把仓库的 pnpm 升到最新版，CI 也一起更新

触发词：pnpm 升级、pnpm self-update、packageManager、action-setup、CI 版本固定

**何时不用**：只升级 pnpm 这一条工具链本身（查版本、预检、对齐 packageManager、重钉 CI）；普通依赖的升级与审计用 dependency-updater，向外部仓库贡献代码用 make-repo-contribution

### 1.3 内置资源

- `(根目录)` —— 1 个文件
- `agents` —— 1 个文件
- `scripts` —— 1 个文件

---

## 二、安装事实（本机）

| 项 | 值 |
| --- | --- |
| 安装位置 | `~/.dsh/skills/pnpm-upgrade/` |
| 来源批次 | `manus` |
| 原始单元 | `/Users/lute/Downloads/skills/Manus/skill02/pnpm-upgrade.zip` |
| SKILL.md 原文 sha256 | `643c80f3c7680fff1061eeff9382132313909871ed85b9399907ca09c219e4c8` |
| 许可证 | internal-only（依据：无 LICENSE 文件且 frontmatter 未声明） |
| 入库文件数 | 3 |
| 安装时间 | 2026-09-15T10:24:02.781Z |

---

## 三、更新与回滚

技能目录**不含 `.git`**（SOP §12.2：入库必然改写 frontmatter），升级走重跑管线：

```bash
NAME=pnpm-upgrade
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
