#!/bin/bash
# dsh-running-test.sh —— dsh-running.sh 的反向自测
#
# 为什么必须有它：这条判据的前身（`pgrep -f "<app>/Contents/MacOS/"`）在 DSH 主进程明明
# 在跑时返回 0 条，而它守的是「运行中替换 app bundle → 白屏」这条红线——**闸静默放行**。
# 一条只会说「没有在跑」的判据，和一条只会说「在跑」的判据，代价完全相同：前者让闸消失，
# 后者让安装器永远装不上。所以本自测的核心不是「它能不能判出在跑」，而是
# **同一条路径、同一份字节，只有进程在不在变，读数必须跟着变**。
#
# 夹具是真的进程（`/bin/sleep` 拷贝到 `<...>.app/Contents/MacOS/DSH Desktop`），不是桩：
# 判据量的是 `ps` 的 comm 列，桩回答不了「ps 到底看得见什么」这个问题。
#
# 用法: bash packaging/scripts/dsh-running-test.sh
# 退出码: 0 = 全绿；1 = 有断言失败
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SUT="$HERE/dsh-running.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FX="$TMP/Fixture.app"
OTHER="$TMP/Other.app"

PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

[ -f "$SUT" ] || { echo "[自测] 找不到被测脚本: $SUT" >&2; exit 1; }

# 夹具：可执行文件名必须**同为** `DSH Desktop`——判据比的是这条全路径，改名就不再是被测对象。
mkfixture(){ mkdir -p "$1/Contents/MacOS"; cp /bin/sleep "$1/Contents/MacOS/DSH Desktop"; }
mkfixture "$FX"; mkfixture "$OTHER"

PID_FX=""; PID_OTHER=""
STARTED=0
start(){ "$1/Contents/MacOS/DSH Desktop" 120 & LAST=$!; sleep 0.4; }
stop(){ kill "$1" 2>/dev/null || true; wait "$1" 2>/dev/null || true; }
cleanup(){ [ -n "$PID_FX" ] && stop "$PID_FX"; [ -n "$PID_OTHER" ] && stop "$PID_OTHER"; }
trap 'cleanup; rm -rf "$TMP"' EXIT

# 只取退出码，把判据自己的散文挡掉（判定看退出码，不看话术）。
rc_of(){ "$1" "${@:2}" >/dev/null 2>&1; echo $?; }

start "$FX"; PID_FX="$LAST"

# ── R1 阳性：进程在跑 → 0 ──────────────────────────────────────────────────
rc="$(rc_of bash "$SUT" --app "$FX")"
if [ "$rc" = "0" ]; then ok "R1 造出的进程在跑 → 0"
else no "R1 期望 0（进程确实在跑），实得 rc=$rc"; fi

# ── R2 判别力：同目录两个 app，只有 FX 在跑 → 两个读数必须分别 0 / 1 ────────
# 没有这一条，一个「扫全表、见任何一行都算命中」的实现照样能过 R1。
rc_o="$(rc_of bash "$SUT" --app "$OTHER")"
rc_f="$(rc_of bash "$SUT" --app "$FX" --quiet)"
if [ "$rc_o" = "1" ] && [ "$rc_f" = "0" ]; then ok "R2 未运行的邻居判 1、运行中的 fixture 判 0（不是「见谁都算命中」）"
else no "R2 期望 邻居=1 / fixture=0，实得 邻居=$rc_o / fixture=$rc_f"; fi

# ── M1 恒真桩突变：把「在跑」那一支改成 exit 1，R1 必须因此失败 ─────────────
n="$(grep -c '^  exit 0$' "$SUT")"
if [ "$n" != "1" ]; then
  no "M1 突变锚点不唯一（'  exit 0' 出现 $n 次）——自测的牙齿本身失效了，请同步更新突变锚"
else
  sed 's/^  exit 0$/  exit 1/' "$SUT" > "$TMP/m1.sh"
  rc1="$(rc_of bash "$TMP/m1.sh" --app "$FX")"
  if [ "$rc1" != "0" ]; then ok "M1 恒真桩（只会说「没有在跑」）下 R1 失败（rc=${rc1}）→ R1 有牙"
  else no "M1 恒真桩下 R1 仍判 0 → R1 与实现无关，是空转"; fi
fi

stop "$PID_FX"; PID_FX=""

# ── R3 阴性：同一条路径、同一份字节，进程没了 → 1 ─────────────────────────
rc="$(rc_of bash "$SUT" --app "$FX")"
if [ "$rc" = "1" ]; then ok "R3 同一 fixture 进程退出后 → 1（读数跟着进程在不在变）"
else no "R3 期望 1（进程已退出），实得 rc=$rc"; fi

# ── M2 恒真桩突变：把「没有在跑」那一支改成 exit 0，R3 必须因此失败 ─────────
n="$(grep -c '^exit 1$' "$SUT")"
if [ "$n" != "1" ]; then
  no "M2 突变锚点不唯一（'exit 1' 出现 $n 次）——请同步更新突变锚"
