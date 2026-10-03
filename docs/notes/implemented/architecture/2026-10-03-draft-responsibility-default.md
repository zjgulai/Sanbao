# 004 建项责任默认值：main 登录投影一处取值与「改责任不动权限」

> 决策与规则见 [ADR-0247](../../../adr/ADR-0247.md)。

## Problem

FW-022/US-008：责任字段默认填入当前已认证身份，且 UI 自报身份不作为授权依据。依赖面曾因
「真实 Organization Policy Provider 未就绪」暂缓；用户裁决走真环境（真实 Logto 部署输入在树内）。

## Decision

- `renderDraft` 责任默认块：默认=同一份 `service.auth` 投影（真登录链 vault 快照）；saved 值优先、
  默认位让开；注入不覆盖用户输入；仅随「保存草案」落盘；无身份三句缺失说明（登出/登录中/无显示名）。
- identity handle 不进入 renderer 面、不落草案记录（2B.2E 契约）；不新增路由/端口。
- 验收：草案路由双层精确键（identity 走私 400）；单 port＋命令/授权管线零调用；编辑前后
  auth/reason/command 逐字节不变。
- 真机探针（隔离 SAGE_ROOT＋CDP）：真实登录 PrayChow → 默认填充 → 编辑保存落盘 → 登出回锁；
  抓到并修复 `HTMLCollection.filter` 实机缺陷（改 `Array.from`）。

## Alternatives considered

默认写进草案记录（否：破 US-010）；handle 进表单/草案（否：运行期引用+2B.2E 契约）；renderer
自取身份（否：US-008）；登出保留未保存默认（否：误导）；main 在 update 路由代填（否：写路径纯
用户驱动）。

## Consequences

- 机器断言两条：不伪造默认（渲染契约面）＋改责任不动权限（走私拒/单 port/管线零调用/投影不变）。
- 真机证据：`/tmp/wk004/real-default.png`（默认填充态）、`real-after-logout.png`（登出回锁）、
  `evi/crop-{signedin,signedout,nameless}-1440.png`（离线三态两宽）。
- 配方教训：模板字面量内注释禁反引号；`npx tsc | head` 的 `$?` 是 head 的（P-17）；dev 循环
  必须「干净构建 → materialize → 启动」，失败构建的 emit 会被 materialize 固化进 profile。
