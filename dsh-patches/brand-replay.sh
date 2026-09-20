#!/bin/bash
# 品牌重放脚本（升级后恢复 Sanbao 品牌）。目标串读 brand-payload-name.txt（由名源
# shared/client/sanbao-brand-source.ts 的 bundleDisplayName 生成）——本文件不再自带品牌字面量。
#
# 背景：官方升级重打包 .app 会还原「DSH Desktop / DeepSeek」品牌字符串。
# 本脚本把品牌注入幂等重放。三块：
#   1) 显示名品牌（DSH Desktop → $BRAND_NAME）——9 个文件；
#   2) 启动词标（wordmark "ROOT" + 内联 SVG）——dsh-web-frontend 哈希资产；
#   3) Info.plist 显示名（CFBundleName/CFBundleDisplayName → $BRAND_NAME）。
#
# 纪律：
#   - 路径 join 字符串【不可替换】：bin.js 的 "DSH Desktop" 全是路径，main.js 5136 行
#     app.setPath("userData", ...) 也是路径——脚本已豁免。
#   - 改主进程/原生页文件需整机重启生效。
#   - 只替换「未加引号（显示文案）」？本版简化：目标文件当前 0 处 "DSH Desktop"
#     （品牌态），升级后出现即全部是显示串，可直接替换；main.js 仅豁免 setPath 行。
#
# 用法:
#   ./brand-replay.sh --check     # 只报告当前品牌状态
#   ./brand-replay.sh --apply     # 幂等重放（每处锚点计数=1 才落笔）
set -u
# 路径参数化（随包分发时由安装器/smoke 显式传入）：DSH_APP（默认 /Applications/DSH Desktop.app）
DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
# 资源根双形态（2026-09-17，2.0.10 基座迁移）：no-ASAR 布局 Resources/app ⇄ 旧 2.0.5
# app.asar.unpacked。判定规则的唯一家是主仓 scripts/lib/app-resources.mjs；本脚本随包
# 分发不能 import 主仓，内联等价判定（app 存在且无 app.asar[.unpacked] → no-asar）。
_RES="$DSH_APP/Contents/Resources"
if [ -d "$_RES/app" ] && [ ! -e "$_RES/app.asar" ] && [ ! -e "$_RES/app.asar.unpacked" ]; then
  CHK="$_RES/app"
else
  CHK="$_RES/app.asar.unpacked"
fi
ASSETS="$CHK/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets"
PAYLOAD="$(dirname "$0")/brand-payload-wordmark.txt"
MODE="${1:---check}"
fail=0
# 显示名目标串来自名源生成物（ADR-0136 D2：改名 = 改一个源 + 重跑生成）；
# 缺失即回退载荷默认值，并由 --check 报出。本文件不再自带品牌字面量。
BRAND_NAME="$(cat "$(dirname "$0")/brand-payload-name.txt" 2>/dev/null | tr -d '\n' || true)"
BRAND_NAME="${BRAND_NAME:-Sanbao}"
# 曾用名（要重放掉的），新→旧。这是「曾用名」的唯一家：改名时在这里追加。
# 为什么必须有它：改名后第一次 --check 若只看「旧名还在不在」，会因「旧名也不见了」
# 落进 N/A 变成假绿——曾用名在 == 还没换成新名，必须报 DRIFT。
#   · LUTE Agentic System —— 上一位（2026-09-20 起换成 Sanbao）
#   · DSH Desktop —— 首代 / 上游 app 名（官方升级重打包会还原，必须认）
PREV_NAMES=("LUTE Agentic System" "DSH Desktop")

say() { echo "[$MODE] $*"; }

case "$MODE" in --apply|--check) ;; *) say "用法: brand-replay.sh [--apply|--check]"; exit 2;; esac
BOOT_REPLAY="$(dirname "$0")/boot-brand-replay.py"
[ -f "$BOOT_REPLAY" ] || { say "MISSING boot-brand-replay.py"; exit 1; }
python3 "$BOOT_REPLAY" "$ASSETS" "$PAYLOAD" "$MODE" || exit 1

# ── 1. 显示名品牌（扫描式）───────────────────────────────────────────────────
# 为什么是扫描而不是文件清单：2026-09-20 实测「9 文件清单」漏了 8 个带品牌的文件
# （notifications-*、tray-locale-*、src-*.js、native-ui/assets/* 等分块），而基座每次
# 升级都可能带来新分块——那是一份会腐烂的纪律。扫描是机制：凡 app 本体（排除
# node_modules 与 *.orig* 备份）里还带着曾用名的文本文件，都在面上；这也让 --check
# 第一次看得见「清单外」的漂移（旧清单式只报清单内的，P-02 假绿）。
#
# 唯一不在这里处理的名字是基座平台名 DeepSeek Harness——很多地方在**正确地指代
# 上游事实**（如 package.json 的 "composed as a DeepSeek Harness Cordis plugin"），
# 只有窗口标题位是产品名，由 2b 块单独处理。
STRINGS_PY="$(dirname "$0")/brand-replay-strings.py"
if [ -f "$STRINGS_PY" ]; then
  python3 "$STRINGS_PY" "$MODE" "$CHK" "$BRAND_NAME" "${PREV_NAMES[@]}" || fail=1
