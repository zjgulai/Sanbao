# Sage 可回退清理与 Codex 异机交接规格

- 日期：2026-10-06
- 状态：已执行（2026-10-06/07）；执行收据、两个消融红与门禁结果见 [交接记录](../notes/implemented/process/2026-10-06-portable-cleanup-and-handoff.md)，决策见 [ADR-0272](../adr/ADR-0272.md)
- 用户选择：退役旧链，保留回退；旧 LUTE 签名私钥暂留；不打断正在运行的打包任务
- 当前产品任务入口：[Sanbao → Sage 集成票据](../plans/2026-10-05-sanbao-in-sage-integration-tickets.md)
- 当前产品状态：[逐行状态矩阵](2026-09-27-sanbao-to-sage-ui-state-map.json)
- 既有纪律：[活动仓基线](../notes/implemented/process/2026-09-27-local-active-repository-baseline.md)、[复发故障总账](../pitfalls-playbook.md) P-49

## 1. 目标与非目标

把 Sage 整理为可在另一台电脑任意目录恢复、构建和继续开发的主项目。应用源码、活动规格、必要测试输入和不可从锁定来源重建的资源必须随项目交付；不依赖当前电脑的 sibling 项目、旧 worktree、用户级助手记忆或未登记的构建缓存。

清理采用“先保全、再隔离消融、后移除”。“无运行引用”不等于“没有保存义务”；历史发布清单、独有实现、来源证明和必要回退必须与垃圾区分。

本任务不升级 Harness pin，不绕过 authority，不补做获授权真实模型调用以外的业务操作，不改外部源项目，不搬运真实用户 profile、登录会话或签名私钥，不自动 commit、push、发布或改写 Git 历史。清理后的开发可恢复，不代表 206 状态、真实业务闭环或公开发布已通过。

## 2. 只读盘点事实

以下为本轮盘点快照，执行前须刷新，不能当成不断变化的工作区当前状态。

| 对象 | 已观察事实 | 处置约束 |
|---|---|---|
| 主仓 | `main` / `HEAD=63e2302`，本地 `origin/main` 同值；尚未联网确认远端 | 不能只交付 HEAD 而丢失工作区 |
| 三层改动 | 133 个 status 路径/目录条目：8 个 staged 删除、18 个 unstaged 删除、43 个 unstaged 修改、64 个 untracked 条目；后者含目录，不是递归文件数 | 保全 index、两层差异和全部已分类的独有文件，不重置、不自动归属 |
| 本仓占用 | `du -kx -d 1 .` 共 6.44 GiB，vendor 2.36 GiB、packages 1.91 GiB | 这是目录分配读数，不是可回收承诺；硬链接/APFS 共享需另核 |
| 关联 worktree | 登记35个关联树；33个旧登记目录存在，测得合计约8.47 GiB；多个 `.git` 仍指向搬迁前的根 | 状态失败/超时是 unknown，不是 clean；先核唯一提交、index、未跟踪和 ignored 独有资产 |
| 两个 prunable 登记 | 旧登记路径不存在，但同名树仍在本仓 `.qoder/worktrees/` | 不能直接 prune 后删除；先对照搬迁后的实际目录 |
| 签名 | 只读 identity 查询仅见旧 `LUTE Code Signing`；旧装配/品牌重签/Setup仍有消费者 | 本轮暂留证书和私钥；退役代码不等于销毁身份 |
| Sage 签名链 | `packaging-sage/sign-local.sh` 使用临时 Sage 专属证书与钥匙串，签后回收临时信任 | 新机按同一链重建；不复用或复制旧 LUTE 私钥 |
| Release | 根 `release/` 约44 KiB，为清单；旧 `packaging/release` 已不存在；Sage release 此次为空 | 不虚报释放历史 DMG 容量，不删除小体积来源/发布凭据 |
| 活跃产物 | `packaging-sage/staging/.packaging-input.lock` 对应PID仍存在，producer临时目录变化 | 本轮排除；等实际任务结束且独占成立后再核，禁止杀进程或删锁 |
| 文档 | 最新批次与包装含未提交实现；部分账本在ignored `.birdview`及外部worktree；README/索引仍有旧P0入口 | 收纳活动事实，不把历史“已通过”升级为本次验证 |

