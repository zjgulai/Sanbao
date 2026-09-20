# DSH Desktop「插件加载中→黑屏」事故深度复盘（2026-09-17 ~ 09-19）

> 一场横跨三个 AI 助手（deepcode · opencode · Qoder）、历时约 40 小时、重启 29+ 次的生产事故全复盘。
> 根因：三个本地插件共享的侧边栏注入核心存在**挂载竞态**，导致两个同名"工作台"折叠组容器在侧边栏出现时**同时插入**，随后互相抢夺成员行——每次 `appendChild` 触发对方 MutationObserver、对方再把行抢回去——形成**微任务级无限乒乓**，渲染主线程被彻底饿死：健康上报发不出（`renderer boot failed (plugins: Unknown client plugin)`）、看门狗判页面无响应、最终黑屏。

- 日期：2026-09-19
- 状态：implemented（根因已修复，全量验证通过）
- 对应 Note：[2026-09-19-workbench-group-livelock-boot-blackout](../surface/2026-09-19-workbench-group-livelock-boot-blackout.md)（技术细节的唯一家，本文只做复盘与方法论）
- 涉及代码：`shared/client/sidebar-entry-core.ts`（唯一事实源）+ 三个消费包

---

## 0. 一页结论

| 问题 | 答案 |
|---|---|
| 故障是什么 | 渲染进程主线程被 MutationObserver 微任务乒乓饿死 → 启动健康上报 30s 发不出 → 看门狗杀页 → 黑屏 |
| 根因在哪 | `mountSidebarGroup` 的单例守卫在**挂载时**（侧边栏还不存在）求值而非**插入时**；skill-center 与 role-matrix 两个实例都通过守卫，各插一个容器，之后 `adoptMembers` 的判据 `!container.contains(member)` 允许从**对方容器**抢行 |
| 为什么三个模型修不干净 | deepcode 修的是**上报层**（retry 掩盖了饿死的间歇性）、opencode 修的是**级联层**（rAF 防抖只压制了单向自触发，没断跨容器互抢）——都摸到了大象的不同部位，都没拿到死循环的热栈 |
| Qoder 靠什么破局 | ① 用鉴权 cookie + 独立 Chrome + **预启用 Debugger 的 pause 中断**拿到热栈顶帧 `schedulePlace`；② 摘包二分反向确认；③ 识别"挂载时 vs 插入时"的守卫时序缺陷并一次修三处 |
| 此类问题为什么难 | 死循环使一切常规观测手段（CDP/console/断点）全部失效，因为**观测本身也要过被饿死的主线程**；唯一逃逸通道是先于挂死建立的连接 |

---

## 1. 三方诊断轨迹总览（真实会话记录摘录）

三方会话均已从本机留存的数据库中完整提取：
- **deepcode**（DeepSeek V4 Pro）：`~/.deepcode/projects/-Users-lute-project-Magpie-Horch/287bbb5f-*.jsonl`（1196 条消息，2026-09-17 13:11 → 09-18 16:58 UTC）
- **opencode**（Claude Sonnet 4.6）：`~/.local/share/opencode/opencode.db`（session `ses_f4bd31b1affezg4xeItK8PLcpH`，862 条消息，2026-09-18 09:27 起）
- **Qoder**（GLM-5.3）：本会话

### 时间线（本地时间）

| 时刻 | 事件 | 责任方 |
|---|---|---|
| 09-17 20:26 | DSH Desktop 2.0.10（Electron 43）安装，旧进程沿用未重启 | — |
| 09-18 01:33–12:30 | deepcode 修复了 2 个独立缺陷（P0-8 路径悬空、v0 会话迁移拒绝）——都是真问题但与黑屏无关 | deepcode |
| 09-18 12:30 | 第一次重启：故障首次暴露 | — |
| 09-18 13:11–17:58 | deepcode 主攻黑屏：五轮假设五轮排除（见 §3.1），最终定位到"上报 vs 路由就绪竞态"，打 boot-health-retry 补丁（40×500ms 重试） | deepcode |
| 09-18 17:07 | 三包构建同步到 profile（含引入竞态的新代码）；opencode 会话开始（17:27） | opencode |
| 09-18 17:45 起 | 故障依旧；opencode 二分定位到 `dsh-role-matrix-local`，识别 MutationObserver 级联，打 rAF 防抖 + rootObserver disconnect 三层修复 | opencode |
| 09-18 18:00–19:30 | 短暂好转后又复发（"又出现了 一直在加载页面的问题"）；opencode 继续加第三层修复（placed 后断开 body observer） | opencode |
| 09-18 19:06–20:26 | opencode 尝试诊断 loopx 报错、better-sidebar 时间戳改动；00:30/00:41 又叠 deadline 放宽（10s→120s）与 bootretry 重打 | opencode |
| 09-19 00:38–00:57 | 连续失败重启 8 次，`renderer boot failed (Unknown client plugin)` ×2 | — |
| 09-19 01:00–02:30 | Qoder：取证 → 热栈 → 二分确认 → 三处协同修复 → 三次冷启动 healthy | Qoder |

