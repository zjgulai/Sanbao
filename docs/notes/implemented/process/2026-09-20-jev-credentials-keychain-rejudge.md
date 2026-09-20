# Jev 凭据风险面重判：Keychain 实测零收益，明确接受现状（ADR-0138 D7）

- 关联 ADR：ADR-0138（D7 凭证链；后果 2 原文为「已登记未消除」）
- 日期：2026-09-20
- 状态：implemented（决策收口，零代码改动）

## Problem

ADR-0138 后果 2 把「`LUTE_JEV_API_KEY` 对所有 agent 会话可读」登记成**已登记、未消除**的欠账，
并写明「若不可接受，回到 ADR 重判 D7（备选是 macOS Keychain）」。同一轮 ADR 里的另一条实测是：
本机 **64% 的 agent 步在跑 bash**，而 `~/.dsh/.credentials.yaml`（实测 `-rw-------` owner=lute）
对同用户进程一律可读——也就是说，任何 agent 会话都能把 key 打印进自己的输出。

要决定的是：接受，还是迁到 macOS Keychain。

## Decision

**接受现状，并把它写成有据的接受**（ADR-0138 后果 2 已同步改写）：

1. **不迁 Keychain（默认形态）。** 本轮实测：`security add-generic-password` 建出的条目，
   非交互读取 `security find-generic-password -s <服务名> -w` → **rc=0、明文值直接拿到**。
   Keychain 的默认形态对「同用户、能跑 bash」的 agent **零收益**，而且比读文件更省事：只要服务名，
   不必知道文件在哪。只为「D7 备选里写了 Keychain」而迁，是把欠账从一处搬到另一处。
2. **本轮也不上收紧 ACL 的 Keychain。** `-T /usr/bin/true`（不把 `/usr/bin/security` 列为可信应用）
   确实拦得住：同一读取命令 → **rc=128、零字节、非交互直接失败**。它是唯一真正改变暴露的形态，
   但它把语义轨变成**人在环**：每次取用要人工授权，agent 触发的非交互跑批不可用。
3. **接受的理由（缓解逐条可核）**：key 是专用、可吊销、按次计费、只用于**内部研发回路**的凭据
   （D1 已钉「出货面本轮不接」）；跑批成本 ≈$0.0155/轮（292 条语料外推），滥用上限低；
   **门禁路径根本不碰 key**（D5 指纹门禁离线、零 API 调用），暴露窗口只在「跑语义轨」那一刻；
   出境内容另由 D2 闸门收口（只认仓内被 git 跟踪的文本）。
4. **前置条件写进 ADR 原文**：日后若要把 Jev 交给无人值守自动化（定时跑、CI），必须先上收紧 ACL 的
   Keychain 或等价的「人在环取用」方案，再谈自动化。这不是愿望，而是把「接受」限定在当前的运行方式上。

## Alternatives considered

- **迁 Keychain、保留默认 ACL。** 否决：实测零收益（见上），只是换家。
- **迁 Keychain、收紧 ACL。** 本轮否决、降级为前置条件：真收益是「agent 无法静默取用」，代价是语义轨
  变人在环；而当前语义轨的用法是「人喊一声、跑一轮、看报告」——收益与代价不匹配。真要上这条时，
  先补一课：GUI 授权对话框在 agent 触发的跑批里到底弹不弹、能不能批（**本轮未实测**，不让未验证的假设进决策）。
- **改成「跑批时人工 export 到 env」。** 否决（方向反了）：env 是解析链第一层，但人会话里敲出来的值会落进
  `~/.dsh/scratch/attrib/**` 的完整转录——那正是 ADR 自己实测过「62MB、含 danger-full-access、
  前 300KB 命中密钥形态」的地方。用更暴露的通道换掉较不暴露的通道。
- **靠轮换纪律。** 否决：纪律不是机制（pitfalls-playbook 同族），且轮换窗口内旧 key 仍可用。

## Consequences

- 正面：一条挂着的欠账变成有实测支撑的决策；「接受」被限定在「非无人值守」这个前提下——将来触到前提
  会被 ADR 原文挡住，而不是靠人记得。
- 正面：省掉一层解析链改造（`resolveJevKey` + 测试 + SOP），也没有引入「读不到就静默降级」这类新风险面。
- 代价（如实保留）：agent 会话仍可读到 key 并把它打进自己的输出；D2 只管得住「发到 Jev 的 state」，
  管不住「agent 拿 key 去干别的」。这条残余**不因本轮而消失**，只是被明确接受。
- 未做：GUI 授权路径未实测；provider 侧是否支持按 key 限额未核。

## 读数（本轮实测，可复跑）

| 探针 | 命令形态 | 读数 |
| --- | --- | --- |
| Keychain 默认 ACL | `security find-generic-password -a probeA -s jev-probe-default -w <临时 keychain>` | `rc=0`，拿到 6 字符明文 |
| Keychain 收紧 ACL（`-T /usr/bin/true`） | 同上，`-s jev-probe-restricted` | `rc=128`，零字节，无 tty 直接失败 |
| 现状存储 | `stat -f '%Sp %Su' ~/.dsh/.credentials.yaml` | `-rw-------` owner=lute |
| 读取便利性 | `security find-generic-password -s <服务名> -w` | 只需服务名，不必知道文件路径 |

探针全部做在 `/tmp` 的**临时 keychain** 上、用假值，跑完即 `security delete-keychain` 清理；
未触碰登录钥匙串、未读取真实 key。
