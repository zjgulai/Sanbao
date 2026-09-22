# SOP · profile 装载点补件

适用于已存在且声明有效的 profile；宿主/客户端装载点见
[架构契约](../architecture.md)。本操作不安装新依赖，不用于修复缺失/损坏的 profile 清单。

## 1. 前置

- 明确仓库根和目标 profile，不依赖脚本默认指向 desktop。
- 先完成目标包构建，检查 `package.json` 的 `files`、入口与本地产物吻合。
- 运行中的生产应用不要用作故障注入对象；消融只在独占临时 profile 上做。
- 将目标文件的原字节及 SHA-256 备份到 profile 外的独占目录；备份不是复原整个 profile 的许可。

## 2. 检查、补件、复核

在仓库根执行，下列 `PROFILE` 必须显式设置为已确认的目录。

```bash
: "${PROFILE:?请设置已确认的 profile 绝对路径}"
node scripts/sync-profile.mjs --check --loadpoint --profile "$PROFILE"
node scripts/sync-profile.mjs --apply --loadpoint --profile "$PROFILE"
node scripts/sync-profile.mjs --check --loadpoint --profile "$PROFILE"
```

检查的 exit 1 必须点名预期缺件或漂移；exit 0 且对比包数大于零才是有效复核。
出现 `skip`、清单不可读、整个包缺失、作用域与预期不符时先停止，不能以汇总行代替逐项证据。
`--apply --loadpoint` 会处理目标 profile 内所有命中的受管包，执行前审阅完整 drift 列表。

## 3. 成功与回退

- 逐文件比较仓库源与装载点的 SHA-256，并确认源文件未改写。
- 原子替换允许目标 inode 改变，不要求恢复硬链接配对；旧硬链接别名必须保留旧字节。
- 复核无临时文件残留；若需回退，只将自己的备份通过同目录临时文件 + rename 还原目标。
- 字节一致不等于界面已验收。按模块装载语义安排刷新/完整重启，再验证目标功能。

## 4. 已执行的隔离演练

2026-09-23，复制 wanzh 的装载面到独占临时 profile；整个过程不修改真实 profile 或仓库源。
命令均为上述三个真实 CLI，附显式 `--profile <隔离目录>`。

```text
baseline --check: exit 0; ok 装载点与仓库源一致（对比 1 个包）
移除 lib/bounded-body.js 后 --check: exit 1
drift dsh-wanzh-hulian: ~lib/bounded-body.js
--apply: exit 0; 已按 tmp+mv 原子替换/补齐 1 个文件
restore --check: exit 0; 对比 1 个包
```

另将隔离目标改为旧字节并建立硬链接别名，重跑 check→apply→check：exit 1→0→0。
目标 inode `278328770 → 278328773`，旧别名哈希不变，新目标与源码哈希一致；
源侧 11 个文件哈希全部不变，临时根已清理。相关同步测试 `14 pass / 0 fail`：

```bash
node --test scripts/gates/sync-profile-files.test.mjs scripts/gates/sync-profile.test.mjs
```