else
  sed 's/^exit 1$/exit 0/' "$SUT" > "$TMP/m2.sh"
  rc1="$(rc_of bash "$TMP/m2.sh" --app "$FX")"
  if [ "$rc1" != "1" ]; then ok "M2 恒真桩（只会说「在跑」）下 R3 失败（rc=${rc1}）→ R3 有牙"
  else no "M2 恒真桩下 R3 仍判 1 → R3 与实现无关，是空转"; fi
fi

# ── R4 「读不出」必须与「没有在跑」分开（P-02）─────────────────────────────
# 桩：一个必然失败的 ps。判据必须给 4，**绝不能**给 1——把它读成「没有在跑」
# 就是前身那条判据的同一个死法。
mkdir -p "$TMP/bin"; printf '#!/bin/bash\nexit 1\n' > "$TMP/bin/ps"; chmod +x "$TMP/bin/ps"
rc="$(PATH="$TMP/bin:$PATH" bash "$SUT" --app "$FX" >/dev/null 2>&1; echo $?)"
if [ "$rc" = "4" ]; then ok "R4 ps 读不出进程表 → 4（判不了，不是「没有在跑」）"
else no "R4 期望 4，实得 rc=$rc —— 读不出被当成了结论"; fi

# ── R5 用法错误 → 2 ────────────────────────────────────────────────────────
rc="$(rc_of bash "$SUT" --bogus)"
if [ "$rc" = "2" ]; then ok "R5 未知参数 → 2（用法错误与两种判定分开）"
else no "R5 期望 2，实得 rc=$rc"; fi

# ── R6 `--any` 的问法：换一张**受控进程表**，两种问法必须给出不同的答案 ──────
# 为什么用桩而不是真机：开发机上真 DSH 一直在跑，`--any` 于是恒为 0，任何断言都测不出东西。
# 受控表让「路径不挑、bundle 名要认」这条规则可判；表里特意放两个诱饵：
# `Other.app`（同名可执行文件、不同 bundle）与 `DSH Desktop.app/…/DSH Desktop-extra`
# （尾锚定必须挡住它）。
mkpsstub(){ # $1=bin 目录 $2=表（每行「pid 路径」）
  mkdir -p "$1"
  { echo '#!/bin/bash'; echo "cat <<'TBL'"; printf '%b\n' "$2"; echo 'TBL'; } > "$1/ps"
  chmod +x "$1/ps"
}
mkpsstub "$TMP/bin2" "  111 /opt/Elsewhere/DSH Desktop.app/Contents/MacOS/DSH Desktop"
rc="$(PATH="$TMP/bin2:$PATH" bash "$SUT" --any --quiet >/dev/null 2>&1; echo $?)"
if [ "$rc" = "0" ]; then ok "R6a 表里的 DSH 在 /opt/Elsewhere（不是默认路径）→ --any 判 0"
else no "R6a 期望 0（--any 不挑路径），实得 rc=$rc"; fi

mkpsstub "$TMP/bin3" "  222 /tmp/Fixture.app/Contents/MacOS/DSH Desktop
  333 /tmp/Dee.app/Contents/MacOS/DSH Desktop-extra"
rc_any="$(PATH="$TMP/bin3:$PATH" bash "$SUT" --any --quiet >/dev/null 2>&1; echo $?)"
rc_app="$(PATH="$TMP/bin3:$PATH" bash "$SUT" --app /tmp/Fixture.app --quiet >/dev/null 2>&1; echo $?)"
if [ "$rc_any" = "1" ]; then ok "R6b bundle 名不是 DSH Desktop.app（含 DSH Desktop-extra 诱饵）→ --any 判 1"
else no "R6b 期望 1（尾锚定），实得 rc=$rc_any"; fi
if [ "$rc_app" = "0" ]; then ok "R6c 同一张表下 --app <路径> 仍判 0 → 两种问法确实不同，不是别名"
else no "R6c 期望 0，实得 rc=$rc_app"; fi

# ── R7 真实靶子：已装的 app 在跑时，本判据必须说 0 ─────────────────────────
# 期望值由**独立读数**给出（本脚本自己 grep ps），不用被测脚本自证。
REAL="${DSH_APP:-/Applications/DSH Desktop.app}"
REAL_EXEC="$REAL/Contents/MacOS/DSH Desktop"
if ps -Ao comm= 2>/dev/null | grep -Fxq -- "$REAL_EXEC"; then
  rc="$(rc_of bash "$SUT" --app "$REAL")"
  if [ "$rc" = "0" ]; then ok "R7 已装 app 正在跑（ps 独立读得）→ 本判据也判 0"
  else no "R7 已装 app 在跑而本判据给 rc=$rc —— 真实靶子上失效"; fi
else
  printf '  [info] R7 跳过：已装 app 当前不在跑（%s 无对应进程）——本次未判定\n' "$REAL_EXEC"
fi

# 这一支**故意不**重取那条死仪器的对照读数：写它会被门禁 `dead-instrument` 判红
# （判据面里容不下「跑一下试试」的写法——它分不出「使用」与「测量」）。对照读数是一次性取证，
# 记在 scripts/gates/dead-instruments.json 的 reading 与 ADR-0080 里；要复核就读那条登记项，
# 不要在本文件里再写一遍那条命令。

echo
echo "== 结果: ${PASS} 通过 / ${FAIL} 失败 =="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
