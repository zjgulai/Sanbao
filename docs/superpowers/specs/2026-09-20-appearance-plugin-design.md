# 架构与设计规格书 · LUTE 外观插件（2 模式 × 3 季节主题）

- 状态：已对齐设计（待进入实施计划）
- 日期：2026-09-20
- 决策者：用户（lute）
- 关联决策与标准：ADR-0008（基座只 pin 不改）、ADR-0019（禁止钉官方 UI 哈希）、ADR-0125 D7/D8（侧栏行轴与宽度契约）、ADR-0132 / ADR-0144（品牌色与 `--sanbao-*` Token 命名空间）、ADR-0145（全站多主题与 Qoder 排版统一）
- 目标：将 `packages/platform/dsh-theme-local` 重构升级为纯净、高内聚的外观插件，支持 2 种模式（明/暗）与 3 种季节主题（秋·羊皮纸、春·暖白粉、夏·森林绿）正交组合，对标 Qoder Desktop「设置 - 外观」交互面板，并与 DSH 基座及自有薄壳（`apps/lute-shell`）全面兼容。

---

## 1. 背景与核心目标

### 1.1 背景
当前产品历史存在多套配色与排版逻辑并存的问题（深海蓝基线、Qoder 灰绿中性面、旧版对比度滑块与十六进制拾色器）。用户明确要求：
1. 以 Qoder CN 现有的优秀纸感与极客风为参照；
2. 引入 Qoder 的**羊皮纸**（Parchment）主题色，形成 **2 模式（明 / 暗）× 3 季节主题（羊皮纸·秋 / 暖白粉·春 / 森林绿·夏）** 的 6 态矩阵；
3. 外观设置交互完全参照 Qoder「设置 - 外观」进行重构；
4. 整体外观能力封装为标准外观插件，并必须向下兼容薄壳骨架 DSH（`apps/lute-shell`）与基座运行时。

### 1.2 核心目标
- **单一事实源（Single Source of Truth）**：全套色彩矩阵统一由 `shared/client/sanbao-tokens.ts` 集中定义并导出，严禁在业务 CSS 中硬编码散落颜色值。
- **正交解耦（Orthogonal Decoupling）**：外观模式（Light / Dark / Auto）与色彩主题（Parchment / Warm Pink / Forest Green）独立切换，互不覆盖。
- **无感启动防白屏（Zero-Flicker Bootstrapping）**：在首个 DOM 节点渲染前完成本地缓存读取与根节点主题注入，消灭白屏/黑屏闪烁（FOUC）。
- **极简瘦身**：彻底删除历史堆叠的对比度滑块、十六进制拾色器、主题导入导出字符串等冗余代码。

---

## 2. 状态模型与 Token 矩阵设计

### 2.1 状态模型定义
```typescript
export const APPEARANCE_MODES = ["light", "dark", "system"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const SEASONAL_THEMES = ["parchment", "warm-pink", "forest-green"] as const;
export type SeasonalTheme = (typeof SEASONAL_THEMES)[number];

export interface AppearanceState {
  mode: AppearanceMode;              // 用户首选项：浅色 / 深色 / 跟随系统
  theme: SeasonalTheme;              // 季节主题：羊皮纸 / 暖白粉 / 森林绿
  effectiveMode: "light" | "dark";   // 解析后实际应用的物理模式
  fontScale: number;                 // 字号缩放比例 (0.9 ~ 1.3，基准 1.0)
  reducedMotion: boolean;            // 是否减弱动态效果
}
```

### 2.2 立面层次模型
- **暗色道**：遵循「**画布最亮，面板/浮层逐级变暗**」的模型，去刺眼荧光，降低视觉疲劳。
- **明色道**：遵循「**画布承载底色，面板洁净微抬，浮层高对比**」的纸感模型，保证正文阅读清晰。

### 2.3 六大色彩调色板规范（6 种组合）

每个状态由 16 个核心语义 Token 组成：

