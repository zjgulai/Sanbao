# DA-25 · 能力组消融矩阵（重版：含宿主启动 + UI 降级实机验证）

- 优先级：**P0**
- 状态：`open`
- 依赖：与 DA-34 同批执行（共享 CDP + 窗口可见会话，用户 2026-09-22 拍板走重版）
- 估算：L
- 来源：用户 2026-09-22 需求（消融测试检查框架可拓展性/稳定性/高效性、卡位是否正确）

## Problem

「插件隔离成立」是薄壳骨架的核心假设：单个二开包缺失/摘除时，宿主与其余能力应正常工作。
该假设从未被系统性消融验证——每次包摘除的教训都是事故现场才发现（如「功能静默不生效 + 日志一句 warn」
的 file: 缺件症状）。

消融统一判据（MASTER-TODO §1）：每个消融都要有**两问答案**——系统怎么降级（稳定性）、
哪个判据变红（可证明）。只有降级没有红灯 = P-02 复发。

## 动作

1. **选样**（M 轮消融，不追求 29 包全量）：
   - 每能力组至少 1 包（capabilities/surfaces/platform/contract/infra）；
   - 叠加热点：右栏（dsh-qoder-sidebar-local，宽度依赖官方能力探测）、主题（dsh-theme-local，
     全页三主题的公共依赖面）、新应用抽屉（可选服务消费）；
   - 叠加共享层：sidebar-entry-core observer（P-52 事故面）。
2. **每轮消融三步**：
   a. 从 preset 摘除该包（本机 profile，tmp+mv 同步语义注意别破坏硬链接——建议复制 profile 副本上做）；
   b. **宿主启动验证**（实机，与 DA-34 同批 CDP 会话）：宿主正常起、无级联报错、其余功能可用；
   c. **判据变红验证**：`profile-metadata-sync` / `profile-files-sync` / `profile-bundle-sync`
      / `live-presets` 相应判红；UI 侧降级文案正确（接 DA-21 的 `data-dsh-newapp-degraded` 语义）。
3. **汇总矩阵**：M × 3 列（启动/判据/UI 降级）落盘；红灯缺失项 = 新判据缺口，登记后续工单。

## 验收

- 消融矩阵完整落盘，每格有原始读数（命令输出 / CDP 截图）；
- 「摘了包但什么都没红」的格子为零，或已登记为新判据缺口工单；
- 宿主启动无级联失败读数；被摘能力的外显行为符合「优雅降级」预期；
- 消融后 profile 完整恢复（哈希核对，不留污染）。

## 注意

- 在 profile **副本**上做，不污染生产 profile；消融结束必须恢复并核对；
- 「宿主正常起」要有旁路证据（lifecycle-events/startup.jsonl），不能只看无报错（挂死诊断纪律）；
- 判据变红的分母要覆盖：摘包后「射程为空」的判据应报 skip 而不是 pass（DA-01 三态收口的延续）。

## 事故记录（2026-09-23，R1 执行即中止；经后续只读审查更正）

**发生了什么**：自写的消融轮脚本 `/tmp/da25-round.sh` 未经预演便交换生产 profile。
脚本只启用 `set -uo pipefail`（第 3 行），恢复函数消费 `ASIDE` 并把原目录移回（第 16 行），
但恢复后既不退出，也没有终止状态；主流程仍能执行第 57–58 行的无条件删除与再次移回。
`ASIDE` 已不存在时，先删除恢复后的 `P`，随后 `mv` 失败，造成生产 profile 目录丢失。

**撤回“ERR 递归已定论”**：日志有 150 对恢复记录，与轮询上限相符；第 42 行的
未受保护赋值包含 `grep` 管道，无匹配时会传播非零状态，能解释恢复返回后被逐轮再次触发。
这是反复触发而非递归的证据方向；原日志没有失败命令、退出码或 trap 深度，最初触发点
不能精确还原。根因中已确认的是**恢复后继续执行与缺少状态保护**，不能仅靠禁用 trap 代替修复。
原“哈希”也只覆盖两个文件及截断的目录名，读取失败时仍产出空输入摘要，且未断言前后相等。

