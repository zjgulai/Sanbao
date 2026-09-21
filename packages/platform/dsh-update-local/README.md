# dsh-update-local · 更新检查骨架

宿主侧（host-only）插件，回答一个问题：**现在有没有新版**。它读 feed
`release/<版本>.latest.json`（[ADR-0151](../../../docs/adr/ADR-0151.md) 的派生契约），
与本机 app 的 `CFBundleVersion`（形如 `2.0.10-lute.2.5.0`）比一下，给出一个具名结论。

## 边界：只检查，不安装

自动下载 / 校验 / 调 `install.sh` / 重启是路线图的第 ⑤ 步，要等 Developer ID 与公证
（[计划](../../../docs/plans/2026-09-13-auto-update-route.md) §5：身份没换之前，自动装下来的包
会撞 Gatekeeper，用户看到的是「更新完打不开」——比不自动更新更坏）。本包**不含任何下载、
写盘、调用安装器的代码路径**，一眼可查。

## 工具

`upd_check`（只读）：

| 状态 | 含义 |
| --- | --- |
| `update-available` | feed 有新版本（附 dmg 名 / sha256 / min_os / 发布说明） |
| `up-to-date` | feed 版本 == 本机版本 |
| `feed-behind` | feed 里的版本比本机**旧**——feed 没跟上，或本机是未发布的本地构建 |
| `channel-mismatch` | feed 的通道与本机认的通道不同（不判新版） |
| `feed-unreadable` | 网络不通 / HTTP 非 2xx / 不是 JSON——**读不到不等于最新** |
| `feed-invalid` | 形状不合法（附违规清单，判据见 `lib/feed.js`） |
| `current-unreadable` | 本机 `CFBundleVersion` 读不出 |
| `current-not-lute` | 本机是上游构建（没有 `-lute.` 后缀） |

启动时默认自动查一次（延后 20 秒、离线只记日志），配置见 `cordis.patch.yml`。

## 判据

```bash
node --test test/*.spec.mjs          # 28 用例
node scripts/live-check.mjs          # 实机读数：真 app bundle + 本地 feed 服务
```

两条纪律写在用例里：

- **交叉钉**：`lib/feed.js` 是 feed 契约的**消费侧**实现（随包物化进 profile，装载点上没有仓库
  脚本可 import），生产侧是 `scripts/lib/update-feed.mjs`。两份必须同源——用例把生产侧
  **派生出来的 feed** 的键序与本包的字段表对钉，并用同一张突变表验证两份判据结论一致。
- **恒真桩突变**：把判据换成恒返回「已是最新」的桩，负向用例必须全红。
