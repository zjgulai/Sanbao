# 2026-09-16 · 第三方 intake 的每个 source ID 必须恰好有一个终态

关联：[ADR-0095](../../../adr/ADR-0095.md)、[P-29](../../../pitfalls-playbook.md#p-29--错误在成功之后才被发现重复终态让守恒式自己骗自己)

## Problem

真实 Red 很直接：`build-third-party-intake.mjs --check` 输出
`✓ third-party-intake.json 与事实源一致` 并退出 0，但后续才计算出 `pm 72 ≠ 69`、`mp 66 ≠ 37`。
目标文件前后 SHA-256 相同，说明 check 路径确实只读，却也证明“只读”不能补偿错误退出码。

旧结构把 32 条本机既有条目追加进 `skip`，同时又从 `$accounting.alreadyInstalled` 再加一次；三个终态没有
各自的版本化 ID set。即使把 if 顺序调对，总数相等仍可能被 imported/skipped overlap、重复 ID 或“删一补一”骗过。

## Decision

把问题拆成分类事实、纯集合判据、生成副作用三层：

- `third-party-source-inventory.json` 固定每个 repo 的 upstream ID 与 already-installed ID；
  `third-party-skip.json` 只放真正 skipped，并保留逐条理由。
- `third-party-intake-accounting.mjs` 在构造 Set 前先数 duplicate，再逐 ID 计算 terminal count，报告
  missing、unexpected、overlap；只有恰好一个终态且字段有效的 ID 才计 checked。
- builder 在全部问题清零后才输出成功或写盘。canonical gate 把 106 个 source ID 与 1 个结构/新鲜度对象分开，
  因此 output drift 会得到 106 checked + 1 failed，而不是把业务分类整体压成一个布尔值。
- `--check` 只比较字节；生成通过同目录临时文件、文件 `fsync`、rename、目录 `fsync` 完成原子替换。
- fetcher 读取独立 `alreadyInstalled`，并对上游同名 source 做唯一性检查，不再识别 `(本机既有 · repo)` 占位目录。

## Alternatives considered

- 保留 `$accounting` 的四个手写数字：数字不是 ID set，不能指出漏了谁或多了谁，否决。
- 让 fetcher 联网时临时推导分类：网络结果会漂移，且离线 gate 无法复核，否决。
- 把所有异常都算成一个 failed object：会丢失 106 个 source 的对象级覆盖；保留结构 sentinel，同时逐 ID 计数。
- 在本卡固定 GitHub commit/blob digest：这是 SEC-RT-002 与 DEC-009 的信任决策，不能借 accounting 修复偷渡。

## Consequences

- Red 基线：旧 `--check` 对 72/69、66/37 仍成功退出；已保留为任务证据。
- Green：当前清单得到 `pm 69=63+3+3`、`mp 37=5+3+29`，canonical 为 107/107。
- 12 条定向测试覆盖 overlap、already duplicate、missing、unexpected、source duplicate、坏 JSON、同总数替换、
  后置错误、`--check` 只读、原子生成后幂等，以及 mandatory input fail-closed；失败路径无成功文案且目标字节不变。
- 首轮 root quick gate 额外抓到 checker 的 pass 结果缺少非空 `reason` 与 `typedSkips`；canonical schema 保持 fail-closed，
  修复适配并补回归后，quick 为 64/65、full 为 71/72，唯一一项均为既有 `live-presets` typed skip，failed=0。
- 证据只到本地 L1/L2/L3 静态分类与生成契约；没有联网验证 upstream 可达性、没有安装/推广，也没有 CI required check。
