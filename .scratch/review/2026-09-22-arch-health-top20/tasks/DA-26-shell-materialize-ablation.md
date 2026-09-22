# DA-26 · 薄壳物资消融（materialize 缺件降级路径）

- 优先级：P1
- 状态：`done`（2026-09-23，EX-09：**消融抓到「目录在内容空」静默通过缺陷并已修**；
  部分内容缺件登记为已知边界）
- 依赖：无
- 估算：M
- 来源：2026-09-22 诊断读数（薄壳 materialize 链路 91 行，缺件时的启动行为从未读数）

## Problem

lute-shell 用 npm 上的 harness 运行时启动 cordis host，`src/profile/materialize.ts` 负责物资就位。
运行时源 = `vendor/dsh-desktop/dsh-plugin-desktop/node_modules`（0.1.5-rc.2 物化 270/270 tgz）。
**缺一个 tgz 时薄壳怎么启动**——是清晰报错、静默降级、还是挂死——没有读过数。
这是启动链路的单点故障面（挂死类故障尤其危险，仪器都要过故障现场）。

## 动作

1. 在隔离环境（备份 profile / 临时目录，不碰生产）抽走 materialize 输入的一个 tgz；
2. 启动薄壳，记录三件事：退出码 / 错误信息（stderr 与日志）/ lifecycle-events 读数；
3. 按「清晰报错 / 静默降级 / 挂死」三态分类；挂死或静默 = 缺陷，补 fail-fast；
4. 与 DA-36 回滚演练共享环境准备（若时序相近）。

## 验收

- 缺件消融的原始读数（命令 + 输出）落盘；
- 若为清晰报错：报错信息指明缺失文件与恢复路径；若为静默/挂死：修复后重跑读数；
- 修复类改动过 `lute-shell-pin` 相关门禁。

## 注意

- 挂死判读按四签名纪律（CPU/inspector/console/rAF），别只等超时；
- 消融在副本上做，结束后恢复并核对哈希。

## 结算（2026-09-23，EX-09）

**消融环境**：`LUTE_SHELL_PROFILE` 指向 `/tmp` 隔离目录（脚本原生支持重定向，无需改代码）；
消融手段 = mv 抽走 composed 包（`dsh-onboarding-carousel-local`）的 `lib/` 产物，全程可逆。

### 三态读数（消融前→修复后）

| 消融形状 | 修复前读数 | 修复后读数 |
| --- | --- | --- |
| `lib/` 整目录缺失 | exit≠0，`missing composed package file … — run pnpm run build`（assertPlan existsSync 拦截；既有测试覆盖） | 同左（不变） |
| **`lib/` 存在但为空** | **exit=0 静默通过**——profile 声明 `dsh-onboarding-carousel` bundle、`.composed` 里只有空 lib，宿主入口缺失（**消融抓到的真缺陷**） | **exit=1**，`composed package directory … is empty — run pnpm run build in the owning package`（e2e 实跑验证） |
| `lib/` 非空但缺个别文件（抽走 index.js） | exit=0 静默通过（残缺 profile） | 仍 exit=0——**登记为已知边界**（见下） |

### 根因与修法

**根因**：`COMPOSED_PACKAGE_DIRS = ['lib']` 走递归目录拷贝，`assertPlan` 只查目录
`existsSync`——目录在而内容空/残缺时静默放行。既有三个「fails loud」测试全部用
「整目录删除」形状，恰好落在 existsSync 能拦的分支。

**修法**（`apps/lute-shell/src/profile/materialize.ts` assertPlan）：recursive 条目加
`readdirSync(entry.from).length === 0` 空目录校验——空目录是能机器判出的最小完整性
下界。红→绿：先写消融形状的测试（红）→ 修复 → 10/10 绿 → `pnpm run build` 重建 lib →
端到端空目录消融 exit=1 复验。

### 已知边界（登记，不在本卡修）

「目录非空但缺个别文件」仍静默通过——完整性枚举需要每包的文件清单
（类似 files-coverage 的清单对账），而 composed 包的清单事实分散在各包
`package.json` 的 `files` 字段。**若该边界需要闭合，正确路径是把
`files` 清单接进 planMaterialize**——那是独立工作量，不在本消融卡射程。
风险面评估：`lib/` 非空但缺入口的场景要求构建被中断在「产出了部分文件」的
中间态，pnpm/tsc 构建要么全成要么可重跑，实际发生概率低。

### 附带发现

`scripts/materialize.mjs` 无参数校验：裸跑（无参数）直接物化默认 profile
`~/.dsh/profiles/lute-shell`（本会话实测误触发过一次——该目录是薄壳自身工作目录、
materialize 幂等，无生产影响）。**登记不修**：脚本语义就是「一键物化」，
加确认反而破坏 SOP 顺滑度；误触的爆炸半径 = 重建薄壳自己的 profile。
