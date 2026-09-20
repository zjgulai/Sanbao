#!/bin/bash
# brand-replay-test.sh —— `brand-replay.sh` 第 4/5 块（Finder + 运行时图标）的反向自测
#
# ## 为什么必须有它
#
# 第 4/5 块把 Finder / Dock / 托盘图标从「官方原样」换成品牌态，而它跑在**装配现场**：
# 判据（`gate:brand-icons`）只能守表与资产的**静态一致**，「落笔到底写了什么字节」
# 只有真跑一次才知道。`: --apply` 是**写**路径——它错了的表现是「app 照出、图标照错」，
# 而所有静态读数都是绿的。
#
# ## 夹具，以及它**不**断言什么
#
# 夹具是一个**不完整**的假 app（只有 `Contents/Resources/icon.icns` 与
# `app.asar.unpacked/build/`，没有 `app.asar.unpacked/lib/**`）。所以本自测
# **断言 icon.icns 与 `build/` 的写路径**（`DRIFT/APPLY/OK/拒绝 build/…`），**不断言**脚本的收尾判决行
# 与退出码——那两样由整棵 app 树决定，在夹具上恒为「有漂移」。这条边界是刻意的：
# 假造 `lib/**` 的补丁锚点要在文件名里写进基座的内容哈希（`electron-runtime-XXXX.js`），
# 每次基座升级都得改，那是一条会腐烂的断言。
#
# 真机上的收尾读数是另一条命令，见 ADR-0081：`refresh-app-brand.sh --check`
# 在已装 app 上给 9 处 OK + `BRAND ALL VERIFIED`。
#
# 用法: bash packaging/scripts/brand-replay-test.sh
# 退出码: 0 = 全绿；1 = 有断言失败
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
REPLAY_SOURCE="$REPO/dsh-patches/brand-replay.sh"
ASSETS="$REPO/packaging/assets/brand-icons"
ICNS_ASSET="$REPO/packaging/assets/app-icon.icns"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/tools"
cp "$REPLAY_SOURCE" "$TMP/tools/brand-replay.sh"
cp "$REPO/dsh-patches/boot-brand-replay.py" "$TMP/tools/boot-brand-replay.py"
cp "$REPO/dsh-patches/brand-replay-strings.py" "$TMP/tools/brand-replay-strings.py"
cp "$REPO/dsh-patches/brand-payload-wordmark.txt" "$TMP/tools/brand-payload-wordmark.txt"
cp "$ICNS_ASSET" "$TMP/tools/app-icon.icns"
REPLAY="$TMP/tools/brand-replay.sh"

PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

[ -f "$REPLAY" ] || { echo "[自测] 找不到被测脚本: $REPLAY" >&2; exit 1; }
[ -d "$ASSETS" ] || { echo "[自测] 找不到资产目录: $ASSETS" >&2; exit 1; }

