# DA-26 · 薄壳物资消融（materialize 缺件降级路径）

- 优先级：P1
- 状态：`open`
- 依赖：无
- 估算：M
- 来源：2026-09-22 诊断读数（薄壳 materialize 链路 91 行，缺件时的启动行为从未读数）

## Problem

lute-shell 用 npm 上的 harness 运行时启动 cordis host，`src/profile/materialize.ts` 负责物资就位。
运行时源 = `vendor/dsh-desktop/dsh-plugin-desktop/node_modules`（0.1.5-rc.2 物化 270/270 tgz）。
**缺一个 tgz 时薄壳怎么启动**——是清晰报错、静默降级、还是挂死——没有读过数。
这是启动链路的单点故障面（挂死类故障尤其危险，仪器都要过故障现场）。

## 动作

1. 在隔离环境（备份 profile / 临时目录，不碰生产）抽走 materialize 输入的一个 tgz；
2. 启动薄壳，记录三件事：退出码 / 错误信息（stderr 与日志）/ lifecycle-events 读数；
3. 按「清晰报错 / 静默降级 / 挂死」三态分类；挂死或静默 = 缺陷，补 fail-fast；
4. 与 DA-36 回滚演练共享环境准备（若时序相近）。

## 验收

- 缺件消融的原始读数（命令 + 输出）落盘；
- 若为清晰报错：报错信息指明缺失文件与恢复路径；若为静默/挂死：修复后重跑读数；
- 修复类改动过 `lute-shell-pin` 相关门禁。

## 注意

- 挂死判读按四签名纪律（CPU/inspector/console/rAF），别只等超时；
- 消融在副本上做，结束后恢复并核对哈希。
