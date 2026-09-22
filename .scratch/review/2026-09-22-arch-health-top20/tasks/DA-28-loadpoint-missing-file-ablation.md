# DA-28 · 装载点缺件消融（profile-files-sync 分母的运行时证明）

- 优先级：P1
- 状态：`done`（2026-09-22，EX-03）
- 依赖：无
- 估算：S
- 来源：P-24（package-files-coverage 判据面）的最后一环；2026-09-22 诊断

## Problem

`profile-files-sync` 判据盯 node_modules 真实装载点：源码有而副本缺 = 真缺件判红。
判据有 selftest（`profile-coverage-selftest`），但那是**判据代码**的自测；
「真实装载点上真删一个文件，判据真的会红」这条**运行时链路**从未演练。
分母覆盖的最终证明是运行时消融，不是 selftest 绿（P-02：selftest 绿 ≠ 链路通）。

## 动作

1. 选一个已同步包（如 dsh-wanzh-hulian，近期刚双同步过 6/6 哈希相符）；
2. 在装载点（`~/.dsh` 对应 node_modules）删一个 `files` 清单内文件；
3. 跑 `profile-files-sync`（或对应 sync-profile --check）：必须判红且点名该文件；
4. 恢复文件（重同步），复跑判绿，哈希核对闭环。

## 验收

- 「删 → 红 → 恢复 → 绿」四步原始读数落盘；
- 红读数点名缺失文件的完整相对路径（不是只报计数）；
- 恢复后装载点与源码哈希一致。

## 注意

- 删除前记录该文件哈希，恢复后核对（防恢复动作本身引入漂移）；
- 用 tmp+mv 语义操作（编辑工具会打破 file: 硬链接——本消融正是验证这条链路的守卫）。

## 结算（2026-09-22，EX-03）

**选样**：`dsh-wanzh-hulian`（近期刚双同步过的包）· 目标文件 `lib/bounded-body.js`（files 清单内）·
装载点 `~/.dsh/profiles/desktop/node_modules/dsh-wanzh-hulian/`。

**四步闭环读数**：

| 步骤 | 操作 | 读数 |
| --- | --- | --- |
| 基线 | 两侧 inode + SHA-256 | load=272498340 / src=264987932；两侧哈希同为 `323ac1c2…bbdb`（inode 不同是 tmp+mv 同步后的正常态） |
| 制造缺件 | `mv` 装载点文件到 /tmp（可逆，非 rm） | — |
| 判据红 | `node scripts/sync-profile.mjs --check --loadpoint` | `exit=1`；`drift dsh-wanzh-hulian: ~lib/bounded-body.js` + `fail 1 个包在装载点存在漂移` |
| 门禁红 | `node scripts/gate.mjs --mode quick` | `exit=1`；`profile-files-sync` failed=1（27 期望 / 26 核对）+ `profile-bundle-sync` failed=1；`profile-metadata-sync` 保持绿（分面行为正确：缺文件不动 metadata 面） |
| 恢复 | `mv` 备份回原位 | inode 272498340 保住（**原字节回原位**，硬链接身份未破坏） |
| 复绿 | 复跑 check | `exit=0`；`ok 装载点与仓库源一致（对比 27 个包）`；两侧哈希仍为 `323ac1c2…bbdb`；/tmp 备份无残留 |

**结论**：分母的运行时覆盖被证明——真实装载点上真删一个 files 清单内文件，
`profile-files-sync` 与 `profile-bundle-sync` 双判红且退出码非零，红读数点名完整相对路径
（`~lib/bounded-body.js`）。P-24 的最后一环（selftest 之外的真实链路证明）收口。
与 EX-02 共同构成「消融两问判据」（系统怎么降级 + 哪个判据变红）在两个 S 级消融上的
方法论验证——**EX-04（DA-25 重版消融矩阵）的前置已满足**。
