---
title: dsh-theme 外观页对齐 ChatGPT.app（三阶段）
status: approved
date: 2026-09-17
---

# dsh-theme 外观页对齐 ChatGPT.app（三阶段）

> 本文是 `packages/platform/dsh-theme-local`（settings.section · dsh-theme）外观页改造的**已批准计划**。
> 取证对象：ChatGPT.app macOS 版外观设置页（bundle 提取 + DOM 结构分析，证据在会话记录）。
> 决策（D1–D6）已由用户逐项确认，本文不重新论证取舍，只记录结论与执行细节。
> 行为与安装契约的权威来源是包 README；本文负责**改造方案本身**。
> P1 收尾时按 ADR-0015 补决策 Note（`docs/notes/`），本文不预先占位。

## 0. 决策记录（已确认）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 取色模型 | **A**：存储 `ThemeStudioSettings` 12 字段不动 + 新增 contrast 字段；呈现层「三主控 + 对比度滑杆 + 高级折叠」 |
| D2 | 浅/深形态 | **A**：同屏堆叠双区（浅色主题 / 深色主题两个子区块，ChatGPT 同款） |
| D3 | P1 范围 | 对比度滑杆 + 导入/导出分享串 + Reduce motion + Font smoothing（全选） |
| D4 | 预设/色卡 | **A**：预设卡片网格 + LUTE 品牌色卡组 + 自定义 |
| D5 | 字体 | **A**：两位精选栈保留，选择项按字体渲染；字号换数字步进器 |
| D6 | 节奏 | **A**：三阶段渐进（P1 结构与能力 → P2 视觉精修 → P3 可选扩展），每阶段独立验收 |

## 1. 目标页面结构（P1 完成后）

```text
外观（settings.section · dsh-theme · 720px 预算）
├─ header：「外观」/ 描述 + [恢复默认]（保留）
├─ 卡 A 「主题」
│  ├─ card header 下方右对齐：[复制主题] [导入]（分享串是整份主题，故归卡级而非子区级）
│  ├─ 模式三卡（radiogroup + sr-only radio，语义对齐 ChatGPT；P2 换 SVG 插画）
│  ├─ 预设卡片网格：15 张 mini 卡（PalettePreview 复用 + 中文名），选中描边；无匹配 → 「自定义」卡
│  ├─ 强调色 行（卡级单组）：品牌色卡组（默认=LUTE 品牌绿）+「自定义」色卡；一次写入双变体
│  ├─ 子区「浅色主题」 <section aria-labelledby>
│  │   ├─ 背景色 行：ColorChip（圆点 + inline hex + 原生拾色器）
│  │   ├─ 文字色 行：ColorChip
│  │   ├─ 对比度 行：滑杆 0–100（轨道 accent 渐变）
│  │   └─ 高级折叠：表面色 / 行内代码背景 / 侧栏色（三行 ColorChip）
│  └─ 子区「深色主题」（同构；色卡名做 dark 变体感知，参照 ChatGPT Black→White）
└─ 卡 B 「偏好」
   ├─ 界面字体 / 代码字体（select，选项按该字体渲染 label）
   ├─ 界面字号 / 代码字号（紧凑数字步进器 12–16 / 11–15，Enter/失焦提交）
   ├─ 减弱动效：跟随系统 / 开 / 关（分段控件）
   └─ 字体平滑：toggle（macOS 抗锯齿）
```

## 2. 数据模型与兼容性

存储 12 字段不动加 2，分享串语义不变，呈现层自由度用派生实现——这是 D1-A 的全部含义。

```ts
// theme-settings.ts —— ThemeStudioSettings 追加 2 字段（不 bump 存储key）
export interface ThemeStudioSettings {
  /* 既有 12 色 + uiFont/codeFont/uiFontSize/codeFontSize 不动 */
  lightContrast: number;  // 0–100 整数
  darkContrast: number;   // 0–100 整数
}
export const CONTRAST_DEFAULT = 50;

// decodeThemeStudioSettings 追加：非 0–100 整数 → 缺省 50（沿用现有回退模式）
// 旧数据（无 contrast 键）自动获得 50 → 派生输出与现状逐字节相同

// 独立的呈现偏好，不进主题分享串：
// persistence.ts 新 key "dsh-theme/prefs/v1"
interface ThemeStudioPrefs {
  reduceMotion: "system" | "on" | "off";  // 缺省 "system"
  fontSmoothing: boolean;                  // 缺省 false = 零干预
}
```

### contrast 派生语义（theme-tokens.ts 参数化）

- 缩放系数 `k(c) = 0.6 + 0.8·(c/100)`，即 **k(50) = 1.0 恒等**。
- border l1–l4、layer/overlay/hover 的混合百分比与 label 次级阶梯（62/50/40/28）统一乘 k 后取整（clamp 到安全区间）。
- **恒等性是显式契约**：默认值时全部 60+ token 输出与当前函数完全一致。测试方法：先冻结现有输出为 golden 快照，再动函数（RED→GREEN）。
- 这是 `scripts/acceptance/theme-tokens-live.mjs` 验收资产零破坏的结构性保证。

### 全局注入（client/index.tsx）

