# 033 成果补全：受控外链、typed 工具结果、只读目录与全屏预览

> 决策与规则见 [ADR-0230](../../../adr/ADR-0230.md)。

## Problem

FW-033/US-172~176：外链仅在显式动作下打开、不自动联网（D-036）；全屏退出恢复焦点；
图片缩放/平移为纯 UI、批注后置；网页成果目录只读、同源版本与访问限制、已托管≠上线
（OBS03/D-037）；工具结果按 typed 数据由 Sage 组件呈现、不支持类型明确拒绝、无脚本无权威
动作输入（M04/D-048）；详情脱敏、图片按权限、raw payload 不透传（M05）。实施中发现既有
**生产装配断链**：index 五族 wiring 被 app-service 装配点静默丢弃（spread 不过剩检查、函数
级测试直连 composition ⇒ 全绿假象），033 的产物依赖正落其上。

## Decision

- `main/external-links.ts`：唯一入口具名 open；http/https 白名单＋凭据/长度/格式各码；注入
  opener（生产 shell.openExternal）；投影只回 scheme+host；模块无抓取路径。
- 预览 ready 态加 `expanded`；`/.sage/artifacts/fullscreen` 只改几何不重载；退出全屏焦点还给
  触发器；图片文档 CSS-only 缩放＋滚动平移、零脚本、无批注控件。
- `main/tool-results.ts`：严格解析五类有界声明；敏感脱敏；不支持类型按名拒绝；链接复用外链
  校验；图片只认本运行就绪 image 产物；槽 `toolResults`（provider 缺席=unavailable）。
- 渲染：D10 工具结果卡（两枚显式按钮）＋D11 网页成果目录（html 筛选＋访问限制＋仅预览）；
  D4 预览加全屏查看按钮。
- `main/app-service.ts` 补五族声明与转发＋033 三键；`test/app-service-wiring.spec.ts` 守护。

## Alternatives considered

预览内开外链/内置浏览器（D-034/036 否决）、渲染端直接开（校验须在 main）、全屏=重载（US-172
否决）、脚本缩放（零脚本纪律）、不支持类型近似渲染（US-175 点名拒绝）、raw 透传调试
（US-176 否决）、断链只登记（P-20 要求知道⇒拦住）。

## Consequences

- 机器断言：外链三条（显式触发/恰一次/未接线诚实＋坏 scheme 拒于 opener 前）；目录筛选与
  文案＋控件名册；图片文档零脚本；装配守护每族标记往返。
- §1.6：D4 全屏态、D10/D11 两宽真实页面＋DOM 交错读数（链接点击→handoff 句、全屏→无重载
  句、目录行）。
- 已知未闭：工具结果 provider 不存在（如实 unavailable）；外链真机行为待真机；五族断链修复
  的窗口复跑挂在真机批；批注/发布后置。
