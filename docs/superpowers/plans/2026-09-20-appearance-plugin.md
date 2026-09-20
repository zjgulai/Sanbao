# LUTE 外观插件（2 模式 × 3 季节主题）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `packages/platform/dsh-theme-local` 重构为高内聚、纯净的外观插件，实现 2 模式（明/暗）× 3 季节主题（羊皮纸·秋 / 暖白粉·春 / 森林绿·夏）共 6 态调色板，对标 Qoder「设置 - 外观」交互面板，并与 DSH 基座及薄壳（`apps/lute-shell`）全面平滑兼容。

**Architecture:** 
1. `shared/client/sanbao-tokens.ts` 作为单一事实源，集中定义 6 套完整调色板并派生 CSS 变量与基座垫片；
2. 客户端在首屏加载阶段通过 `persistence.ts` 从 localStorage 同步注入 preboot 样式消灭闪屏（Zero-Flicker）；
3. 设置面板用 `ThemeStudio.tsx` 重新编排模式分段、季节卡片网格与排版步进器；
4. Host 服务端与 Electron 薄壳协同，通过 IPC 同步 `nativeTheme.themeSource`。

**Tech Stack:** TypeScript 5.6+, React 18, Vitest 4, Happy-DOM, Cordis 4, Electron 43.

**Spec:** `docs/superpowers/specs/2026-09-20-appearance-plugin-design.md`

## Global Constraints

- 基座只 pin 不改（ADR-0008）；官方 UI 改写锚禁止钉哈希（ADR-0019）。
- 色彩 token 唯一源头在 `shared/client/sanbao-tokens.ts`，禁止在业务 CSS 散落硬编码 hex 颜色。
- 侧栏行高统一收敛为 32px，严格维持 `sidebar-row-axis` 门禁契约（`TARGET=264px`, `box-sizing: border-box`）。
- 提交必须保持原子性，不修改其他会话在制品（`packages/surfaces/dsh-right-sidebar-local` 等）。

---

### Task 1: 核心 Token 矩阵定义与对比度测试（单一源）

**Files:**
- Modify: `shared/client/sanbao-tokens.ts`
- Sync: `packages/platform/dsh-theme-local/src/client/sanbao-tokens.ts`
- Test: `shared/client/sanbao-tokens.test.ts`

**Interfaces:**
- Produces: `THEME_IDS: ["parchment", "warm-pink", "forest-green"]`, `MODE_IDS: ["light", "dark"]`, `SANBAO_PALETTES`, `buildSanbaoVariables(theme, mode)`

- [ ] **Step 1: Write the failing contrast & token completeness test**

```typescript
// shared/client/sanbao-tokens.test.ts
import { test, expect } from "vitest";
import { THEME_IDS, MODE_IDS, SANBAO_PALETTES, buildSanbaoVariables } from "./sanbao-tokens.ts";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hexToRgb(hex1));
  const l2 = luminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test("SANBAO_PALETTES contains all 6 combinations", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODE_IDS) {
      const palette = SANBAO_PALETTES[`${theme}-${mode}`];
      expect(palette).toBeDefined();
      expect(palette.canvas).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(palette.foreground).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      
      // WCAG contrast check: text on canvas >= 7 (AAA) or >= 4.5
      const textContrast = contrastRatio(palette.foreground, palette.canvas);
      expect(textContrast).toBeGreaterThanOrEqual(4.5);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run shared/client/sanbao-tokens.test.ts`
Expected: FAIL with missing theme keys or undefined exports

- [ ] **Step 3: Update `shared/client/sanbao-tokens.ts` with 6-state palette matrix**

Implement `SANBAO_PALETTES` with `parchment-light`, `parchment-dark`, `warm-pink-light`, `warm-pink-dark`, `forest-green-light`, `forest-green-dark`, and export compatibility shims.

- [ ] **Step 4: Synchronize to dsh-theme-local and verify tests pass**

Run: `node scripts/sync-shared.mjs && pnpm vitest run shared/client/sanbao-tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/client/sanbao-tokens.ts shared/client/sanbao-tokens.test.ts packages/platform/dsh-theme-local/src/client/sanbao-tokens.ts
git commit -m "feat(tokens): 建立 2 模式 × 3 季节主题调色板矩阵单一源"
```

---

### Task 2: 客户端控制器与零闪烁启动注入（`persistence.ts` & `theme-controller.ts`）

**Files:**
- Modify: `packages/platform/dsh-theme-local/src/client/persistence.ts`
- Modify: `packages/platform/dsh-theme-local/src/client/theme-controller.ts`
- Test: `packages/platform/dsh-theme-local/src/client/persistence.test.ts`
- Test: `packages/platform/dsh-theme-local/src/client/theme-controller.test.ts`

**Interfaces:**
- Consumes: `AppearanceMode`, `SeasonalTheme` from `sanbao-tokens.ts`
- Produces: `initAppearancePreboot()`, `AppearanceController.setMode()`, `AppearanceController.setTheme()`, `AppearanceController.setFontScale()`

- [ ] **Step 1: Write failing tests for preboot injection and state transitions**

