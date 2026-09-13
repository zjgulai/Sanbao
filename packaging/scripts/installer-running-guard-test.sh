#!/bin/bash
# installer-running-guard-test.sh —— 安装器 0b 闸（「先退出运行中的 DSH 再替换 app bundle」）的反向自测
#
# ## 为什么必须有它
#
# 0b 闸守的是白屏红线（运行中替换 app bundle → 宿主 HMR 热更 → 整屏白屏）。它的前身是
# `pgrep -f "$APP_TARGET/Contents/MacOS/"`，在 DSH 主进程明明在跑时返回 0 条——闸**静默放行**，
# 而它守的白线因此等于没有（ADR-0080）。判据本身已收进 `dsh-running.sh` 并自有自测；本文件测的是
# **安装器有没有正确地消费那条判据**：`0`/`1` 走两条路，`4`（判不了）与未知码必须**中止**。
#
# ## 为什么不跑整个安装器
#
# 跑 `install.sh` 会替换本机 `/Applications/DSH Desktop.app`——开发机上不能这么测。所以本自测
# **按字节抽出 0b 那一块**（`# ── 0b/6` 到其后第一个 `fi`），配桩运行。抽出来的就是要跑的那些行，
# 安装器改了闸、本自测跟着改；抽不到内容则判红，不会静默变成空转。
#
# ## 桩的红线
#
# `osascript` **必须**打桩：0b 块会执行 `tell application "<QUIT_APP>" to quit`，不打桩就会
# 拿**开发机上正在跑的 DSH**（也就是跑这个测试的那台）去满足断言。`QUIT_APP` 同时被指向一个
# 不存在的名字，两道保险。
#
# 用法: bash packaging/scripts/installer-running-guard-test.sh
# 退出码: 0 = 全绿；1 = 有断言失败
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
INSTALLER="$HERE/../installer/install.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

[ -f "$INSTALLER" ] || { echo "[自测] 找不到安装器: $INSTALLER" >&2; exit 1; }

# ── 按字节抽出 0b 块 ────────────────────────────────────────────────────────
# 锚点用**段落标记**而不是「第一个 fi」：0b 块内部有自己的 if/fi（缺工具那条），
# 按 fi 收尾会截出一个只剩开头几行的空壳——而空壳照样跑得出绿（首版 T3 就是这么假绿的）。
awk '/^# ── 0b\/6/{f=1} /^# ── 1\/6/{f=0} f{print}' "$INSTALLER" > "$TMP/block.sh"
LAST="$(grep -v '^[[:space:]]*$' "$TMP/block.sh" | tail -1)"
if [ ! -s "$TMP/block.sh" ] || [ "$LAST" != "fi" ]; then
  echo "[自测] 抽不出完整的 0b 块（末行='${LAST}'，期望 'fi'）——自测失效，判红" >&2
  exit 1
fi
BLOCK_LINES="$(wc -l < "$TMP/block.sh" | tr -d ' ')"

# ── 夹具：一个载荷目录（HERE=payload），可指定 tools/dsh-running.sh 的形态 ──
# mode: real = 真判据（拷贝）；always0 = 恒说「在跑」；abstain = 判不了（4）
mkharness(){ # $1=目录 $2=mode
  local dir="$1" mode="$2"
  mkdir -p "$dir/payload/tools" "$dir/App.app/Contents/MacOS"
  case "$mode" in
    real)    cp "$HERE/dsh-running.sh" "$dir/payload/tools/dsh-running.sh" ;;
    always0) printf '#!/bin/bash\nexit 0\n' > "$dir/payload/tools/dsh-running.sh" ;;
    abstain) printf '#!/bin/bash\necho "判不了：桩" >&2\nexit 4\n' > "$dir/payload/tools/dsh-running.sh" ;;
    none)    : ;;
  esac
  cat > "$dir/run.sh" <<RUNNER
