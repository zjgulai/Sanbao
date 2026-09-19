#!/bin/bash
# refresh-app-brand.sh —— 把 Sanbao 受管品牌资产补落到**已安装**的 app 上，并重签。
#
# ## 为什么需要它（2026-09-13 实测）
#
# 品牌有**两个家**，而 brand-replay.sh 长期只守了其中一个：
#
#   · Finder 图标 ← `Contents/Resources/icon.icns`（第 4 块，一直是对的）
#   · **Dock / 托盘图标** ← `Contents/Resources/app.asar.unpacked/build/{app-icon-mac.png,tray-icon*.png}`
#     —— dsh-plugin-desktop 启动时用 `app.dock?.setIcon(iconPath)` **覆盖**掉 bundle 图标，
#     而那一套从未被品牌化。实测 `app-icon-mac.png` 是 2.2 MB 的 DSH 原生图标。
#
# 症状因此极具欺骗性：**Finder 里是 ROOT、Dock 里是 DSH 原生**，而 `brand-replay.sh --check`
# 报 `BRAND ALL VERIFIED`——因为检查只覆盖了其中一个家（P-02 假绿 + P-07 多个家）。
#
# 那个假绿已在 `brand-replay.sh` 第 5 块修掉（现在会报 8 处 DRIFT）。本脚本做的是**下一步**：
# 把修好的品牌落到本机已安装的 app 上，让用户不必等下一版重装。
#
# ## 为什么必须重签
#
# `app.asar.unpacked/**` 在代码签名封条之内。就地改它 = seal 破损 —— 而 seal 破损不只是
# 「签名难看」：TCC 判定要求时做的是代码有效性校验，seal 一旦坏了，
# 已授的辅助功能 / 屏幕录制会被**静默拒绝**（ADR-0068 的「假的已开启」形态）。
# 故改完必须用**同一个身份**重签——指定要求是 `identifier + certificate leaf`，
# 与字节无关，所以同一身份重签后授权应当延续（ADR-0063）。
#
# ## 用法（**必须先退出 DSH**）
#
#   bash packaging/scripts/refresh-app-brand.sh            # 落品牌 + 重签 + 验签
#   bash packaging/scripts/refresh-app-brand.sh --check    # 只报告，不动任何东西
#
# 退出码：0 = 品牌态且验签通过；1 = 有漂移或验签失败；2 = 用法错误；3 = DSH 正在运行（拒绝动手）
set -u

REPO="${DSH_VENDOR:-$(cd "$(dirname "$0")/../.." && pwd)}"
DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
BRAND_ICON_ASSET="$REPO/packaging/assets/app-icon.icns"
ICONS="${BRAND_ICONS_DIR:-$REPO/packaging/assets/brand-icons}"
REPLAY="$REPO/dsh-patches/brand-replay.sh"
SIGN_IDENTITY="${LUTE_SIGN_IDENTITY:-LUTE Code Signing}"
GUARD="$REPO/packaging/scripts/verify-app-signature.sh"
MODE="${1:---apply}"

say() { echo "[brand] $*"; }

# 检测「已安装的 DSH 是否在跑」——**判据不在本文件里**：「在不在跑」只有一个家
# （`packaging/scripts/dsh-running.sh`，随包也分发到载荷 `tools/`；ADR-0080）。
# 这里曾就地写过 `pgrep -f "<app>/Contents/MacOS/"`，而**它在主进程明明在跑时返回 0 条**
# ——闸不触发，`--apply` 就在 DSH 运行时跑了下去（P-02 仪器假绿：那道闸守的正是
# 「运行中替换 app bundle → 白屏」）。退出码契约：**0 在跑 / 1 没在跑 / 2 用法错误 /
# 4 判不了**；4 必须中止——「读不到」不是「没有在跑」。
DSH_RUN_TOOL="$REPO/packaging/scripts/dsh-running.sh"
if [ ! -f "$DSH_RUN_TOOL" ]; then
  echo "[brand] 失败：找不到判据 ${DSH_RUN_TOOL}（缺判据 ≠ 没有实例在跑）" >&2
  exit 1
fi
dsh_running() { bash "$DSH_RUN_TOOL" --app "$DSH_APP" --quiet; }

if [ "$MODE" != "--apply" ] && [ "$MODE" != "--check" ]; then
  echo "用法: refresh-app-brand.sh [--apply|--check]" >&2
  exit 2
fi
[ -d "$DSH_APP" ] || { echo "[brand] 失败：app 不存在: $DSH_APP" >&2; exit 1; }
[ -f "$REPLAY" ] || { echo "[brand] 失败：找不到 $REPLAY" >&2; exit 1; }

