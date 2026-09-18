# 2026-09-18 · 对象库卫生门禁与凭据出库（SEC-RT-011）

- 状态：implemented（2026-09-18）
- 负责人：lute
- 对应 ADR：[ADR-0121](../../../adr/ADR-0121.md)

## Problem

代码与包债务审计实测到 `.git` 为 3.9 GB，其中约 3.4 GB 与仓库源码无关，且**包含活凭证**：

1. `pack-f81a4840…pack`（2.6 GiB）内**只有 1 个对象**：blob `ddab355b3e4a07d2b8035137250b824e3aae575b`，未压缩 **6,800,745,472 字节**，路径 `packaging/backup/pre-2.0.10-migration/dsh-home-snapshot.tar`。
2. 该 tar 内含 `.dsh/.credentials.yaml`（与磁盘上当时正在用的那份 **sha256 逐字节相同**，`77d27c62…`，1342 B）、`.dsh/.credentials.yaml.bak-vod-aigc-20260915-211414`、`.dsh/ext-bridge-token`（同样相同，`f7ec0c11…`）。**违反 `~/.dsh/AGENTS.md` 第一条红线。**
3. 它只从 4 条 `refs/codex/turn-diffs/checkpoints/**` 可达；那 4 条 ref 指向 **3 棵裸 tree**（codex 对 git index 做 `git write-tree` 的快照），所以 `git log --find-object` 找不到它、`git status` 不提示异常、`git fsck` 只把它当普通 dangling。
4. 两个 `tmp_pack_*`（402 MB + 315 MB）是中断的 repack 残骸；`git count-objects -v` 已把它记为 `garbage: 2`，但 `git gc` 因默认 2 周 `pruneExpire` 删不掉，实测滞留一天。

为什么三个环节都没拦住：

- `.gitignore` **未覆盖** `packaging/backup/`（`git check-ignore` 返回未忽略），而 `packaging/backup/README.md` 是已跟踪文件——目录是活的；
- codex checkpoint 走 `write-tree`，**任何被 `git add` 的东西都会静默进入对象库**，没有尺寸或密级筛查；
- **没有任何门禁看对象体积或垃圾包**。`.gitignore` 只管「能不能 add」，进去之后没有第二道闸。

这是本仓库最熟悉的一类缺陷：**知道没有变成拦住**。

## Decision

1. 新增 `scripts/gates/object-store-hygiene.mjs` + `.test.mjs`，注册为门禁 `object-store-hygiene` 与 `object-store-hygiene-selftest`（quick 档）。三条判据：单对象未压缩体积 ≤ 50 MiB、对象库总量 ≤ 1 GiB、垃圾包 = 0。
2. 阈值 50 MiB 的**依据是真实读数**：合法的最大资产是 `packaging/vendor/python-standalone/cpython-3.14.7+20260825-aarch64-apple-darwin-install_only.tar.gz`（26,656,635 B，被 `main` 与全部 tag 可达），必须放行；6.8 GB 的 tar 与 183 MB 的 Mach-O 必须判红。反向自测即用这三条真实读数当输入，并加一条 `Infinity` 恒真桩突变。
3. 判据面常显分母（扫描对象数 / 超限数 / 总量 / 垃圾数 / ref 可达对象数）；扫描面为空、`count-objects` 取不到、采集异常一律判红——「一个都没扫」与「都扫过且干净」必须分开。
4. 登记为 **SEC-RT-011** 并纳入 `security-contract-master` 分母。为此修掉主门禁一个真实缺陷：`expected` 原被钉死在必需项数（10），**导致新增第 11 条契约时主门禁自己判 schema invalid**（实测 `expected=10` 而 `checked=11`）。改为「登记项数 + 缺失必需项数」。
5. `.gitignore` 收窄排除 `packaging/backup/` 下体积型二进制（`*.tar` / `*.tar.gz` / `*.tgz` / `*.dmg` / `*.zip` / `*.pkg` / `*.app/`），**不整目录排除**以免制造 tracked+ignored 漂移（ADR-0013）。
6. 一次性处置（次序不可颠倒）：
   1. **先救文件**：`git cat-file blob 5d11147e…` 取出 `packages/capabilities/dsh-overseas-skills/check-fragment.py`，验证 `git hash-object` 与对象库原值一致（✅ 逐字节相同，4156 B）。它是 1289 个 codex 独有路径中**唯一不存在盘外副本**的一个。
   2. 备份 4 条 ref 名与 SHA 到 `/tmp/codex-refs-backup-20260918-021049.txt`，`git update-ref -d` 逐条删除（无 reflog，`find .git/logs/refs/codex` 为空，无需 expire）。
   3. **定点移除**含该 tar 的 pack（`git show-index` 确认包内仅 1 个对象）：删 `.pack` + `.idx` 两个文件。**不用 `gc --prune=now`**——另一会话正在活跃写入，其刚 `git add` 的 loose 对象尚未进入 index，会被当成不可达而删除。
   4. 定点删除 518 个 codex 独有 loose 对象（集合由 `rev-list --objects --all` 差集推出，定义上不被任何非 codex ref 需要）。
   5. 删除 2 个 `tmp_pack_*`。