旧清理器存在已复现的安全缺口：`scripts/lib/cleanup-inventory.mjs` 的 Git 查询异常返回空引用，给不存在仓库执行只读探针得到 `verdict=suggested`；代码引用域没有 `packaging-sage`，且仅查 tracked 路径。修复并验证这些缺口前，其“建议”不能成为删除授权。

## 3. 推荐方案与替代方案

采用可回退的主仓收敛：

1. 保全当前工作与来源，再处理旧 worktree/legacy 资产；恢复集与活动依赖分离。
2. 主项目需要的外部源码、规格和固定测试输入迁入 Sage，记录来源版本、许可证、摘要及本地修改；可重建 npm 包由锁文件和安装流程恢复，不复制旧 `node_modules` 充当源码。
3. 旧发布链转为退役状态，保留可恢复快照及说明；所有 still-required 脚本/检查先分类，再决定保留或迁移，不通过删门禁或缩小分母让消融变绿。
4. 清理只接受明确候选路径清单，不以目录名、扩展名、年龄或容量批量裁第三方包。
5. 活动任务与交接入口沿现有 `docs/plans`、`docs/specs`、`docs/architecture.md`、README和AGENTS维护；不另造第二套产品进度账本。

不采用整目录照搬：虽然省事，却保留绝对路径、失效worktree和缓存依赖。也不采用直接清空vendor/legacy：它会破坏当前构建、验证或历史证据，无法区分基线故障与清理回归。

## 4. 保全、整合与消融合同

### 4.1 冻结与回退

- 先确认其他写者和打包任务状态；活跃范围只读。对将修改/移除的对象要求两次指纹一致，无法获得稳定快照则标blocked。
- 恢复集单独存放，不成为源码依赖，不进入普通Git提交或公开分享。记录路径、类别、原位置、摘要、大小、Git身份和恢复方法；敏感/未知文件不得盲目整目录打包。
- 保存当前index和staged/unstaged差异，保留未跟踪源码与活动文档；对于detached worktree另保全唯一commit与本地差异。先实际读回或在隔离根恢复一个样本，证明回退方法有效。
- 证书私钥、登录会话、真实profile和未知敏感数据留在原受保护位置，交接只写安全重建/重新登录要求。
- 不使用 `git reset --hard`、`git clean`、强制worktree删除、裸stash或批量解锁文件。

### 4.2 依赖闭包

以install、typecheck/test、build、materialize、dev、package和独立验收各自的入口追踪依赖；分别登记运行依赖、构建输入、验证输入、文档证据与历史恢复物。

- `vendor/dsh-desktop` 在证明替代链完整前保留只读pin语义；nested `.git`、依赖缓存和产物不能与固定源码混为一类。
- Sanbao等外部输入按实际消费路径收纳；不得把外部`dist`复制进来就声称源码可重建。
- 外部工单保留来源身份与适用边界；过时的审批状态和旧执行顺序只作历史，不覆盖新的206行集成计划。
- 锁文件、相对路径、原生架构输入和所需工具版本都进入迁移验证；不假设迁移电脑已有相同Homebrew或用户目录。

当前已定位的必需资源与收纳边界：

| 资源 | 消费边 | 交接要求 |
|---|---|---|
| 根包、Sage Shell与profile seed | 根包没有workspace，Shell须独立安装；Harness来自seed npm版本，`COMPOSED_PACKAGES=[]` | 将现行manifest/lock/安装配置纳入可迁移清单；根部两份ignored lock先比对包管理器事实再确定唯一安装合同，不能直接丢弃 |
| vendor桌面与Harness仓 | `scripts/gate.mjs` 核对nested Git HEAD及桌面manifest；实读HEAD分别与各自pin一致 | 保留固定源码与必要Git身份的可恢复方式；以离线bundle恢复再核pin，不能只传pin文件，也不依赖当前nested checkout缓存 |
| 少量legacy package脚本 | gate在scope过滤之前静态import `dsh-overseas-skills`；role-brief检查引用`dsh-role-matrix-local`源码；路径自测消费legacy packaging | 先保留精确闭包，或在不改变Sage检查集合/断言的前提下去除legacy加载耦合并重验；整目录删除不合格 |
| Sanbao原型 | `sanbao-surface-root.ts`可选承载消费dist/_site；矩阵生成器消费catalog、ledger和源Git HEAD | 默认桌面不依赖该原型，但再生成与相关验证需要；收纳固定源码、锁和静态资源，并保留来源身份验证；当前只读源HEAD为`b861d046`，执行前再冻结 |
| 品牌SVG | `generate-sage-assets.mjs`原始输入为`A_StarSail_Product_symbol.svg`，已读摘要匹配 | 收纳实际匹配的原SVG、许可证/来源声明，不以同名`_light`变体替代；保留生成资产和原有未批准权属边界 |
| Sage内测打包 | producer强制离线冻结安装，assembler读取Shell的Electron.app | 源码与锁之外还需可复现的依赖预取步骤；用独立构建缓存供应离线producer，明确Electron和Darwin arm64资源；不将缓存充当源码或复制真实profile |
| 设计仓与旧worktree任务 | 外部判者反向调用Sage；部分未闭任务在ignored账本 | 收纳仍有效规格、票据、判者及最小fixture闭包，改用主仓相对入口；历史LOOP读数不冒充当前验收；Plugins目前仅有研究引用，不整包导入 |

