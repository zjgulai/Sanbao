# 基座解耦与一键更新架构设计

> 日期：2026-09-19
> 状态：待用户审阅
> 决策者：用户（lute）+ agent（brainstorming 五题收敛）
> 关联 ADR：ADR-0006（观察窗）、ADR-0008（submodule 参照系）——本设计落地后将取代两者的执行机制，ADR 本身需 supersede

## 1. 问题陈述

LUTE Agentic System 当前基于 `anywhere-labs/dsh-desktop`（Electron 桌面壳）的 fork 构建，壳内嵌 `deepseek-ai/deepseek-harness` 作为 submodule 提供 AI 运行时。每次上游版本迭代（约每月 1-2 次），LUTE 需要：

- 重锚 38 个补丁（12 个壳层 + ~15 个运行时层 + 品牌/判定项）
- 迁移 15+ 处脚本硬编码路径
- 全量 verify + smoke 矩阵

单次迁移耗时 2-4 周，年累计 8-24 周。根因：LUTE 的产品代码与上游壳层的**打包实现细节**（ASAR/no-ASAR、chunk 哈希文件名、dist 路径常量）深度耦合。

用户的核心诉求：**只要 deepseek-harness 的 AI 运行时核心能力，不要其桌面壳的实现细节**；上游更新时做到「一键」或接近一键。

## 2. 决策摘要（五题）

| # | 决策点 | 选择 |
|---|---|---|
| 1 | 宿主层归属 | **自建薄壳**：LUTE 拥有 `apps/lute-shell/`，彻底脱离 `anywhere-labs/dsh-desktop` |
| 2 | 运行时消费方式 | **npm 版本依赖**（`@deepseek-ai/dsh-*`）+ git submodule 只读参照 |
| 3 | 迁移路径 | **渐进式绞杀（Strangler Fig）**：新旧壳并存，逐期迁移，P5 才退役旧壳 |
| 4 | 补丁归宿 | **组合策略**：pnpm patch 为底线 + bug fix 争取上游化 + UI 增强插件化 |
| 5 | 薄壳起点 | **先 Spike 验证 npm 可行性，通过后以 harness `apps/desktop` 为种子 fork** |

## 3. 目标架构（终态）

```
LUTE Agentic System 仓库
├── apps/lute-shell/           ← 你拥有的 Electron 薄壳
│   ├── main.ts                  窗口/菜单/TCC/生命周期
│   ├── preload.ts               contextBridge
│   ├── recovery/                恢复模式
│   ├── packaging/               DMG/签名/公证
│   └── brand/                   品牌资产
├── packages/<能力组>/<包>/    ← 19+ LUTE 插件（cordis plugin API，不变）
├── patches/                   ← ~8 个 pnpm patch 文件
├── shared/client/             ← 跨插件共享层
├── scripts/gates/             ← 门禁体系
├── vendor/deepseek-harness/   ← submodule，只读参照（不参与构建）
├── docs/                      ← ADR/notes/research
└── package.json               ← npm 依赖声明（@deepseek-ai/dsh-*、cordis、electron）
    pnpm-lock.yaml             ← 版本锁（即 pin）
    pnpm.patchedDependencies   ← patch 注册
```

关键变化 vs 现状：

| 维度 | 现在 | 目标 |
|---|---|---|
| 壳层归属 | fork `anywhere-labs/dsh-desktop`，补丁改 dist | 自有 `apps/lute-shell/`，壳层代码 100% LUTE 的 |
| 运行时来源 | 壳内嵌 tgz 物化 | npm 依赖（package.json 声明版本） |
| 补丁机制 | 38 锚点手工重锚（哈希文件名+行号） | ~8 个 pnpm patch（精确到行的 git diff，冲突自动报错） |
| 更新动作 | 2-4 周人工迁移 | `pnpm update` → 门禁 → 修冲突 patch → 完事 |
| 壳层补丁 | 12 个 | 0 个（壳是自有源码） |
| 插件兼容 | cordis plugin API + profile | 不变（薄壳实现同一套 cordis host 接口） |

## 4. Spike 验证（P0，1-2 天）

在仓库外独立目录验证 4 个前提：

| # | 前提 | 验证方法 | 通过判据 | 失败退路 |
|---|---|---|---|---|
| 1 | `@deepseek-ai/dsh-*` 可从 npm 安装 | `npm view` + `pnpm add` | 能拉到 ≥0.1.5-rc.2 | 退回 submodule 源码构建 |
| 2 | host/boot 包可脱离 dsh-desktop 独立启动 | ~50 行 main.ts boot cordis | 进程不崩、root 启动 | 从 harness `apps/desktop-host` 提取 boot 序列 |
| 3 | 一个现有 LUTE 插件能被新宿主加载 | spike profile 声明 `dsh-theme-local` | 插件 loaded+activated | 记录缺失服务清单，薄壳补等价实现 |
| 4 | pnpm patch 能正确应用到 harness 包 | `pnpm patch @deepseek-ai/dsh-llm` → 改一行 → 重装 | 改动生效 | 退回 postinstall 脚本重放 |

产出：`docs/research/17-thin-shell-spike.md`（四项 PASS/FAIL + 证据）。

Spike 不做：不建 Electron 窗口、不做品牌/打包、不迁移全部插件、不改现有仓库。

