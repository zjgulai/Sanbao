# 设备偏好独立读取与默认桌面设置主链

- 日期：2026-10-05
- 决策：[ADR-0270](../../../adr/ADR-0270.md)
- 状态：已实施；改动未提交

## Problem

默认桌面只有最小 bootstrap 和既有偏好 POST，设置页无法独立读取八项设备偏好；若 renderer 从 bootstrap 补默认值或从 POST receipt 直接更新，会把未持久化、拒绝或 timeout 冒充成功。新 GET 还必须与业务 projection-read 分权：设备显示偏好不需要 active matter，但也不能因此绕过 caller/frame/freshness。

## Decision

1. 建立 `GET /.sage/device-preferences` 与 route-specific unavailable code，使用 local-system admission；读中身份或读后 frame generation 变化都丢弃结果。
2. main runner 从 `preferences.snapshot(nativeTheme observation)` 取得权威值，再裁剪为 exact DTO；validator 同时约束八项枚举、canonical `savedAt` 与 `effectiveTheme`。
3. renderer controller 串行 refresh/save；POST 后总是 GET，只有 GET 成功值可以更新 root attributes 和表单。失败且回读也不可用时 root 回到 unknown，不保留乐观值。
4. 默认桌面 mount controller，账号菜单进入八项原生表单。theme/density 消费既有唯一 token 家；其余六项只保存，文案显式披露未应用。
5. route matrix/gate 从 59/1 更新为 60/2，并为 device-preferences 增加独立 source proof、exact GET/read/provider facts 与 mutation tests；T03-A state collection 与 T03-D search 既有改动完整保留。

## Alternatives considered

- 让设置页读取 `/.sage/state`：需要 active-matter grant，且会把设备偏好绑到业务聚合，否决。
- 让 bootstrap 承载八项：扩大启动投影并重复设置 owner，否决。
- 在 renderer localStorage 保存：绕过设备封存、main authority 与 restart truth，否决。

## Consequences

- signed-out 首页也能取得真实本设备外观值；业务 state/search 的准入没有放宽。
- 设置保存可以确认“写后可读”，但未接消费面的六项不会被描述为生效。
- root-level GET 改变了旧 UI 测试的 fetch 基数；session/search 测试通过 inert controller 隔离，原 POST 数量、路径和 payload 断言保持不变。
- 当前 live evidence 只覆盖读取、设置页挂载、theme/density、reflow 与无异常；真实保存点击和 packaged second-process restart 进入 DMG 验收。

## Verification

- 定向设置/route/UI 回归：7 files、97 tests PASS。
- route-authority mutation self-test：35/35 PASS；实际 gate `expected=60, discovered=60, checked=60, skipped=0, failed=0`。
- 完整 Sage Shell suite：199 files PASS，1808 tests PASS，1 skip。
- `pnpm --dir apps/sage-shell build`：PASS；product bundle 425159 bytes，desktop bundle 298813 bytes。
- 真实 Electron（Qoder 启动、真实服务响应、无 fixture）现场检查：唯一 `dsh-app://app/index.html` 产品窗；device DTO 八项可读、设置页八个 select、root facts 正确、1440/660/320 CSS px 无横向溢出、exceptions=0；本地诊断输出在 `.scratch/codex-device-preferences-live-2026-10-05/`，不作为矩阵 tracked completion evidence。