## Alternatives considered

1. **只写 SOP、靠纪律** —— 否决。本次已证明 `.gitignore` 与门禁都没拦住，纪律更不会；且会制造同一条事实的第四个副本（ADR-0009）。
2. **只加 `.gitignore`、不加门禁** —— 否决。`.gitignore` 管「能不能 add」，管不了「已经进去了」。
3. **门禁读对象内容、判断有无凭据** —— 否决。需要一份会腐烂的「什么算凭据」清单；体积是不需要词汇表的代理量。代价（6.8 GB 凭据快照与 6.8 GB 正当资产同罪）已在 ADR-0121 的「后果」里显式登记为缺口，不用「已覆盖」盖过去。
4. **`filter-repo` 重写历史** —— 本版否决。逐 ref 验证该 blob 不可从任何分支/tag 到达，无需重写；重写要 force push 双远端，代价远大于收益。留作独立立项。
5. **`git gc --prune=now`** —— 本次执行时点否决，理由见决策 6.3（与并发 `git add` 抢锁）。

## Consequences

**实测读数（改动前后对照，均可复跑）**

| 读数 | 前 | 后 |
|---|---|---|
| `.git` 体积 | 3.9 G | **80 M** |
| packs / in-pack 对象 | 3 / 7841 | 2 / 7840 |
| loose 对象 / 体积 | 1889 / 536.07 MiB | 1370 / 15.26 MiB |
| `garbage` / `size-garbage` | 2 / 716.63 MiB | **0 / 0** |
| `git cat-file -e ddab355b…` | 成功（可取回含凭证的 tar） | **失败** |
| `git fsck --connectivity-only` | 退出码 0 | 退出码 0（62 条 dangling，无害） |
| 门禁 `object-store-hygiene` | 不存在 | ok（扫 9210 对象；超限 0；总量 79.75 MiB；垃圾 0） |
| 门禁 `security-contract-master` | expected=10 | expected=11 / discovered=11 / checked=11 / failed=0 |

HEAD `ac625fd0`、分支 `main`、14 个 tag、8 个远端跟踪 ref 全部未变。

**正面**

- 对象库不再有活凭证；此类缺陷从「靠人记得」变成「门禁拦得住」。
- 反向自测用真实读数而非编造数字，阈值可追溯。
- 主门禁分母恢复可扩展，SEC-RT 系列可继续增长。

**负面 / 已知缺口（显式登记）**

- 本项**不读内容**：凭据快照与同等体积的正当资产同罪。
- 本项**只看当前对象库**，已 gc 掉的历史不在射程内。
- 本项**不联网**：本次 `git ls-remote` 对 origin 与 codeup 两端均需凭据、调用 120 s 超时，**该 blob 是否曾推送远端为 Unknown**。可给的只是推论：它不可从任何 ref 到达，故常规 `git push <分支|tag>` 不会带上；`git push --mirror` 会。
- **凭证轮换**：用户判定不需要（依据：从未离开本机 + 不可达自任何 ref）。该依据属推论而非读数，本 Note 如实记录其性质。
- **codex 的 `write-tree` 行为未改**：被 `git add` 的东西仍会静默进对象库；本 ADR 只在体积这一维设闸，密级那一维没有机制。
- **失去 codex undo**：那 4 轮（09-16 18:26 / 09-17 09:45 / 16:21 / 16:39）的 undo 能力已不可恢复。
- **同批发现的 mode 000 写入缺陷未修**：本次执行中 `edit` 工具产出的文件落成 `----------`（tmp+rename 后未恢复权限），`scripts/gate.mjs` 与 `scripts/gates/security-contract-registry.mjs` 均中招；另有 `docs/adr/README.md` 与 `docs/notes/implemented/security/2026-09-18-sec-rt-010-…md` 也出现过 000 窗口（后者由另一写入方产生）。000 文件对 `node`/`rg`/`git grep` 全部 EACCES，而 `git` 的 mode 位只跟踪可执行位，**因此它对 git 完全隐形，会让门禁静默变红**。本次仅 chmod 修复，**没有加判据**——「源文件不得 mode 000」应作为独立条目处理。

**后续动作**

- `check-fragment.py` 已救回工作树但**尚未入库**，应补进仓库并接入调用点（它的存在本身就说明曾经有人要用它）。
- 建议独立立项：①「源文件不得 mode 000」门禁；②codex checkpoint 的对象库写入是否应设密级/体积前置闸。