## 5. 迁移分期（P0-P5，~5-7 周）

| 期 | 目标 | 里程碑 | 旧壳状态 |
|---|---|---|---|
| P0 | Spike 验证 | 四项 PASS | 不动 |
| P1 | 薄壳骨架 | 新壳 boot + 显示 harness 默认 UI + 空 profile 正常 | 继续出货 |
| P2 | 插件逐个迁移 | 19 个插件在新壳 loaded+activated+冒烟通过 | 继续出货 |
| P3 | 运行时补丁迁移 | pnpm patch 全部自动应用 + 全功能正常 | 继续出货 |
| P4 | 打包出货 | 新壳 DMG 可安装、全功能、与旧壳等价 | 继续出货（新壳为候选） |
| P5 | 旧壳退役 | 门禁全绿无旧壳校验 + 客户收到新壳 DMG | 删除 |

约束：
- 插件源码不改（P2）：新旧壳共用 `packages/`，差异只在 profile 和宿主服务。
- 门禁跟着走：每期结束门禁全绿；P1-P4 双轨覆盖。
- 客户无感：P5 前客户用旧壳 DMG；P5 做版本跳跃（2.5.x → 3.0.0）。
- 回滚点：P5 前任何一期失败可退回旧壳继续出货。

## 6. 一键更新机制（P5 后的日常）

### 正常路径（无 patch 冲突）

```bash
pnpm update @deepseek-ai/dsh-*
pnpm run gate
git add pnpm-lock.yaml && git commit -m "chore(deps): harness <version>"
pnpm run release
```

耗时：~15 分钟（门禁时间）。

### 有 patch 冲突时

pnpm 报精确冲突（`ERR_PNPM_PATCH_NOT_APPLIED`，点名文件+行号）→ `pnpm patch <pkg>` 进入编辑 → 修冲突行 → `pnpm patch-commit` → `pnpm run gate`。

每个冲突 patch ~30 分钟；通常 1-3 个冲突。

### 门禁新增

| 门禁名 | 校验 |
|---|---|
| `patch-applies-clean` | `pnpm install` 后所有 patchedDependencies 成功应用 |
| `harness-version-pin` | lockfile 中 `@deepseek-ai/dsh-*` 版本与 package.json 一致 |
| `submodule-ref-sync` | vendor/deepseek-harness HEAD 与运行时版本对应 tag 一致 |

### ADR-0006 观察窗适配

策略不变（2 周观察 + 红线触发），执行成本从「2-4 周迁移」降到「`pnpm update` + 门禁 + 可能修 1-3 个 patch」。红线安全修复当天可完成 update + 验证 + 出货。

## 7. 所有权边界

### 第三层：100% LUTE 的（上游更新零影响）

- `apps/lute-shell/`（Electron 壳全部）
- `packages/` 下所有 LUTE 插件
- `shared/client/`（跨插件共享层）
- `scripts/gates/`（门禁体系）
- `docs/`、ADR、notes
- `packaging/`（DMG/签名/公证/出货）
- profile 配置

### 第二层：LUTE 拥有但有上游参照（选择性对齐）

- `patches/*.patch`（~8 个 pnpm patch）
- `vendor/deepseek-harness/`（submodule 只读参照）
- cordis.patch.yml / profile 声明

### 第一层：100% 上游的（只消费不改）

- `@deepseek-ai/dsh-host`、`dsh-boot`、`dsh-llm`、`dsh-client-*`、`dsh-skill`、`dsh-tool-*`、`dsh-session-*`、`dsh-credentials`、`dsh-fs`、`dsh-mcp-*`
- cordis / cordis-plugin-loader / schemastery
- electron（版本由壳 package.json 锁定）

### 现有 38 补丁归宿

- ~20 个 → 第三层（退役，写进壳源码）
- ~8 个 → 第二层（pnpm patch）
- ~3 个 → 消失（上游已修/将修）
- ~7 个 → 插件化（变成正常功能代码）

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `@deepseek-ai/dsh-*` 未发布到 npm | 中 | 方案退回 submodule 源码构建 | P0 Spike 第一项验证；退路明确 |
| harness boot API 强依赖 dsh-desktop 壳上下文 | 低-中 | P1 工作量增加 | Spike #2 验证；退路是从 `apps/desktop-host` 提取 |
| 上游大改包名/导出（如 PTC→ptc-runtime） | 中 | pnpm patch 大面积冲突 | 观察窗（ADR-0006）缓冲；冲突是精确报错不是静默失败 |
| 迁移期间双轨维护成本 | 确定 | CI 时间翻倍、磁盘增加 | P5 前有限期（~5 周）；P5 后单轨 |
| 客户升级路径（旧壳→新壳） | 低 | 数据迁移 | profile/会话数据格式由 harness 运行时管理，壳无关；P4 时验证旧 profile 在新壳可加载 |

## 9. 成功标准

1. P5 后，上游发新版到 LUTE 出货 ≤ 1 天（无 patch 冲突时 ≤ 1 小时）
2. 壳层补丁数量 = 0
3. 运行时补丁 ≤ 10 个，全部为 pnpm patch（精确冲突检测）
4. `pnpm run gate` 一条命令覆盖全部校验（无额外 verify-patches 脚本）
5. 19+ 插件包源码无需因壳层变更而修改