# ── 夹具：假 app + 漂移的 icon.icns + N 个「尺寸合规、字节非品牌」的目标 ────────────
# 造的是**合法** PNG（zlib + CRC 齐备），因为 `--apply` 会用 `sips` 量目标尺寸并按结果决定
# 是否落笔——一张假 PNG 会让那条判据读不出尺寸，测的就不是我们要测的东西了。
mkfixture(){ # $1=app 路径 $2=尺寸覆盖（空=照表；"512x512"=全部改成这个尺寸）
  python3 - "$REPLAY" "$ASSETS" "$1" "${2:-}" <<'PY'
import json, struct, sys, zlib, pathlib
replay, assets, appdir, override = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
root = pathlib.Path(appdir)
web = root / 'Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
web.mkdir(parents=True, exist_ok=True)
svg = pathlib.Path(replay).with_name('brand-payload-wordmark.txt').read_text().strip()
boot = 'const css={wordmark:"_wordmark_fixture_1",spinner:"_spinner_fixture_1"};class Boot{constructor(t){this.wordmark=div(css.wordmark,""),this.wordmark.innerHTML=' + json.dumps(svg,ensure_ascii=True) + ',this.spinner=div(css.spinner),this.spinner.dataset.dshBootSpinner="",t.append(this.wordmark,this.spinner)}}'
(web / 'boot.js').write_text(boot)
(web / 'boot.css').write_text('._spinner_fixture_1{animation:_spin_fixture_1 2s linear infinite}@keyframes _spin_fixture_1{to{transform:rotate(360deg)}}')
build = root / 'Contents/Resources/app.asar.unpacked/build'
build.mkdir(parents=True, exist_ok=True)
# 显示名扫描面（块 1）要求至少有一个可扫描的文本文件——空扫描面会（按设计）报 MISSING。
# 放一个品牌态文件：不进 DRIFT、不置 fail，但让收尾判决行在夹具上可断言。
libdir = root / 'Contents/Resources/app.asar.unpacked/lib'
libdir.mkdir(parents=True, exist_ok=True)
(libdir / 'brand-anchor.js').write_text('const brand = "Sanbao";\n')
(root / 'Contents/Resources').mkdir(parents=True, exist_ok=True)
(root / 'Contents/Resources/icon.icns').write_bytes(b'old hard-edge icon bytes')
def png(w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
pairs = [l.strip().strip(',').strip('"').split(':')
         for l in open(replay, encoding='utf-8')
         if l.strip().startswith('"') and l.count(':') == 2]
for tgt, _asset, dim in pairs:
    w, h = (int(x) for x in (override or dim).split('x'))
    (build / tgt).write_bytes(png(w, h, (10, 20, 30)))   # 「官方原样」：尺寸对、字节不同
print(f"夹具 {len(pairs)} 个目标 @ {override or '表内尺寸'}")
PY
}

run_replay(){ # $1=app $2=模式 [额外环境]… → stdout 落 $TMP/out
  local app="$1" mode="$2"; shift 2
  env DSH_APP="$app" BRAND_ICONS_DIR="$ASSETS" "$@" bash "$REPLAY" "$mode" > "$TMP/out" 2>&1
}

APP="$TMP/DSH Desktop.app"
mkfixture "$APP"

# ── R1 --check 必须报 icon.icns + 8 处运行时图标 DRIFT ───────────────────────
run_replay "$APP" --check
n_drift="$(grep -c 'DRIFT build/' "$TMP/out" || true)"
n_targets="$(grep -cE '^ *"[^"]+:[^"]+:[0-9]+x[0-9]+"' "$REPLAY" || true)"
if grep -q 'DRIFT icon.icns' "$TMP/out" && [ "$n_drift" = "$n_targets" ] && [ "$n_drift" != "0" ]; then
  ok "R1 --check 报出 icon.icns + $n_drift 处运行时图标 DRIFT（与表内 $n_targets 对一致）"
else
  no "R1 期望 icon.icns + 表内 ${n_targets} 对 DRIFT，实得运行时 $n_drift"
fi

# ── R2 --apply 必须落笔，且逐字节等于资产 ─────────────────────────────────
run_replay "$APP" --apply
n_apply="$(grep -c 'APPLY build/' "$TMP/out" || true)"
if grep -q 'APPLY icon.icns' "$TMP/out" && [ "$n_apply" = "$n_targets" ]; then
  ok "R2 --apply 落笔 icon.icns + $n_apply 处运行时图标"
else no "R2 期望 APPLY icon.icns + $n_targets 处，实得运行时 $n_apply"; fi
ICNS_BAD="$(cmp -s "$ICNS_ASSET" "$APP/Contents/Resources/icon.icns"; echo $?)"
if [ "$ICNS_BAD" = "0" ]; then ok "R2b icon.icns 落笔后逐字节等于仓库资产"
else no "R2b icon.icns 与仓库资产不符"; fi
BYTES_BAD="$(python3 - "$REPLAY" "$ASSETS" "$APP" <<'PY'
import hashlib, pathlib, sys
replay, assets, appdir = sys.argv[1], sys.argv[2], sys.argv[3]
build = pathlib.Path(appdir) / 'Contents/Resources/app.asar.unpacked/build'
pairs = [l.strip().strip(',').strip('"').split(':')
         for l in open(replay, encoding='utf-8')
         if l.strip().startswith('"') and l.count(':') == 2]
bad = [tgt for tgt, asset, _ in pairs
       if hashlib.sha256((pathlib.Path(assets) / asset).read_bytes()).digest()
       != hashlib.sha256((build / tgt).read_bytes()).digest()]
sys.stdout.write(str(len(bad)))
PY
)"
if [ "$BYTES_BAD" = "0" ]; then ok "R3 落笔后 $n_apply 个目标**逐字节**等于仓库资产（sha256 比对）"
else no "R3 有 $BYTES_BAD 个目标与资产不符——落笔写了别的字节"; fi