```typescript
export const SANBAO_PALETTES = Object.freeze({
  // ① 羊皮纸（Parchment · 秋季）—— Qoder CN 经典沉浸暖纸风
  "parchment-light": Object.freeze({
    canvas: "#FBF7EE", sidebar: "#F3EEE3", rightSidebar: "#F3EEE3", panel: "#FFFFFF",
    inset: "#EFE9DC", overlay: "#FFFFFF", foreground: "#2A2723", secondary: "#6B595B",
    accent: "#8C6534", accentFill: "#8C6534", onAccent: "#FFFFFF", hover: "#EFE6D5",
    pressed: "#E5DAC4", selected: "#EFE6D5", disabled: "#A09A8F", border: "#E2DAC9",
    controlBorder: "#8D8474", success: "#356B42", warning: "#8C6014", error: "#A83B3B",
  }),
  "parchment-dark": Object.freeze({
    canvas: "#1F1E1B", sidebar: "#1A1917", rightSidebar: "#161513", panel: "#161513",
    inset: "#121110", overlay: "#121110", foreground: "#EAE5DB", secondary: "#A8A195",
    accent: "#D19F5B", accentFill: "#B88542", onAccent: "#1A150D", hover: "#292723",
    pressed: "#302E29", selected: "#2D2922", disabled: "#787267", border: "#33302B",
    controlBorder: "#787163", success: "#7EA885", warning: "#D6A865", error: "#DF8282",
  }),

  // ② 暖白粉（Warm Pink White · 春季）—— 三宝品牌原生活力风
  "warm-pink-light": Object.freeze({
    canvas: "#FFF8F7", sidebar: "#F7EEEC", rightSidebar: "#F7EEEC", panel: "#FFFDFC",
    inset: "#F3E6E4", overlay: "#FFFDFC", foreground: "#382E30", secondary: "#6B595E",
    accent: "#8F5361", accentFill: "#8F5361", onAccent: "#FFFFFF", hover: "#EFE1DF",
    pressed: "#E9D8D6", selected: "#EDDBDE", disabled: "#A48F94", border: "#DCC8CD",
    controlBorder: "#A2838B", success: "#406748", warning: "#80501F", error: "#A53945",
  }),
  "warm-pink-dark": Object.freeze({
    canvas: "#211C1D", sidebar: "#1C1819", rightSidebar: "#181415", panel: "#181415",
    inset: "#120E0F", overlay: "#120E0F", foreground: "#F0E5E7", secondary: "#B8A4A8",
    accent: "#E28D9E", accentFill: "#C46D80", onAccent: "#1F0F13", hover: "#2A2325",
    pressed: "#332B2D", selected: "#332328", disabled: "#7D6B70", border: "#382A2E",
    controlBorder: "#7F676D", success: "#87B58E", warning: "#DDA675", error: "#DE7A88",
  }),

  // ③ 森林绿（Forest Green · 夏季）—— Qoder CN 极客灰绿风
  "forest-green-light": Object.freeze({
    canvas: "#F7F9F7", sidebar: "#EEF2EE", rightSidebar: "#EEF2EE", panel: "#FFFFFF",
    inset: "#E6EDE6", overlay: "#FFFFFF", foreground: "#1E241F", secondary: "#5A665C",
    accent: "#386940", accentFill: "#386940", onAccent: "#FFFFFF", hover: "#E3ECE3",
    pressed: "#D7E3D7", selected: "#E2EFE3", disabled: "#939E94", border: "#D1DDD2",
    controlBorder: "#78877A", success: "#2F6B3D", warning: "#855D18", error: "#A94040",
  }),
  "forest-green-dark": Object.freeze({
    canvas: "#232523", sidebar: "#242624", rightSidebar: "#191B1A", panel: "#191B1A",
    inset: "#131413", overlay: "#131413", foreground: "#ECEDEB", secondary: "#AFB5AF",
    accent: "#8FBC99", accentFill: "#5C9363", onAccent: "#101C12", hover: "#2E332F",
    pressed: "#343C35", selected: "#293A2D", disabled: "#737D75", border: "#3E463F",
    controlBorder: "#818E84", success: "#8FBC99", warning: "#DAB879", error: "#E49393",
  }),
});
```

---

## 3. 设置面板 UI 组件设计（对标 Qoder「设置 - 外观」）

面板位于 `dsh-settings-shell` 中，结构清晰划分为三大区域：

