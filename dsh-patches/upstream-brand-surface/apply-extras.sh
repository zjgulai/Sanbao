#!/bin/bash
# brand-surface 批二：平台面清扫（PWA 清单 / favicon / 窗口标题 / CA 名 / 系统提示 / CLI / 徽章技能）
#
# 与批一（apply-fixes.sh）分工：批一管「可见 UI 文案」三处；本脚本管**平台面**——
# 这些位置不渲染在常规界面上，但用户翻得到、模型读得到、产出物带得走：
#
#   ① SPA 的 PWA 清单（安装名 / 短名）        ② favicon（标签页/PWA 图标，官方鲸鱼图形）
#   ③ 原生窗口标题 windowTitle                ④ 局域网 HTTPS 的 CA CommonName
#   ⑤ 第三方 bridge 插件的用户可见错误串      ⑥ 系统提示三处（模型自我描述/指代本产品）
#   ⑦ CLI 帮助描述                           ⑧ dsh-badge 技能（往产出物贴「powered by dsh」徽章）
#   ⑨ profile 影子副本（layout / settings-models：版本一变就会夺权的那两份）
#   ⑩ 旧 CA 状态目录改名（让新 CA 以新 CN 重新生成；改 CN 必做，否则 LAN HTTPS 起不来）
#
# 纪律与批一同源：锚点唯一才落笔、写后断言残留 0、app 内文件要求**应用运行中**打（--staged 豁免；
# 2026-09-21 实证：运行中打 + 重启，服务端才发新字节，见批一 Note）、
# 备份 `.orig-brand-surface-extras`、名字读 brand-payload-name.txt（不新增第二份家）。
#
# 用法：apply-extras.sh apply|--check|--rollback [--staged]
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${DSH_APP:-/Applications/DSH Desktop.app}"
PROFILE="${DSH_PROFILE:-$HOME/.dsh/profiles/desktop}"
RUNNING_TOOL="$REPO/packaging/scripts/dsh-running.sh"
MODE="${1:---check}"
STAGED=0
for a in "$@"; do [ "$a" = "--staged" ] && STAGED=1; done

BRAND_NAME="$(cat "$(dirname "$0")/../brand-payload-name.txt" 2>/dev/null | tr -d '\n' || true)"
BRAND_NAME="${BRAND_NAME:-Sanbao}"
BRAND_ZH="三宝"
UPSTREAM="DeepSeek Harness"
FAVICON_SRC="$(dirname "$0")/../../brand/logo/sanbao-favicon.svg"
CA_STATE_DIRS=("$HOME/.dsh/lan-https" "$HOME/Library/Application Support/Sanbao/lan-https")
RES="$APP/Contents/Resources"
if [ -d "$RES/app" ] && [ ! -e "$RES/app.asar" ]; then APP_ROOT="$RES/app"; else APP_ROOT="$RES/app.asar.unpacked"; fi
LIB_ER="$(ls "$APP_ROOT"/lib/electron-runtime-*.js 2>/dev/null | head -1)"

say() { echo "[brand-extras] $*"; }
die() { say "失败：$*" >&2; exit 1; }

ca_cn() { # ca_cn <状态目录> —— 只读证书主体 CN（不触碰 sealedPrivateKey）
  local j="$1/ca.json"
  [ -f "$j" ] || return 1
  node -e 'const fs=require("fs"),crypto=require("crypto");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const c=new crypto.X509Certificate(j.certificate);process.stdout.write(String(c.subject).split("\n")[0].replace(/^CN=/,""))' "$j" 2>/dev/null
}

case "$MODE" in
  apply|--check|--rollback) ;;
  *) die "用法: apply-extras.sh apply|--check|--rollback [--staged]" ;;
esac

