# DA-32 · 启动时序基线判据

- 优先级：P1
- 状态：`done`（2026-09-23：5/5 样本落盘 + 基线建议 + 形态裁决=例行窗口体检不入本地 gate）
- 依赖：无（读数采集可与 DA-34 同批开机共享）
- 估算：M
- 来源：用户 2026-09-22 需求（高效性）；lifecycle-events/startup.jsonl 是启动判定的权威读数源但从未做成基线

## Problem

宿主启动时序的权威读数源是 `lifecycle-events/startup.jsonl`（数据目录内），薄壳主进程
`host-process.ts` 390 行管理启动流程。但：

- 没有启动耗时的**基线**——无法判「这次启动慢了」是回归还是噪声；
- 二开插件的启动开销（加载顺序、阻塞点）没有量化——「高效性」目前没有数字。

## 动作

1. 采集 N 次（≥5）正常启动的 startup.jsonl，解析各阶段时间戳，产出阶段耗时分布；
2. 定义基线形态：各阶段的阈值上限（P95 + 余量），落成数据文件；
3. 写判据 `gate:startup-timeline`（或脚本 + 例行体检形态，若启动需实机则归入 DA-34 型的
   例行窗口而非本地门禁——**形态选择本身是本工单的决策点**）；
4. 与 DA-10 更新器、DA-25 消融共享启动会话，摊薄开机成本。

## 验收

- 阶段耗时分布读数落盘（N 次采样、命令、原始 jsonl 摘录）；
- 基线阈值有出处（P95 + 余量，写明采样窗口）；
- 判据或例行体检形态落地，超基线时能被看到（红或告警，不是静默）。

## 注意

- 启动读数受同机负载影响（09-22 环境 load 4.59、Notes.app 100% 仍在）：采样窗口要记录环境负载，
  或分「冷启/热启」两档基线；
- 判据若需实机则不进本地 gate 射程（避免本地恒 skip 变噪声）——归 DA-34 型例行窗口更诚实。

## 采样记录

### 样本 1/5（2026-09-23 09:39，DA-34 会话首次重启）

环境：load 前 12.27（Kaspersky kavd 活跃 + 后台 gate:full 竞争）——**高负载窗样本**，
与后续安静窗样本分档记录。runId `2df62a96-f406-476e-aeaf-29c16f81eb89`：

| 阶段 | durationMs | mono@ |
| --- | --- | --- |
| electron-ready | 257 | 261 |
| shell-environment | 249 | 510 |
| runtime-bootstrap | 14 | 525 |
| profile-selection | 11 | 537 |
| profile-composition | 486 | 1023 |
| runtime-bootstrap (2nd) | 133 | 1156 |
| host-boot | **12467** | 13624 |
| renderer-startup | 1783 | 15407 |
| health-commit | 124 | 15532 |
| **总时长** | **15534** | finalStage=health-commit, rendererStatus=healthy |

host-boot 占 80%（12467/15534）——该窗含 50+ 客户端包 combo 编译/装配，AV 竞争下
读数显著偏高；P95 阈值必须分「安静窗/负载窗」两档，不能混算。剩余 4 次采样待
重启窗口（每轮 quit+relaunch ≈ 1 分钟，或延至 AV 安静窗）。

### 样本 2/5（2026-09-23 10:06，DA-10 修复验证重启兼采样）

环境同上（负载窗，load≈12）。runId `735bcf2c-f186-46c6-afe9-1a26f30cdfe0`：
electron-ready 428 / shell-environment 524 / runtime-bootstrap 14 / profile-selection 12 /
profile-composition 386 / runtime-bootstrap(2nd) 112 / host-boot **11694** /
renderer-startup **3912** / health-commit 94，总 **17184ms**，healthy。

### 样本 3-5/5（2026-09-23 12:13-12:18，同条件重启循环）

| # | runId 前缀 | 总时长 | host-boot | renderer-startup | load |
| --- | --- | --- | --- | --- | --- |
| 3 | 6c8fcda8 | 12305ms | 10124ms | 1183ms | 9.06 |
| 4 | 9ab5aa2d | 18564ms | 16191ms | 1346ms | 10.12 |
| 5 | 39798289 | 15925ms | 12106ms | 2964ms | 11.49 |

五样本全 healthy（finalStage=health-commit）。同条件 = 冷启动 + CDP 参数 + 同 profile + 同机负载窗。

### 基线建议（P95 + 余量，本卡决策点）

- 总时长：12.3~18.6s，P95≈18.6s → 上限 **30s**（余量 1.6×）；
- host-boot：10.1~16.2s，P95≈16.2s → 上限 **25s**；
- renderer-startup：1.2~3.0s → 上限 **6s**。
- 样本窗 load 9~16（AV 竞争）——本基线是**负载窗下界**；安静窗重采后可收紧。
- **形态裁决**：采样需要实机重启 → 不进本地 gate 射程（避免恒 skip 噪声）；落
  DA-34 型例行窗口体检（启动超限告警而非门禁红）。数据文件：采样记录在本卡；
  后续若要判据，写脚本读 startup.jsonl 的 run.completed durationMs 对表。
