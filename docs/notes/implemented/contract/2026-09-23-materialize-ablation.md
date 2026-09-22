# materialize 缺件消融：空目录静默放行的修复与已知边界

关联决策：[ADR-0139](../../../adr/ADR-0139.md)（薄壳 seed 与 materialize 链路）、
[ADR-0014](../../../adr/ADR-0014.md)（判据化与反向自测）

## 续跑更正（2026-09-23）

下文“不修部分缺件、实际概率低、误触无生产影响”不再作为验收结论：
缺入口而目录非空是本次最初复现的实际反例，不能通过改测空目录把原缺陷留作边界。
误执行 CLI 已写入默认 lute-shell profile；此前没有前置快照，无法证明零副作用，
本轮不擅自回滚用户数据。后续故障注入只在隔离输入与目标中执行。
清单级预检修复和验证记录见 [DA-26](../../../../.scratch/review/2026-09-22-arch-health-top20/tasks/DA-26-shell-materialize-ablation.md)。

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

1. **第一轮修复（空目录下界）**：`assertPlan` 对 recursive 条目增加空目录校验，
   报错文案可操作（`run pnpm run build in the owning package`）。
2. **第二轮修复（清单级预检，最终形态）**：用户复审抓回原始反例——非空 lib
   缺 index.js 仍静默放行，空目录校验不覆盖。补 `assertComposedArtifacts`：
   读每个 composed 包 `package.json` 的 `files` 清单，逐项在**写 profile 之前**
   预检（条目为字面量相对路径、无 glob/穿越/控制字符；文件存在且为 regular
   file；realpath 不逃出包目录；落在拷贝计划内）。任一异常 fail-closed 拒绝整次
   物化，报错指明缺失文件与恢复命令。manifest 非法（JSON 坏/缺 files/空数组）
   同样拒绝——不把清单缺失当「无事可验」。
3. **红→绿**：第一轮 10/10；第二轮新增 30+ 用例（恶意清单 9 形态、unsupported
   entries 24 形态、symlink 逃逸、目录代替文件、拷贝计划外、缺件后恢复），
   focused 55/55、全套件 125/125；隔离 CLI 复验原始反例 exit=1
   （profileCreated:false、clientStillExists:true）。

## Alternatives considered

- **只做空目录校验（第一轮方案）**：被用户复审否决——原始反例「非空目录缺入口」
  仍静默放行，等于缺陷原样留在边界外。空目录校验保留为快速路径，清单预检是
  完整性判据的权威面。
- **拷贝后校验产物侧而非源侧**：否决——源侧 assertPlan 是既有的失败前置语义
  （拷之前就报错，不留半成品 profile），清单预检应顺着该语义。
- **把 files 清单对账做成运行时一致性检查（每启动比对）**：否决——启动链路的
  完整性判据放在物化时点即可；每启动比对是另一层防御（对 node_modules 外部
  重同步场景由 profile-files-sync 判据覆盖）。

## Consequences

- 缺件三态全部闭合：整目录缺失 / 空目录 / 非空但缺声明文件——一律 exit=1 可操作
  报错，profile 不被创建或不被改写；失败前置语义（fail-closed before write）保持。
- composed 包 manifest 的 `files` 字段成为物化完整性判据的权威清单：
  新增产物必须登记 `files`，否则拒绝（fail-closed 倾向登记遗漏）；undeclared
  产物不要求存在（源 map 等）。
- `assertPlan` 签名收窄为 `(plan)`（seedDir 参数从未被消费）。
- `scripts/materialize.mjs` 裸跑会物化默认 profile `~/.dsh/profiles/lute-shell`
  （本会话实测误触发一次，无生产影响）——登记不修：脚本语义就是一键物化，
  误触爆炸半径 = 幂等重建薄壳自身 profile。
- 消融基线读数（正常物化 exit=0、三类缺件形态）留档 DA-26 工单，
  可作薄壳故障排查的预期输出模板。