```
+-------------------------------------------------------------------------------+
|  外观 (Appearance)                                                            |
|  自定义界面配色模式、季节主题与阅读排版                                       |
+-------------------------------------------------------------------------------+
|                                                                               |
|  外观模式                                                                     |
|  +-------------------------------------------------------------------------+  |
|  |  ( ) 浅色 (Light)      |   (*) 深色 (Dark)      |   ( ) 跟随系统 (Auto) |  |
|  +-------------------------------------------------------------------------+  |
|                                                                               |
|  季节主题                                                                     |
|  +---------------------+  +---------------------+  +---------------------+    |
|  | [o] 羊皮纸 · 秋     |  | [ ] 暖白粉 · 春     |  | [ ] 森林绿 · 夏     |    |
|  | ------------------- |  | ------------------- |  | ------------------- |    |
|  | [画布][面板][强调]  |  | [画布][面板][强调]  |  | [画布][面板][强调]  |    |
|  | 经典复古暖纸感      |  | 温柔典雅晨曦感      |  | 自然清凉极客感      |    |
|  +---------------------+  +---------------------+  +---------------------+    |
|                                                                               |
|  字体与排版                                                                   |
|  字号缩放：    [ - ]  100% (标准)  [ + ]   (90% / 100% / 110% / 120% / 130%)  |
|  代码等宽字体： [ JetBrains Mono / Fira Code / 系统默认等宽 v ]               |
|  减弱动态效果： [  开关 Toggle  ]                                              |
|                                                                               |
|  实时预览                                                                     |
|  +-------------------------------------------------------------------------+  |
|  |  LUTE Agentic System                                                    |  |
|  |  当前主题已激活，色彩对比度符合 WCAG AAA 级标准。                          |  |
|  |  [ 操作按钮 ]    状态: [已就绪]    命令: `pnpm run gate`                 |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

### 3.1 核心组件划分
1. **`ModeSegmentedControl`**：
   - 浅色、深色、跟随系统三段式胶囊选择器。
   - 当模式为「跟随系统」时，自动绑定 `window.matchMedia('(prefers-color-scheme: dark)')` 监听系统切换。
2. **`SeasonalThemeCardGrid`**：
   - 3 张并列季节卡片，展示各主题中文名、季节定位及由动态色块组成的 Mini 预览条。
   - Mini 预览条会随着当前生效的 `effectiveMode` 实时更新为该模式下的实际色块。
3. **`TypographyStepper`**：
   - 5 档比例调节，更新 CSS 变量 `--sanbao-font-scale`。
4. **`LivePreviewCard`**：
   - 实时沙盒渲染区，供用户切换时即刻感受视觉呈现。

---

## 4. 统一排版与度量标准

排版遵循 4px 基准网格与控件/正文分离原则：

| 语义角色 | 字号 / 行高 | 字重 | Token | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **品牌标题** | `28px / 36px` | 600 | `--sanbao-font-display` | 新对话页中央欢迎区标题 |
| **页面标题** | `20px / 28px` | 600 | `--sanbao-font-h1` | 设置页、岗位矩阵、抽屉主标题 |
| **区块标题** | `16px / 24px` | 600 | `--sanbao-font-h2` | 设置区块头、右栏面板折叠头 |
| **界面操作** | `13px / 20px` | 500 | `--sanbao-font-ui` | 侧栏导航、按钮文案、Tab 标签 |
| **正文阅读** | `15px / 26px` | 400 | `--sanbao-font-body` | 聊天气泡文本、Markdown 长文 |
| **代码等宽** | `13px / 22px` | 400 | `--sanbao-font-mono` | 终端代码段、行内 `code` 标签 |

- **侧栏行高**：统一收敛为 `32px`，严格维持 `sidebar-row-axis` 门禁契约（`box-sizing: border-box`, `width: 100%`, `paddingInline: 10px`, `TARGET=264px`）。

---

## 5. 插件架构与薄壳（DSH / lute-shell）双重兼容机制

### 5.1 目录与模块职责（重构后）
```
packages/platform/dsh-theme-local/
├── cordis.patch.yml               # DSH profile 装配声明
├── package.json                   # 模块元数据与构建声明
├── src/
│   ├── index.ts                   # Cordis Host 插件入口：注册 appearance 服务与设置项
│   ├── theme-host.ts              # Host 端状态持久化与多窗口广播
│   └── client/
│       ├── index.tsx              # 客户端入口：挂载 CSS 注入器与设置页扩展
│       ├── sanbao-tokens.ts       # 单一事实源：2×3 调色板与 CSS 变量生成器
│       ├── theme-controller.ts    # 状态控制器：管理 state、本地持久化与系统监听
│       ├── theme-typography.ts    # 排版尺寸定义与动态缩放
│       ├── persistence.ts         # localStorage 启动快照（首屏防白屏）
│       ├── ThemeStudio.tsx        # 参照 Qoder 交互重构的外观设置面板
│       └── studio.css             # 设置面板局部布局与卡片样式
```

### 5.2 兼容机制
1. **冷启动零闪烁（Zero-Flicker Bootstrapping）**：
   - 页面装载的第一时间，`persistence.ts` 从 `localStorage` 同步读出上次选中的 `mode` 与 `theme`。
   - 立即向 `<html>` 注入 `<style id="sanbao-theme-preboot">` 并设置 `data-sanbao-mode` 与 `data-sanbao-theme`，在 React 执行前就完成变量挂载，消灭白色闪屏。
2. **基座变量全量垫片（Shim Layer）**：
   - 注入器自动派生 `--ds-bg-base`, `--ds-bg-canvas`, `--ds-bg-layer-1`, `--ds-text-primary`, `--ds-border` 等基座原生变量，无侵入覆盖基座既有组件，无需修改 `vendor/dsh-desktop` 源码。
3. **Electron 薄壳原生适配（`lute-shell`）**：
   - Host 端服务向 Electron 主进程同步通知当前明暗模式，驱动 `nativeTheme.themeSource` 切换，确保原生窗口标题栏、上下文右键菜单与滚动条与色彩主题完美融合。

---

## 6. 验证与门禁策略

1. **Token 一致性门禁**：
   - `shared/client/sanbao-tokens.ts` 为色彩矩阵的唯一源头。运行门禁脚本比对各包副本，防止代码分叉。
2. **WCAG 对比度自动化测试**：
   - 对 6 套调色板运行纯数学断言：`foreground` on `canvas` 必须 $\ge 7:1$（AAA 级）；`accent` on `canvas` 必须 $\ge 4.5:1$（AA 级）。
3. **薄壳启动烟测（Smoke Test）**：
   - 在 `apps/lute-shell` 执行启动测试，验证真实 DOM 上正确挂载 `data-sanbao-mode` 和 `data-sanbao-theme` 属性。
