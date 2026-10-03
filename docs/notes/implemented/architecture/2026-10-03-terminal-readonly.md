# 043 集成终端只读呈现：两读端点、缺项未就绪与「面板开关不触执行」

> 决策与规则见 [ADR-0243](../../../adr/ADR-0243.md)。

## Problem

FW-037/US-203/204：终端只在工作台侧面板内提供，打开/关闭不影响执行；输出作为运行观察只读
呈现，不进对话历史、不作产物、不接收权威动作输入；无可用终端显示未就绪与缺项。原产品证据：
P14.terminal.entry + M03 终端工具。基座事实 pin 包 `dsh-terminal`：owner 作用域
`terminals.list(owner)`（snapshot{id,name,type,pid,status}）与 `terminals.read(owner,id,{offset,count})`
（有界滚动页）；写半边 spawn/kill/signal/send 存在但本票不接。

## Decision

- 桥 +`session/terminals`（read；行有界、裁 pid/无 cwd；缺席=bridge-provider-unavailable、
  无活代理=bridge-session-not-live）＋+`session/terminal-read`（read；text≤64KiB 截断标注＋分页
  元数据）；消费登记 +terminals；host 表 +2。
- `main/terminal.ts`：无能力=unavailable+reason（未就绪句）；零会话=合法空态另一句；
  read 先对最近 list 校验（not-listed 零桥调用）；offset/lines 双层校验。
- 面板开关不触执行（结构）：无写端点；打开=本地开关+一条读页、关闭=纯本地零请求；
  调用表恰两读（spec 断言）；块内无 input/textarea/select。
- 授权扩面/持久化导出/真实 shell 包装承诺首版不做；写半边桥面永不出现。

## Alternatives considered

接 spawn/kill（否：工单边界只读）；空终端壳（否：验收 1）；输出入史入列（否：US-204）；
暴露 pid/cwd（否：033 机器路径纪律）；长订阅流（否：基座是有界页，第二推流面必漂）。

## Consequences

- 机器断言：①无能力=unavailable+缺项句不显示空终端；②输出不进对话同步与产物列表
  （调用表恰两读＋transcript 容器不受影响＋文本只落 #terminal-output）。
- §1.6：1440/660 两宽——「终端 2 项（只读运行观察；打开/关闭面板不影响执行）。」＋两行
  （运行中／已退出（exitCode 1）＋[打开输出（只读）]）；flow 展开态按钮变[关闭输出]＋输出页＋
  「只读运行观察（第 0–2 行 / 共 12 行）——不进对话历史、不作交付产物，也不接收操作输入。」；
  DOM 恰一条 POST `{terminalId:'t-1'}`。
- 已知未闭：真实 PTY 真机未跑；滚动导航与持久化后置；真机 Electron 未跑。
