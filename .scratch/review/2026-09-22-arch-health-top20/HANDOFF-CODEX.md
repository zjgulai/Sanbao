# DA-25 事故后恢复 — Codex 会话交接（下次打开先读这份）

> 整理日期：2026-09-23
> 目的：接续剩余恢复与隔离消融工作，不重新执行已经完成的生产恢复。
> 当前工作稿：[DA-25 工单](tasks/DA-25-capability-ablation-matrix.md)。本文是交接入口；详细读数和事故定性以该工单为准。

## 1. 任务是什么

项目是 Sanbao / DSH Desktop 二开平台。DA-25 原目标是按能力组做含宿主启动、判据与 UI 降级的重版消融矩阵；此前执行脚本误删生产 profile，任务转入事故恢复。

本轮已完成用户单独授权的**最小生产恢复**，不是完成 DA-25 消融，也不是证明全部状态回到事故前。Codex 应先确认现场没有漂移，再与用户选择剩余事项；不要从旧脚本或旧交接断点重新恢复一遍。

- 工作仓库：`~/project/Magpie-Horch`，分支 `main`，远端 `origin` 为 `https://github.com/zjgulai/Sanbao`。
- 续接来源：会话 `616a2690-6fc7-4bfb-b567-251b176680d2`；本轮会话 `687af8f8-72fd-4a1b-aaca-a244ca99169b`。
- 本轮开始时 HEAD：`48bad33`；本文件所在提交是后续交接边界，不在文档内循环写自己的 commit hash。
- Git 只交付本文件与本批 `MASTER-TODO.md`、`EXECUTION-TODO.md`、DA-25 工单，**不包含生产 profile、备份、凭据或原始截图**。

## 2. 必须遵守的约束

1. 先读仓库 [AGENTS.md](../../../AGENTS.md) 和 [复发故障总账](../../../docs/pitfalls-playbook.md)，不得改 pin 的基座或直接在生产 profile 上做消融。
2. **禁止交换、移走、删除生产 `desktop` 目录。** `/tmp/da25-round.sh` 是事故脚本；本轮 `apply-minimal.mjs` 是已执行的一次性恢复程序，也不是可重跑的安装器。
3. 本轮已用完的授权仅限最小恢复、备份、停机/重启与验收。下一轮安装依赖、改锁文件、恢复 MCP、改构建权限、再次重启、创建测试账户/虚拟机都须先与用户确认；本次提交推送授权不自动扩大到 Codex 的未来改动。
4. 保持 `mcp-jev`、koffi、全局设置与锁文件现状；**不要为了让清单对齐而直接跑 `pnpm install`**。
5. 同一工作树有其他会话在制品。不要 `git add .`、清理未跟踪文件、整体 stash 或覆盖他人内容。只提交自己明确核验的文件/hunks。
6. 门禁运行期间不写工作树，尤其 full 的并发见证阶段；失败按原始诊断归因，不预判为环境问题、不放宽门槛。
7. 报告“已恢复”必须明确是清单、包体、启动还是功能；启动 healthy 不能替代 UI，Node 假树通过不能替代 Electron/操作系统隔离。

## 3. 依据材料

| 材料 | 路径/说明 | 本任务里怎么用 |
| --- | --- | --- |
| 唯一事故与恢复台账 | [DA-25](tasks/DA-25-capability-ablation-matrix.md) | 根因勘误、恢复对账、实机验证、隔离限制 |
| 执行入口 | [EXECUTION-TODO](EXECUTION-TODO.md)、[MASTER-TODO](MASTER-TODO.md) | EX-04 / DA-25 保持 open；其他工单先读自身证据，不凭汇总推断 |
| 批次规格 | [第二批规格](../../../docs/specs/2026-09-22-arch-health-top20-batch2.md) | 原消融目标与范围 |
| 判活唯一入口 | [dsh-running.sh](../../../packaging/scripts/dsh-running.sh) | 0=在跑，1=不在跑，4=不可判；不可把 4 当成停机 |
| 装载点只读核对 | [sync-profile.mjs](../../../scripts/sync-profile.mjs) | 只用 `--check --loadpoint` 起手；射程来自当前声明，不证明历史包体 |
| 生产应用与数据 | `/Applications/DSH Desktop.app`；`~/Library/Application Support/Sanbao`；`~/.dsh/profiles/desktop` | App 名仍为 DSH Desktop.app；活跃 userData 是 Sanbao，不读旧同名迁移备份当现场 |
| 持久备份根 | `~/project/Magpie-Horch-backups/da25-minimal-restore-20260923-xnm80gog/` | 下表区分各副本，绝不能整棵无审查覆盖生产 |
| 交付门禁证据目录 | `/private/tmp/sanbao-da25-handoff-f6f7_7ql/` | 本次提交/推送时产生的命令输出与退出码；不存在时不能补造通过记录 |

