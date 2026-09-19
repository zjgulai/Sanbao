# 发布面迁移与旧仓清理 · 收据

- 时间：2026-09-19
- 触发：本会话按用户指令把唯一远端从 `zjgulai/lute-dsh-platform` 换成 `zjgulai/Sanbao`，
  `release-published` 随之判红（读数与归因见
  [换皮开工基线 §2.3](../sanbao-reskin/baseline/README.md)——那里是这条事实的家，本文件只记发布面动作）
- 原始账：`old-repo-releases.raw.json`（旧仓 13 条 Release 的完整 API 响应，含 `name` / `body` /
  `assets[].digest` / `browser_download_url`，删除后这是唯一留存的文字记录）

## 1. 每条 Release 的字节存放地（删之前先量清「删了还剩什么」）

| 版本 | 旧仓资产 | 本地 `packaging/release/` | 仓库外归档 `~/Library/Application Support/LUTE/releases/` | 删旧仓后 |
| --- | --- | --- | --- | --- |
| 2.4.1 | 636 MB | ✓ | ✓ | 已镜像到 Sanbao，无损失 |
| 2.4.0 | 636 MB | ✓ | ✓ | 已镜像到 Sanbao，无损失 |
| 2.3.3 | 640 MB | ✓ | ✓ | 已镜像到 Sanbao，无损失 |
| 2.3.1 | 640 MB | ✓ | ✓ | 同上 |
| 2.3.0 | 640 MB | ✓ | ✓ | 同上 |
| 2.2.0 | 639 MB | ✓ | ✓ | 同上 |
| 2.0.1 | 686 MB | ✓ | ✓ | **字节能找回**（射程外，不镜像） |
| 2.0.0 | 1367 MB | ✗ | ✗ | **旧仓是唯一副本，删了即失** |
| 1.2.2 | 1368 MB | ✗ | ✗ | 同上 |
| 1.2.1 | 1375 MB | ✗ | ✗ | 同上 |
| 1.2.0 | 689 MB | ✗ | ✗ | 同上 |
| 1.1.0 | 676 MB | ✗ | ✗ | 同上 |
| 1.0.0 | 498 MB | ✗ | ✗ | 同上 |

**净失：6 个版本、约 5.98 GB 的二进制**（2.0.0 + 1.x 全部）。文字与哈希不失——
`old-repo-releases.raw.json` 里有每条资产的 `digest` 与 `browser_download_url`，
CHANGELOG 有对应的发布说明。

用户裁决（2026-09-19 两次）：这 11 条「直接删除」，范围是**旧仓的 Release 与其资产**。

### 1.1 有没有人在用这些链接（删之前查一次 `download_count`）

| 版本 | 累计下载 | 版本 | 累计下载 |
| --- | --- | --- | --- |
| v1.0.0 | 0 | v2.0.1 | 1 |
| v1.1.0 | 0 | v2.2.0 | 1 |
| v1.2.0 | 0 | v2.3.0 | 0 |
| v1.2.1 | 0 | v2.3.1 | 0 |
| v1.2.2 | **5** | v2.3.3 | 0 |
| v2.0.0 | 0 | v2.4.0 | 2 |
| | | v2.4.1 | 0 |

13 条合计 **9** 次下载；被删的 11 条占其中 **7** 次（v2.4.0 的 2 次不在删除范围内）。
7 次里有 5 次集中在 v1.2.2。读数不足以支撑「有客户正依赖旧链」的判断，但也不是零——
**这就是本节存在的理由**：删除不可逆，判据必须是一次真实读数而不是「应该没人下过」。


## 2. 删除边界（写清不做什么，免得下次猜）

- **只删旧仓 `zjgulai/lute-dsh-platform` 的 Release**，不碰 Sanbao。
- **不删 tag**：`v1.0.0 … v2.0.1` 在 Sanbao 上保留。删公开仓 tag 属改已发布历史，
  用户此前已就同类动作定调「别动公开仓历史」（见 `.scratch/release-tag-gap/README.md`）。
- **不删本地与仓库外归档**，也不动 `release/*.sha256` 入库清单——
  ADR-0067 明令禁止删除已发布产物，清单是「字节能找回」的收据，删它就等于把
  ADR-0058 建立的机制自己拆掉。删射程外版本的 Release ≠ 让它们不再是发布版。

## 3. 执行

迁移（先镜像，后删除——顺序不能反，否则中间有一刻某版本哪儿都没有）：

```bash
gh release create v<版本> packaging/release/<版本>/DSH-Desktop-LUTE-<版本>-mac-arm64.dmg \
  packaging/release/<版本>/SHA256SUMS -R zjgulai/Sanbao \
  --title '<旧仓逐字 name>' --notes-file <逐字 body> --latest=false
```

删除：

```bash
gh release delete v<版本> -R zjgulai/lute-dsh-platform --yes   # 不带 --cleanup，不碰 tag
```

### 3.1 本次执行踩到的一条：漏了 `--latest=false`

`gate.mjs` 里 `release-published` 的 remediation **明文要求历史版本另加 `--latest=false`**，
理由是「免得被创建时间顶成 Latest」。第一批命令我照 SOP 抄了 `gh release create` 却没带上这个旗标，
实测后果就在眼前：18:41 时 Sanbao 的 **Latest 落在 v2.2.0 上**，而 v2.3.0 / v2.3.1 / v2.3.3 /
v2.4.0 / v2.4.1 都比它新——按 Latest 下载的客户拿到的是**一周前**（2026-09-12）的构建。
门禁对此**完全无感**：`release-published` 只查「射程内有没有 Release」与「是不是 draft」，
不查 Latest 指向谁。

> 口子在于：**remediation 把要求写清楚了，却没有任何一条断言守着它**——
> 要求只在有人抄全命令时生效。这一条**待办就住在本节**（不在换皮射程表的 T 系列里：
> 它不是换皮引入的，也不随换皮收口）。触发条件：下一次按 SOP §6 发版之前，
> 给 `release-published` 补一条「Latest 必须指向射程内最高版本」的断言。

修正动作（全部迁移完成后执行，把 Latest 钉回最高版本）：

```bash
gh release edit v2.4.1 -R zjgulai/Sanbao --latest
```

## 4. 结果

（执行后回填：Sanbao 6/6 已发布且资产摘要与清单同值；旧仓剩 2 条；被删 11 条的 tag 仍在。）
