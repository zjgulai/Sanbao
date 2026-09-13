#!/bin/bash
# brand-replay-test.sh —— `brand-replay.sh` 第 5 块（运行时图标）的反向自测
#
# ## 为什么必须有它
#
# 第 5 块把 Dock / 托盘图标从「官方原样」换成品牌态，而它跑在**装配现场**：
# 判据（`gate:brand-icons`）只能守表与资产的**静态一致**，「落笔到底写了什么字节」
# 只有真跑一次才知道。`: --apply` 是**写**路径——它错了的表现是「app 照出、图标照错」，
# 而所有静态读数都是绿的。
#
# ## 夹具，以及它**不**断言什么
#
# 夹具是一个**不完整**的假 app（只有 `Contents/Resources/icon.icns` 与
# `app.asar.unpacked/build/`，没有 `app.asar.unpacked/lib/**`）。所以本自测
# **只断言 `build/` 那几行**（`DRIFT/APPLY/OK/拒绝 build/…`），**不断言**脚本的收尾判决行
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
REPLAY="$REPO/dsh-patches/brand-replay.sh"
ASSETS="$REPO/packaging/assets/brand-icons"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

[ -f "$REPLAY" ] || { echo "[自测] 找不到被测脚本: $REPLAY" >&2; exit 1; }
[ -d "$ASSETS" ] || { echo "[自测] 找不到资产目录: $ASSETS" >&2; exit 1; }

# ── 夹具：假 app + N 个「尺寸合规、字节非品牌」的目标 ─────────────────────────
# 造的是**合法** PNG（zlib + CRC 齐备），因为 `--apply` 会用 `sips` 量目标尺寸并按结果决定
# 是否落笔——一张假 PNG 会让那条判据读不出尺寸，测的就不是我们要测的东西了。
mkfixture(){ # $1=app 路径 $2=尺寸覆盖（空=照表；"512x512"=全部改成这个尺寸）
  python3 - "$REPLAY" "$ASSETS" "$1" "${2:-}" <<'PY'
import struct, sys, zlib, pathlib, shutil
replay, assets, appdir, override = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
root = pathlib.Path(appdir)
build = root / 'Contents/Resources/app.asar.unpacked/build'
build.mkdir(parents=True, exist_ok=True)
(root / 'Contents/Resources').mkdir(parents=True, exist_ok=True)
shutil.copy(pathlib.Path(assets) / '..' / 'app-icon.icns', root / 'Contents/Resources/icon.icns')
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
  env DSH_APP="$app" "$@" bash "$REPLAY" "$mode" > "$TMP/out" 2>&1
}

APP="$TMP/DSH Desktop.app"
mkfixture "$APP"

# ── R1 --check 必须报出 8 处 DRIFT ────────────────────────────────────────
run_replay "$APP" --check
n_drift="$(grep -c 'DRIFT build/' "$TMP/out" || true)"
n_targets="$(grep -cE '^ *"[^"]+:[^"]+:[0-9]+x[0-9]+"' "$REPLAY" || true)"
if [ "$n_drift" = "$n_targets" ] && [ "$n_drift" != "0" ]; then
  ok "R1 --check 报出 $n_drift 处 DRIFT（与表内 $n_targets 对一致）"
else
  no "R1 期望 DRIFT 数 = 表内对数（${n_targets}），实得 $n_drift"
fi

# ── R2 --apply 必须落笔，且逐字节等于资产 ─────────────────────────────────
run_replay "$APP" --apply
n_apply="$(grep -c 'APPLY build/' "$TMP/out" || true)"
if [ "$n_apply" = "$n_targets" ]; then ok "R2 --apply 落笔 $n_apply 处"
else no "R2 期望 APPLY $n_targets 处，实得 $n_apply"; fi
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

# ── R4 再 --check 必须全 OK ───────────────────────────────────────────────
run_replay "$APP" --check
n_ok="$(grep -c 'OK   build/' "$TMP/out" || true)"
n_drift2="$(grep -c 'DRIFT build/' "$TMP/out" || true)"
if [ "$n_ok" = "$n_targets" ] && [ "$n_drift2" = "0" ]; then ok "R4 重跑 --check：$n_ok 处 OK、0 处 DRIFT（幂等）"
else no "R4 期望全 OK，实得 OK=$n_ok / DRIFT=$n_drift2"; fi

# ── R5 尺寸不符必须**拒绝**落笔（那意味着基座换了图标规格）─────────────────
APP5="$TMP/WrongSize.app"
mkfixture "$APP5" "8x8"           # 目标全是 8x8，而表里声明 16x16 起
run_replay "$APP5" --apply
n_refuse="$(grep -c '拒绝' "$TMP/out" || true)"
n_applied5="$(grep -c 'APPLY build/' "$TMP/out" || true)"
if [ "$n_refuse" -gt 0 ]; then
  ok "R5 目标尺寸与声明不符时拒绝落笔（$n_refuse 处），未被静默覆盖"
else
  no "R5 期望出现「拒绝」，实得拒绝 $n_refuse 处、落笔 $n_applied5 处"
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
python3 - "$TMP/other-icons/icon-1024.png" <<'PY'
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

echo
echo "== 结果: ${PASS} 通过 / ${FAIL} 失败（表内 ${n_targets} 对）=="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
