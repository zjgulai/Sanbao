# 右栏宽度设置口：官方写入口 + 镜像区间 + 采纳收口（ADR-0146）

- 日期：2026-09-20
- 归属：`packages/surfaces/dsh-qoder-sidebar-local`（Qoder 式右栏插件）
- ADR：[ADR-0146](../../../adr/ADR-0146.md)

## Problem

右栏宽度是外壳的内存态：store 里 `rightbar: number | null`、首开取视口 45%、重启即回默认，
两种外壳持久化路径都不持久。用户要「宽度设置口」——设一次、跨重启生效、跟拖拽不打架。

此前一轮已经实机量死了两条实现路：

| 路 | 实测 | 判决 |
| --- | --- | --- |
| 覆写 grid 轨道（`!important`） | 内联样式 250ms 内被外壳改回原值 | 要赢只能每帧抢属性（P-07/P-52 形状），否决 |
| 只压面板宽 | 面板 320 而轨道 619、右缘死缝 | 轨道是宽度真源，否决 |

同时仓库里有一个**伪命题**要修正：旧 note（`2026-09-20-qoder-sidebar-rebuilt.md`）写过
「`ILayout` 没有宽度设置口」——宽度写入口存在（store 动作 `setRightbar`，拖把手走的就是它），
只是被 TS `private` 收在 `LayoutController.panels` 的类型面之外。

## Decision

四层结构，全部围绕「宽度真源只有一个（外壳 store），本包只持有偏好与决定」：

1. **纯契约层**（`rightbar-width.ts`）：区间**镜像**外壳 `columns.ts`
   （MIN 300 / MAX_RATIO 0.7 / DEFAULT_RATIO 0.45）+ 存储编解码（脏值判 null）。
   零 DOM，node 直接测（14 条）。
2. **偏好层**（`rightbar-width-pref.ts`）：localStorage 读写 + 变更广播，单一家。
3. **动作面**（`rightbar-width-face.ts`）：步进从「眼睛看到的宽度」起步（实测当前值，
   读不到退外壳首开口径）、写入前过镜像钳位、「跟随默认」= 清偏好（9 条）。
4. **落地点**（`rightbar-width-writer.ts`）：能力探测找官方 `setRightbar`（`ctx.get('layout')`
   服务对象 + 一层属性值当候选，调用时重读）；探不到一个像素不写、结论钉在
   `<html data-lute-rightbar-writer>` 上。设置行挂官方 `settings.general.item` 座位
   （先例：locale → Language、ui-conversation → Composer Enter）。

**采纳收口**（本轮最重要的一个修复）：最初观察器无条件采纳「外壳自己改的宽度」，
实机撞出自激回环——我们 `writer.set(420)` → 外壳重渲染触发 MutationObserver →
回调里 `getComputedStyle` 读到的还是旧轨道 320 → `pref.write(320)` 把刚写的 420 吃掉。
抓凶手的读数（localStorage.setItem 栈回溯）：

```
v=320  at Object.write (…dsh-qoder-sidebar-local/client.js)
     at adopt (…client.js)
     at MutationObserver.<anonymous> (…client.js)
```

收口为不变量：**采纳只认「拖拽抬手后的第一次提交」**（pointerup 置待认领标记，
观察器认领一次；两帧 rAF 兜底覆盖「提交没动 style」的情形）。抬手瞬间不能直接读——
把手在 pointerup 里才提交最后一个 dx，样式还要再过一次 React 渲染。

## Alternatives considered

- **覆写轨道 / 内联 `!important` / 每帧抢属性**：见 Problem 表，实测否决。
- **自创区间 240–720**：外壳下限 300 会把 240 钳成 300——设置页显示外壳永远不会给的值。
  镜像 + 实机两端对钉（请求 200→实测 300、请求 9999→实测 min(floor(视口×0.7), 视口−左轨−400)）
  才能把「我们与外壳一致」从声明变成被检查的事实。
- **未设时抢写默认宽度**（比如抢先写 420 实现「Qoder 常态宽」）：等于把没人点过的设置变成
  事实所有者；且外壳首开 45% 的决定权会被抢走。保持「未设 = 不写」，用户在设置口点一次。
- **观察器无条件采纳 / pointerup 直接读**：分别是自激回环与「读到拖拽中的旧值」，
  都实测或推演否决。

## Consequences

- **验收读数（实机 CDP，`accept:right-sidebar-width`，2026-09-20 17:2x）**：6/6 过
  （viewport=1376、左轨 280）——writer-reachable=official；播种 420→右轨 420；
  播种 200→300；播种 9999→696（=min(floor(1376×0.7), 1376−280−400)）；设置模态可开；
  设置行渲染、− 步进 420→380 落地且 localStorage 同步。
- **跨重启持久（实测）**：重启前 localStorage=320 → 带新 bundle 重启后轨道
  `280px 776px 320px`（boot 时经官方写入口落地）。注：这是 16:2x 重启时的一次性读数，
  探针本身不重启应用（重启须外部执行）。
- 包内测试 48/48（5 文件）、`tsc --noEmit` 0 错；构建产物已同步 profile 两个装载点
  （node_modules 软链 + vendor lib，字节一致）。
- 镜像常量是外壳 `columns.ts` 的第二个家：外壳改数字这里不会自己知道，只能靠探针的
  floor/ceiling 两判据判红。外壳跟进（ADR-0006 观察窗）时顺带重跑。
- 拖拽采纳路径未实机验证（合成 pointer + pointer capture 不可靠）；其失效形态是
  「拖完宽度没进偏好」，不破坏布局。
- 探针的页内轮询 wrapper 超时 90s：窗口隐藏时页面计时器被节流，页内 8s 循环实际可跑
  30s+——第一版 30s 超时在隐藏窗口下间歇假红（P-54 同款），已放大并留档。
- 并发注记：本轮宽度线由会话 be4ef608 独占（用户指令停掉 39e9329a）；ADR-0144 D3
  登记的换皮线也承诺不动本包。