上述为已定位边，不是完整递归软链接扫描通过；执行阶段须补齐软链/硬链、动态资源和离线包可得性检查。当前没有运行安装、build、gate或产品启动，不把静态闭包分析写成验证通过。

### 4.3 实验矩阵

| 组 | 实验 | 通过条件 |
|---|---|---|
| V0 基线 | 当前稳定工作区完整验证 | 真实退出码与测试分母；既有失败单列，不由清理掩盖 |
| V1 仪器 | Git失败、无权限、缺候选、新增untracked引用、packaging-sage引用的负对照 | 未核清必blocked；真实无引用与真实引用有正反例 |
| V2 再生物 | 隔离候选build/cache/旧预览依赖 | 从声明源码重建，相关行为与测试不退化 |
| V3 历史包与vendor | 每次移除一组候选，保留其恢复指纹 | 安装/构建/运行/验证闭包仍完整；失败恢复并登记真实依赖 |
| V4 worktree | 在可核对Git元数据的情况下比对commit/index/工作文件 | 独有工作已收纳或恢复验证；非活跃；注册和实际目录一致 |
| V5 跨项目收纳 | 在不同路径恢复主项目，运行时不能访问旧sibling/worktree | 安装、构建、materialize和必要验收无旧路径读取；失败可定位 |
| V6 用户可见交接 | 启动默认Sage窗口，验证核心导航与诚实拒绝态 | 不以fixture/额外窗口冒充真实集成，不依赖旧profile |

消融失败分成产品既有失败、候选实际必需、仪器错误和环境缺失。只有候选确认为冗余且回退有效时才清除活动副本；未跑或超时显式登记。第三方包保持published package合同，不递归删除`src/`、`scripts/`或平台资源来缩包。

验证至少包括当前脚本定义的相关测试、`pnpm run gate`、`pnpm run gate:full`、构建与真实默认窗口检查；打包验证须等活跃producer结束并另取稳定输入。另一台电脑尚未执行的步骤始终标记“待新机验证”。

## 5. 待办与交接交付

当前产品继续以既有票据和逐行矩阵为准，优先完成T03真实读取正例与scope/resolver，再推进T04持久事项、T05首条真实消息、T06生命周期，随后功能族与T14全量收敛；内测打包有独立前置，不能代替产品验收。

交接文档必须让接手者得到四个答案：执行什么、在哪运行、产物在哪、如何判断成功。内容包括：

- 精确源码/工作区基线、保留的未提交差异与恢复入口；不宣称尚未提交的工作已入Git。
- 本机与新机工具链、架构约束、安装及重建顺序、凭据重新配置的边界。
- 当前有效规格/任务/状态入口，已完成、待验证、blocked及退役delete-zone；仅链接历史证明，不复制过期读数。
- 逐候选保留/整合/隔离/移除结果、前后容量、消融命令和退出码、未运行项。
- Codex从仓内AGENTS与文档进入即可工作，无需复制用户级助手记忆或查询旧电脑目录。

## 6. 完成条件

本规格批准后进入实施计划。最终完成须满足：独有工作未丢失；必需资源可在主项目范围内定位或按锁定来源重建；所有删除均有候选清单、回退证明与对应消融结果；active packaging和旧LUTE私钥未被擅动；现有门禁未被放宽；当前任务与交接文档和实际证据一致；异机尚未运行的部分清楚保留边界。
