# 021 搜索：两区、缺席与空结果分开、命中只读

> 决策与规则见 [ADR-0220](../../../adr/ADR-0220.md)。

## Problem

FW-014 要求一次输入两区结果：事项本地匹配 + 会话走基座检索（cursor 分页、有界、只可见会话）；
`dsh-session-query` 未挂载时不伪装"无结果"；搜索是读取面（命中不打开、不激活、不加载正文）。
基座证据：`sessionController.search` 返回 `{items(≤20), hasMore}`、snippet 截 240 码点；其首行即
`ctx.get("sessionQuery")` 缺席检查；内部 cursor 循环 + 100 次调用预算 + cwd 可见性过滤。

## Decision

- 事项区：本地已建项草案事实（goal 标题 + 三个关键属性）匹配、按 matterRef 去重、上限 20。
- 会话区：bridge `session/search`（read）一次调用；`hasMore` 如实显示"还有更多未列出"。
- 缺席：桥先检 `ctx.get('sessionQuery')` → `bridge-search-unavailable` → 会话区 `unavailable`，
  渲染句"…（这不是'无结果'；事项本地匹配不受影响）"与空结果句互斥；事项区照常。
- 边界三道（渲染器/route/桥）+ 基座自检；空关键词零请求。
- 只读：全部桥流量恰好一条 `session/search`（测试逐条断言）；命中无任何动作按钮；在途忽略重复点击。

## Alternatives considered

- 事项走基座搜索：事项是 Sage 自有对象、基座无该概念——否决。
- 缺席显示"无结果"：US-087 点名分开——否决。
- 真 cursor 外露分页：公开面无 cursor 参数——如实显示 hasMore，加载更多后置。
- 命中可点开：US-088 点名不打开——否决。
- 两区合排：US-089 后置——否决。

## Consequences

- 全量 937→950；新 spec：search.spec(7)、search-surface.spec(5)、bridge 追加 1 组；gate 25/25
  （`sessionQuery` 消费登记当场补）。
- 已知未闭：真机未跑；hasMore 后续页交互后置；正文检索与统一排序按 US-089 后置。
