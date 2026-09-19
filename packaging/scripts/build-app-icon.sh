#!/bin/bash
# build-app-icon.sh —— 从受管中性几何占位标生成 macOS squircle 与运行时图标。
# 占位标不含 W/P 语义；正式 Sanbao 图形字母标由后置待办 T1 替换输入，不改生成机制。
set -euo pipefail

OUT="${1:?用法: build-app-icon.sh <输出.icns>}"
REPO="${DSH_VENDOR:-$(cd "$(dirname "$0")/../.." && pwd)}"
MARK="${APP_ICON_MARK:-$REPO/brand/logo/placeholder-mark.svg}"
ASSETS="${APP_ICON_ASSETS_DIR:-$REPO/packaging/assets/brand-icons}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$MARK" ] || { echo "[app-icon] 缺少受管占位标: $MARK" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")" "$ASSETS"

python3 - "$MARK" "$TMP/icon-1024.png" "$TMP/mark-colored-1024.png" "$TMP/mark-template-1024.png" <<'PY'
import re, struct, sys, zlib
from pathlib import Path

mark_path, app_out, colored_out, template_out = map(Path, sys.argv[1:])
text = mark_path.read_text(encoding='utf-8')
if 'data-status="placeholder"' not in text or 'data-semantic="neutral-geometric"' not in text:
    raise SystemExit('[app-icon] 占位标缺 placeholder/neutral-geometric 标记')
polygons = []
for raw in re.findall(r'<polygon\s+points="([^"]+)"', text):
    points = []
    for pair in raw.split():
        x, y = pair.split(',')
        points.append((float(x), float(y)))
    if len(points) < 3:
        raise SystemExit('[app-icon] polygon 至少需要三点')
    polygons.append(points)
if not polygons:
    raise SystemExit('[app-icon] 占位标里没有 polygon')

W = H = 1024
SCALE = 2.0
BG = (0x0B, 0x15, 0x21, 255)
MARK = (0xC4, 0xD0, 0xDC, 255)
BLACK = (0, 0, 0, 255)
HALF = 448.0
CENTER = 512.0
POWER = 5.0

def inside_polygon(px, py, points):
    inside = False
    j = len(points) - 1
    for i, (xi, yi) in enumerate(points):
        xj, yj = points[j]
        if (yi > py) != (yj > py):
            x_cross = (xj - xi) * (py - yi) / (yj - yi) + xi
            if px < x_cross:
                inside = not inside
        j = i
    return inside

def inside_squircle(x, y):
    dx = abs((x - CENTER) / HALF)
    dy = abs((y - CENTER) / HALF)
    return dx ** POWER + dy ** POWER <= 1.0

def pixels(mode):
    out = bytearray(W * H * 4)
    for y in range(H):
        py = (y + 0.5) / SCALE
        for x in range(W):
            px = (x + 0.5) / SCALE
            hit_mark = any(inside_polygon(px, py, poly) for poly in polygons)
            if mode == 'app':
                rgba = MARK if hit_mark else BG if inside_squircle(x + 0.5, y + 0.5) else (0, 0, 0, 0)
            elif mode == 'colored':
                rgba = MARK if hit_mark else (0, 0, 0, 0)
            else:
                rgba = BLACK if hit_mark else (0, 0, 0, 0)
            off = (y * W + x) * 4
            out[off:off + 4] = bytes(rgba)
    return bytes(out)

def png(path, rgba):
    raw = b''.join(b'\x00' + rgba[y * W * 4:(y + 1) * W * 4] for y in range(H))
    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

png(app_out, pixels('app'))
png(colored_out, pixels('colored'))
png(template_out, pixels('template'))
PY

cp "$TMP/icon-1024.png" "$ASSETS/app-squircle-1024.png"
for size in 16 20 24 32; do
  sips -z "$size" "$size" "$TMP/mark-colored-1024.png" --out "$ASSETS/mark-colored-${size}.png" >/dev/null
  if [ "$size" = "16" ] || [ "$size" = "32" ]; then
    sips -z "$size" "$size" "$TMP/mark-template-1024.png" --out "$ASSETS/mark-template-${size}.png" >/dev/null
  fi
done

ICONSET="$TMP/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$TMP/icon-1024.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$TMP/icon-1024.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$OUT"
printf '[app-icon] 生成完成: %s sha1=%s\n' "$OUT" "$(shasum "$OUT" | awk '{print $1}')"
