# DA-07 · 源码热点拆分（ResearchView.tsx / wanzh lib/index.js / investigation.ts / gate 核心）

- 优先级：P1
- 状态：`in-progress`（ResearchView 首片、client 构建与隔离浏览器验收已补；DSH 集成、全仓门禁及其余热点未完成）
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
4. 源码拆分保持行为并留 Note；用户后续批准的旧产物→当前 SOURCE 同步及终审修复是独立行为变更，见 [ADR-0156](../../../../docs/adr/ADR-0156.md)，不把整批标成行为保持。

## 验收

- 相关包 `typecheck` + `test` + `build`（含 validate-build）全绿；
- `package-files-coverage` 不红（wanzh 拆出的每个新 lib 文件都在 files 清单内）；
- 行为证据留存：受影响能力的 acceptance 脚本读数或实况截图。

## 注意

先读 `docs/pitfalls-playbook.md` P-24/P-47；拆分不做「顺手重构」，一次只拆一个文件。

## 首片部分结算（2026-09-21）

- 已完成 ResearchView 的五模块拆分、hook 行为测试与跨展示文件的视觉断言；调用方/API 未改。
- 基线、RED/GREEN、强制编译、清单判据、保留问题和临时浏览器入口统一记录在
  [决策 Note](../../../../docs/notes/implemented/surface/2026-09-21-research-view-separation.md)，
  对应 [ADR-0155](../../../../docs/adr/ADR-0155.md)。
- client 构建缺口已补：复用 repo 本地插件 preset，实际 build 回归先红后绿，重建并核验 shipped client 与 host；
  具体命令、78 条测试、sourcemap/factory、Typert 保留及依赖隔离证据见同一 Note 的构建补片章节。
- **终审修复波次**：scope 订正、HTML 注入、删除依赖错位、CSS 产物精度四项已处置；保留当前 SOURCE 的 workbench/overlay-only 入口及预算/来源/编辑/导出能力。
  实际 built factory/apply、CSSOM、DOM 和点击提交 payload 的 RED/GREEN，最终全包/强制编译/build/verify 输出与最终哈希归
  [产物同步 Note](../../../../docs/notes/implemented/surface/2026-09-21-deepresearch-artifact-sync.md)。协调者已复验 84/84 测试与实际 bundle 浏览器 8/8；定向复审四项全关闭，无新增阻塞项。首片本地验收通过，不标整卡完成。
- **不是全卡完成**：wanzh / investigation / gate 拆分未做；主树与 worktree 均缺 manifest 声明的 21 个旧版开发运行时 tarball，
  完整从零安装未验证；validate-build 脚本不存在；source 与实际 bundle 的隔离浏览器交互已补证，DSH 集成未验证，整仓门禁仍失败。
  读数与剩余边界见同一 Note 的协调者验收章节，不用组件预览替代实机读数。
