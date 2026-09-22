# materialize 缺件消融：空目录静默放行的修复与已知边界

关联决策：[ADR-0139](../../../adr/ADR-0139.md)（薄壳 seed 与 materialize 链路）、
[ADR-0014](../../../adr/ADR-0014.md)（判据化与反向自测）

## Problem

DA-26 工单立项时的疑问：materialize 输入缺一个产物时薄壳怎么启动——清晰报错、
静默降级、还是挂死？2026-09-23 在 `/tmp` 隔离 profile 上做端到端消融
（`LUTE_SHELL_PROFILE` 重定向 + mv 抽走 composed 包 `lib/` 产物），三态读数：

- 整目录缺失：清晰报错（assertPlan existsSync 拦截，既有测试覆盖）✓
- **`lib/` 存在但为空：exit=0 静默通过**——profile 声明 `dsh-onboarding-carousel`
  bundle、`.composed` 里只有空 lib，宿主入口缺失。工单预言的最危险形态实锤。
- `lib/` 非空但缺个别文件：同样静默通过（登记为边界，见后）。

**根因**：composed 包走递归目录拷贝（`COMPOSED_PACKAGE_DIRS = ['lib']`），
`assertPlan` 只查目录 `existsSync`——目录在而内容空时放行。既有三个「fails loud」
测试全部用「整目录删除」形状，恰好落在能拦的分支；空目录/残缺形状零覆盖。

## Decision

1. **修复**：`assertPlan` 对 recursive 条目增加 `readdirSync(entry.from).length === 0`
   空目录校验——空目录是能机器判出的**最小完整性下界**。报错文案可操作
   （`run pnpm run build in the owning package`）。
2. **红→绿**：先写消融形状的测试（空 lib 目录 → 红）→ 修复 → 10/10 绿 →
   重建 lib → 端到端复验（空目录消融 exit=1、报错文案正确）。
3. **已知边界登记**（不修）：「目录非空但缺个别文件」仍静默通过。完整性枚举需要
   把各包 `package.json` 的 `files` 清单接进 `planMaterialize`——独立工作量，不在
   消融卡射程。风险面：该场景要求构建被中断在「产出了部分文件」的中间态，
   pnpm/tsc 要么全成要么可重跑，实际概率低。

## Alternatives considered

- **把 files 清单对账一并做掉**：否决——超出消融卡射程，且需要逐包核对清单事实，
  应独立立项（若未来要做，接入点是 `planMaterialize` 的 composed 展开）。
- **拷贝后校验产物侧而非源侧**：否决——源侧 assertPlan 是既有的失败前置语义
  （拷之前就报错，不留半成品 profile），修复应顺着该语义。

## Consequences

- 空目录形状从静默放行变为 exit=1 可操作报错；薄壳物资缺件三态里两态清晰、
  一态登记边界。
- `scripts/materialize.mjs` 裸跑会物化默认 profile `~/.dsh/profiles/lute-shell`
  （本会话实测误触发一次，无生产影响）——登记不修：脚本语义就是一键物化，
  误触爆炸半径 = 幂等重建薄壳自身 profile。
- 消融基线读数（正常物化 exit=0、三类缺件形态）留档 DA-26 工单，
  可作薄壳故障排查的预期输出模板。
