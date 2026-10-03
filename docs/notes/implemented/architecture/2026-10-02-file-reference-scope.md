# 013 本地引用：scope 归属、只 stat 的建立、取用前重核

## Problem

工单 013 的验收三条里两条是硬的：「引用创建时不读取文件正文（有断言）」「源变更后取用被阻断且提示具体失效原因」。
取证基座 `workspaceFiles` 时先撞上一个更前置的问题：**文件读的范围不是目录，而是会话**——
`WorkspaceFileScope = {sessionId, workspaceRoot}`，由基座 lookup 从线上的 SessionId 解析
（`workspaceRoot = header.cwd ?? sandboxPolicy.workspaceRoot`）。本 shell 现在一个会话都没有，
而 scope 又不该由 Sage 自己发明。

## Decision

- **scope 来自真实会话**（ADR-0207 D1）：桥在 `sessions.list()` 里找 `header.cwd` 等于所请求根的活会话；
  没有就答 `bridge-file-scope-unavailable`，文件服务一次也不碰。
- **引用只从候选建立**（D2）：候选 = 基座 `list`（工作区限定，越界即 `outside-workspace`）；
  main 另设早门拒绝绝对路径与 `..`，不经桥。
- **建立＝一次 stat**（D3）；**取用先重核版本**（D4），不等即 `source-changed` 且在任何 `read` 之前阻断；
  `read` 自报 token 不符同样阻断（不交付不匹配内容）。
- **取不到的说法自成一格**（D5）：`source-not-readable`，界面明说"这次取不到"且不宣称删除、不换源。
- **记录只在本次运行**（D6），界面明说未持久化。

## Alternatives considered

- 桥自铸 sessionId / 拿沙箱根顶替：伪造身份且工作区语义失真，否决。
- UI 手输绝对路径：工作区外引用本就不做（工单明确不做），否决。
- 取用时读最新内容：把用户确认过的来源悄悄换掉，正撞"源变更即阻断"，否决。
- 解析 version token 得到"何时变的"：基座明文 never parsed，否决。
- 引用落库：存储与归属未决（002 草案存储未决），先落库=第二家；本票记 in-process 并写明，否决。

## Consequences

- 生产面在"有会话绑定工作区"之前恒不可用（`bridge-file-scope-unavailable`）——这是当前 shell 的真实状态，
  002/005 接上会话后自然可用；真机端到端未跑（本票不启动 Host），版本的失效判据与成本上限留待实测。
- 三条验收各有机器断言：单次 stat（无 read）、变更即阻断（无 read）、越界早门（不触桥）；
  界面文案有反例断言（不得出现删除式表述、不得换源）。
- 引用记录进程内；`fileCandidates/fileReferences/fileReferenceUse` 三个投影槽随状态一起出。