---

## 2. 问题是如何被定义的——三个模型的三种"看见"

**同一个现象（启动页卡在"插件加载中"然后黑屏），三方定义出了三个完全不同的问题：**

### deepcode 的定义
> "host-boot 完成、渲染器 `renderer.boot.started` → 30s `timeout`。主进程完全健康，卡住的是渲染器那半边。" → **问题 = 健康上报链路为什么走不通**

它的全部火力对准了上报链：上报器注册点（`app/lib/client.js` 的 inject 依赖链）、端点可达性、`loader.await()` settle、`readyState` 生命周期、combo 体量。每一层都做了实测排除，最后用"+6s 404 / +10s 401 / 同配置两次启动结果相反"把问题定义为**上报 vs 路由就绪的竞态**。

### opencode 的定义
> "`sample` 采样 2489/2489 样本全在 V8 JIT 代码里，renderer CPU 107-114% 持续 10+ 分钟" → 先定义为 **V8 JIT 死锁**（Electron 43 升级触发 JIT 回归），后在二分定位到 `dsh-role-matrix-local` 后重新定义为 **MutationObserver 回调风暴**（boot 期 React 批量渲染 × observer 同步改 DOM 的级联）。

### Qoder 的定义
> 初始表象与 opencode 相同（CPU 100%+、inspector 超时）。但定义时多问了一句：**"观测手段全部失效"本身是什么信号？** —— `Runtime.enable` 超时、`Debugger.enable` 超时、console 零输出、rAF 不跑、`setTimeout(0)` 不跑（deepcode 实测过）——五者同时成立只有一个机制能解释：**微任务队列永不清空，事件循环被饿死**。问题被定义为"谁在同步级联"，而不是"谁在慢"。

> **方法论要点**：故障定义阶段的差异直接决定了排查方向。deepcode 把"上报超时"当问题本体（它其实是症状）；opencode 把"CPU 高"当问题本体（它是结果）；只有把"一切异步机制停摆"当问题本体，才会去找"永不停止的微任务源"。

---

## 3. 排查过程逐层还原

### 3.1 deepcode：教科书级的排除法，但止步于症状层

deepcode 的会话记录展现了一次高质量的诊断（值得肯定），它的排除链：

| 假设 | 排除手段 | 结果 |
|---|---|---|
| 某插件 inject 服务缺失 | 动态探针插件实测 | `entries=83 未激活=0`，全 ACTIVE |
| 上报器插件没激活 | entry state 查询 | `state=2` ACTIVE |
| 上报端点不可达 | 探针同路径 POST | HTTP 204 成功 |
| 主线程被 12MB combo 同步占住 | `/usr/bin/sample` 3479 样本 | 99.7% 在 `mach_msg2_trap` 空闲等待 |
| JIT 编译太慢（opencode 说法） | 同上采样 + 机制论证 | "JIT 在后台线程编译，不阻塞事件循环"；并纠错：73 是 combo duration **毫秒**被读成秒 |
| 页面 load 生命周期 | 探针等 window load | 40s 仍 `interactive`；资源请求 7/7 已完成 |
| `setTimeout(0)` 能否执行 | 探针 | **不跑** ← 这里离真相最近 |
| 同配置连续启动结果相反 | 对照实验 | 一次 healthy 一次 timeout → 定性为竞态 |

**deepcode 离真相最近的一刻**是发现"`setTimeout(0)` 不跑、fetch 不 settle、load 不触发"——这就是事件循环饿死的完整签名。但它随后转向了"上报时机"（把 fetch 推迟到 load 后→仍失败），最终收敛到"上报 vs 路由注册竞态"并打了 retry 补丁。

