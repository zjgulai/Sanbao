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

## 事故记录（2026-09-23，R1 执行即中止）

**发生了什么**：自写的消融轮脚本（/tmp/da25-round.sh）在**未经任何预演练**的情况下
对生产 profile 槽位执行 swap（mv 换出→cp 副本→摘包→读数→rm 换入副本→mv 换回）。
两个缺陷叠加：① `trap 'restore_now' ERR` 在 restore_now 自身失败时**递归触发**，
造成每秒一次的恢复循环；② 主流程末尾 `rm -rf $P && mv $ASIDE $P` 不是原子操作——
rm 成功后 mv 因 ASIDE 已被循环消费而失败，**生产 profile 目录被物理删除**
（1.6G，无本地快照）。

**恢复**：`~/project/Magpie-Horch-backups/pre-2.0.10-migration/lute-desktop-profile-20260917.tar`
（SHA256 39d32b5b… 与清单一致）解包 → `sync-profile.mjs --apply`（15 包 vendor 副本面）
→ `--apply --loadpoint`（25 包装载点）→ 补回 dsh-update-local（vendor 目录 + 依赖/
bundles 条目 + node_modules）→ 重启 healthy。恢复后装载点与仓库一致（25 包）。

**恢复边界（如实）**：基线是 09-17 快照；09-17~09-23 间 profile 的非仓库托管变化
（第三方包的新增/升级）**可能有损**——事故前读数 41 依赖/42 bundles，恢复后
40/41，差 1 个未知包（可能是其他会话安装的第三方包）。已同步 25 个受管包到仓库
当前版，dsh-update-local 修复版已回位（host 日志 feed-unreadable 复现）。

**根因教训（P 条目级候选）**：
1. 「看起来合理的恢复脚本」= 未演练的恢复路径（P-01 变体）：trap 递归与
   rm-then-mv 非原子两处缺陷都是**离线可预演**的形状，我跳过了预演直接上生产；
2. 对生产槽位做破坏性操作前没有做「恢复本身」的演练（先在一棵假树上跑通
   swap→恢复循环再上真树）；
3. trap 内不得再触发 trap；恢复路径禁用 rm（用 mv 两段式：换出与换回都是 mv）。

**本卡状态**：消融方式需重新设计并获用户拍板后才继续。候选：纯 mv 两段式交换 +
假树预演；或先给 profile 加选择器（宿主侧，超出本卡射程）；或降档为
「声明级消融」（只改副本 package.json 摘 bundles，不换生产槽位——宿主 boot
只读 bundles 清单，摘声明即可验证降级，判据红由 sync --check 对副本跑）。
