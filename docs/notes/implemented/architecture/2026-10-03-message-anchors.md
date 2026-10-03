# 035 消息锚点：轮次跳点、本地短预览与保留现场的缺失

> 决策与规则见 [ADR-0235](../../../adr/ADR-0235.md)。

## Problem

FW-035/US-183~184：锚点点击定位到该消息并显示短预览，不加载整段正文、不激活执行；目标运行
不可读保持缺失提示、不显示空白成功。产品证据（P01.anchor.preview + M01.message-anchor，N05）：
hover/点击出短预览弹层（预览＋「定位到此轮消息」＋关闭），hover 不提交命令；基座以 `turn/start`
为每轮锚。009 已立纯历史接点判据，035 在其上做跳点。

## Decision

- `main/session-anchors.ts`：`read` 只调一次有界 `session/page`（400 条），`runsOfRecords`
  组轮（首条用户消息为短预览、截断 ≤140），newest-first，MAX 50；`no-session` 不建会话；
  失败=`unavailable+code`；预览随列表随行（点预览零桥调用）。
- `locate` 一次有界窗口读（`beforeSeq:runSeq`）→ `located{runSeq,turn,promptPreview≤300}`；
  失败/不在页=`missing+code`（US-184 可判定）。
- 渲染面：读取按钮＋锚点行（`运行 @N·第K轮 — 预览：… [锚点预览]`）＋本地短预览弹层
  （`[定位到此轮消息][关闭预览]`）；hover 零监听；`located` 标记随投影重建（保现场）。
- `runsOfRecords` 增 `firstUserText`（加法）；路由 `/.sage/session/anchors` 精确体；
  端口名册 +2；033 装配守护 +1 族。
- 首版不做：收藏/分享、跨事项跳转、检索式定位。

## Alternatives considered

引入 `dsh-session-turn-outline`（否：客户端 rail 投影；009 页读已同构，免新增 host 服务面）；
点预览再读桥（否：短预览随行有界返回，点击必须零调用可断言）；hover 也触发（否：N05）；
定位失败清空锚点区（否：US-184 保现场不空白）。

## Consequences

- 机器断言：读/定位只调 `session/page`（预览点击与 hover 零请求、定位恰一条）；缺失具名句且
  行与预览仍在。
- §1.6：真产物两页（锚点行＋打开的短预览弹层，1440+660）；真实 Chrome DOM 读数：定位恰一条
  `{action:'locate',runSeq:12}`、缺失句与行数/预览保持。
- 已知未闭：收藏/分享、跨事项、检索式定位后置；真机未跑。
