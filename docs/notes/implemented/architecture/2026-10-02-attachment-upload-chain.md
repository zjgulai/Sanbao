# 014 附件上传链：候选即封存版本、流式过桥、回执摘要核验

> 决策与规则见 [ADR-0217](../../../adr/ADR-0217.md)。

## Problem

FW-010/011 要求附件走基座上传链：选择只产生候选、确认后经 main 流式上传取 receipt、回执区分
传输/核验/关联、部分失败续传同一封存版本、随消息发送并在历史回看，机器路径不出本机；核验项是
receipt 的"同一会话"绑定与事项隔离。基座有完整通道（`fileUploads.uploadStream` +
`FileAttachmentRef` = 内容寻址），Sage 缺的是产品接线与事项范围绑定。

## Decision

- 候选=封存版本：pick 只做一次有界封存（sha256+字节数，64MiB 上限）；投影只带 name/bytes/stage。
- 桥四端点 begin/chunk/commit/abort；宿主注册表有序收 128KiB 分块、终块校长、失败唤醒消费者；
  commit **先于**后续分块发出——store 边到边拉，不聚合整文件；commit 时限 120s（其余 10s 不动）。
- 内容核验=回执 `attachmentId`（sha256）对本地封存摘要；不一致=source-changed（需重选，同 item
  再传被拒）。部分失败重试同一封存版本：测试断言两次尝试的字节逐位相同。
- receipt 同会话：基座在会话 Agent 作用域解析，跨会话即 `session/attachment-invalid`；上传与
  send/resume 共用 `ensureSession`；本地记录运行内有效，持久记录是会话日志（重开沿历史回看）。
- 发送：stored 附件随下一条消息（text 可空）；仅受理回执标 sent；暂停期带附件发送整体拒绝；
  历史折叠只补带附件的 user/message 行，按 rpcId 去重（005 的 echo 模型不动）。
- 呈现：传输中/内容核验通过/已随消息发送分句；上传成功不写"已读取/已使用"；无独立附件列表面板、
  无跨消息复用（工单 §7）。

## Alternatives considered

- 基座 HTTP 上传路由：被 `routeRequest` 拒绝面挡死且 renderer 无文件读取权——否决。
- commit 放在全部 chunk 之后：宿主整文件入队，违背"不聚合上传"——否决（改为 commit 先行）。
- 单次桥调用带 base64 全量：违背有界分块——否决。
- 上传前复制本地快照：D-093 后置；封存摘要+回执核验已达成同版本语义——否决。
- 暂停时把附件挂进待继续：receipt 运行内有效、待继续跨运行——拆半承诺，否决。

## Consequences

- 三条验收机器断言：词表扫描（不冒充已读取）、同版本重试（字节逐位）＋源变必重选、机器路径零出现
  （投影与桥载荷双断言）。
- 桥面 17→21 端点；服务消费登记加 `fileUploads`；host lib 清单加 `host/attachment-uploads.js`；
  顺手删掉 bridge 流式分支两段不可达重复块。
- 全量套件 870→901（新 6 个 spec 文件/追加 31 条）；gate 25/25。
- 已知未闭：真机 E2E 未跑；图片专用通道与跨消息复用不做；断点续传按"同版本重传"读。
