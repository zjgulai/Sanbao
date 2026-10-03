# 038 输入区技能与插件选择器：挂载投影只读、随请求携带与「未挂载≠已停用」

> 决策与规则见 [ADR-0238](../../../adr/ADR-0238.md)。

## Problem

FW-036/US-189~191：技能/插件列表只读来自挂载观察（名称、来源、可用性）；选择只对本次请求
生效并随请求携带；未挂载显示不可用与缺项、不说成"已失效"；选择插件不改变启用状态、不宣称
已获得能力；无 authority 时 unavailable-first。基座事实：`ctx.skills.snapshot()` →
`{skills:[{name,description,invocation:{modelInvocable,userInvocable},source,provider}], complete}`
（`complete:false`=发现未完成）；插件侧复用 026 的组合 runtime inventory 同一投影。

## Decision

- 桥面 +`skills/snapshot`（read；有界摘要+complete；缺席=`skills-unavailable`）；消费登记+skills；
  host 表 deliberate +1。
- `main/input-selections.ts`：技能=快照投影（不完整⇒具名句「不得当作"已失效"」）；插件=同一
  classifyPlugins 结果；`select` 校验（userInvocable/挂载行；not-listed/not-mounted/model-only
  各有码，全程零桥写）；`carryPrefix=[/skill:x] [/plugin:y] ` 经同一发送入口随请求携带，
  accepted/deferred 后 consume 清空、refused 保留、事项间不泄漏。
- 渲染面：只读清单（model-only 禁用+显句；插件行「已挂载（组合内实际存在）」）＋选中 chips
  「（随下一次发送携带）」（插件显式「不改变启用状态，也不代表已获得能力」）+[清除]；
  select/clear 各恰一条 POST。
- 启用/安装/授权/配置写与市场跳转首版不做。

## Alternatives considered

直读文件系统列技能（否：注册表才是挂载权威）；插件另开观察（否：同一事实第二个家）；
选择写启用状态（否：§7.5/明令）；跨请求保留（否：只对本次请求生效）；不完整时标"已失效"
（否：不完整≠消失）。

## Consequences

- 机器断言：列表来源为挂载观察（未挂载/未读如实不写"已停用"）；选择只影响本次请求
  （同事项下次无前缀、他事项不受影响、accepted 后清空）。
- §1.6：技能三行（可选用/仅模型可调用不可选）＋插件两行（已挂载）＋不完整句＋chip；DOM 读数
  select 恰一条、SKILLS 3/PLUGINS 2、model-only 禁用。
- 已知未闭：快照端点真机真实调用未跑；写面与市场跳转后置；真机未跑。