- `reduceMotion=on` → `body[data-lute-reduce-motion="reduce"]` + 过渡/动画短路 CSS（带 `data-plugin-css` 标识与 cleanup）。
- `system` → `matchMedia('(prefers-reduced-motion: reduce)')` 监听镜像同一属性（DSH 官方 CSS 未处理该 media query，repo grep 已确认）。
- `off` → 零干预。
- `fontSmoothing` → `body[data-lute-font-smoothing="on"] { -webkit-font-smoothing: antialiased; }`。

### 分享串

- `ThemeStudioSettings` 全 18 字段紧凑 JSON（**不含 prefs**——呈现偏好不随主题分享）；编码经 `THEME_STUDIO_FIELDS` 白名单投影，合并对象也漏不进 prefs。
- 复制：`navigator.clipboard` + 状态反馈；导入：内联展开面板（textarea + 导入/取消，非 modal），`JSON.parse → decodeThemeStudioSettings` 复用现有校验器，失败行内报错。

### 品牌色卡组（AccentSwatches）

- `ACCENT_SWATCHES: { id; light; dark }[]`（约 8–9 对，默认=LUTE 品牌绿）。
- 判活跃用 `themePresetIdOf` 同款模式（无匹配=自定义）。
- **硬约束**：每对在对应 variant 背景上 WCAG 1.4.11 ≥3:1，写成单测选色——色值由测试约束筛定，不预先拍定。

## 3. 文件清单

| 类别 | 文件 |
|---|---|
| 新增组件（各带单测） | `src/client/ColorChip.tsx`、`ContrastSlider.tsx`、`AccentSwatches.tsx`、`SizeStepper.tsx`、`AdvancedDisclosure.tsx`、`ShareString.tsx` |
| 新增纯模块（各带单测） | `accent-swatches.ts`（色卡对 + 活跃判定）、`share-string.ts`（编解码）、`prefs-css.ts`（动效判定矩阵 + 门控 CSS） |
| 修改 | `theme-settings.ts`、`theme-tokens.ts`、`persistence.ts`、`store.ts`、`ThemeStudio.tsx`、`client/index.tsx`、`locales.ts`、`studio.css`、`presets.ts` |
| 约束 | 全部沿用 `data-appearance-*` 命名与 `--appearance-*` token 化变量，不碰官方 class 哈希 |
| 预设 | 15 预设统一 `contrast=50`（P1 观感零变化） |
| 版本 | `package.json` `0.1.0-local.1 → 0.2.0-local.1` |

## 4. 验收链（每阶段真实执行，证据留档）

```bash
cd packages/platform/dsh-theme-local && pnpm run build && pnpm run test && pnpm run typecheck
pnpm run gate                                  # quick；P 全完成时 gate:full
node scripts/acceptance/theme-tokens-live.mjs  # live token 双 scheme 全量核对
node scripts/acceptance/settings-shell-live.mjs# 结构锚不漂移
# 浏览器实拍：外观页 三模式 × 双 scheme 前后对照 + Reduce motion on 全局效果
```

## 5. 阶段划分

- **P1（本次）**：数据模型 + contrast 派生（恒等性先行）+ 双区结构 + 全部新控件 + prefs 全局注入 + 分享串。P1 结束时页面功能完整，视觉为「结构正确版」。
- **P2**：模式三卡 SVG 插画（LUTE 绿点缀）、预设网格视觉精修、popover 完全体、变体 header mini 色板条、预设 contrast 调性微调。
- **P3（可选）**：正文字体位（markdown token 已支持）、代码语法主题可行性调查报告。

**明确不做**：账户同步、Dock 图标、半透明侧边栏（官方桌面设置管辖）、指针光标、系统字体枚举。

## 6. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| R3 popover 自绘 | 保底 styled 原生 `input[type=color]`（能力不丢、颜值降）；a11y checklist 进 visual test | — |
| R4 全局动效短路 `!important` | 仅 on / system 命中时激活，默认零 CSS 干预；实拍官方页面动画回归 | prefs 键删除即零干预 |
| R5 纵向膨胀 | 720px 内三列预设网格（每卡 ~72px）+ 高级折叠；实拍验证滚动 | — |
| 数据兼容 | contrast 缺省 50 = 现状恒等；不 bump 存储key | 阶段级 git revert；插件级 profile 移除 bundle；数据级删新字段/prefs 键即回旧行为 |

## 7. P1 实施记录

实施已完成（2026-09-17），与本文的两处偏离及理由：

| 偏离 | 理由 |
|---|---|
| 拾色用**原生 picker**，不自绘 popover | R3 自绘风险整块消掉；原生 picker 自带键盘、焦点、读屏契约。popover 完全体仍留在 P2。 |
| 分享按钮放在**卡 A 级**（非浅/深子区各一份） | 分享串是整份 `ThemeStudioSettings`（18 字段、含两套变体），子区级复制在当前模型下无意义；按模式拆分分享串不在 P1 范围。 |
| 强调色行提到**卡级单组**（原设计在浅/深子区各一份） | 渲染验收实测：色卡一次写入双变体，两处渲染会得到两个语义与状态都相同的单选组（同 name 16 个 radio）。 |

后续阶段的边界与本文 §5 一致；P1 的实测读数见决策 Note。