```typescript
// packages/platform/dsh-theme-local/src/client/persistence.test.ts
import { test, expect, beforeEach } from "vitest";
import { loadSavedAppearance, saveAppearance, initAppearancePreboot } from "./persistence.ts";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-sanbao-mode");
  document.documentElement.removeAttribute("data-sanbao-theme");
  document.head.innerHTML = "";
});

test("initAppearancePreboot mounts data attributes before DOM render", () => {
  saveAppearance({ mode: "dark", theme: "parchment", fontScale: 1.1, reducedMotion: false });
  initAppearancePreboot(document);

  expect(document.documentElement.getAttribute("data-sanbao-mode")).toBe("dark");
  expect(document.documentElement.getAttribute("data-sanbao-theme")).toBe("parchment");
  expect(document.head.querySelector("style[data-sanbao-preboot]")).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dsh-theme-local vitest run src/client/persistence.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `persistence.ts` and `theme-controller.ts`**

Handle:
1. `loadSavedAppearance` reading `{ mode, theme, fontScale, reducedMotion }`;
2. System preference resolution via `window.matchMedia('(prefers-color-scheme: dark)')`;
3. Dynamic body and documentElement data attribute updates.

- [ ] **Step 4: Run controller and persistence tests**

Run: `pnpm --filter dsh-theme-local vitest run src/client/persistence.test.ts src/client/theme-controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/platform/dsh-theme-local/src/client/persistence.ts packages/platform/dsh-theme-local/src/client/theme-controller.ts packages/platform/dsh-theme-local/src/client/persistence.test.ts packages/platform/dsh-theme-local/src/client/theme-controller.test.ts
git commit -m "feat(theme): 实现冷启动零闪烁注入与外观状态机解耦"
```

---

### Task 3: 重构外观设置面板 UI（参照 Qoder「设置 - 外观」）

**Files:**
- Modify: `packages/platform/dsh-theme-local/src/client/ThemeStudio.tsx`
- Modify: `packages/platform/dsh-theme-local/src/client/studio.css`
- Delete: `packages/platform/dsh-theme-local/src/client/AccentSwatches.tsx`
- Delete: `packages/platform/dsh-theme-local/src/client/ContrastSlider.tsx`
- Delete: `packages/platform/dsh-theme-local/src/client/ShareString.tsx`
- Test: `packages/platform/dsh-theme-local/src/client/theme-studio.test.ts`

**Interfaces:**
- Consumes: `AppearanceController`, `AppearanceState`
- Produces: `ThemeStudio` (React Component)

- [ ] **Step 1: Write test for ThemeStudio layout and interactions**

```typescript
// packages/platform/dsh-theme-local/src/client/theme-studio.test.ts
import { test, expect } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react"; // or happy-dom container
import { ThemeStudio } from "./ThemeStudio.tsx";

test("ThemeStudio renders Mode Segmented Control, 3 Seasonal Cards, and Typography Stepper", () => {
  // Assert presence of parchment, warm-pink, forest-green buttons
  // Assert presence of light, dark, system mode options
  // Assert fontScale stepper functionality
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dsh-theme-local vitest run src/client/theme-studio.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `ThemeStudio.tsx` and updated `studio.css`**

Build:
1. `ModeSegmentedControl` (浅色 / 深色 / 跟随系统);
2. `SeasonalThemeCardGrid` (羊皮纸 · 秋 / 暖白粉 · 春 / 森林绿 · 夏，含 4 格动态微缩预览色块);
3. `TypographyStepper` (90% ~ 130%);
4. `LivePreviewCard` (实时展示按钮、文本、代码段效果);
5. Remove all legacy sliders, hex pickers, and share strings.

- [ ] **Step 4: Verify test passes**

Run: `pnpm --filter dsh-theme-local vitest run src/client/theme-studio.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/platform/dsh-theme-local/src/client/ThemeStudio.tsx packages/platform/dsh-theme-local/src/client/studio.css
git commit -m "feat(ui): 参照 Qoder 重构外观设置面板与季节主题卡片"
```

---

### Task 4: 薄壳（`apps/lute-shell`）与 Host 端双向同步

**Files:**
- Modify: `packages/platform/dsh-theme-local/src/theme-host.ts`
- Modify: `packages/platform/dsh-theme-local/src/index.ts`
- Test: `packages/platform/dsh-theme-local/src/theme-host.test.ts`
- Test: `apps/lute-shell/tests/appearance-sync.test.ts`

**Interfaces:**
- Consumes: `AppearanceState`
- Produces: Host service `appearance`, broadcasting updates over IPC to Electron main

- [ ] **Step 1: Write failing test for Host service state broadcasting**

```typescript
// packages/platform/dsh-theme-local/src/theme-host.test.ts
import { test, expect, vi } from "vitest";
import { AppearanceHostService } from "./theme-host.ts";

test("AppearanceHostService syncs mode changes to subscribers", () => {
  const service = new AppearanceHostService();
  const listener = vi.fn();
  service.subscribe(listener);

  service.updateAppearance({ mode: "dark", theme: "parchment" });
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ mode: "dark", theme: "parchment" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dsh-theme-local vitest run src/theme-host.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Host appearance service and thin-shell bridge**

Bridge state to `ctx.emit('appearance/change', state)` and handle Electron `nativeTheme.themeSource`.

- [ ] **Step 4: Run Host tests**

Run: `pnpm --filter dsh-theme-local vitest run src/theme-host.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/platform/dsh-theme-local/src/theme-host.ts packages/platform/dsh-theme-local/src/index.ts packages/platform/dsh-theme-local/src/theme-host.test.ts
git commit -m "feat(host): 实现 Host 外观服务与薄壳 Electron 原生同步"
```

---

### Task 5: 门禁验证与全站契约闭环

**Files:**
- Verify: `scripts/gate.mjs`
- Test: `pnpm run gate`

- [ ] **Step 1: Run whole gate suite to detect regressions**

Run: `pnpm run gate`
Expected: All gates PASS including `sidebar-row-axis`, `sanbao-tokens`, and test suites.

- [ ] **Step 2: Build bundle verification**

Run: `pnpm --filter dsh-theme-local run build`
Expected: Clean build without missing exports.

- [ ] **Step 3: Commit final integration changes if any**

```bash
git commit -m "chore(gate): 验证外观插件重构并确保全量门禁通过"
```
