#!/bin/bash
# upstream-brand-surface：把上游平台名 `DeepSeek Harness` 从**可见 UI 面**清掉，换成品牌名。
#
# ## 为什么要单独一支补丁（而不是并进 brand-replay）
#
# 这三处都在 `Contents/Resources/app/node_modules/` 里，而 `brand-replay-strings.py` 的扫描面
# **排除 node_modules**（那里绝大多数是第三方包，逐字替换会误伤）。它们是「装载点」上的
# **上游产品名硬编码**，不是文件清单里能扫到的显示串，所以走锚点补丁而不是扫描式重放。
#
# ## 目标（三处，都是上游硬编码）
#
#   1. `@deepseek-ai/dsh-client-ui-layout/lib/client.js`
#         const productTitle = "DeepSeek Harness";
#       → 喂 `document.title`（`会话名 — DeepSeek Harness`）与 sidebar 槽的 productTitle 属性。
#  2. `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js`
#         内测声明正文（中/英）：`DeepSeek Harness 目前的 0.1 版本…` / `…Harness's core plugins…`
#         ＋ 独立出现的 `Harness 开发者` / `Harness developers`。
#       这张卡被首启轮播接管后**不再出现**；本项是「轮播确认被清掉也不会露旧名」的兜底。
#  3. `lib/electron-runtime-*.js`（主进程分块）
#         远程控制对话框文案：`从其他设备使用这台电脑上的 DeepSeek Harness。`
#
# ## 生效方式（与 identity 补丁相反，注意）
#
# **client bundle 必须在应用运行中打**：app 的 boot 清单把客户端包拼成一个大 combo，
# rev = 内容哈希，主机侧「mismatched revisions are rejected」——关机态改字节 → 重启整屏白屏
# （2026-09-08 实测，见 dsh-desktop-diagnostics）。运行中改会触发 HMR re-hash，安全；
# 落笔后 Cmd+R 即可看到页眉/标题变化。主进程分块（目标 3）下次启动才生效。
# 装机 app 中若被拒（未运行），请先启动应用；`--staged` 供打包流水线的**全新拷贝**使用
# （那份从未启动过，无 rev 缓存，不存在白屏问题）。
#
# ## 不动的东西
#
#   · 模型/提供方真名 `DeepSeek`（模型菜单）×；`@deepseek-ai/*` 包 id ×（轨迹/插件清单显示真名）；
#     官方 URL（github.com/deepseek-ai/…）×。改名它们等于说谎。
#   · 本地 CA 的 CommonName `DeepSeek Harness Desktop Local CA`：改了等于换新 CA，
#     已信任的证书要重签，不入本补丁。
#
# 用法：apply-fixes.sh apply|--check|--verify-anchors|--rollback [--staged]
# 目标串：读 `dsh-patches/brand-payload-name.txt`（名源派生物，brand-derivatives-sync 门禁管着）。
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${DSH_APP:-/Applications/DSH Desktop.app}"
RUNNING_TOOL="$REPO/packaging/scripts/dsh-running.sh"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"

MODE="${1:---check}"
STAGED=0
[ "${2:-}" = "--staged" ] && STAGED=1

UPSTREAM="DeepSeek Harness"
BRAND_NAME="$(tr -d '\n' < "$PATCH_DIR/../brand-payload-name.txt" 2>/dev/null || true)"
BRAND_NAME="${BRAND_NAME:-Sanbao}"

say() { echo "[brand-surface] $*"; }

case "$MODE" in
  apply|--check|--verify-anchors|--rollback) ;;
  *) echo "用法: apply-fixes.sh apply|--check|--verify-anchors|--rollback [--staged]" >&2; exit 2 ;;
esac

RES="$APP/Contents/Resources"
if [ -d "$RES/app" ] && [ ! -e "$RES/app.asar" ] && [ ! -e "$RES/app.asar.unpacked" ]; then
  CHK="$RES/app"
else
  CHK="$RES/app.asar.unpacked"
fi

if [ "$MODE" = "apply" ] || [ "$MODE" = "--rollback" ]; then
  if [ "$STAGED" -eq 0 ]; then
    [ -f "$RUNNING_TOOL" ] || { say "失败：找不到「在不在跑」的判据 ${RUNNING_TOOL}（缺判据 ≠ 没有实例在跑）" >&2; exit 1; }
    if ! bash "$RUNNING_TOOL" --app "$APP" --quiet; then
      say "失败：$APP 未运行。client bundle 必须**运行中**打（关机态改字节 → combo rev 失配 → 重启白屏）；" >&2
      say "      先启动应用再跑；打包流水线对全新拷贝请加 --staged。" >&2
      exit 1
    fi
  fi
fi

# 目标收集（每项都断言「恰好 n 个文件」，升级换版后计数漂移要显式报错）
CLIENT_TARGETS=()
LAYOUT="$CHK/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js"
MODELS="$CHK/node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js"
for f in "$LAYOUT" "$MODELS"; do
  [ -f "$f" ] || { say "失败：找不到目标文件 $f" >&2; exit 1; }
  CLIENT_TARGETS+=("$f")
