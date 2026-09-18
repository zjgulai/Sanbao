# 启动健康上报确认式重试（renderer boot health）

- 日期：2026-09-18
- 范围：`app/lib/client.js`（`dsh-plugin-desktop` 客户端 bundle）
- ADR：[ADR-0127](../../../adr/ADR-0127.md)
- 补丁：`dsh-patches/boot-health-retry/apply-fixes.sh`（清单 §A 已登记）

## Problem

DSH Desktop 2.5.0（基座 2.0.10）启动后停在加载页。宿主报
`The Renderer did not report boot health within 30000ms`，生命周期
`renderer.boot.timeout`。渲染器实际**健康**。

**定位过程（全部为探针实测；本段同时是对推理链的纠错记录）**

| 假设 | 结论 | 推翻它的读数 |
|---|---|---|
| 某个 client inject 服务缺失 → fiber 永挂 | ❌ | 探针：`loader.await()` 120ms settle、**entries=83 未激活=0**；`remote`/`settingsScope`/`connection`/`modules` 全在 |
| `apply` 早退门 / `applyDesktopSettings` 抛错 → 上报器不注册 | ❌ | 把上报器**无条件提前注册**后仍超时 |
| 客户端 loader 整体停滞 | ❌ | 清渲染器缓存后 console 由 7 行变 **84 行**，`apply` 正常执行 |
| 12MB 组合包同步占住主线程 | ❌ | `/usr/bin/sample` 1ms×3479：主线程 **3470 样本在 `mach_msg2_trap`**（事件循环空闲） |
| JIT 编译太慢（外部工具提出） | ❌ | 同上采样非编译态；且 JIT 不阻塞事件循环；"73" 实为 combo 的 `duration=73ms` 被读成 73 秒 |
| **上报 vs 路由就绪是竞态** | ✅ | 同一端点 **+6s→404、+10s→401**；同一配置**连续两次启动结果相反** |

**机制**：宿主 `DesktopRendererHealthGate.commitIfEligible` 要求
`phase==="monitoring" && nativeMounted && rendererHealthy` 同时成立；
`rendererHealthy` 只能来自渲染器 POST `/_dsh/desktop/renderer-boot`，
而**该路由由宿主插件在自己的 `ctx.effect` 里注册**，必然晚于 `renderer.boot.started` 就绪。
渲染器只发一次 POST → 落在路由就绪前就永久失败 → 宿主等满 30s。

## Decision

`postRendererBootReport` 改为**确认式重试**：非 2xx 即退避重试（40 × 500ms，落在宿主
30s 窗口内），网络异常同样计入；成功即返回。宿主判定一行不动。补丁做成幂等 + 锚点唯一
+ `node --check` 把关 + `.orig` 可回滚，并登记进清单 §A。

## Alternatives considered

- **宿主降级放行**：立刻解冻但掩盖根因（上报通道坏了也算健康）——不可接受。
- **删 `connection` 上的 `inject: [webRuntime, webServer]`**：实测两面都坏（宿主直接
  `startup-failed`：`loopx-goalbar: cannot get property "webServer" without inject`）；
  该 entry 同服宿主与客户端两组合，删任一半炸另一半。
- **在组合层给 `connection` 拆第二条 entry**：机制未验证（既有经验：桌面组合层会静默忽略
  insert），改动面大于一处竞态修复。
- **改 vendor 源码并重建（§A 正统路径）**：正确的最终形态，但需全量重建；本轮以装配期补丁
  解绑事故，残差已登记。
- **等 `load` 事件后再上报**：实测无效（`readyState` 停在 `interactive` 与本案无关），
  且把成功寄托于另一个不确定事件。

## Consequences

- 事故解除：连跑 3 次全部 `startup.run.completed` / `healthy`（各约 9s）。
- 失败时日志给出重试次数与最后状态码，不再只有一句兜底文案。
- **残差 1（阻塞级）**：vendor 源码未修 → 下次按来源重建会覆盖本补丁；永久修复需在
  `vendor/dsh-desktop` 的 `postRendererBootReport` 源实现里加重试并提交。
- **残差 2**：本补丁属装配期重放，**不在 NM 层**（NM 目标空间是 app `node_modules`）。
- **观察点**：`renderer boot health accepted on attempt N`（N>1）出现即说明竞态在本机真实发生，
  也是上游 issue 的直接证据。
- 本决策**不**推广为"所有宿主端点都应重试"：其它端点调用点在交互路径上，本就允许失败。