# ── 1. 动手前必须没有 DSH 在跑 ───────────────────────────────────────────────
# 运行中替换 app bundle 会触发宿主 HMR 热更 → 生产 renderer 无完整热替换 runtime → 白屏
# （2026-09-13 实测；见 docs/sop/dmg-release.md §7 红线）。这里把它变成一条判据。
# 顺序要紧：这道闸必须在**任何写入之前**——`--check` 只读，不受它限制。
if [ "$MODE" = "--apply" ]; then
  DSH_RUN=0
  dsh_running || DSH_RUN=$?
  case "$DSH_RUN" in
    0)
      echo "[brand] 拒绝执行：DSH 正在运行。" >&2
      echo "[brand] 先退出全部 DSH 实例（⌘Q），再重跑本脚本——运行中替换 app bundle 会白屏。" >&2
      exit 3
      ;;
    1) : ;;
    *)
      echo "[brand] 失败：判不出「DSH 在不在跑」（dsh-running.sh 退出码 ${DSH_RUN}），中止。" >&2
      echo "[brand] 判不了 ≠ 没有在跑；本脚本要替换封条内的字节，宁可不做也不瞎做。" >&2
      exit 1
      ;;
  esac
fi

# ── 2. 写入前置：签名身份可用 + 备份当前字节 ────────────────────────────────
if [ "$MODE" = "--apply" ]; then
  if ! security find-identity -v -p codesigning 2>/dev/null | grep -qF "\"$SIGN_IDENTITY\""; then
    echo "[brand] 失败：签名身份不可用：$SIGN_IDENTITY" >&2
    echo "[brand] 建立它：packaging/scripts/ensure-signing-identity.sh —— 这里**不**回退 adhoc，" >&2
    echo "[brand] 回退等于把 TCC 授权绑回字节哈希（ADR-0063 要消除的那个缺陷）。" >&2
    exit 1
  fi
  STAMP="$(date +%Y%m%d-%H%M%S)"
  BACKUP="$HOME/Library/Application Support/LUTE/brand-backup/$STAMP"
  mkdir -p "$BACKUP/runtime-icons" || exit 1
  BUILD_DIR="$DSH_APP/Contents/Resources/app/build"
  [ -d "$BUILD_DIR" ] || BUILD_DIR="$DSH_APP/Contents/Resources/app.asar.unpacked/build"
  for f in "$BUILD_DIR"/app-icon*.png "$BUILD_DIR"/tray-icon*.png; do
    if [ -f "$f" ]; then cp "$f" "$BACKUP/runtime-icons/" || exit 1; fi
  done
  cp "$DSH_APP/Contents/Resources/icon.icns" "$BACKUP/icon.icns" || exit 1
  say "已备份原字节 → $BACKUP"
fi

# ── 3. 品牌核对/落笔 ────────────────────────────────────────────────────────
say "品牌重放（资产：${ICONS}，模式 ${MODE}）"
BRAND_ICON_ASSET="$BRAND_ICON_ASSET" BRAND_ICONS_DIR="$ICONS" DSH_APP="$DSH_APP" bash "$REPLAY" "$MODE" || {
  [ "$MODE" = "--check" ] && exit 1
  echo "[brand] 失败：品牌重放未通过（见上），**未做任何签名动作**" >&2
  exit 1
}

if [ "$MODE" = "--check" ]; then
  say "仅核对模式：未改动任何文件"
  exit 0
fi

# ── 4. 重签（同一身份；指定要求与字节无关，故 TCC 授权延续）──────────────────
say "重签（身份：${SIGN_IDENTITY}）"
codesign --force --deep --sign "$SIGN_IDENTITY" "$DSH_APP" || {
  echo "[brand] 失败：codesign 返回非零" >&2
  exit 1
}

if [ -f "$GUARD" ]; then
  bash "$GUARD" "$DSH_APP" "brand 重放后" || exit 1
else
  codesign --verify --deep --strict "$DSH_APP" || { echo "[brand] 失败：验签不通过" >&2; exit 1; }
fi

# ── 5. 刷新图标缓存 ─────────────────────────────────────────────────────────
# 换了字节但 Dock 仍显示旧图是常见形态：以 bundle mtime + 重新注册 + 重启 Dock 三者一起刷。
touch "$DSH_APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$DSH_APP" 2>/dev/null || true
killall Dock 2>/dev/null || true
say "已刷新 Dock / LaunchServices 图标缓存"

say "完成。重开 DSH Desktop 即可看到 Sanbao 占位 squircle（Dock 与托盘）。"
say "复核 TCC 是否仍有效：bash packaging/scripts/tcc-grant-status.sh"
exit 0