done
RUNTIME_TARGETS=()
while IFS= read -r f; do RUNTIME_TARGETS+=("$f"); done < <(find "$CHK/lib" -maxdepth 1 -name 'electron-runtime-*.js' ! -name '*.map' ! -name '*.orig*' | sort)
if [ "${#RUNTIME_TARGETS[@]}" -ne 1 ]; then
  say "失败：预期恰 1 个 electron-runtime-*.js，实际 ${#RUNTIME_TARGETS[@]} 个" >&2
  exit 1
fi
TARGETS=("${CLIENT_TARGETS[@]}" "${RUNTIME_TARGETS[@]}")

# 每文件的期望命中数（锚点计数；漂移即失败，不做「猜着改」）
expected_count() {
  case "$(basename "$1")" in
    client.js)
      case "$1" in
        */dsh-client-ui-layout/*) echo 1 ;;
        */dsh-client-ui-settings-models/*) echo 4 ;;
        *) echo 0 ;;
      esac ;;
    electron-runtime-*.js) echo 4 ;;
    *) echo 0 ;;
  esac
}

count_upstream() { grep -o "$UPSTREAM" "$1" 2>/dev/null | wc -l | tr -d ' '; }
count_standalone() { grep -o "Harness 开发者\|Harness developers" "$1" 2>/dev/null | wc -l | tr -d ' '; }

verify_anchors() {
  local fail=0 f want got
  for f in "${TARGETS[@]}"; do
    want="$(expected_count "$f")"; got="$(count_upstream "$f")"
    if [ "$got" = "0" ] && [ "$want" != "0" ]; then
      say "已换：$(basename "$f")（上游名 0 处）"
      continue
    fi
    if [ "$got" != "$want" ]; then
      say "anchor drift: $(basename "$f")（上游名 ×${got}，期望 ×${want}）——升级换版后按新计数改本脚本" >&2
      fail=1
    fi
  done
  [ "$fail" -eq 0 ] && say "anchors OK（上游名计数与期望一致，或已全部换名）"
  return "$fail"
}

apply_one() {
  local f="$1" want got
  want="$(expected_count "$f")"; got="$(count_upstream "$f")"
  if [ "$got" = "0" ]; then
    say "SKIP $(basename "$f")（已是 ${BRAND_NAME}）"
    return 0
  fi
  if [ "$got" != "$want" ]; then
    say "失败：$(basename "$f") 锚点数 ×$got ≠ 期望 ×$want ——先跑 --verify-anchors 核对" >&2
    return 1
  fi
  [ -f "$f.orig-brand-surface" ] || cp "$f" "$f.orig-brand-surface"
  perl -pi -e "s/\Q$UPSTREAM\E/$BRAND_NAME/g" "$f"
  # 声明正文里独立出现的 Harness（仅 settings-models 文案）
  if [ "$(count_standalone "$f")" != "0" ]; then
    perl -pi -e "s/Harness 开发者/${BRAND_NAME} 开发者/g; s/Harness developers/${BRAND_NAME} developers/g" "$f"
  fi
  # 落笔后校验：上游名与独立 Harness 都必须清零
  local left left2
  left="$(count_upstream "$f")"; left2="$(count_standalone "$f")"
  if [ "$left" != "0" ] || [ "$left2" != "0" ]; then
    say "失败：$(basename "$f") 落笔后仍有残留（上游名 ×${left}、Harness 独立词 ×${left2}）" >&2
    return 1
  fi
  say "APPLY $(basename "$f")（上游名 ×$got → ${BRAND_NAME}；残留 0）"
}

rollback_one() {
  local f="$1"
  if [ -f "$f.orig-brand-surface" ]; then
    cp "$f.orig-brand-surface" "$f"
    say "ROLLBACK $(basename "$f")"
  else
    say "SKIP $(basename "$f")（无备份）"
  fi
}

case "$MODE" in
  --verify-anchors) verify_anchors ;;
  --check)
    verify_anchors || true
    for f in "${TARGETS[@]}"; do
      say "$(basename "$f"): 上游名 ×$(count_upstream "$f") / Harness 独立词 ×$(count_standalone "$f") / 期望 ×$(expected_count "$f")"
    done
    ;;
  apply)
    verify_anchors || exit 1
    fail=0
    for f in "${TARGETS[@]}"; do apply_one "$f" || fail=1; done
    [ "$fail" -eq 0 ] || exit 1
    say "完成：client bundle 已换名——回应用按 Cmd+R 生效（HMR re-hash）；主进程分块下次启动生效。"
    say "      接着跑 packaging/scripts/refresh-app-brand.sh 同身份重签（改动使签名封条失效，TCC 会静默拒绝）。"
    ;;
  --rollback)
    for f in "${TARGETS[@]}"; do rollback_one "$f"; done
    say "回滚后请同样重签（refresh-app-brand.sh）"
    ;;
esac