if [ "$MODE" = "apply" ] || [ "$MODE" = "--rollback" ]; then
  if [ "$STAGED" -eq 0 ]; then
    [ -f "$RUNNING_TOOL" ] || die "找不到「在不在跑」的判据 ${RUNNING_TOOL}（缺判据 ≠ 没有实例在跑）"
    bash "$RUNNING_TOOL" --app "$APP" --quiet || die "$APP 未运行。app 内文件必须**运行中**打（2026-09-21 实证：运行中打 + 重启后服务端发出的才是新字节）；先启动应用再跑；出货暂存树用 --staged"
  fi
fi

# ── 目标表：label|文件|原文|新文（原文为空 = 专用处理） ──────────────────────
app_files=(
  "$APP_ROOT/node_modules/@deepseek-ai/dsh-web-frontend/dist/manifest.webmanifest"
  "$APP_ROOT/node_modules/@deepseek-ai/dsh-web-frontend/dist/favicon.svg"
  "$APP_ROOT/node_modules/@deepseek-ai/dsh-web-frontend/dist/manifest.webmanifest"
  "$APP_ROOT/node_modules/@agents-anywhere/dsh-bridge-next/lib/index.js"
  "$APP_ROOT/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js"
  "$APP_ROOT/node_modules/@deepseek-ai/dsh-web-app/lib/index.js"
  "$APP_ROOT/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js"
  "$APP_ROOT/node_modules/@deepseek-ai/dsh/lib/bin.js"
  "$APP_ROOT/node_modules/@deepseek-ai/dsh-skill-badge/lib/index.js"
  "$LIB_ER"
)
for f in "${app_files[@]}"; do [ -e "$f" ] || die "目标缺失：$f"; done
WT_FILE="$(ls "$APP_ROOT"/lib/src-*.js 2>/dev/null | head -1)"
CA_FILE="$(ls "$APP_ROOT"/lib/lan-https-certificate-*.js 2>/dev/null | head -1)"
[ -n "$WT_FILE" ] || die "找不到 src-*.js（windowTitle）"
[ -n "$CA_FILE" ] || die "找不到 lan-https-certificate-*.js（CA 名）"

PROFILE_SHADOWS=(
  "$PROFILE/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js"
  "$PROFILE/node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js"
  "$PROFILE/node_modules/@deepseek-ai/dsh-web-app/lib/index.js"
  "$PROFILE/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js"
)

