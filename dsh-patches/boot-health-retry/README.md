# boot-health-retry · 启动健康上报确认式重试

**归属**：宿主壳层（`lib/client.js` = `dsh-plugin-desktop` 的客户端 bundle）。
**触发事故**：2026-09-18 DSH Desktop 2.5.0（基座 2.0.10）启动页一直转。
**状态**：已应用并实测；装配期重放（见下方"残差"）。

## 症状

- UI 停在加载页；宿主日志：`renderer boot failed (plugins: Unknown client plugin): The Renderer did not report boot health within 30000ms.`
- 生命周期末尾：`event=renderer.boot.timeout`，`rendererStatus=timeout`。

## 根因（可复现的机制，非推测）

宿主放行界面要求三个状态同时成立 —— `DesktopRendererHealthGate.commitIfEligible`
（`lib/electron-runtime-*.js`）：

```
phase === "monitoring" && nativeMounted && rendererHealthy
```

`rendererHealthy` **只能**由渲染器 POST `/_dsh/desktop/renderer-boot` 得到。而这条
路由由 **`dsh-plugin-desktop` 宿主插件在自己的 `ctx.effect` 里注册**：

```js
ctx.effect(() => ctx.webServer.register({
  kind: "exact", path: RENDERER_BOOT_REPORT_PATH, handler: ...
}), "dsh-plugin-desktop: renderer boot report route");
```

**effect 会晚于 `renderer.boot.started` 就绪。** 实测：

| 时刻 | 同一端点 POST | 含义 |
|---|---|---|
| 启动后 +6s | **404** | 路由**尚未**注册 |
| 启动后 +10s | **401** | 路由**已经**注册（被鉴权挡） |

且同一套配置**连续两次启动结果相反**：一次 `renderer.boot.completed`(healthy)、
一次 `renderer.boot.timeout`。→ **这是"上报 vs 路由就绪"的竞态**，不是 JIT、不是
插件注入缺失、不是主线程阻塞。

渲染器原来只发**一次** POST：落在路由就绪之前就永久失败，宿主只能等满 30s 判超时。

### 已排除的假设（同类事故不要重复走这些路）

| 假设 | 排除依据 |
|---|---|
| JIT 编译太慢 | `/usr/bin/sample` 1ms×3479：主线程 **3470 样本在 `mach_msg2_trap`**（事件循环空闲），非编译态；且 JIT 不阻塞事件循环 |
| 某个 client inject 服务缺失 | 探针实测 `loader.await()` 120ms settle、**entries=83 未激活=0**；`remote`/`settingsScope`/`connection`/`modules` 全部在场 |
| 上报器所在的插件没激活 | 该 entry `state=2`(ACTIVE)；无条件提前注册仍超时 |
| 主线程被 12MB 组合包同步占住 | 同上采样：主线程空闲待命 |
| `Unknown client plugin` 文案指向某插件 | 它是超时兜底：`plugins.length===0` 时的占位串（`handleRendererBootVerdict`） |

## 修法

`postRendererBootReport` 由**一次性 POST** 改为**确认式重试**：拿不到 2xx 就退避重试
（`40 × 500ms`，落在宿主 30s 窗口内），网络异常同样计入重试；成功即返回，重试成功会
打一条 `renderer boot health accepted on attempt N`。

宿主判定逻辑**一行未动** —— 只让渲染器不再赌时序。

## 用法

```bash
./apply-fixes.sh apply             # 幂等应用（已打补丁则跳过）
./apply-fixes.sh --check           # 只报告状态
./apply-fixes.sh --verify-anchors  # 对 .orig 基线验证锚点唯一（升级后体检）
./apply-fixes.sh --rollback        # 从 .orig 备份还原
```

`DSH_APP` 可覆盖应用路径（默认 `/Applications/DSH Desktop.app`）。

## 验证记录（2026-09-18）

| 项 | 结果 |
|---|---|
| `--check` on pristine | `original` |
| `--verify-anchors` | 锚点唯一 ✅ |
| `apply` | `patched OK`（含 `node --check` 把关，失败自动回滚） |
| 再次 `apply` | `already patched, skip`（幂等）✅ |
| 补丁产物 vs 已部署文件 | **逐字节相同** ✅ |
| `--rollback` | 还原为 pristine ✅ |
| 线上可靠性 | 连跑 3 次全部 `startup.run.completed` / `healthy`（各约 9s）✅ |

## 残差（必须与修复同批处理）

1. **来源未被修复**：按 `dsh-patches/patches-manifest-v3.md` §A 的声明，宿主壳层改动应由
   **vendor LUTE 源码提交**承载（`vendor/dsh-desktop`，lute 分支）。本次**未**改 vendor 源码
   （`src/client/index.ts` 无该修复），因此**下次按来源重建会覆盖本补丁**。
   真正的永久修复 = 在 vendor 的 `postRendererBootReport` 源实现里加重试并提交。
2. **NM 层不适用**：`packaging/patches/nm/` 的目标空间是 app 的 `node_modules`
   （27 个补丁全部位于其下），而本文目标是 app 根 `lib/` —— 不可放进 NM 层。
3. **上游候选**：这是上游 2.0.10 的握手竞态，值得作为上游 issue 上报（渲染器一次性上报
   vs 宿主 effect 迟到注册路由）。
