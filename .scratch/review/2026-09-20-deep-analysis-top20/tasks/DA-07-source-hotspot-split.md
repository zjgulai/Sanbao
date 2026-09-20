# DA-07 · 源码热点拆分（ResearchView.tsx / wanzh lib/index.js / investigation.ts / gate 核心）

- 优先级：P1
- 状态：`open`
- 依赖：无
- 估算：L
- 来源：本次图谱实测；报告 TOP20 #7

## Problem

图谱实测的单文件职能密度（**注意区分源与构建产物**）：
- `packages/capabilities/dsh-deepresearch-local/src/client/ResearchView.tsx`：39 函数 / 552 条调用边（全仓最大单文件调用面）；
- `…/src/investigation.ts`：32 函数；
- `packages/capabilities/dsh-wanzh-hulian/lib/index.js`：31 函数（**纯 JS 包，lib 即源码**，files 清单交付物）；
- `scripts/gate.mjs`（24）+ `scripts/gates/checks.mjs`（23）：门禁核心两位一体，且 gate.mjs 是最高频改动入口之一。
TS 包的 `lib/*.js` 是 tsc/tsdown 产物，不计入本条。

## 动作

1. 先拆 `ResearchView.tsx`：视图渲染 / 状态管理 / 请求逻辑三层分离，hooks 抽离；
2. 再拆 wanzh `lib/index.js`：按域拆模块（oauth / boards / 路由注册等），**同一提交同步 `files` 清单**（P-24 复发形态：漏加=全新安装 ERR_MODULE_NOT_FOUND）；
3. `investigation.ts` 与 gate 核心视窗口排期（gate.mjs 需先看是否有在飞改动，P-43 并发会话）；
4. 全部按本仓纪律：行为不变 + 留 Note。

## 验收

- 相关包 `typecheck` + `test` + `build`（含 validate-build）全绿；
- `package-files-coverage` 不红（wanzh 拆出的每个新 lib 文件都在 files 清单内）；
- 行为证据留存：受影响能力的 acceptance 脚本读数或实况截图。

## 注意

先读 `docs/pitfalls-playbook.md` P-24/P-47；拆分不做「顺手重构」，一次只拆一个文件。
