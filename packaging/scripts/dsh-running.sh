#!/bin/bash
# dsh-running.sh —— 「本机是否有 DSH 实例正在跑」的**唯一判据**。
#
# ## 为什么它必须只有一个家
#
# 「运行中替换 app bundle → 宿主 HMR 热更 → 生产 renderer 无完整热替换 runtime → 整屏白屏」
# 是一条红线（2026-09-13 实测，SOP §7）。守着它的那道闸出现在**四个地方**：安装器 0b 步、
# 首启验收、品牌重放、发布前检查清单。四处各自量了一遍，于是同一个事实住了四个家，
# 而**修的时候只修了看得见的那一处**（P-07 的原形）。本文件把它们收成一家：
# 要问「在不在跑」，就调本脚本，不要就地再写一条。
#
# ## 判据为什么不能是 `pgrep -f "$APP/Contents/MacOS/"`
#
# 2026-09-13 实测（DSH 主进程确实在跑，`/Applications/DSH Desktop.app`）：
#
#     $ ps -Ao pid=,comm=
#     87357 /Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop     ← 靶子在这里，读得到
#     $ pgrep -f '/Applications/DSH Desktop.app/Contents/MacOS/'
#     (无输出)                                                          ← 原判据：0 条，exit=1
#     $ pgrep -f 'Contents/MacOS/'
#     222 条                                                            ← 不是 pgrep 坏了，是它对**这个进程**盲
#
# `pgrep -f` 对普通 CLI 进程是好的（同一条模式对一个从 `Contents/MacOS/` 路径启动的
# 拷贝进程当场命中 99354）；它盲的是**这个 Electron 主进程**。原因未查明，也不重要——
# 我们不需要解释它，只需要不再用它。
#
# 失效之所以昂贵，是因为它是**静默**的：原判据返回空 → 安装器一路走到 `else` 打印
# 「无运行中的 DSH 实例」→ 然后在运行中替换 app bundle → 白屏。**那道闸守的正是白屏红线，
# 而它等于没有守**（P-02 仪器假绿）。
#
# ## 判据
#
# 读 `ps -Ao pid=,comm=`（**可执行文件全路径**，不扫 argv），按两种问法之一比：
#
#   · `--app <路径>`（默认）：comm 必须**逐字节等于** `<路径>/Contents/MacOS/DSH Desktop`。
#   · `--any`：comm 必须以 `/DSH Desktop.app/Contents/MacOS/DSH Desktop` **结尾**——
#     问的是「这台机器上有没有**任何**一份 DSH 在跑」，不挑路径（首启验收要的是这个：
#     双实例并存会互相干扰，而干扰的那一份可能在隔离目录里）。
#
# 不扫 argv 有两个好处：精确（不命中路径里恰好含该串的别的进程），且不会被调用者自己的
# 命令行误命中（self-match）。
#
# ## 退出码（契约）
#
#     0 = 有实例在跑
#     1 = 没有实例在跑（**可判定**，包括 app 根本没装——那也算「没有在跑」）
#     2 = 用法错误
#     4 = **判不了**（`ps` 读不出进程表）
#
# 4 这一档是这条判据的重点：**「读不到」与「没有在跑」必须分开**。合并成 1 的后果与
# 上面那个 `pgrep` 完全相同——闸静默放行。调用方拿到 4 必须**中止**，不得当成「没在跑」。
#
# ## 边界（诚实写清楚）
#
# 1. **只在 macOS 上验过**，且本机实测 `ps -Ao comm=` 给的是**未截断的完整路径**。
#    Linux 的 `comm` 是 15 字符截断量，本判据在那里会恒判「没有在跑」。安装器本身
#    只在 macOS 上跑（`uname -s` 前置校验），故不为此加分支。
# 2. **只量「有没有」**，不量「是不是同一个 app」。`--app` 只比路径，不校验签名身份、
#    不校验版本；`--any` 更宽，连路径都不挑。要判「跑的是不是已装那一份」，用 `lsof`
#    那条判据（见 `verify-tcc-runtime.sh` 的归因检查）。
# 3. **不判「该不该退」**。命中之后退不退、等多久，由调用方决定（安装器等 15 秒，
#    品牌重放直接拒绝动手）。
#
# 用法：
#   bash dsh-running.sh [--app <app 路径>] [--any] [--quiet]
# 环境变量：DSH_APP 提供默认 app 路径。
set -u

APP="${DSH_APP:-/Applications/DSH Desktop.app}"
QUIET=0
ANY=0
USAGE="用法：dsh-running.sh [--app <app 路径>] [--any] [--quiet]"

while [ $# -gt 0 ]; do
  case "$1" in
    --app)     APP="${2:-}"; shift 2 || { echo "$USAGE" >&2; exit 2; } ;;
    --app=*)   APP="${1#--app=}"; shift ;;
    --any)     ANY=1; shift ;;
    --quiet|-q) QUIET=1; shift ;;
    -h|--help) sed -n '1,75p' "$0" | sed -n 's/^# \{0,1\}//p'; exit 0 ;;
    *)         echo "$USAGE" >&2; exit 2 ;;
  esac
done

[ -n "$APP" ] || { echo "用法：--app 不能为空" >&2; exit 2; }
EXEC="$APP/Contents/MacOS/DSH Desktop"
# --any 的问法：不挑路径，只认 bundle 名。尾锚定，免得命中 `NotDSH Desktop.app` 这类。
ANY_SUFFIX="/DSH Desktop.app/Contents/MacOS/DSH Desktop"

# ── 量。读不出必须与「没有在跑」分开（P-02）。────────────────────────────────
PS_TABLE="$(ps -Ao pid=,comm= 2>/dev/null)" || {
  echo "[dsh-running] 判不了：\`ps -Ao pid=,comm=\` 读不出进程表，不能据此断定没有实例在跑" >&2
  exit 4
}
if [ -z "$PS_TABLE" ]; then
  echo "[dsh-running] 判不了：进程表为空（$0 拿到 0 行），不能据此断定没有实例在跑" >&2
  exit 4
fi

# comm 字段可能含空格（本例的 app 名就含），所以只摘掉第一列 pid，其余整行逐字节比。
if [ "$ANY" = "1" ]; then
  # 后缀比较必须用 substr。`index($0,suf)` 在**未命中**时返回 0，当 comm 比 suf 短 1 字符时
  # 「尾部窗口 = 0」与它撞号 → 短路径全被误判成命中（2026-09-20 实机：coreservicesd /
  # icdd / iconservicesd 三条系统进程让 --any 谎报「在跑」，quit 后轮询不收敛；回归网 R6d）。
  PIDS="$(printf '%s\n' "$PS_TABLE" | awk -v suf="$ANY_SUFFIX" '{ pid=$1; $1=""; sub(/^ /, ""); if (length($0) >= length(suf) && substr($0, length($0) - length(suf) + 1) == suf) print pid }')"
  WHAT="任何 DSH 实例"
else
  PIDS="$(printf '%s\n' "$PS_TABLE" | awk -v want="$EXEC" '{ pid=$1; $1=""; sub(/^ /, ""); if ($0 == want) print pid }')"
  WHAT="$EXEC"
fi

if [ -n "$PIDS" ]; then
  if [ "$QUIET" = "0" ]; then
    PID_LIST="$(printf '%s\n' "$PIDS" | tr '\n' ' ' | sed 's/ $//')"
    echo "[dsh-running] 在跑：pid ${PID_LIST} → ${WHAT}"
  fi
  exit 0
fi

[ "$QUIET" = "1" ] || echo "[dsh-running] 没有在跑：$WHAT"
exit 1