else
  say "MISSING brand-replay-strings.py（显示名扫描面缺判据——读不到 ≠ 无漂移）"
  fail=1
fi

# ── 2b. 网页标题（hero 空态标题的补丁已于 2026-09-11 退役）───────────────
# 退役说明：原先此处把官方 locale 的 "hero.headline" 改写成品牌句做兜底，与
# dsh-root-brand 插件的「隐藏官方标题 + 渲染品牌句」构成第二条真相源 —— 一旦插件
# 的隐藏规则 miss（CSS-module 哈希漂移），官方标题就会以同文案第二次出现。
# 现在品牌句的唯一真相源是插件，官方标题由插件在运行时解析类名后隐藏。
# 规格：.scratch/dsh-root-brand-drift/spec.md ｜ 决定：ADR-0019
TITLE_HTML='<title>Sanbao</title>'   # 派生物（门禁 brand-derivatives 守）：窗口标题
IDX_HTML="$CHK/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html"
if [ -f "$IDX_HTML" ]; then
  if grep -qF "$TITLE_HTML" "$IDX_HTML" 2>/dev/null; then
    say "OK   index.html 标题"
  elif [ "$MODE" = "--apply" ]; then
    # 锚点不写死某一个历史名：替换器认任意 <title>…</title>（上游态 / 曾用名态都换得
    # 动）；落笔前先量 <title> 出现次数（== 1 才动手）、落笔后 grep 校验（旧实现
    # replace 不命中也打印 patched——2026-09-20 实测的假绿）。
    n_title=$(grep -oF '<title>' "$IDX_HTML" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$n_title" != "1" ]; then
      say "APPLY index.html 中止：<title> 出现 $n_title 次（期望 1）——基座换了布局？"
      fail=1
    else
      TITLE_HTML="$TITLE_HTML" perl -0777 -pi -e 's{<title>.*?</title>}{$ENV{TITLE_HTML}}s' "$IDX_HTML"
      if grep -qF "$TITLE_HTML" "$IDX_HTML"; then
        say "APPLY index.html 标题"
      else
        say "APPLY index.html 失败：落笔后校验不过"
        fail=1
      fi
    fi
  else
    say "DRIFT index.html 标题 — 跑 --apply"
    fail=1
  fi
fi

# ── 3b. Electron Helper 重命名（Electron 按外层 CFBundleName 查找 helper，缺省会 "Unable to find helper app"）──
# 曾用名要认：旧实现把旧目录名写死成首代名（DSH Desktop Helper），改名到 Sanbao 后再接手
# 两个分支都不进、静默跳过——check 不报、apply 不改（2026-09-20 实测：外层 CFBundleName
# 已是 Sanbao 而 helper 还叫上一位的名字，启动 17ms 崩在 FATAL "Unable to find helper app"）。
HELPERS_DIR="$DSH_APP/Contents/Frameworks"
for helper_suffix in "" " (GPU)" " (Plugin)" " (Renderer)"; do
  NEW_H="$HELPERS_DIR/$BRAND_NAME Helper${helper_suffix}.app"
  OLD_H=""
  for prev in "${PREV_NAMES[@]}"; do
    if [ -d "$HELPERS_DIR/$prev Helper${helper_suffix}.app" ]; then
      OLD_H="$HELPERS_DIR/$prev Helper${helper_suffix}.app"
      break
    fi
  done
  if [ -n "$OLD_H" ]; then
    if [ "$MODE" = "--apply" ]; then
      mv "$OLD_H" "$NEW_H"
      /usr/libexec/PlistBuddy -c "Set :CFBundleName $BRAND_NAME Helper${helper_suffix}" "$NEW_H/Contents/Info.plist" 2>/dev/null || true
      /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $BRAND_NAME Helper${helper_suffix}" "$NEW_H/Contents/Info.plist" 2>/dev/null || true
      for prev in "${PREV_NAMES[@]}"; do
        if [ -f "$NEW_H/Contents/MacOS/$prev Helper${helper_suffix}" ]; then
          mv "$NEW_H/Contents/MacOS/$prev Helper${helper_suffix}" "$NEW_H/Contents/MacOS/$BRAND_NAME Helper${helper_suffix}"
          break
        fi
      done
      # 落笔后校验：PlistBuddy 静默失败的下场就是「启动了才崩在 Unable to find helper app」
      cur_name="$(/usr/libexec/PlistBuddy -c "Print :CFBundleName" "$NEW_H/Contents/Info.plist" 2>/dev/null || true)"
      if [ "$cur_name" = "$BRAND_NAME Helper${helper_suffix}" ] && [ -x "$NEW_H/Contents/MacOS/$BRAND_NAME Helper${helper_suffix}" ]; then
        say "APPLY Helper${helper_suffix} 重命名（$(basename "$OLD_H") → $(basename "$NEW_H")）"
      else
        say "APPLY Helper${helper_suffix} 失败：CFBundleName='$cur_name'、可执行文件缺失——启动会崩在 Unable to find helper app"
        fail=1
      fi
    else
      say "DRIFT Helper${helper_suffix} 未重命名（仍为 $(basename "$OLD_H")）— 跑 --apply"
      fail=1
    fi
  elif [ -d "$NEW_H" ]; then
    [ "$MODE" = "--check" ] && say "OK   Helper${helper_suffix} 已重命名"
  fi
done

# ── 3. Info.plist 显示名 ──────────────────────────────────────────────────────
PLIST="$DSH_APP/Contents/Info.plist"
if [ -f "$PLIST" ]; then
  cur=$(/usr/libexec/PlistBuddy -c "Print :CFBundleName" "$PLIST" 2>/dev/null)
  if [ "$cur" = "$BRAND_NAME" ]; then
    say "OK   Info.plist CFBundleName"
  elif [ "$MODE" = "--apply" ]; then
    /usr/libexec/PlistBuddy -c "Set :CFBundleName $BRAND_NAME" "$PLIST"
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $BRAND_NAME" "$PLIST"
    say "APPLY Info.plist"
  else
    say "DRIFT Info.plist (现为 $cur) — 跑 --apply"
    fail=1
  fi
fi

# ── 4. app 图标（icon.icns；Sanbao 受管 squircle 为唯一真相源）───────────
# 真相源：brand/logo/placeholder-mark.svg → packaging/scripts/build-app-icon.sh →
# packaging/assets/app-icon.icns。占位标不含 W/P 语义，正式图形标由后置 T1 替换输入。
# 优先取 BRAND_ICON_ASSET；随包运行时缺省为脚本同目录的 app-icon.icns（payload/tools/），动态计算期望 hash；
# 无资产时回退常量（仅 check 用途），--apply 必须有资产。
ICON_ASSET="${BRAND_ICON_ASSET:-$(dirname "$0")/app-icon.icns}"
BRAND_ICON_SHA="${BRAND_ICON_SHA:-}"
if [ -f "$ICON_ASSET" ]; then
  BRAND_ICON_SHA="$(shasum "$ICON_ASSET" | awk '{print $1}')"
elif [ -z "$BRAND_ICON_SHA" ]; then
  BRAND_ICON_SHA="7679eaf58b6a45ebfb5bb34b7383f916149778f5"  # build-app-icon.sh 受管产物 sha1
fi
ICON="$DSH_APP/Contents/Resources/icon.icns"
if [ -f "$ICON" ]; then
  cur=$(shasum "$ICON" | awk '{print $1}')
  if [ "$cur" = "$BRAND_ICON_SHA" ]; then
    say "OK   icon.icns Sanbao squircle"
  elif [ "$MODE" = "--apply" ] && [ -f "$ICON_ASSET" ]; then
    cp "$ICON_ASSET" "$ICON"
    say "APPLY icon.icns ← $(basename "$ICON_ASSET")"
  elif [ "$MODE" = "--apply" ]; then
    say "APPLY icon.icns 失败：随包缺少 app-icon.icns（本脚本不带 icns 资产）"
    fail=1
  else
    say "DRIFT icon.icns（hash ${cur}）— 与 Sanbao 受管 squircle 不符"
    fail=1
  fi
fi

# ── 5. 运行时图标（build/app-icon*.png + build/tray-icon*.png）───────────────
# 为什么必须有这一块（2026-09-13 实测）：
#   第 4 块管的是 Contents/Resources/icon.icns——那是 **Finder** 里的图标，它一直是对的。
#   但 **Dock 图标不是**：dsh-plugin-desktop 在启动时显式覆盖它——
#     const iconFilename = runtime.platform === "darwin" ? "app-icon-mac.png" : "app-icon.png"
#     const iconPath = fileURLToPath(new URL(`../build/${iconFilename}`, …))
#     app.dock?.setIcon(icon)          // electron-runtime 的 MacPlatformStrategy.configureApplication
#   而 app.asar.unpacked/build/ 那一套**从未被品牌化**：实测 app-icon-mac.png 是 2.2 MB 的
#   DSH 原生图标，而 ROOT 图标只有 47 KB；tray-icon*.png 同理。
#   症状极具欺骗性：**Finder 里是 ROOT、Dock 里是 DSH 原生**，而本脚本报 ALL VERIFIED
#   —— 因为「品牌检查」只看了一个家，而图标有两个家（P-07）。
# 资产：$(dirname "$0")/brand-icons/（随包分发）。入库副本 packaging/assets/brand-icons/，
#   由 brand/logo/placeholder-mark.svg 经 packaging/scripts/build-app-icon.sh 可复现生成。
# 右侧第三列是**两边必须相同的像素尺寸**：`--apply` 落笔前会真的量一遍并拒绝尺寸不符的资产
#   （尺寸不符意味着基座换了图标规格，静默覆盖会把 Dock 图标换成一张模糊图）。
BUILD_DIR="$CHK/build"
# 资产位置。**只有一个家**（packaging/assets/brand-icons/），三种跑法都不许另存一份：
#   · 随包分发：payload/tools/brand-icons/（与脚本同目录，默认）
#   · 仓库内直接跑（开发/排障）：../packaging/assets/brand-icons/（此处回退）
#   · 调用方显式指定：assemble.sh 与 refresh-app-brand.sh 用 BRAND_ICONS_DIR 传入仓库侧那一份
# 为什么要回退而不是只报 MISSING：只报 MISSING 会**诱导**人去 dsh-patches/ 下复制一份资产
# 来「修好」它——那正好造出同一条事实的第二个家（P-07）。资产真的一个都没有时才报 MISSING。
if [ -z "${BRAND_ICONS_DIR:-}" ]; then
  SIBLING="$(dirname "$0")/brand-icons"
  REPO_SIDE="$(dirname "$0")/../packaging/assets/brand-icons"
  if [ -d "$SIBLING" ]; then BRAND_ICONS_DIR="$SIBLING"
  elif [ -d "$REPO_SIDE" ]; then BRAND_ICONS_DIR="$REPO_SIDE"
  else BRAND_ICONS_DIR="$SIBLING"; fi   # 都不在：照原样报 MISSING，并指出期望路径
fi
# 目标（app 侧 build/）:资产（brand-icons/ 内）:尺寸
ICON_PAIRS=(
  "app-icon-mac.png:app-squircle-1024.png:1024x1024"
  "app-icon.png:app-squircle-1024.png:1024x1024"
  "tray-icon-blue.png:mark-colored-16.png:16x16"
  "tray-icon-blue@1.25x.png:mark-colored-20.png:20x20"
  "tray-icon-blue@1.5x.png:mark-colored-24.png:24x24"
  "tray-icon-blue@2x.png:mark-colored-32.png:32x32"
  "tray-iconTemplate.png:mark-template-16.png:16x16"
  "tray-iconTemplate@2x.png:mark-template-32.png:32x32"
)
if [ -d "$BUILD_DIR" ]; then
  if [ ! -d "$BRAND_ICONS_DIR" ]; then
    # 没有资产就**说不出「图标是品牌态」**——不许静默跳过（P-02：读不到不等于合格）。
    say "MISSING brand-icons/（运行时图标资产）——本脚本无法核对 Dock / 托盘图标"
    fail=1
  else
    for pair in "${ICON_PAIRS[@]}"; do
      tgt="${pair%%:*}"; rest="${pair#*:}"; asset="${rest%%:*}"; dim="${rest#*:}"
      tf="$BUILD_DIR/$tgt"; af="$BRAND_ICONS_DIR/$asset"
      if [ ! -f "$af" ]; then say "MISSING brand-icons/$asset"; fail=1; continue; fi
      if [ ! -f "$tf" ]; then
        say "MISSING build/${tgt}（基座改了图标文件名？核对 ICON_PAIRS）"
        fail=1
        continue
      fi
      cur=$(shasum "$tf" | awk '{print $1}')
      want=$(shasum "$af" | awk '{print $1}')
      if [ "$cur" = "$want" ]; then
        say "OK   build/${tgt} Sanbao 受管图标（${dim}）"
      elif [ "$MODE" = "--apply" ]; then
        tdim="$(sips -g pixelWidth -g pixelHeight "$tf" 2>/dev/null | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w"x"h}')"
        if [ "$tdim" != "$dim" ]; then
          say "APPLY build/${tgt} 拒绝：目标实为 ${tdim}，资产表声明 ${dim}——先核对 ICON_PAIRS"
          fail=1
          continue
        fi
        cp "$af" "$tf"
        say "APPLY build/${tgt} ← ${asset}（${dim}）"
      else
        say "DRIFT build/${tgt}（${cur}）— Dock / 托盘图标仍是官方原样"
        fail=1
      fi
    done
  fi
fi

echo
if [ "$fail" = "0" ]; then echo "BRAND ALL VERIFIED"; else echo "BRAND DRIFT — 升级后跑 --apply"; fi
exit $fail