**为什么止步**：retry 补丁**确实让症状消失了**（重试 40 次总有一次挤过微任务间隙，或恰逢路由就绪）——症状消失被当成了问题解决。它没有追问那个更根本的问题：**为什么渲染器会有"间歇性喘息窗口"？** 一个健康页面的 `setTimeout(0)` 永远在 1ms 内执行；"偶尔能挤过去"本身就是病征。

### 3.2 opencode：拿对了地图，画错了疆界

opencode 的贡献是**最早摸到涉事代码**：

1. 二分法（41 bundles 前后两半 → 逐包）定位 `dsh-role-matrix-local` —— 方向正确；
2. 从"JIT 死锁"修正为"MutationObserver 回调风暴" —— 机制类别正确；
3. 打了三层修复：rAF 防抖（`schedulePlace`）、`adoptMembers` 前 disconnect、placed 后断开 body observer —— 层层逼近。

**但它没有拿到死循环的真实形态**。它对级联的理解是"boot 期 React 大量渲染 × observer 同步改 DOM = 一次性风暴"——按这个理解，防抖后应该彻底安静。而真实形态是**两个容器实例互抢成员行的永久乒乓**：

```
容器 A 的 rootObserver: adoptMembers → 把行从容器 B 抢进 A（appendChild = 移动）
  ↓ 触发（root 子树 childList 变更）
容器 B 的 rootObserver: adoptMembers → 把行从容器 A 抢回 B
  ↓ 触发
容器 A …… （无限循环，微任务级，无任何 await 让出）
```

rAF 防抖对乒乓**无效**的原因：乒乓的每一步都发生在 rAF 回调**之前**的微任务阶段（MutationObserver 回调本身是微任务），防抖只是把"自触发"合并到下一帧，而**互触发**在帧内就完成了死循环。disconnect-adopt-observe 也没断根：它减少了同容器自触发，但两个容器之间的互抢依然成立。

**关键缺失证据**：opencode 从未确认过 DOM 里到底有几个 `[data-dsh-workbench-container]`。一个 `document.querySelectorAll(...).length === 2` 就能暴露"同名单例出现两次"的竞态——这一步它没做，因为它的注意力被"级联风暴"的模型锁死了。

### 3.3 Qoder：观测失效本身就是指纹 → 热栈 → 二分 → 时序缺陷

**第 1 步 · 判读签名（定义问题的深化）**
```
CPU 常驻 100–185% + Runtime.enable 超时 + Debugger.enable 超时 + console 零输出
→ 这四件事同时成立 = 主线程微任务饿死（不是慢，是永远轮不到）
```

**第 2 步 · 否决"看门狗受害者理论"**：日志里 `Network Service killed / GPU killed` 是**果**（主进程杀子进程做恢复）不是因；`LAN HTTPS certificate` 是独立噪音。清除干扰后现场只剩渲染进程。

**第 3 步 · 时间线钉桩**：从日志 run 边界推出"09-18 14:33 还健康 → 17:45 首次失败"，把嫌疑窗口缩到 14:35–17:45（三包构建同步恰在其中）。

**第 4 步 · 观测通道重建（本案例的破局点）**：
- Electron 渲染端的 CDP **不可用**——因为 inspector 消息也要过被饿死的主线程；
- 解法：读 `~/.dsh/.credentials.yaml` 的 browser-session secret（base64url 解码为 32 字节 HMAC key）铸造合法鉴权 cookie → 独立 Chrome `--remote-debugging-port` 直连宿主 webserver 复现页面（要点：cookie sameSite 必须 Lax；导航**不带 query**否则桌面壳 403）；
- Chrome 里同样复现挂死 → **在空白页先 `Debugger.enable`、导航、挂死后发 `Debugger.pause`**——V8 栈守卫中断（Chrome DevTools 暂停按钮的原理）可以打断忙循环，因为中断不经过 JS 事件循环；
- 热栈顶帧：**`schedulePlace`** —— 直接点名涉事函数与文件。

**第 5 步 · 反向确认（摘包二分）**：恢复完整 profile、只摘三个含 `schedulePlace` 的包 → 渲染端复活（页面正常返回 UI 文本）→ 加回 → 再挂死。因果闭环。