**恢复过程与未闭合边界**：使用 09-17 的
`~/project/Magpie-Horch-backups/pre-2.0.10-migration/lute-desktop-profile-20260917.tar`
（SHA-256 `39d32b5b5052352885d90c083ab7a2d45db298d73adfa69a078d37dc6391e579`）
重建 profile、同步受管包、补入 dsh-update-local，随后曾读到 healthy 启动。
这只证明该重建组合曾启动，**不证明恢复到事故前字节、声明或功能**。

- 事故前计数为 41 依赖/42 bundles，重建后为 40/41；净计数差不能推出“只缺一个未知包”。
- 两份事故前健康快照与当前清单逐项对账，确认缺 `dsh-capability-hub-local`、
  `dsh-qoder-sidebar-local`，多出已退役的 `dsh-better-sidebar`，且 bundle 顺序改变；
  配置、锁文件与包体的证据边界见下节「恢复差异对账」。
- 原文以 12:19 的旧 updater 日志作为恢复后复验的依据不成立，恢复后的更新器功能仍需新证据。
- 后续 full 门禁真实失败于 dsh-update-local 装载目录缺 `README.md`。
  经用户单独授权，仅补入 2,283 字节、SHA-256
  `8356a4d4dd69dffdaaf1cfb57f1cd013d58a134562d086ba8935b035c669a57a` 的 README；
  未改依赖、配置或运行代码、未重启。复验 136 项为 133 pass、3 skip、0 fail，exit 0。
  原始门禁证据在 `/private/tmp/sanbao-push-readme-restored-l2a97a94/`。
  门禁只验证当前声明的射程，不能替代事故前后完整恢复对账。

### 恢复差异对账（2026-09-23，只读续跑）

事故前依据是健康快照 slot-2（`2026-09-23T04:16:38.025Z`）与 slot-3
（`2026-09-23T04:18:58.449Z`，本地 12:18），不是 09-17 备份。两份快照元数据及
各自 6 个已存在文件均与记录的 SHA-256 相符，第 7 项 `home/cordis.patch.yml` 均不存在；
两份 profile 清单哈希相同。前会话保全目录 `/private/tmp/sanbao-profile-reconcile-cov_vbmn/`
中保存的清单、锁文件和配置副本再次核验通过。

本次原始证据在 `/private/tmp/sanbao-da25-resume-i76tl2yc/`：
`recovery-audit.mjs` / `recovery-audit.json`、`runtime-audit.mjs` / `runtime-audit.json`。
审计进程只获所列生产文件的读取权限，写权限仅限证据目录，无网络或子进程权限；
YAML 使用 JSON schema，`!js` 仅作为字符串数据读取，未执行配置表达式或业务插件。
生产 profile 的 5 个配置文件及全局 2 个配置路径在审计前后哈希/存在性一致，
**不将这 7 个路径的核对扩大为整个生产树零变化证明**。

