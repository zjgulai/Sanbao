# scripts/ · Sage Shell 本地脚本

这些脚本都是本地开发工具，不进入 CI；断言清单以 [`smoke.mjs`](smoke.mjs) 源码为准。

所有脚本只认 Sage 的数据根：默认是 `~/Library/Application Support/Sage`，也可以用绝对路径
`SAGE_ROOT` 覆盖。该根中的 `harness/` 才会作为子进程的 `DSH_HOME`；Electron 的 userData、
session、日志和 crash dump 都在同一 Sage 根的 `electron/` 下。脚本不会把环境中的旧 Harness
根作为资料来源。

## `materialize.mjs`（`pnpm run materialize`）

先运行 `pnpm run build`，再创建一个新的不可变 profile generation：将 `seed/` 与编译好的 Host
运行时复制到 staging，执行依赖安装、清单哈希校验，然后原子更新 `profile-current.json`。已激活的
generation 不会被原地覆盖，失败也不会替换原有指针。

`SAGE_ROOT=/absolute/sage-root pnpm run materialize` 适合临时 fixture 或隔离验收。不要把真实旧资料、
凭证、会话、预设或工作区复制进这个命令；这些资料的导入仍须走后续经确认的 allowlist 流程。

## `preview.mjs`（`pnpm run preview`）

默认在仓库的 `.sage-preview/` 下创建独立 Sage 根、profile generation 和 Electron 预览，不接触默认
资料根。可通过 `SAGE_ROOT=/absolute/isolated-root` 指定另一个隔离根，`SAGE_CDP_PORT` 指定本机 CDP
端口，`SAGE_DEVTOOLS=1` 打开开发者工具。预览会清除继承的旧 Harness 根和旧 Shell 环境变量。

预览只用于隔离桌面验收，不等同于已发布 App 或真实用户资料的迁移验收。

## `smoke.mjs`（`pnpm run smoke`）

无头端到端 smoke：读取当前 Sage 根中的已激活 profile，纯 Node 父进程 spawn Host 子进程，走
FD3/FD4 帧管道核对 Sage 文档、`/.sage/state`、唯一 `retry` action 和被拒绝的旧路由。它不启动 GUI；
Host 子进程只得到该 Sage 根的 Harness 目录。`SAGE_NODE_BINARY` 可显式指定子进程 Node，`SAGE_ROOT`
可选择要验收的隔离 Sage 根。

Host 中途死亡（fatal、提前退出、请求无应答超时）会转成点名请求的 FAIL 行和子进程 stderr 转储，
不会静默挂起。前置条件是对应根已成功完成 `materialize`；profile 未物化、旧运行时与 GUI 问题应
分别归因，不要混成产品状态结论。