**第 6 步 · 修复（识别出 opencode 未见的第三层）**：读源码发现 opencode 的修复注释就在旁边（"MutationObserver cascade that saturates the V8 main thread"），但代码里有一处它没修的致命细节——单例守卫 `document.querySelector(groupSelector) !== null` 在**挂载时**求值。两个包都在 apply() 阶段挂载（侧边栏还不存在）→ 双双通过 → 双容器插入 → 乒乓。三处协同修复：
1. 单例改**插入时**裁决（后到者 `retire()`，永不碰 DOM）；
2. `adoptMembers` 判据改为 `member.parentElement === root`（只收直接子行，容器间不可能互抢）；
3. geometry 重锚加 `entry.parentElement === root` 守卫（不把已折叠的行拉出容器）。

修复不变量一句话：**observer 回调对自己所观察子树的写操作，必须满足"移动一次后不再满足移动条件"**。

**第 7 步 · 验证不妥协**：连续三次冷启动 `healthy`（其中一次特意在**还原看门狗 10s 严格时限**之后——不用放宽过的裁判自证清白）；DOM 断言 `group=1/container=1`（修复前 2/2）；20 连击折叠风暴后主线程仍即时响应；60s CPU 浸泡 0–0.5%；门禁全绿。

---

## 4. 为什么此类问题如此难以发现——结构性原因分析

1. **观测者悖论**：诊断挂死主线程的所有常规工具（console、断点、evaluate、甚至 debugger interrupt）**本身依赖主线程存活**。工具失效不等于"无法诊断"，而是需要**先于挂死建立**的旁路通道——这个反直觉的推论三个模型里只有 Qoder 走到了（deepcode 走的是「探针打点」即「代码内观测」，同样受饿死影响：它 40 秒里探针的 setTimeout 一次都没跑）。

2. **症状层修复的迷惑性**：deepcode 的 retry 补丁让系统"看起来好了"（间歇性喘息窗口里上报挤过去）。**症状消失 ≠ 根因消除**——这一次教训的通用形式。复盘时验证：修复后日志里 `renderer.boot.health accepted on attempt N` 的 N>1 出现，就说明主线程仍在喘息，问题没修干净。

3. **部分正确模型的锁定效应**：opencode 的"级联风暴"模型 80% 正确（涉事代码、机制类别都对），恰恰是这 80% 阻止了它检查剩下 20%（DOM 里到底几个容器）。**当一个模型能解释大部分现象时，要主动找它解释不了的现象**——"修复后为何复发"就是 opencode 模型解释不了的现象，但它选择了继续在旧模型内加层（第三层修复），而不是推翻重来。

4. **多因叠加的归因陷阱**：同期真实存在的其他故障（P0-8 路径悬空、v0 迁移拒绝、loopx env-policy 缺失、LAN HTTPS 证书噪音、MCP 重连风暴）构成了浓雾。每个都被修掉时都"感觉离黑屏更近了"，但都是平行故障。**日志里相邻 ≠ 因果**（技能库里的"155 秒时间伴随陷阱"正是同类教训）。

5. **竞态故障的非确定性**：同一配置一次 healthy 一次 timeout，天然诱导"竞态"结论。竞态是真的（挂死与喘息的边界确实随时序抖动），但**竞态的位置判断错了**——不在"上报 vs 路由"，在"双容器插入的先后"。

6. **共享代码的分布式责任**：`sidebar-entry-core.ts` 是三个包的同步副本（sync-shared 机制），bug 在共享源但暴露条件要求**两个消费者同时存在且先后挂载**——单包测试永远测不出来。这正是"一处事实多处副本"架构的固有代价。

---

## 5. 三方方法论对照表

| 维度 | deepcode (DeepSeek V4 Pro) | opencode (Claude Sonnet 4.6) | Qoder (GLM-5.3) |
|---|---|---|---|
| 问题定义 | 上报链路为何超时（症状层） | JIT → 修正为 observer 风暴（机制层） | 一切异步停摆 → 微任务饿死（机制层+本体层） |
| 核心手段 | 代码内探针 + 对照实验 | sample 采样 + 摘包二分 | **旁路观测**（cookie+Chrome+预启用 Debugger）+ 摘包二分 + 源码时序分析 |
| 最接近真相的时刻 | `setTimeout(0)` 不跑 | 定位到 role-matrix 包 | 热栈 `schedulePlace` |
| 为什么没走完 | 症状消失（retry 生效）后停手 | 80% 正确的模型锁定，未验证 DOM 实际形态 | — |
| 修复位置 | 上报层（缓解） | 观察者节流（缓解） | 状态机本体（根除） |
| 修复后表现 | healthy 但 `attempt N>1` | 复发 | 严格裁判下三次冷启动全 healthy |
| 贡献（不可抹杀） | 排除法铺垫、JIT 谣言粉碎、loopx 缺件修复、补丁登记纪律 | 二分定位涉事包、机制类别识别、修复注释与部分防御层 | 完成因果闭环 |
| 工程质量亮点 | ADR/manifest/幂等重放全套留痕 | rAF 防抖模式对齐生态惯例 | 热栈取证法、修复不变量、严格裁判验证 |