# ── R4 再 --check 必须 icns + 运行时全 OK ──────────────────────────────────
run_replay "$APP" --check
n_ok="$(grep -c 'OK   build/' "$TMP/out" || true)"
n_drift2="$(grep -c 'DRIFT build/' "$TMP/out" || true)"
if grep -q 'OK   icon.icns Sanbao squircle' "$TMP/out" && [ "$n_ok" = "$n_targets" ] && [ "$n_drift2" = "0" ]; then
  ok "R4 重跑 --check：icon.icns + $n_ok 处运行时图标 OK、0 处 DRIFT（幂等）"
else no "R4 期望 icns + 运行时全 OK，实得 OK=$n_ok / DRIFT=$n_drift2"; fi

# ── R5 尺寸不符必须**拒绝**落笔（那意味着基座换了图标规格）─────────────────
APP5="$TMP/WrongSize.app"
mkfixture "$APP5" "8x8"           # 目标全是 8x8，而表里声明 16x16 起
hash_targets(){
  python3 - "$REPLAY" "$1" <<'PY'
import hashlib, pathlib, sys
replay, appdir = sys.argv[1], pathlib.Path(sys.argv[2])
build = appdir / 'Contents/Resources/app.asar.unpacked/build'
pairs = [line.strip().strip(',').strip('"').split(':')
         for line in open(replay, encoding='utf-8')
         if line.strip().startswith('"') and line.count(':') == 2]
for target, _asset, _dim in pairs:
    print(target, hashlib.sha256((build / target).read_bytes()).hexdigest())
PY
}
before5="$(hash_targets "$APP5")"
run_replay "$APP5" --apply
n_refuse="$(grep -c '拒绝' "$TMP/out" || true)"
n_applied5="$(grep -c 'APPLY build/.*←' "$TMP/out" || true)"
after5="$(hash_targets "$APP5")"
if [ "$n_refuse" = "$n_targets" ] && [ "$n_applied5" = "0" ] && [ "$before5" = "$after5" ]; then
  ok "R5 目标尺寸与声明不符时 $n_targets/$n_targets 全部拒绝，0 处落笔，前后 sha256 同值"
else
  no "R5 期望全部 $n_targets 处拒绝、0 落笔且字节不变，实得拒绝 $n_refuse / 落笔 $n_applied5 / hash_equal=$([ "$before5" = "$after5" ] && echo yes || echo no)"
fi

# ── R6 资产目录缺失必须判红（不是静默跳过）────────────────────────────────
mkdir -p "$TMP/empty-icons"
run_replay "$TMP/DSH Desktop.app" --check BRAND_ICONS_DIR="$TMP/empty-icons"
if grep -q 'MISSING brand-icons/' "$TMP/out"; then
  ok "R6 资产目录为空时报 MISSING（读不到 ≠ 合格，P-02）"
else
  no "R6 期望 MISSING brand-icons/，实得：$(grep -c . "$TMP/out") 行输出但无该行"
fi