| 核对面 | 实测结论 | 恢复处置边界 |
| --- | --- | --- |
| profile 清单 | 缺能力中枢与新右栏，多旧右栏；共同依赖 specifier 无变化；岗位矩阵在 bundles 中的相对顺序改变 | 按事故前完整清单恢复声明与顺序，不能只把两个包追加到末尾；对账阶段未写入，后续执行见「最小生产恢复」 |
| 两个缺失包 | vendor 与装载点均缺失；当前仓库分别有 17、20 个候选交付文件，与前会话候选哈希相同 | 可供恢复预演，但无事故前安装包体哈希，不宣称历史字节完全一致 |
| 其他包 | 事故前 27 个本地包中，25 个现有装载点符合当前 `loadPointFiles` 与装载字段契约，2 个缺失；14 个 npm 包版本均满足事故前 semver 声明 | 当前版本/契约一致不等于事故前包体或传递依赖一致，也不等于功能验收 |
| profile patch | 7 项→6 项，仅缺 `/6` 的 `mcp-jev` 插入项，插件名 `@deepseek-ai/dsh-mcp-client` | 配置缺失已确认；命令参数未展示、未执行。恢复会重新引入子进程能力，需单独确认 |
| workspace | 仅缺 `/allowBuilds/koffi`；事故前值实际为 `set this to true or false` | 这是无效占位串，不是授权布尔值；禁止照旧写回或擅自改成 `true` |
| 全局配置与市场状态 | `~/.dsh/settings.yaml`、profile `.dsh-market/state.json` 与快照哈希相同；全局 `cordis.patch.yml` 前后均不存在 | 无证据需恢复这些文件，本轮不改，未展示设置内容 |
| 锁文件 | 事故前 importer 已漏能力中枢、新右栏、updater，却保留旧右栏和 boot-diag；当前 importer 漏 updater；26 个共同记录变化，packages 497→353 | 事故前锁本身已滞后，整份覆盖不是正确恢复；安装/重解依赖须另行审阅，未执行 |

补充的全量交付文件比对还发现 vendor/装载点的源码、类型、文档、source map 等差异；
初始枚举未展开通配清单，不能称作完整包体审计。上述差异只对照**当前仓库**，未建立
事故前字节基线，故不自动列为事故缺陷或全量同步对象。`runtime-audit.json` 保存口径勘误，
包括 `^0.2.14` 接受已装 `0.2.14`，不能用字符串不等判版本错误。

既有只读命令 `node scripts/sync-profile.mjs --check --loadpoint --profile <desktop>`
在无写权限的 Node 进程下实跑 exit 0，输出「对比 25 个包」；其射程为**当前声明**，
上述 27 包对账才暴露缺失的两个包，不能据该绿灯宣布恢复完成。

**离线恢复候选（对账阶段未应用，随后获授权执行见下节）**：同一证据目录的 `recovery-candidate/` 保存事故前
`package.json` 与两个缺失包的 37 个候选交付文件。清单哈希与 slot-3 完全一致，
41 依赖/42 bundles；37 个文件与仓库哈希相同、独立 inode、链接数均为 1，
两个包的 host/client 四个 JS 入口 `node --check` 均 exit 0。
`recovery-candidate.json` 记录清单；这不是可直接启动的完整 profile，也不是生产备份。
候选未复制旧锁文件、全局设置、profile patch 或 workspace 配置；`mcp-jev` 未获恢复授权。

### 最小生产恢复（2026-09-23，用户单独授权后执行）

用户选择「最小生产恢复」：停机、独立备份、补回能力中枢与新右栏、恢复事故前清单顺序并停用旧右栏、
重启验收；不删旧包体，不动 `mcp-jev`、koffi、全局设置或锁文件，必须安装依赖时先停下确认。
执行前官方 `dsh-running.sh --any` 返回 1，进程表亦无 app/Helper，故无需额外退出。

- **独立备份**：`~/project/Magpie-Horch-backups/da25-minimal-restore-20260923-xnm80gog/`，
  `profile/` 共 25,239 项、22,783 个普通文件、694,166,978 字节；复制前源、复制后源、
  备份三份逐文件 SHA-256/类型/权限/符号链接目标一致，普通文件 inode 均与源独立。
  `backup-verification.json` 是清单；另保存两份完整事故前健康快照，避免启动轮换丢失。
- **真实脚本先假树**：`apply-minimal.mjs` 成功、清单已变、目标已占三例均符合预期，
  后两例 exit 1 且原文件不变。最初 `fsyncSync` 被 Node 权限模式禁止，未动生产；
  保留该失败后改为关闭写入、读回哈希、rename，**不承诺断电持久性**。
- **就位次序**：两个包先各自临时目录→核验→rename 到 vendor 与 node_modules，
  最后原子替换 `package.json`。新增 74 个文件、16 个目录，删除 0，既有文件仅清单变化；
  全 profile 对账证据 `production-file-verification.json`。旧右栏包体保留但不再声明/加载。
