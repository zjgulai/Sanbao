# 右栏受控原生浏览器

- 日期：2026-09-24
- 相关：[ADR-0158](../../../adr/ADR-0158.md)
- Birdview：`.birdview/activity-controlled-browser.html`（revision 2，用户确认后实施）
- 当前基线：**deferred**。BASE-04 只保留决策证据，未回放 controlled-browser 源码、Qoder sidebar 增量或 packaging 接线；不得把本文历史实施记录当作当前 Sage 基线已具备该能力。

## Problem

右栏浏览器原型依赖 iframe，不能在宿主层对远程页面的导航、权限和原生内容生命周期建立可验证边界。用户已确认以 Birdview revision 2 的最小文件级方案替换它。

## Decision

在 `dsh-qoder-sidebar-local` 中增加 Browser tab，并仅在检测到 `window.dshControlledBrowser` 的五个完整方法时启用。它将 Browser tab 的可见占位 rect 发送给宿主；tab 非激活、取消、零尺寸或不支持的浮动布局一律隐藏原生视图。

宿主补丁创建独立、非持久的 `WebContentsView`。所有导航和请求均由同一 HTTPS/公网 URL 策略裁决，远程内容没有 preload、Node 或 DSH bridge；权限、popup、webview、下载、认证和证书交互默认拒绝。补丁只能作用于临时 fixture 或 packaging staging app，带专属回滚备份和锚点验证。

## Alternatives considered

- 保留 iframe：初始 URL 校验无法覆盖页面自己发起的跳转和加载，拒绝。
- 使用 `<webview>`：把不可信内容的嵌入能力放到主渲染器，拒绝。
- 直接修改 vendor 或已安装应用：违反基座与生产边界，拒绝。

## Consequences

这是一条跨包、宿主运行时与打包链的能力，因此源码、构建、fixture、staging 锚点和实机读数分别记录；任一层未运行不得替代另一层。首批只承诺 URL 层和 Electron policy 层的拒绝，不把 DNS rebinding 的最终连接目标、内网访问、OAuth popup 或下载伪装为已经解决。
