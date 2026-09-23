# 生产机现场只读取证 SOP（DA-37）

回答一个问题：**那台生产机的 DSH Desktop 现状**（版本 / 签名 / 启动健康 / 装配面）。
本 SOP 是「现场只读取证」通道的落地——零网络端口、零新权限、零写入目标机，
读数回传前由操作人人工复核脱敏面（凭证红线：凭证不落仓库、不明文回传）。

## 前置（操作人自检）

1. 本脚本**只读**：不写目标机任何文件（只读 Info.plist / startup.jsonl /
   profile 的 package.json 与目录名清单）；不读 settings.yaml、凭据、日志内容、
   会话数据——脚本里没有读它们的代码路径（见 `scripts/production-readout.mjs`
   的 `omitted` 声明）。
2. 在目标机上先 `node --check scripts/production-readout.mjs` 过语法门，再执行。

## 执行

```bash
# 目标机终端（缺省路径；自定义用 --app / --data）
node scripts/production-readout.mjs > /tmp/readout.json

# 人工复核脱敏面（必做）：确认输出没有 settings/凭据/日志/会话内容，
# 只有版本、签名主体、最近一次启动的 finalStage/rendererStatus/耗时、
# profile 依赖名与 bundles 名。
head -c 2000 /tmp/readout.json
```

然后把复核后的 JSON 贴回会话（或截图回传）。

## 读数能答的问题

| 问题 | 字段 |
| --- | --- |
| 装机 app 是哪一版 / 是不是 LUTE 构建 | `app.cfBundleVersion`（形如 `2.0.10-lute.2.5.0`） |
| 签名身份 | `app.signingAuthority`（LUTE Code Signing vs 上游证书主体） |
| 最近一次启动是否健康 | `lifecycle.runs[0].finalStage / rendererStatus / totalMs` |
| 装配面有哪些包 | `profile.dependencyNames` + `bundles`（名字清单，不含凭据） |

**数据源特性**：`startup.jsonl` 每轮冷启动截断，只保留最近一次 run——历史
启动健康度不可回溯，只能回答「最近一次」。若需要多次采样须多轮重启后立刻读取。

## 边界（不做什么）

- 不启用 SSH / VNC / 遥测；不新增密钥或权限（弃案记录在 DA-37）。
- 不回传完整日志与错误内容——需要逐行诊断时改走人工摘录脱敏。
- 读数≠验证：architecture.md §1 的「生产机现状未核实」脚注在**拿到并采信
  一次读数**之前不动（P-01：没读数就不改断言）。