swap() { # swap <file> <from> <to> <expect> —— 锚点计数不符即中止
  local f="$1" from="$2" to="$3" expect="$4" n
  n=$(grep -oF "$from" "$f" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" = "0" ]; then return 0; fi
  [ "$n" = "$expect" ] || die "$(basename "$f")：锚点 ×${n}（期望 ${expect}）——「${from:0:40}」"
  perl -pi -e "s/\Q$from\E/$to/g" "$f"
}

backup() { [ -f "$1.orig-brand-surface-extras" ] || cp "$1" "$1.orig-brand-surface-extras"; }

apply_app() {
  local mf="$APP_ROOT/node_modules/@deepseek-ai/dsh-web-frontend/dist/manifest.webmanifest"
  local fav="$APP_ROOT/node_modules/@deepseek-ai/dsh-web-frontend/dist/favicon.svg"
  local br="$APP_ROOT/node_modules/@agents-anywhere/dsh-bridge-next/lib/index.js"
  local sp="$APP_ROOT/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js"
  local wa="$APP_ROOT/node_modules/@deepseek-ai/dsh-web-app/lib/index.js"
  local ab="$APP_ROOT/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js"
  local cli="$APP_ROOT/node_modules/@deepseek-ai/dsh/lib/bin.js"
  local badge="$APP_ROOT/node_modules/@deepseek-ai/dsh-skill-badge/lib/index.js"

  # ① PWA 清单
  backup "$mf"
  swap "$mf" '"name": "DeepSeek Harness"' "\"name\": \"$BRAND_NAME\"" 1
  swap "$mf" '"short_name": "DSH"' "\"short_name\": \"SB\"" 1
  # ② favicon（整文件替换）
  if ! grep -q 'aria-label="SanBao"' "$fav" 2>/dev/null; then
    backup "$fav"; cp "$FAVICON_SRC" "$fav"; say "APPLY favicon.svg ← brand/logo/sanbao-favicon.svg"
  fi
  # ③ 窗口标题
  backup "$WT_FILE"
  swap "$WT_FILE" "windowTitle: \"$UPSTREAM Desktop\"" "windowTitle: \"$BRAND_NAME\"" 1
  # ④ CA 名
  backup "$CA_FILE"
  swap "$CA_FILE" "CA_COMMON_NAME = \"$UPSTREAM Desktop Local CA\"" "CA_COMMON_NAME = \"$BRAND_NAME Local CA\"" 1
  # ⑤ bridge 可见串
  backup "$br"
  swap "$br" "该会话已在 $UPSTREAM 客户端中归档，请取消归档后继续。" "该会话已在${BRAND_ZH}客户端中归档，请取消归档后继续。" 1
  swap "$br" "\"$UPSTREAM\"" "\"$BRAND_ZH\"" 1
  # ⑥ 系统提示三处
  backup "$sp"; swap "$sp" "You are an AI agent powered by $UPSTREAM." "You are an AI agent powered by $BRAND_NAME." 1
  backup "$wa"; swap "$wa" "You are interacting with the user through the $UPSTREAM Web GUI at" "You are interacting with the user through the $BRAND_NAME Web GUI at" 1
  swap "$wa" "Canonical local URL of the $UPSTREAM Web GUI" "Canonical local URL of the $BRAND_NAME Web GUI" 1
  backup "$ab"; swap "$ab" "The $UPSTREAM implementation checkout is at" "The $BRAND_NAME implementation checkout is at" 1
  # ⑦ CLI 描述
  backup "$cli"; swap "$cli" "dsh: boot a $UPSTREAM profile" "dsh: boot a $BRAND_NAME profile" 1
  # ⑧ dsh-badge 技能：provider 返回空清单（模型与用户都调不到它）
  backup "$badge"
  swap "$badge" "list: () => Promise.resolve([CANDIDATE])" "list: () => Promise.resolve([])" 1
  swap "$badge" "produced with $UPSTREAM" "produced with $BRAND_NAME" 1
}

apply_profile() {
  local lay="${PROFILE_SHADOWS[0]}" sm="${PROFILE_SHADOWS[1]}" wa="${PROFILE_SHADOWS[2]}" ab="${PROFILE_SHADOWS[3]}"
  if [ -f "$lay" ]; then backup "$lay"; swap "$lay" "const productTitle = \"$UPSTREAM\"" "const productTitle = \"$BRAND_NAME\"" 1; fi
  if [ -f "$sm" ]; then
    backup "$sm"
    swap "$sm" "$UPSTREAM 目前的 0.1" "$BRAND_NAME 目前的 0.1" 1
    swap "$sm" "$UPSTREAM 0.1 remains in testing" "$BRAND_NAME 0.1 remains in testing" 1
    swap "$sm" "$UPSTREAM's core plugins" "$BRAND_NAME's core plugins" 1
    swap "$sm" "预计 $UPSTREAM 的核心插件" "预计 $BRAND_NAME 的核心插件" 1
    swap "$sm" "Harness developers" "$BRAND_NAME developers" 2
    swap "$sm" "Harness 开发者" "${BRAND_ZH}开发者" 2
    swap "$sm" "DSH 插件生态" "$BRAND_NAME 插件生态" 1
  fi
  [ -f "$wa" ] && { backup "$wa"
    swap "$wa" "You are interacting with the user through the $UPSTREAM Web GUI at" "You are interacting with the user through the $BRAND_NAME Web GUI at" 1
    swap "$wa" "Canonical local URL of the $UPSTREAM Web GUI" "Canonical local URL of the $BRAND_NAME Web GUI" 1; }
  [ -f "$ab" ] && { backup "$ab"; swap "$ab" "The $UPSTREAM implementation checkout is at" "The $BRAND_NAME implementation checkout is at" 1; }
  # ⑩ 旧 CA 状态改名（新 CA 以新 CN 生成）。判据读证书主体，不按目录存在性——
  # 新 CA 铸出后同目录会合法重生，按目录判会把它误当残留
  local ca_dir cn
  for ca_dir in "${CA_STATE_DIRS[@]}"; do
    cn="$(ca_cn "$ca_dir" || true)"
    if [ "$cn" = "$BRAND_NAME Local CA" ]; then say "SKIP CA 状态（已是新 CN：${cn}）"
    elif [ -n "$cn" ] && [ ! -d "$ca_dir.orig-deepseek-ca" ]; then
      mv "$ca_dir" "$ca_dir.orig-deepseek-ca"; say "APPLY CA 状态改名（原 CN=${cn}）→ $(basename "$ca_dir").orig-deepseek-ca"
    elif [ -n "$cn" ]; then say "SKIP CA 状态（备份已存在：$ca_dir.orig-deepseek-ca）"
    elif [ -d "$ca_dir" ]; then say "SKIP CA 状态（无 ca.json，未见旧 CN：${ca_dir}）"
    fi
  done
}

check() {
  local bad=0
  for f in "${app_files[@]}" "$WT_FILE" "$CA_FILE"; do
    local n; n=$(grep -oF "$UPSTREAM" "$f" 2>/dev/null | wc -l | tr -d ' ')
    [ "$n" = "0" ] || { say "残留 ${n} 处：$f"; bad=1; }
  done
  grep -q 'aria-label="SanBao"' "$APP_ROOT/node_modules/@deepseek-ai/dsh-web-frontend/dist/favicon.svg" 2>/dev/null || { say "favicon 仍是官方图形"; bad=1; }
  for f in "${PROFILE_SHADOWS[@]}"; do
    [ -f "$f" ] || continue
    local n; n=$(grep -oF "$UPSTREAM" "$f" 2>/dev/null | wc -l | tr -d ' ')
    [ "$n" = "0" ] || { say "残留 ${n} 处（影子副本）：$f"; bad=1; }
  done
  local ca_dir cn
  for ca_dir in "${CA_STATE_DIRS[@]}"; do
    cn="$(ca_cn "$ca_dir" || true)"
    [ -n "$cn" ] || continue
    [ "$cn" = "$BRAND_NAME Local CA" ] || { say "CA 名未换（${ca_dir}：CN=${cn}）"; bad=1; }
  done
  [ "$bad" -eq 0 ] && say "extras OK（平台面 0 处上游名）"
  return "$bad"
}

rollback() {
  local f
  for f in "${app_files[@]}" "$WT_FILE" "$CA_FILE" "${PROFILE_SHADOWS[@]}"; do
    if [ -f "$f.orig-brand-surface-extras" ]; then cp "$f.orig-brand-surface-extras" "$f"; say "ROLLBACK $(basename "$f")"; fi
  done
  local ca_dir aside
  for ca_dir in "${CA_STATE_DIRS[@]}"; do
    [ -d "$ca_dir.orig-deepseek-ca" ] || continue
    if [ -d "$ca_dir" ]; then
      aside="$ca_dir.sanbao-ca"
      [ -e "$aside" ] && aside="$aside.$(date +%s)"
      mv "$ca_dir" "$aside"; say "ROLLBACK 新 CN 状态移开 → $(basename "$aside")"
    fi
    mv "$ca_dir.orig-deepseek-ca" "$ca_dir"; say "ROLLBACK CA 状态目录 $(basename "$ca_dir")"
  done
  say "回滚后请重签（refresh-app-brand.sh）"
}

case "$MODE" in
  apply) apply_app; apply_profile; say "完成——请重签并重启（refresh-app-brand.sh；服务端字节判据见批一 Note）" ;;
  --check) check || true ;;
  --rollback) rollback ;;
esac
