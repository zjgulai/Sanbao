# 032 方案预览、步骤就绪、退出清单、引导与环境

> 决策与规则见 [ADR-0229](../../../adr/ADR-0229.md)。

## Problem

FW-034/US-165~171：接受方案≠执行方案（D-043/061）；步骤就绪按动作前提、未知=阻断而非
失败、不就绪不派发（D-056/071）；执行针对明确动作、携带一次性凭据（D-055）；退出先列
影响——进行中/待继续/未保存（D-013/014），关闭窗口≠退出、停止不承诺撤回（D-022）；
引导只读不替代登录授权（不自动改配置）；环境只读显示来源（D-042），默认执行环境来自
011 关联事实并在派发前逐次核验（D-091）。基座：执行主体归 fail-closed 流水线（0190 步骤
3–10 收紧），生产不接线；可复用 025 共享确认 store 与 011 前提家。

## Decision

- `main/plans.ts`：create 守卫；accept=回执（零铸卡/零消耗/lastStepRun 保持 null）；
  readiness 每次重推导（unknown=阻断不称失败、环境缺失=not-ready、未选定=ready）；
  prepare 只对 ready 铸单卡；execute 先重验新鲜度（变了 retire+拒绝）再 consume；
  端口缺席=not-ready 且**不消耗**（可重放）；每次尝试写 lastStepRun。
- 路由 `/.sage/plans`（精确体 1–4 键、stepNo 1..12）；槽 `plans`；四枚端口（createPlan/
  acceptPlan/preparePlanStep/executePlanStep；未接线 `plans-unavailable`）。
- renderer：D9 方案卡（接受按钮只记回执；仅 ready 行有准备按钮）；执行结果以**响应随行
  投影**渲染（未接线句"没有伪造运行，也不消耗确认"），local notice 只留未记录态。
- profile 三卡：退出检查（投影事实+真实未保存字段合成；取消零请求；stop 发
  `/.sage/session/stop` 且明说不可承诺撤回）；引导（展开/收起本地零请求）；环境（三行
  事实各标源；无装配/跨设备/远端执行入口）。

## Alternatives considered

接受顺带铸卡（D-043/061 点名否决）、就绪缓存（D-091 逐次核验）、未就绪写"失败"
（D-056/071）、结果只用 local notice（遮蔽投影且刷新即失）、未接线伪造执行（ADR-0190
fail-closed）、退出面板直提供"退出应用"（D-013）。

## Consequences

- 机器断言：接受零派发（计数 0+lastStepRun null）；阻断结构性（铸卡前拒绝＋非 ready 行
  无按钮）；未接线不消耗可重放；新鲜度重验线旧卡（retire+stale）；一卡一次
  （replay=confirmation-consumed）；渲染 8 项文案/行为。
- 真页面实测：1440/660 两宽读 D9（三态就绪徽章、单卡七事实、投影结果句）与 profile
  （退出三行事实、引导展开、环境三源）；DOM 交互读数逐项核对。
- 已知未闭：生产执行主体未接线（如实 not-ready）；方案为运行内存储；环境存在性依赖
  最近成功折叠（未读取=unknown 阻断）；真机未跑。
