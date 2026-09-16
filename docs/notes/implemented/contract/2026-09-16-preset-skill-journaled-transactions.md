# 2026-09-16 · preset/skill 的路径校验必须覆盖最终落点，批量提交必须能从 journal 恢复

关联：[ADR-0093](../../../adr/ADR-0093.md)、[ADR-0023](../../../adr/ADR-0023.md)、
[P-23 / P-28](../../../pitfalls-playbook.md#p-23--删除用户预设不跑引用面预检会话恢复当场-not-found)

## Problem

两个旧入口共享同一种失败形状，但此前被当成两类小问题：

- preset 删除只检查 `join(userRoot, id)` 是否存在，`id=".."` 可把 target 变成 root 外目录；之后按项
  `ditto → 文件数/总字节数 → rmSync`，尾项失败时前项已经不可逆删除。
- skill installer 校验 `name`，实际写盘却使用 `installAs ?? name`；同时在循环里先 `rmSync`/写 `SKILL.md`
  再发现后项问题。`--only pm` 还会无条件夹带 70 个 existing skill。

fail-first 在临时根复现：旧 installer 的 `--only pm` 选择 133 而非 63；旧 remover 接受 `--ids ..`。
两条都没有 journal、排他锁或 batch rollback。会话扫描另有一个同族假绿：sessions root 缺失、解码器非零退出
或关键 JSON 破损时仍可能被读成“零引用”。

## Decision

把问题收敛为三个窄层，而不是给两个 CLI 各打一个局部补丁：

1. `preset-skill-paths.mjs` 只负责 final name、root/direct child、树 manifest、verified copy、durable JSON 与锁。
   名称只接受 lowercase ASCII kebab；root、target、树内 symlink/hard-link/special file 全部 fail-closed。
2. `preset-skill-transaction.mjs` 只负责一个 root 内的 directory replace/remove：全批校验、同锁 prepare、
   staging、intent journal、backup/quarantine、逆序 rollback 与显式 recovery。它不解析产品参数，也不做 GC。
3. remover、restore 与 installer 各自负责业务 preflight，再把已经证明的 plan 交给事务层。默认 dry-run；
   `--force` 只绕过“已知 session 引用”这个产品决策，不能绕过扫描失败、路径、digest、锁或恢复能力。

preset archive 使用逐树 SHA-256 manifest，remove commit 是 rename 到 quarantine；restore 拒绝旧的“文件数 + 总字节”
证明。skill existing 更新先复制完整旧目录，仅在 staging 中改 `SKILL.md`，然后整目录 swap；新第三方技能因
SEC-RT-002 审批账本未落地，真实 apply 整批拒绝，不以本卡伪造审批字段。

## Alternatives considered

- 在旧循环前多加一次正则：只能挡 `../`，挡不住 root/parent symlink、大小写/NFC 冲突、TOCTOU 与半批提交。
- 用临时目录后逐项覆盖文件：resources 仍可能跨版本混合，恢复面也无法用一个 digest 表达。
- 捕获异常后重新跑 installer/remover：现场可能已是混合版本，重跑会覆盖 recovery evidence。
- 自动判断 stale lock 超时：时间不是 owner 已死亡的证明；改为 journal token + batch + PID 三项显式接管。
- 等 SEC-RT-002 一起做：会继续让 preset 删除暴露路径逃逸；因此事务底座先落地，第三方 promotion 保持锁闭。

## Consequences

- 定向 suite 覆盖 final-name/NFC/case、root/target/tree link、hard link、同尺寸篡改、全批尾项失败、并发锁、
  copy/fsync/journal/old rename/new rename/close fault、真实子进程 rename 后硬退出、orphan adoption、
  preset remove/archive/restore round-trip 与 installer 整目录 swap。
- recovery evidence 默认永久保留；后续若增加 GC，必须是另一条带 retention 与 journal-state 证明的决策。
- `--apply` 是 mutation authority，不代表第三方供应链已获批准。第三方 installer 还要同时满足 SEC-RT-002。
- 本轮没有修改真实 preset/session/skill，也没有把临时根的成功提升为 live/DMG/生产验收。
