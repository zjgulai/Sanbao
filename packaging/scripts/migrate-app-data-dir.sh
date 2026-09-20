#!/bin/bash
# migrate-app-data-dir.sh —— 把 Electron 用户数据目录从旧产品名搬到新名（Sanbao）。
#
# ## 搬的是什么、不搬什么
#
#   · 搬：`~/Library/Application Support/<旧名>`（Electron userData：缓存、日志、
#     窗口尺寸、上次选中的 profile、diagnostics、health-snapshots、cli）。
#   · **不搬也不碰**：`~/.dsh` —— 真正的 profile / 会话 / 设置住在那里，与 productName
#     无关（实测 `data-directory/state.json` 不存在时应用走它兜底）。
#
# ## 纪律
#
#   · **只复制不删除**：旧目录原地保留当后路，确认新实例跑通后再由人决定是否清理。
#   · 运行中拒绝动手（替换 app bundle / 搬迁 userData 都会让运行中的实例写错地方）。
#   · 幂等：新目录已有内容时只报告，不合并、不覆盖（--force 才覆盖，且仍不删旧）。
#
# 用法：migrate-app-data-dir.sh [--check|--apply [--force]]
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNING_TOOL="$REPO/packaging/scripts/dsh-running.sh"
APP="${DSH_APP:-/Applications/DSH Desktop.app}"
MODE="${1:---check}"
FORCE="${2:-}"

BRAND_NAME="$(cat "$REPO/dsh-patches/brand-payload-name.txt" 2>/dev/null | tr -d '\n' || true)"
BRAND_NAME="${BRAND_NAME:-Sanbao}"
OLD_DIR="$HOME/Library/Application Support/DSH Desktop"
NEW_DIR="$HOME/Library/Application Support/$BRAND_NAME"

say() { echo "[migrate] $*"; }

size_of() { [ -d "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "—"; }

case "$MODE" in
  --check)
    say "旧 ${OLD_DIR}（$(size_of "$OLD_DIR")）→ 新 ${NEW_DIR}（$(size_of "$NEW_DIR")）"
    if [ -d "$NEW_DIR" ] && [ -n "$(ls -A "$NEW_DIR" 2>/dev/null)" ]; then
      say "新目录已有内容：跳过即可（除非要 --apply --force 覆盖）"
    else
      say "新目录为空或不存在：跑 --apply 复制（旧目录保留）"
    fi
    ;;
  --apply)
    [ -f "$RUNNING_TOOL" ] || { say "失败：找不到「在不在跑」的判据 ${RUNNING_TOOL}（缺判据 ≠ 没有实例在跑）" >&2; exit 1; }
    if bash "$RUNNING_TOOL" --app "$APP" --quiet; then
      say "失败：应用正在运行——先退出再迁移（运行中搬迁会让实例写回旧目录）" >&2
      exit 1
    fi
    [ -d "$OLD_DIR" ] || { say "失败：旧目录不存在 $OLD_DIR" >&2; exit 1; }
    if [ -d "$NEW_DIR" ] && [ -n "$(ls -A "$NEW_DIR" 2>/dev/null)" ] && [ "$FORCE" != "--force" ]; then
      say "新目录已有内容，未动：${NEW_DIR}（要覆盖加 --force，旧目录仍会保留）"
      exit 0
    fi
    mkdir -p "$NEW_DIR"
    rsync -a \
      --exclude 'SingletonLock' --exclude 'SingletonCookie' --exclude 'SingletonSocket' \
      --exclude 'DevToolsActivePort' \
      "$OLD_DIR"/ "$NEW_DIR"/
    old_n=$(find "$OLD_DIR" -type f ! -name 'Singleton*' ! -name 'DevToolsActivePort' | wc -l | tr -d ' ')
    new_n=$(find "$NEW_DIR" -type f | wc -l | tr -d ' ')
    say "复制完成：旧 $old_n 个文件 → 新 $new_n 个文件"
    if [ "$new_n" -lt "$old_n" ]; then
      say "失败：新目录文件数少于旧目录，请检查 rsync 输出" >&2
      exit 1
    fi
    say "旧目录保留在 ${OLD_DIR}（确认新实例跑通后再人工清理）"
    ;;
  *)
    echo "用法: migrate-app-data-dir.sh [--check|--apply [--force]]" >&2
    exit 2
    ;;
esac