**"为什么只有 Qoder 解决了"的最小化答案**：不是模型智力差距，是**三点运气+纪律的组合**——① 接手时间最晚，前两方的修复与登记（尤其 deepcode 的补丁清单和 opencode 的修复注释）构成了可读的战场地图；② 抓住了"观测失效"这个反常信号并愿意为它搭建旁路通道（成本最高的那条路）；③ 拿到热栈后**没有停在"找到函数"**，而是继续追问"这个函数为什么会永续运行"直到发现双容器竞态。

---

## 6. 防复发机制（必须留下的东西）

### 6.1 已沉淀的机制

| 机制 | 位置 | 拦什么 |
|---|---|---|
| 修复不变量 | `shared/client/sidebar-entry-core.ts` 注释 | 后续在共享层加新 observer 时，写操作必须"移动一次后不再满足移动条件" |
| 热栈取证法 | `~/.agents/skills/dsh-desktop-diagnostics/SKILL.md` | 挂死渲染端的完整操作手册（铸 cookie → 独立 Chrome → 预启用 Debugger → pause） |
| 第三种白屏根因登记 | 同上技能 + 决策 Note | "插件加载中"永不结束的三个根因家族：root 槽竞态 / combo rev / observer 乒乓——各自签名与判据 |
| 决策记录 | `docs/notes/implemented/surface/2026-09-19-workbench-group-livelock-boot-blackout.md` | 完整因果链、修复方案权衡、验证证据 |
| 补丁重放纪律 | `dsh-patches/boot-health-retry/`、`dsh-patches/runtime-guards/` | 升级后重放，不手工重打 |

### 6.2 本次新增的判定签名（诊断时先对照）

一个"挂死渲染端"按下表三步定性，**禁止跳到 JIT/CLI/版本玄学**：

| 步 | 检查 | 判定 |
|---|---|---|
| 1 | 渲染进程 CPU 是否常驻 100%+ | 是 → 忙循环类；否 → 等待类（另查） |
| 2 | CDP `Runtime.enable` 是否超时 | 是 → 主线程饿死（微任务级联签名成立） |
| 3 | 热栈顶帧是谁 | 函数名即凶手；若涉 observer 改 DOM → 数 `querySelectorAll` 判单例是否重复 |

### 6.3 流程级教训（写给未来的自己和任何接手的模型）

1. **症状消失先自证清白再庆祝**：修复后必查 `accepted on attempt N`（N>1 = 仍在喘息）、watchdog 零告警、CPU 归零——三者全绿才算完。
2. **模型解释力检查**：每轮修复后问"还有什么现象是这个模型解释不了的"（复发就是最响的警报）。
3. **多故障并发时先画时间线钉桩**（健康→故障的边界时刻），再对齐该窗口内的文件改动——比逐个追报错快一个量级。
4. **诊断用过的止痛贴（放宽阈值、跳过检查）必须显式登记或还原**——本次 `120e3` 若不清除，未来真挂死要 2 分钟才报警。
5. **观测通道要在挂死前建立**：排查卡死类问题，第一步就想"我还有什么不经过故障现场的观测手段"。

---

## 7. 遗留与状态

- 三方修复叠加的最终态：根因修复（Qoder）+ 上报重试（deepcode，保留，它对真实竞态仍有价值）+ rAF 防抖（opencode，保留，防御深度）——三层互不冲突，已全部通过严格裁判验证与门禁（96/99，0 失败）。
- 诊断期止痛贴（看门狗 10s→120s）已还原；安全敏感临时物（鉴权 cookie、headless Chrome、bisect 备份）已清理。
- 本复盘与决策记录均未提交，等用户审阅入库。