set -euo pipefail
HERE="$dir/payload"
APP_TARGET="$dir/App.app"
QUIT_APP="LuteFixtureMustNotQuit"
say(){ echo "[install] \$*"; }
# 桩：不许碰开发机上真正在跑的 DSH；也把 15 次等待压成 1 次。
osascript(){ echo "(桩) 拒绝退出"; return 1; }
seq(){ echo 1; }
sleep(){ :; }
. "$TMP/block.sh"
echo "BLOCK_PASSED"
RUNNER
}

run_case(){ # $1=dir → stdout 与退出码
  bash "$1/run.sh" > "$1/out.txt" 2>&1; echo $?
}

# ── T1 没有实例在跑（真判据 + 不存在的 app 路径）→ 放行 ─────────────────────
mkharness "$TMP/t1" real
rc="$(run_case "$TMP/t1")"
if [ "$rc" = "0" ] && grep -q 'BLOCK_PASSED' "$TMP/t1/out.txt" && grep -q '无运行中的 DSH 实例' "$TMP/t1/out.txt"; then
  ok "T1 没有实例在跑 → 放行（真判据，app 路径不存在）"
else
  no "T1 期望放行且打「无运行中的 DSH 实例」，实得 rc=$rc / $(tail -1 "$TMP/t1/out.txt")"
fi

# ── T2 有实例在跑且退不出去 → 必须中止（不得继续替换 app bundle）────────────
mkharness "$TMP/t2" always0
rc="$(run_case "$TMP/t2")"
if [ "$rc" = "1" ] && grep -q '未能在 15 秒内退出' "$TMP/t2/out.txt" && ! grep -q 'BLOCK_PASSED' "$TMP/t2/out.txt"; then
  ok "T2 实例在跑且退不出去 → 中止（未走到替换 app bundle）"
else
  no "T2 期望 rc=1 且打「未能在 15 秒内退出」，实得 rc=$rc"
fi

# ── T3 载荷缺 tools/dsh-running.sh → 必须中止，不得当成「没有实例在跑」──────
mkharness "$TMP/t3" none
rc="$(run_case "$TMP/t3")"
if [ "$rc" = "1" ] && grep -q '载荷缺少 tools/dsh-running.sh' "$TMP/t3/out.txt"; then
  ok "T3 缺判据 → 中止（缺判据 ≠ 没有实例在跑）"
else
  no "T3 期望 rc=1 且打「载荷缺少」，实得 rc=$rc"
fi

# ── T4 判不了（退出码 4）→ 必须中止，不得走到「无运行中的 DSH 实例」─────────
mkharness "$TMP/t4" abstain
rc="$(run_case "$TMP/t4")"
if [ "$rc" = "1" ] && grep -q '判不了' "$TMP/t4/out.txt" && ! grep -q '无运行中的 DSH 实例' "$TMP/t4/out.txt"; then
  ok "T4 判不了（4）→ 中止，且**没有**打印「无运行中的 DSH 实例」"
else
  no "T4 期望 rc=1 且只打「判不了」，实得 rc=$rc"
fi

# ── M1 恒真桩突变：把 4 也当成可放行的码，T4 必须因此失败 ───────────────────
n="$(grep -c '^  0|1) : ;;$' "$TMP/block.sh")"
if [ "$n" != "1" ]; then
  no "M1 突变锚点不唯一（'  0|1) : ;;' 出现 $n 次）——请同步更新突变锚"
else
  sed 's/^  0|1) : ;;$/\t0|1|4) : ;;/' "$TMP/block.sh" > "$TMP/block-m1.sh"
  mkharness "$TMP/m1" abstain
  sed "s#$TMP/block.sh#$TMP/block-m1.sh#" "$TMP/m1/run.sh" > "$TMP/m1/run-m1.sh"
  rc="$(bash "$TMP/m1/run-m1.sh" > "$TMP/m1/out.txt" 2>&1; echo $?)"
  if [ "$rc" != "1" ]; then ok "M1 恒真桩（4 被当成可放行）下 T4 失败（rc=${rc}）→ T4 有牙"
  else no "M1 恒真桩下 T4 仍中止 → T4 与实现无关，是空转"; fi
fi

echo
echo "== 结果: ${PASS} 通过 / ${FAIL} 失败（0b 块 ${BLOCK_LINES} 行）=="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