- **持久性**：两次启动后清单仍与事故前快照逐字节一致，41 依赖/42 bundles；74 文件哈希一致；
  锁文件、workspace、profile patch、market state、全局 settings/patch 六条路径均未变。
  `sync-profile.mjs --check --loadpoint` exit 0，对比 **27 个包**；无依赖安装或锁文件重写。

| 运行验收 | 新鲜读数 |
| --- | --- |
| 临时 loopback CDP 启动 | `2026-09-23T11:27:24.167Z` 开始，12,808.996 ms 到 health-commit/healthy；一个 renderer.boot.started |
| 关闭 CDP 后普通启动 | `2026-09-23T12:00:07.533Z` 完成，11,524.838 ms，health-commit/healthy；一个 renderer.boot.started；9333 已关闭 |
| 能力中枢 | CDP 键盘 Cmd+K 打开、combobox 获焦、列表观察到 42 项；无匹配搜索为 0 项；Esc 关闭 |
| 新右栏 | 打开既有会话并展开右栏，出现「活动」页、环境信息/产出；宽度 writer 为 `official`；未发送消息或执行列表能力 |
| 空闲进程快照 | 普通启动后 main 与两个 Renderer 均 0.0% CPU；其余 Helper 最大 0.7%，不把单次快照等同长期稳定性 |
| 日志窗口 | 两份 host 日志中本次窗口未匹配 watchdog/renderer failed/unresponsive；未获得健康上报内部 `attempt=1` 文本，不以一次 renderer.boot.started 偷换该值 |

原始证据包括 `startup-debug-run.json`、`startup-normal-run.json`、`ui-acceptance.json`、
`production-final-verification.json`、`renderer-log-window.json` 与 `palette-ready.png` / `sidebar-ready.png`；
本次证据目录已完整复制到上述独立备份根的 `final-evidence/`，校验表为 `final-evidence-sha256.json`。
首次按旧文件字节偏移读取 lifecycle 得到空集是**仪器误判**：文件会重写/轮换，后改按 runId/时间
复读证实真实 healthy，旧空输出仍保留。CDP 为本次临时 loopback 通道，验收后正常退出再普通启动，
未持久化调试开关。

**剩余不是隐去的绿灯**：`mcp-jev` 仍未恢复；锁文件仍落后于清单；历史 koffi 无效占位不回填；
更新器本次真实返回 feed-unreadable / HTTP 404，pixpix 与 shopify 有连接告警，均未顺手修复。
本节只结算用户授权的最小恢复，不宣称事故前完整包体、所有能力或消融矩阵已经恢复/通过。

### 隔离入口核对

撤回“desktop 常量意味着无选择器”：装机
`Resources/app/lib/profile-manager-Drv_R61i.js:381-420` 提供命名 profile 选择；
`main.js:3943` 使用 userData 下的 `profile-selection/state.json`。
Harness 支持 `DSH_HOME`，但 `main.js:3911-3922` 的已持久化数据目录选择可能覆盖其回退值。
这些是源码证据，尚未完成隔离启动实测；命名 profile 共享 Harness HOME 与全局配置，
不能因此宣称生产隔离。旧 app 从备份目录启动或仅指定 userData，同样不能证明不会读写当前 HOME。
**生产目录交换不再作为本卡的默认路线。**

续跑复用装机导出的选择器，在新建受限假树内复测 **10/10 pass、exit 0**，
原始输出 `selector-retry.log` 与命令 `selector-retry-result.json` 位于本次证据目录。
首个绝对测试路径调用在执行断言前因定位失败退出 1；改用临时目录 cwd 与相对测试名后通过，
前次失败日志保留，不当作回归 Red。测试验证命名选择、状态隔离、非法选择拒绝及假树不变，
**没有启动 Electron GUI，也没有证明其子进程受 Node 测试权限约束**。

装机源码审查与关键链复读进一步确认（以下行号均相对 `Resources/app/`）：