# ── M1 恒真桩突变：把资产换成别的字节，R3 的比较必须失效 ────────────────────
# 证明 R3 的绿来自「真的逐字节比了资产」，而不是比了两份相同的东西。
mkdir -p "$TMP/other-icons"; cp "$ASSETS"/*.png "$TMP/other-icons/"
python3 - "$TMP/other-icons/app-squircle-1024.png" <<'PY'
import pathlib, sys, zlib, struct
p = pathlib.Path(sys.argv[1])
def png(w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
p.write_bytes(png(1024, 1024, (200, 0, 0)))    # 同尺寸、不同字节
PY
APP_M="$TMP/Mutant.app"; mkfixture "$APP_M"
run_replay "$APP_M" --apply BRAND_ICONS_DIR="$TMP/other-icons"
BYTES_BAD_M="$(python3 - "$REPLAY" "$ASSETS" "$APP_M" <<'PY'
import hashlib, pathlib, sys
replay, assets, appdir = sys.argv[1], sys.argv[2], sys.argv[3]
build = pathlib.Path(appdir) / 'Contents/Resources/app.asar.unpacked/build'
pairs = [l.strip().strip(',').strip('"').split(':')
         for l in open(replay, encoding='utf-8')
         if l.strip().startswith('"') and l.count(':') == 2]
bad = [tgt for tgt, asset, _ in pairs
       if hashlib.sha256((pathlib.Path(assets) / asset).read_bytes()).digest()
       != hashlib.sha256((build / tgt).read_bytes()).digest()]
sys.stdout.write(str(len(bad)))
PY
)"
if [ "$BYTES_BAD_M" != "0" ]; then
  ok "M1 换一批资产后 R3 的同一条比较给出 $BYTES_BAD_M 处不符 → R3 有牙"
else
  no "M1 换了资产仍判 0 处不符 → R3 比的根本不是资产"
fi

# ── T 系列：显示名扫描面（2026-09-20）──────────────────────────────────────
# 为什么加这一组：块 1 原来是「9 文件清单」+「PREV 态只报 DRIFT 不落笔」的死角。
# 真机实测（2026-09-20 Sanbao 改名落地）三处缺陷：
#   · 清单漏了 8 个文件（notifications-*、tray-locale-*、src-*.js、native-ui/assets/* 等分块）；
#   · 上一位品牌名（LUTE Agentic System）跑 --apply 也只报 DRIFT 不动手——永远修不好；
#   · index.html 的替换锚点只认上游名，PREV 态下 replace 不命中却照样打印 patched（假绿）。
# 现在：扫描式扫描面 + PREV 可落笔 + 豁免只留身份行/路径行。假分块的文件名刻意不写基座
# hash——扫描面不依赖文件名，这正是它相对「清单 + 动态 hash 发现」的机制优势。
APP_T="$TMP/Strings.app"; mkfixture "$APP_T"
TR="$APP_T/Contents/Resources/app.asar.unpacked"
TLIB="$TR/lib"; mkdir -p "$TLIB"
printf 'const a = "LUTE Agentic System Settings";\nconst b = `Open LUTE Agentic System now`;\n' > "$TLIB/chunk-prev.js"
printf '// for the DSH Desktop Electron executable\nconst help = "Launch DSH Desktop with the selected profile.";\n' > "$TLIB/chunk-dsh.js"
printf 'const ok = "Sanbao is ready";\n' > "$TLIB/chunk-brand.js"
printf 'const IDENTITY = {\n\tproductName: "DSH Desktop",\n\tproductName: "DSH Desktop Beta",\n};\n' > "$TLIB/identity.js"
printf 'app.setPath("userData", app.getPath("appData") + "/DSH Desktop");\n' > "$TLIB/path.js"
printf '// composed as a DeepSeek Harness Cordis plugin\n' > "$TLIB/harness.js"
TDECOY="$TR/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/decoy.js"
printf 'const decoy = "LUTE Agentic System upstream copy";\n' > "$TDECOY"
printf '<!doctype html><html><head><title>LUTE Agentic System</title></head><body></body></html>\n' > "$TR/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html"
sha_of(){ shasum "$1" | awk '{print $1}'; }
t_identity0="$(sha_of "$TLIB/identity.js")"; t_path0="$(sha_of "$TLIB/path.js")"
t_harness0="$(sha_of "$TLIB/harness.js")"; t_decoy0="$(sha_of "$TDECOY")"

run_replay "$APP_T" --check
if grep -q 'DRIFT lib/chunk-prev.js' "$TMP/out" && grep -q 'DRIFT lib/chunk-dsh.js' "$TMP/out" && grep -q 'DRIFT index.html' "$TMP/out"; then
  ok "T1 --check：PREV 态分块 / DSH 态分块 / index.html(PREV 态) 三处都报 DRIFT"
else no "T1 期望三处 DRIFT，实得 $(grep -c 'DRIFT' "$TMP/out" || true) 行 DRIFT"; fi
if grep -q 'OK   lib/chunk-brand.js' "$TMP/out" && ! grep -q 'harness.js' "$TMP/out"; then
  ok "T2 已是品牌态的文件报 OK；基座名（DeepSeek Harness）不进扫描面"
else no "T2 期望 chunk-brand 报 OK 且 harness 完全不出现"; fi
if grep -q 'SKIP lib/identity.js' "$TMP/out" && grep -q 'SKIP lib/path.js' "$TMP/out" \
   && ! grep -q 'DRIFT lib/identity.js' "$TMP/out" && ! grep -q 'DRIFT lib/path.js' "$TMP/out"; then
  ok "T3 身份行/路径行报 SKIP 不报 DRIFT（豁免是显式的，不是静默忽略）"
else no "T3 期望 identity/path 报 SKIP 且无 DRIFT"; fi

run_replay "$APP_T" --apply
if ! grep -q 'LUTE Agentic System' "$TLIB/chunk-prev.js" && grep -q 'Sanbao Settings' "$TLIB/chunk-prev.js" \
   && ! grep -q 'DSH Desktop' "$TLIB/chunk-dsh.js" && grep -q 'Sanbao Electron executable' "$TLIB/chunk-dsh.js"; then
  ok "T4 --apply：PREV 态与 DSH 态都落笔成 Sanbao（覆盖旧实现只报不改的分支）"
else no "T4 期望两文件换净（prev 残留 $(grep -c 'LUTE Agentic System' "$TLIB/chunk-prev.js" || true)、dsh 残留 $(grep -c 'DSH Desktop' "$TLIB/chunk-dsh.js" || true)）"; fi
if grep -qF '<title>Sanbao</title>' "$TR/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html"; then
  ok "T5 --apply：index.html 标题从 PREV 态换成 Sanbao（旧实现此处 replace 不命中却报 patched）"
else no "T5 index.html 标题未换"; fi
if [ "$(sha_of "$TLIB/identity.js")" = "$t_identity0" ] && [ "$(sha_of "$TLIB/path.js")" = "$t_path0" ] \
   && [ "$(sha_of "$TLIB/harness.js")" = "$t_harness0" ] && [ "$(sha_of "$TDECOY")" = "$t_decoy0" ]; then
  ok "T6 身份行 / 路径行 / 基座名 / node_modules 诱饵 四者逐字节不变"
else no "T6 有文件被误改（identity/path/harness/decoy 中至少一个 hash 变了）"; fi

run_replay "$APP_T" --check; rc_t=$?
if [ "$rc_t" = "0" ] && ! grep -q 'DRIFT' "$TMP/out" && grep -q 'BRAND ALL VERIFIED' "$TMP/out"; then
  ok "T7 重跑 --check：0 DRIFT、退出码 0、BRAND ALL VERIFIED（幂等且收尾读数一致）"
else no "T7 期望全绿，实得 rc=$rc_t / $(grep -c 'DRIFT' "$TMP/out" || true) 行 DRIFT"; fi

# ── U 系列：Helper 重命名的曾用名识别（2026-09-20）────────────────────────
# 为什么加：块 3b 的旧目录名只认首代名（DSH Desktop Helper），改名到 Sanbao 后再接手
# 两个分支都不进、静默跳过——check 不报、apply 不改。实测后果：外层 CFBundleName 已是
# Sanbao 而 helper 还叫上一位的名字，启动 17ms 崩在 FATAL "Unable to find helper app"
# （Electron 按外层 CFBundleName 查找 helper）。
APP_U="$TMP/Helpers.app"; mkfixture "$APP_U"
UH="$APP_U/Contents/Frameworks/LUTE Agentic System Helper.app/Contents"
mkdir -p "$UH/MacOS"
cat > "$UH/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
	<key>CFBundleName</key><string>LUTE Agentic System Helper</string>
	<key>CFBundleExecutable</key><string>LUTE Agentic System Helper</string>
</dict></plist>
PLIST
printf '#!/bin/sh\ntrue\n' > "$UH/MacOS/LUTE Agentic System Helper"; chmod +x "$UH/MacOS/LUTE Agentic System Helper"

run_replay "$APP_U" --check
if grep -q 'DRIFT Helper' "$TMP/out"; then
  ok "U1 --check：上一位品牌名的 Helper 被认出来并报 DRIFT（旧实现两个分支都不进、静默）"
else no "U1 期望 DRIFT Helper，实得无该行"; fi

run_replay "$APP_U" --apply
UNEW="$APP_U/Contents/Frameworks/Sanbao Helper.app"
u_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$UNEW/Contents/Info.plist" 2>/dev/null)"
u_exec="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$UNEW/Contents/Info.plist" 2>/dev/null)"
if [ -d "$UNEW" ] && [ "$u_name" = "Sanbao Helper" ] && [ "$u_exec" = "Sanbao Helper" ] && [ -x "$UNEW/Contents/MacOS/Sanbao Helper" ]; then
  ok "U2 --apply：目录、plist 两字段、可执行文件名四处一起换成 Sanbao Helper"
else no "U2 期望四处齐换，实得 dir=$([ -d "$UNEW" ] && echo yes || echo no) name='$u_name' exec='$u_exec' bin=$([ -x "$UNEW/Contents/MacOS/Sanbao Helper" ] && echo yes || echo no)"; fi

run_replay "$APP_U" --check; rc_u=$?
if [ "$rc_u" = "0" ] && ! grep -q 'DRIFT' "$TMP/out" && grep -q 'OK   Helper' "$TMP/out"; then
  ok "U3 重跑 --check：Helper OK、0 DRIFT、收尾 ALL VERIFIED（幂等）"
else no "U3 期望全绿，实得 rc=$rc_u / $(grep -c 'DRIFT' "$TMP/out" || true) 行 DRIFT"; fi

echo
echo "== 结果: ${PASS} 通过 / ${FAIL} 失败（表内 ${n_targets} 对）=="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
