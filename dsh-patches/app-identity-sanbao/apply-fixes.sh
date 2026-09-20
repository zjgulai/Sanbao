#!/bin/bash
# app-identity-sanbao：把 app 的「数据目录身份」从 DSH Desktop 改成 Sanbao。
#
# ## 为什么要单独一支补丁
#
# `productName` 是 app 用来**定位私有数据目录**的身份（`~/Library/Application Support/<productName>`），
# 它同时记录在 `lib/bin.js` 与 `lib/profile-manager-*.js` 两处（同一张表的两个家，P-07）。
# `brand-replay.sh` 出于「路径 join 不可替换」的纪律**豁免**了它们——本补丁就是那次豁免的
# 正式接替：改名 + 数据目录迁移（`packaging/scripts/migrate-app-data-dir.sh`）必须成对执行。
#
# 显示名（Info.plist / 界面文案 / Helper 名）不归本脚本管：那是 `brand-replay.sh` 的面，
# 它的目标串现在读 `brand-payload-name.txt`（由名源 `shared/client/sanbao-brand-source.ts.bundleDisplayName`
# 生成），不再各自抄一份。
#
# ## 不动的东西（红线）
#
#   · `appId: "ai.deepseek.dsh.desktop"`：TCC 授权与更新链路按它记账，改名即失授权。
#   · `~/Library/Application Support/DSH Desktop` 旧目录：迁移脚本只复制不删除。
#   · `~/.dsh`（真正的 profile/会话/设置）：与 productName 无关，本补丁碰不到它。
#
# 用法：apply-fixes.sh apply|--check|--verify-anchors|--rollback
# 生效方式：**必须先退出应用**（脚本自己用 packaging/scripts/dsh-running.sh 判定，判不了就中止）。
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${DSH_APP:-/Applications/DSH Desktop.app}"
RUNNING_TOOL="$REPO/packaging/scripts/dsh-running.sh"
MODE="${1:---check}"

BRAND_NAME="$(cat "$(dirname "$0")/../brand-payload-name.txt" 2>/dev/null | tr -d '\n' || true)"
BRAND_NAME="${BRAND_NAME:-Sanbao}"
OLD_NAME="DSH Desktop"

say() { echo "[identity] $*"; }

case "$MODE" in
  apply|--check|--verify-anchors|--rollback) ;;
  *) echo "用法: apply-fixes.sh apply|--check|--verify-anchors|--rollback" >&2; exit 2 ;;
esac

# 资源根双形态：no-ASAR（Resources/app）⇄ 旧 2.0.5（app.asar.unpacked）。
RES="$APP/Contents/Resources"
if [ -d "$RES/app" ] && [ ! -e "$RES/app.asar" ] && [ ! -e "$RES/app.asar.unpacked" ]; then
  CHK="$RES/app"
else
  CHK="$RES/app.asar.unpacked"
fi

if [ "$MODE" = "apply" ] || [ "$MODE" = "--rollback" ]; then
  [ -f "$RUNNING_TOOL" ] || { say "失败：找不到「在不在跑」的判据 ${RUNNING_TOOL}（缺判据 ≠ 没有实例在跑）" >&2; exit 1; }
  if bash "$RUNNING_TOOL" --app "$APP" --quiet; then
    say "失败：$APP 正在运行——先退出应用（运行中替换 app bundle = 白屏，ADR-0080）" >&2
    exit 1
  fi
fi

# 目标文件：bin.js（CLI/身份表）与 profile-manager-<hash>.js（同一张表的第二家）
targets=("$CHK/lib/bin.js")
while IFS= read -r f; do targets+=("$f"); done < <(find "$CHK/lib" -maxdepth 1 -name 'profile-manager-*.js' ! -name '*.map' | sort)
if [ "${#targets[@]}" -ne 2 ]; then
  say "失败：预期 2 个身份文件（bin.js + profile-manager-*.js 恰一份），实际 ${#targets[@]} 个" >&2
  exit 1
fi

count_line() { grep -c "productName: \"$1\"" "$2" 2>/dev/null || true; }
count_draft() { grep -c "productName: \"$1\"" "$2" 2>/dev/null || true; }

verify_anchors() {
  local fail=0 f
  for f in "${targets[@]}"; do
    local new stable beta
    new=$(count_line "$BRAND_NAME" "$f"); stable=$(count_line "$OLD_NAME" "$f"); beta=$(count_draft "$OLD_NAME Beta" "$f")
    local newBeta; newBeta=$(count_draft "$BRAND_NAME Beta" "$f")
    if [ "$stable" = "1" ] && [ "$beta" = "1" ]; then continue; fi
    if [ "$new" = "1" ] && [ "$newBeta" = "1" ]; then continue; fi
    say "anchor drift: ${f}（DSH×$stable/${beta}、Sanbao×$new/${newBeta}，期望每种恰好 1 行）" >&2
    fail=1
  done
  [ "$fail" -eq 0 ] && say "anchors OK（身份表两处 × 每文件 1 行）"
  return "$fail"
}

apply_one() {
  local f="$1" stable beta
  stable=$(count_line "$OLD_NAME" "$f")
  beta=$(count_draft "$OLD_NAME Beta" "$f")
  if [ "$stable" = "0" ] && [ "$beta" = "0" ]; then
    say "SKIP $(basename "$f")（已是 ${BRAND_NAME}）"
    return 0
  fi
  if [ "$stable" != "1" ] || [ "$beta" != "1" ]; then
    say "失败：$(basename "$f") 锚点不唯一（DSH×$stable Beta×${beta}）——升级换版后先跑 --verify-anchors" >&2
    return 1
  fi
  [ -f "$f.orig-app-identity" ] || cp "$f" "$f.orig-app-identity"
  perl -pi -e "s/productName: \"\Q$OLD_NAME\E\"/productName: \"$BRAND_NAME\"/" "$f"
  perl -pi -e "s/productName: \"\Q$OLD_NAME\E Beta\"/productName: \"$BRAND_NAME Beta\"/" "$f"
  say "APPLY $(basename "$f")（productName → $BRAND_NAME / $BRAND_NAME Beta）"
}

rollback_one() {
  local f="$1"
  if [ -f "$f.orig-app-identity" ]; then
    cp "$f.orig-app-identity" "$f"
    say "ROLLBACK $(basename "$f")"
  else
    say "SKIP $(basename "$f")（无备份）"
  fi
}

case "$MODE" in
  --verify-anchors) verify_anchors ;;
  --check)
    verify_anchors || true
    for f in "${targets[@]}"; do
      say "$(basename "$f"): DSH×$(count_line "$OLD_NAME" "$f") / ${BRAND_NAME}×$(count_line "$BRAND_NAME" "$f")"
    done
    ;;
  apply)
    verify_anchors || exit 1
    fail=0
    for f in "${targets[@]}"; do apply_one "$f" || fail=1; done
    [ "$fail" -eq 0 ] || exit 1
    say "完成：跑 packaging/scripts/migrate-app-data-dir.sh --apply 迁移数据目录，再用 refresh-app-brand.sh 重签"
    ;;
  --rollback)
    for f in "${targets[@]}"; do rollback_one "$f"; done
    say "回滚后请同样重签（refresh-app-brand.sh）"
    ;;
esac