| 共享面 | 当前证据 | 对下一轮的约束 |
| --- | --- | --- |
| 单实例 | `lib/main.js:3644-3648` 在选择 profile 前申请全局单实例锁；`:3853-3859` 处理第二实例并显示现有窗口 | 新命名 profile 仍可能激活生产实例，不能直接试启动 |
| HOME 与环境 | `lib/main.js:3866-3873` 从 Electron `app.getPath('home')` 捕获登录 shell；`:3895` 先加载 `.env`，`:3911-3922` 才裁决持久化 HOME | 只传 `HOME`/`DSH_HOME` 不能证明无生产环境或凭据继承 |
| 启动前写入 | `lib/main.js:3923-3926` 在 profile 选择前可隔离全局 session projection cache；`:3943-3954` 才进入 profile 选择 | 不能以“还没加载测试插件”为无副作用证明 |
| Electron 数据 | `lib/main.js:3904` 命令运行时落在 `app.getPath('userData')`；`lib/electron-runtime-IsgfTki1.js:350-367` renderer 使用固定 `persist:dsh-desktop-renderer` | profile 名不是 userData、缓存或 renderer 存储隔离键 |

`--user-data-dir` 的 Electron 原生生效范围、完整后代进程、系统钥匙串、跨通道 appData
及网络边界未做运行时验证。分离 HOME/DSH_HOME/userData 只是路径配置，不是操作系统权限隔离；
后续实机消融优先选择**不挂载生产目录、无生产凭据的可丢弃虚拟机**，或另行验证的独立受限用户环境。
同用户目录方案若继续，须先证明文件访问、IPC 与出网限制覆盖整棵进程树，不能复用假树测试绿灯放行。

### 假树预演（2026-09-23；不等于实机消融）

本轮只使用 `/private/tmp/sanbao-da25-rehearsal-zyqb25lw/` 内人工生成的两个文件与目录，
没有复制真实 profile、执行原事故脚本、启动 app 或调用业务探针。
运行 Node v26 权限模式：读写只授权该临时根，不授权网络或子进程；拒绝真实 HOME 读取有负例。
外层驱动器只向自己创建的等待子进程发送信号，未对现有应用发信号。

| 证据 | 实测结果 |
| --- | --- |
| 三轮正常换入/恢复 | 原槽位和独立保留副本逐文件 SHA-256 一致；试验副本移到 quarantine，未删除 |
| 故障矩阵 | 20/20 通过，覆盖各前向阶段异常、提前恢复后停止、重复恢复、备份缺失/残缺、目标被占、符号链接、根目录替换、硬链接拒绝 |
| 反向突变 | 去掉试验活动阶段终止守卫后 18 pass/2 fail、exit 1；恢复守卫后 20/20、exit 0 |
| 中断保全 | INT/TERM/HUP/KILL 四种实际子进程中断均留下完整原始目录与独立保留副本；**没有自动恢复** |

脚本、测试、红绿日志、三轮清单与独立复算哈希在上述临时目录；入口证据
`summary.json`、`round-integrity.json`、`interruption-results.json`、`evidence-sha256.json`。
这是未入库的控制流原型，不是生产恢复工具：未证明断电持久性、同用户恶意并发替换安全、
真实 GUI/HOME/userData 隔离或完整能力降级行为；目录占用等用例也不替代全部底层 I/O 故障注入。

**本卡保持 open**：用户授权的最小生产恢复已实机验收，应用现以普通方式运行，临时 CDP 已关闭；
隔离环境选择、`mcp-jev` 与锁文件等残余仍待决，实机消融与旧版回滚均未执行。
恢复实施阶段未提交、未推送，只做了针对性验收与文档检查；随后用户另行要求提交、推送并交接。
交付边界、门禁证据位置及后续操作入口见 [Codex 交接文档](../HANDOFF-CODEX.md)。
不再交换生产 profile，不启动旧 app，不以最小恢复成功关闭 DA-25 或 DA-36。
