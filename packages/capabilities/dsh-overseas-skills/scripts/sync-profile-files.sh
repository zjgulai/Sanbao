#!/bin/bash
# sync-profile-files.sh — 把仓库产物同步进 profile 副本（`file:` 依赖的装载点）。
#
# 为什么单独成脚本而不是留在 pipeline.sh 里内联：**内联的守卫没法被测**。
# pipeline.sh 的第 8 阶段原来是一段内联 shell，它的 `-ef` 判据在真实事故里起过作用
# （见下），却没有任何用例能跑它 —— 这正好是本仓库台账 #25 那一类：
# 「判据在 main() 里，selftest 只测库函数 ⇒ 把守卫改成 if(false) 照样全绿」。
# 抽出来之后，`test/profile-sync.spec.mjs` 用夹具**真跑这个入口**，并把它改坏验证用例有劲。
#
# 用法：
#   bash scripts/sync-profile-files.sh <profile_lib_dir> <file> [<file>...]
#
# 环境：
#   PROFILE_SRC_LIB    仓库侧源目录（默认 `lib`，相对**本包根**）。
#                      ⚠️ 要给别的包同步时**必须给绝对路径**；给相对路径会静默地把
#                      **本包的产物**写进那个包的装载点。这不是假想：本脚本的作者
#                      第一次这样调用，就把出海包的 `index.js`/`client.js` 写进了
#                      算法技能包的装载点（两个包的文件名完全一样，尺寸也只差一点）。
#                      所以下面加了包名对账（退出码 3），让这个错**写不进去**。
#   PROFILE_SYNC_MODE  `tmp-mv`（默认，唯一准入的写盘方式）| `direct`（朴素 `cat >`）
#
# ── 它防的是什么 ────────────────────────────────────────────────────────────────
# `pnpm file:` 装出来的是**硬链接**，不是拷贝、也不是符号链接：仓库里那份与装载点那份
# 是同一个 inode。/etc 级的事实是 —— 编辑工具（含本仓库的 agent）落盘一律 tmp+mv，
# 新 inode ⇒ 硬链接当场断开，此后仓库里每次构建都只写进仓库那一份，装载点停在旧字节。
#
# 而**把它接回去的时候**才有真正的杀招：若两份又是同一 inode（`ln -f` 接回的形态），
# 用 `cat src > dst` 同步会先把 dst 截断为 0 字节 —— 而 dst 与 src 是同一个 inode，
# 于是**源文件也被截成 0 字节**。本仓库真发生过：`lib/catalog.js` 曾被这样「硬链接双杀」
# 归零（见 packages/capabilities/dsh-overseas-skills/docs/recent-changes-2026-09-08.md）。
#
# 所以本脚本有两条出口，都不是可选的：
#   1. 同 inode ⇒ 先 `rm -f` 断链，再 tmp+mv 原子替换（内容正确、链接关系明确断开）；
#   2. `PROFILE_SYNC_MODE=direct` 且同 inode ⇒ **拒绝执行并报出来**（退出码 1），
#      绝不落到那句 `cat >` 上。非同 inode 的 `direct` 放行 —— 守卫不许退化成
#      「一律拒绝」，否则它只是一枚橡皮图章。
#
# 退出码：0 成功 / 1 守卫拦下（同 inode 直写）/ 2 输入没拿到（源文件不存在）/ 3 包名对不上
set -euo pipefail
cd "$(dirname "$0")/.."

DEST_DIR="${1:?用法: sync-profile-files.sh <profile_lib_dir> <file> [<file>...]}"
shift
if [ "$#" -eq 0 ]; then echo "✗ 没有给要同步的文件名" >&2; exit 2; fi

SRC_DIR="${PROFILE_SRC_LIB:-lib}"
MODE="${PROFILE_SYNC_MODE:-tmp-mv}"

# ── 包名对账 ────────────────────────────────────────────────────────────────
# `lib/index.js` / `lib/client.js` 这种名字**每个包都一样**，所以「源目录指错了包」
# 不会以任何形式报错：它会安静地把 A 包的产物写进 B 包的装载点，而两边文件名都对得上。
# 这里拿两边的 package.json.name 对一次账，对不上直接拒绝（退出码 3）。
# 拿不到 package.json 时**跳过**（夹具目录就没有），但会把「跳过了」打出来 ——
# 静默跳过等于把这条判据换成一句空话。
SRC_PKG="$(dirname "$SRC_DIR")/package.json"
DEST_PKG="$(dirname "$DEST_DIR")/package.json"
if [ -f "$SRC_PKG" ] && [ -f "$DEST_PKG" ]; then
  s_name="$(node -p "require('$SRC_PKG').name || ''")"
  d_name="$(node -p "require('$DEST_PKG').name || ''")"
  if [ "$s_name" != "$d_name" ]; then
    echo "✗ 源包「${s_name}」≠ 目标包「${d_name}」：拒绝把 ${s_name} 的产物写进 ${d_name} 的装载点。" >&2
    echo "  多半是 PROFILE_SRC_LIB 给了相对路径（本包根）或指到了别的包。" >&2
    echo "  源：${SRC_PKG}" >&2
    echo "  目标：${DEST_PKG}" >&2
    exit 3
  fi
  echo "包名对账：${s_name} = ${d_name}"
else
  echo "包名对账：跳过（源或目标没有 package.json：${SRC_PKG} / ${DEST_PKG}）"
fi

for f in "$@"; do
  s="$SRC_DIR/$f"; d="$DEST_DIR/$f"
  if [ ! -f "$s" ]; then echo "✗ 源不存在：${s}" >&2; exit 2; fi

  # `-ef` 即「同一设备 + 同一 inode」，与硬链接是同一件事的两种说法。
  linked=0
  if [ -f "$d" ] && [ "$s" -ef "$d" ]; then linked=1; fi

  if [ "$linked" = "1" ]; then
    if [ "$MODE" = "direct" ]; then
      echo "✗ 守卫拦下：${d} 与 ${s} 是同一 inode（硬链接）。" >&2
      echo "  \`cat >\` 会先把目标截断为 0 字节，而目标是同一个 inode ⇒ 源文件一起归零" >&2
      echo "  （历史事故：lib/catalog.js 被硬链接双杀）。改用 tmp+mv，或先 ln -f 断链。" >&2
      exit 1
    fi
    echo "⚠ 守卫：${d} 与 ${s} 同 inode（硬链接）——先断链再原子替换（cat > 会双杀）"
    rm -f "$d"
  fi

  if [ "$MODE" = "direct" ]; then
    cat "$s" > "$d"
  else
    cp "$s" "$d.tmp" && mv -f "$d.tmp" "$d"
  fi
  echo "  ${f}: 同步 ← ${s}"
done