### 备份根内各目录的含义

| 名称 | 是什么 | 不是什么 |
| --- | --- | --- |
| `profile/` + `backup-verification.json` | 本轮最小恢复**之前**的完整停机备份：22,783 个普通文件、694,166,978 字节，逐文件哈希/类型/权限/链接目标核对通过且 inode 独立 | 不是事故前完整 profile；其中仍是最小恢复前缺两个包、多旧右栏的组合 |
| `health-slot-2/`、`health-slot-3/` | 事故前 12:16 / 12:18 的健康配置快照；清单均为 41/42，元数据与内容哈希已核验 | 没有事故前完整 node_modules/vendor 包体，不保证历史锁文件正确 |
| `preincident-evidence/` | 上一会话的只读对账及选择器测试记录 | 部分早期报告已被后续证据勘误，不取旧结论覆盖工单 |
| `final-evidence/` + `final-evidence-sha256.json` | 本轮审计、候选、真实恢复、UI、两次启动、最终持久性检查的完整留存 | 不要因里面有脚本就直接执行；可能包含本机配置、命令参数或会话截图，仅本机读取，禁止上传/入库 |

优先读 `final-evidence/production-final-verification.json`、`production-file-verification.json`、
`production-apply.json`、`ui-acceptance.json`、`startup-debug-run.json`、`startup-normal-run.json`。
旧临时原目录是 `/private/tmp/sanbao-da25-resume-i76tl2yc/`，已复制到持久备份，续跑优先用持久副本。
更早的 20 用例换入/恢复原型在 `/private/tmp/sanbao-da25-rehearsal-zyqb25lw/`，**仅假树实验，不准据此放行生产交换**。

## 4. 当前进度

### 已完成的最小恢复

- 补回 `dsh-capability-hub-local` 与 `dsh-qoder-sidebar-local` 的 vendor 和 node_modules 两处，各包分别 17、20 文件，共新增 74 文件、16 目录。
- 最后原子替换 profile `package.json`，恢复事故前声明及 bundle 顺序：**41 依赖 / 42 bundles**；SHA-256 为 `bb163f7d18971a8f55fa3cc55a3cd511cbaf2699dbff290899aabbbc63585162`。
- 旧 `dsh-better-sidebar` 从声明与 bundles 移除，**包体未删除**。两次启动后清单与 74 文件哈希仍一致。
- 修改后启动前全 profile 对账：既有文件仅 `package.json` 变化，没有删除；锁、workspace、profile patch、market state、全局 settings/patch 六条路径保持不变。
- 未运行安装、未改 app bundle、未重签。客户端两个 bundle 只依赖已存在的 React 模块；最初对 `react-dom` 的裸解析失败不是必须安装的结论，真实 bundle 不引用它。

### 已验证的层级

| 层级 | 证据结论 |
| --- | --- |
| 假树 | 命名 profile 导出选择器 10/10；恢复程序正常、清单漂移拒绝、目标占用拒绝三例通过；不等同 GUI 隔离 |
| 文件 | 当前 27 个本地装载点契约通过；事故前 14 个 npm 依赖的已装版本满足声明范围；不证明传递依赖或历史字节完全一致 |
| 启动 | 临时 CDP 启动 healthy：12,808.996 ms；普通启动 healthy：11,524.838 ms；各有一个 renderer.boot.started |
| UI | Cmd+K 打开能力中枢并获焦，观察到 42 个结果；无匹配搜索为 0；Esc 关闭。既有会话右栏出现活动、环境信息与产出，writer=`official`；没有发送消息或执行能力 |
| 收尾 | 正常启动时 main/两个 Renderer 的单次 CPU 采样为 0.0%；临时 loopback CDP 9333 已关闭；应用留在普通运行态 |
| 诚实边界 | 未读到健康上报内部 `attempt=1` 文本；日志窗口未匹配 watchdog/renderer 故障，但不把单次采样当长期稳定性 |

恢复实施阶段只运行上述针对性检查和文档链接/差异检查，没有以旧 full 结果代替新交付门禁。
本次用户要求的提交、推送在交付阶段执行，最终以 Git 与交付目录中的真实报告为准；
Codex 起手用 `git log -3 --oneline`、`git status --short`、`git rev-list --left-right --count origin/main...HEAD` 核对，不把本文件存在当作已推送证明。

## 5. 已拍板的事实

