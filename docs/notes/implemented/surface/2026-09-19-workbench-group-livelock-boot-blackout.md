# 决策记录：工作台折叠组挂载竞态导致的渲染主线程死循环（启动黑屏）

- 日期：2026-09-19
- 状态：implemented
- 对应 ADR：[ADR-0125](../../../adr/ADR-0125.md) D4、[ADR-0009](../../../adr/ADR-0009.md)
- 涉及包：`shared/client/sidebar-entry-core.ts`、`packages/surfaces/dsh-skill-center-local`、`packages/surfaces/dsh-role-matrix-local`、`packages/surfaces/dsh-newapp-local`

## Problem

2026-09-18 17:08 三个能力包（技能中心 / 岗位矩阵 / 新应用抽屉）构建并同步到 profile 后，用户重启 DSH Desktop 进入持续故障态：

- 启动页永远停在「插件加载中」，随后看门狗判 `renderer surface watchdog: page did not respond`，恢复窗口加载 `ERR_FAILED`，最终黑屏；
- 主进程日志反复出现 `renderer boot failed (plugins: Unknown client plugin): The Renderer did not report boot health within 30000ms`（`Unknown client plugin` 意为渲染端上报的插件清单为空——健康上报从未发出）；
- 渲染进程 CPU 常驻 100–185%，CDP `Runtime.enable`/`Debugger.enable` 全部超时——**渲染主线程被同步级联彻底饿死**，连调试器中断都进不去。

取证路径（供同类故障复用）：铸造 `~/.dsh/.credentials.yaml` 的 browser-session 签名 cookie → 独立 Chrome 直连 `http://127.0.0.1:43120/` 复现挂死 → **先在空白页启用 Debugger 再导航，挂死后发 `Debugger.pause`**（V8 栈守卫中断可打断忙循环，Electron 渲染端 inspector 因消息必须过主线程而不可用）→ 拿到热栈顶层帧 `schedulePlace`，定位到 `sidebar-entry-core.ts`。

根因是 `mountSidebarGroup` 的**三处协同缺陷**：

1. **单例守卫在挂载时而非插入时求值**：技能中心与岗位矩阵都在 apply() 阶段挂载工作台组，此时侧边栏尚未渲染，`document.querySelector(groupSelector)` 对两个实例都返回 null——两个实例都通过守卫，等侧边栏出现时**各自插入自己的 L1/L2**（实测 DOM 中出现 2 组 2 容器）。
2. **`adoptMembers` 可从别的容器抢行**：判据是 `!container.contains(member)`，成员在**对方**容器里时为真 → `appendChild` 把行抢过来（移动即 root 子树 childList 变更）→ 触发对方 rootObserver → 对方抢回去 → **微任务级无限乒乓**，主线程饱和。
3. **entry 的 geometry 重锚可把已折叠的行拉出容器**：`button.after(entry)` 不判断行的父节点，与 `adoptMembers` 形成第二对拉锯。

## Decision

三处协同修复，全部落在唯一事实源 `shared/client/sidebar-entry-core.ts`（副本由 `sync-shared.mjs` 分发）：

1. **单例改到插入时裁决**：`tryPlace` 插入前查 `root.querySelector(options.groupSelector)`，命中即 `retire()`（断开全部 observer、永不触碰 DOM）；后到实例退出而非参战。
2. **`adoptMembers` 只收编侧边栏根的直接子行**：判据改为 `member.parentElement === root`——已被收进容器的行（父节点是容器）永不再次移动，容器之间不可能互抢。
3. **geometry 重锚加 `entry.parentElement === root` 守卫**：被折叠组收编的行不再被拉出容器，自愈仍对「React 重渲染把直接子行挤走」生效。

验证（全部真实输出，连续两次冷启动）：

- 全量 profile（40 bundles 含三个涉事包）冷启动：`startup.run.completed / rendererStatus healthy`，渲染 CPU 从 100–185% 降至 0–2.6%；
- DOM 断言：`group=1, container=1`（修复前 2 组 2 容器），技能中心与岗位矩阵行均在 `[data-dsh-workbench-container]` 内，组标签「工作台」可见，徽标（99+/50）正常；
- 独立 Chrome 复现通道在修复字节下不再挂死；
- `sync-shared` 门禁：20 个消费方全部一致。

## Alternatives considered

- **摘除三个能力包**（bisect 期间的临时态）：恢复启动但丢失技能中心 / 岗位矩阵 / 新应用抽屉三个能力面，不可交付。
- **只做 rAF 节流**（前一轮修复尝试 `schedulePlace`）：只压制了 waitObserver 的同步级联，跨容器互抢与拉锯未断根，挂死依旧。
- **给 observer 回调加 try/catch 或计数熔断**：掩盖机制而非消除机制，且热路径计数无法区分「高频正常自愈」与「死循环」。

## Consequences

- 折叠组的幂等语义从「挂载时查全局 DOM」改为「插入时查活动根」，语义更贴实际生命周期；后挂载实例静默退出，其 disposer 无害（自身节点从未入 DOM）。
- 共享层新增不变量：**回调观察自身所改的子树时，写操作必须满足「移动一次后不再满足移动条件」**（`parentElement === root` / 单例裁决均为此模式）；后续在 `sidebar-entry-core.ts` 增加新观察者时必须维持。
- 故障取证方法论沉淀：Electron 渲染端 inspector 不可达时，「铸 cookie + 独立 Chrome + 预启用 Debugger 的 pause 中断」是拿到死循环热栈的可行通道。
- 诊断期止痛贴的清理（同日收口）：诊断工具曾在 app bundle 把渲染看门狗探测时限 10s→120s（`120e3`）以推迟杀页——根因修复后已还原上游 10s（还原后以严格看门狗复验仍 healthy），该改动**未登记进重放体系**，属应当消失而非应当保留的字节；两个合法补丁（boot-health-retry、G2 console 转发）已有幂等重放脚本（`dsh-patches/boot-health-retry/apply-fixes.sh`、`dsh-patches/runtime-guards/apply-fixes.sh`）与合并后的规范备份基线，升级后按脚本重放。
