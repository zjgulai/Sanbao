# 036 已发消息的编辑与重发：版本链、同入口单身份与核对解冻

> 决策与规则见 [ADR-0236](../../../adr/ADR-0236.md)。

## Problem

FW-035/US-185~187：编辑已发送消息产生新内容与版本、保留原版本及提交关系；重发只针对编辑后
内容走同一命令入口，重复点击不并行发起、原消息不重复派发；结果未知先核对同一操作，不自动
重试、不直接放回可重发队列。基座事实：`prompt` 按 `source.rpcId` 全量去重（live inbox＋durable
`user/message`）；`user/message.source.rpcId` 是消息身份；005 发送入口即"同一命令入口"。

## Decision

- `main/session-edits.ts`：`save` 首次从通道 transcript 捕获原文（不可变）后追加版本（≤16），
  保存零桥调用；`resend` 走**通道 send**（同 session/prompt 路径），**每版本 requestId 铸造
  一次**（跨点击稳定；原 rpcId 永不作为重发身份）；`inFlight` 闸 + 基座 rpcId 去重 ⇒ 重复点击
  不并行不重派；已接收/已生效重复点击返回同一回执零调用。
- `verify` 有界查该版本 rpcId：命中→effective；未命中且原 unknown→not-delivered（**显式核对
  后**才允许显式再发，身份不变）；原 accepted→保持 accepted（edit-version-not-visible）；
  暂停态重发拒 `edit-paused` 且版本回到未提交。
- 005 deliberate：`SessionChannelEntry.messageRef`（echo/history rpcId）；`send` 可选
  `requestId`；同步 `transcriptOf`（原版本的家=日志上次读到的行）。
- 渲染面：会话行 [编辑]（本地填编辑器零请求）→[保存为新版本]→版本链（原消息（未改写）/v1/v2
  状态）→[重发 vN]；unknown/accepted → 只给 [核对同一操作]（无重发钮）。
- 路由 `/.sage/session/edits`（save/resend/verify 精确体）；端口名册 +3；033 守护 +1 族。

## Alternatives considered

复用原 rpcId 重发（否：基座去重会拒收编辑内容）；改写历史消息体（否：US-185/基座无动词）；
客户端提交原文（否：原版本须锚在日志）；未知后直接恢复重发钮（否：US-187）；暂停态并入待继续
（否：无身份会半留）。

## Consequences

- 机器断言：原版本可回看且原文不变；同版本重复点击恰一条 send、换版本换身份、原 rpcId 从不
  作为重发身份；unknown 后重发被拒、核对确认未送达后才允许显式再发。
- §1.6：编辑器（消息 req-original-1（原消息不变））＋版本链（原消息（未改写）/v1/v2（当前）
  ＋状态与 [重发 v2]）；DOM 读数：保存+重发恰两条、未知态只有 [核对同一操作]、核对后
  「核对确认未送达：可再次显式重发（不自动）」。
- 已知未闭：历史删除、他人消息编辑、自动继续后置；版本链进程内（重开清空，028 先例）；真机未跑。