- DA-25 仍走重版，但生产恢复不能被消融任务继续破坏；本轮只结算最小恢复。
- 事故根因已确认的是恢复后继续执行、缺少终止状态导致再次删除原目录；**“ERR 递归已定论”已撤回**，最初触发命令缺乏证据。
- “只缺一个未知包”已撤回，真实差异是少两个本地包、多一个旧右栏，外加顺序及配置/锁差异。
- 命名 profile 选择器确实存在；**“没有选择器所以只能交换 desktop”已撤回**。
- 命名 profile 只隔离组合，不隔离 HOME、凭据、全局缓存、userData、renderer 分区或单实例行为；只传 `DSH_HOME`/`HOME`/`--user-data-dir` 不构成完整保护。
- 事故前锁文件本来就滞后，历史 koffi 值是 `set this to true or false`，不是可恢复的布尔权限策略。

## 6. 待确认 / 未完成

| 序号 | 事项 | 谁提供 | 用在哪 |
| --- | --- | --- | --- |
| 1 | `mcp-jev` 挂载缺失 | Codex 只读核对保存配置、真实命令目标及所需凭据；用户确认重新启用范围 | 不要把配置原文、命令参数、密钥贴入 Git；用户批准后再恢复/验收 |
| 2 | 当前锁仍落后于 41 项声明，缺能力中枢、新右栏及 updater；锁内旧右栏仍在 | Codex 提供隔离副本重解计划与预期差异；用户确认安装/改锁 | 不直接覆盖事故前旧锁、不在生产执行“自动修好” |
| 3 | 更新器 fresh feed-unreadable / HTTP 404 | Codex 从只读配置/源码/发布事实查 URL 与产物，发布变更另获授权 | 不声称更新器恢复完成，不修改远端发布面来绕过问题 |
| 4 | pixpix / shopify 连接告警 | Codex 判断是否需本轮处理；用户决定认证/配置调整 | 未修，不能与 renderer 启动因果混为一谈 |
| 5 | 隔离环境与 DA-25 实机矩阵 | 用户选择已有可丢弃 VM 或经验证的独立受限用户环境；Codex 提供 containment 验证证据 | 不挂生产目录/凭据，先验文件访问、IPC、子进程与出网边界，再启动测试 GUI |
| 6 | DA-36 旧版回滚演练 | 用户确认独立目标环境；Codex 执行既有工单 | 仍未执行，不在本机真实 HOME 下直接启动旧 app |
| 7 | 更广泛事故前包体一致性、健康上报 attempt 与长期稳定性 | 需要新的可验证基线/采样，Codex 说明缺口 | 不通过扩大“已恢复”的说法关单 |

## 7. 下一场会话建议

建议把本文件直接交给 Codex，并附一句：

> 先读此交接和 DA-25 工单，只读核对现场与备份，报告最小恢复是否仍保持；不要重跑恢复脚本，不安装依赖、不改锁/MCP、不重启应用，先给剩余事项的下一步及需我确认的边界。

起手只读检查（本机路径存在才执行，未安装环境不能冒充通过）：

```bash
git status --short
git log -3 --oneline
git rev-list --left-right --count origin/main...HEAD
bash packaging/scripts/dsh-running.sh --app "/Applications/DSH Desktop.app"
node scripts/sync-profile.mjs --check --loadpoint --profile "$HOME/.dsh/profiles/desktop"
shasum -a 256 "$HOME/.dsh/profiles/desktop/package.json"
```

生命周期按 `runId` 和时间读取，不要沿用旧字节偏移：启动文件会重写/轮换，本轮曾因此误报“没有新记录”。
先完成残余方案决策，再决定是否处理 MCP/锁/更新器，不能自行创建 VM 或账户来消除用户决策。
若 Codex 不在这台机器上，只能读 Git 文档；上述本机证据不可得就明确标记，不索要整包带秘密的备份。

## 8. 禁止事项

1. 不执行 `/tmp/da25-round.sh`，不把新假树恢复脚本用于消融，不整棵恢复 `profile/` 备份。
2. 不运行生产 `pnpm install`、不改 `allowBuilds`、不恢复 MCP 子进程，除非新授权明确覆盖该动作。
3. 不放宽 watchdog、不把重试后成功当成问题根除，不改 AGENTS、权限、pin、远端或 CI 来绕过约束。
4. 不上传 `health-slot-*`、`final-evidence`、生产配置、截图或 credentials；Git 只留脱敏结论和本机证据指针。
5. 不把本轮关闭临时 CDP 的动作反过来改成长期开放端口；需要再次开启和重启时重新确认。
6. 不将最小恢复完成标成 DA-25 / DA-36 done；不清理他人的未跟踪内容或停掉无关进程。

## 9. 用户要记住的原话

无额外长期记忆请求；本文件仅用于该任务交接，不写入跨项目记忆。
