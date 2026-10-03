# 044 产物独立预览窗口：同版本引用、显式打开与「关窗不动运行」

> 决策与规则见 [ADR-0244](../../../adr/ADR-0244.md)。

## Problem

FW-037/US-205：产物独立预览窗口仅在用户显式动作下打开，与侧面容器共用同一版本引用；迟到
结果不覆盖当前选择，关闭不取消运行。验收：①显式动作前不创建窗口；②窗口与侧面板同时存在时
不出现两份权威版本值；同版本重开不重跑生成。既有面（015/033）：单一侧面板容器＋generation
守卫＋版本冻结＋全屏（同文档布局切换）。

## Decision

- `artifact-preview.ts`：`lastLoad`（同一份已备文稿引用）＋`windowContainer`／`window` 态；
  `openWindow` 仅 ready 且显式可调、零桥调用、同引用加载、generation 迟到丢弃（销毁拒
  `artifact-superseded`）；`closeWindow` 只销毁窗口（面板/产物记录不动）；`close()` 释放两个
  表面（各自回收自己的 sage-preview 令牌——面板不再一刀 `served.clear()`）。
- `createWindowContainer` 注入（生产＝`createPreviewWindowContainer` 真实非特权 BrowserWindow）；
  路由 `/.sage/artifacts/window` `{action:'open'|'close'}`；名册 +2；装配守护 +1。
- 多窗口标签/窗口内编辑回写/窗口级权限策略首版不做；真机后置。

## Alternatives considered

窗口独立重读（否：两份版本值）；卡片即建窗（否：验收①）；关窗取消运行（否：US-205）；
面板/窗口互斥（否：验收②以并存为条件）；一刀 served.clear（否：会清另一表面）。

## Consequences

- 机器断言：①显式前零创建（工厂计数 0、未点击零请求）；②并存一份权威（同引用、零桥调用、
  迟到销毁）；同版本重开不再读。
- §1.6：1440/660 —— 就绪态三按钮（全屏/在独立窗口打开（同一版本）/关闭预览）；window:true
  按钮变[关闭独立窗口]＋句尾「独立窗口已打开：同一文档、同一版本引用；关闭独立窗口不改产物
  记录」；flow 恰一条 `POST {action:'open'}`＋「未重读、未重跑生成」。
- 已知未闭：真实 Electron 窗口真机未跑；窗口级交互后置。
