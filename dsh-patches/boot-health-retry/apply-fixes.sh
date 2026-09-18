#!/bin/bash
# =============================================================================
# LUTE boot-health retry 补丁（2026-09-18「启动页一直转」事故的机制修复）
#
#   症状：DSH Desktop 2.5.0（基座 2.0.10）启动后停在加载页，宿主日志：
#         `renderer boot failed ... The Renderer did not report boot health
#          within 30000ms`（生命周期末尾 event=renderer.boot.timeout）。
#
#   根因：宿主放行界面需要两个条件同时成立
#         （lib/electron-runtime-*.js · DesktopRendererHealthGate.commitIfEligible：
#          `phase==="monitoring" && nativeMounted && rendererHealthy`）。
#         其中 rendererHealthy 只能由渲染器 POST `/_dsh/desktop/renderer-boot`
#         得到，而**该路由由 dsh-plugin-desktop 宿主插件在自己的 ctx.effect 里注册**
#         （src/client → dist 的 `ctx.effect(() => ctx.webServer.register({path:
#          RENDERER_BOOT_REPORT_PATH, ...}))`），effect 会晚于 renderer.boot.started
#         就绪。
#         实测同一端点在启动后 +6s 返回 404（路由未注册）、+10s 返回 401（已注册）；
#         同一套配置连续两次启动，一次 renderer.boot.completed(healthy)、一次
#         renderer.boot.timeout。即「上报 vs 路由就绪」是竞态。
#         渲染器原来只发**一次** POST：落在路由就绪之前就永久失败，宿主只能等 30s 超时。
#
#   修法：把一次性上报改成**确认式重试**——拿不到 2xx 就退避重试（40 × 500ms，
#         落在 30s 窗口内）；网络异常同样计入重试。宿主行为不变，渲染器不再赌时序。
#
# 用法:
#   ./apply-fixes.sh apply             # 幂等应用（已打补丁则跳过）
#   ./apply-fixes.sh --check           # 只报告状态，不改文件
#   ./apply-fixes.sh --verify-anchors  # 对 .orig 基线验证锚点唯一（升级后体检）
#   ./apply-fixes.sh --rollback        # 从 .orig 备份还原
#
# 环境: DSH_APP（默认 /Applications/DSH Desktop.app）
# 纪律: 锚点唯一（count==1 才落笔）→ node --check → .orig 备份 → 完整重启生效
#       （这是渲染器 bundle，但改动只在渲染器侧逻辑；宿主判定不动）。
# =============================================================================
set -euo pipefail

DSH_APP="${DSH_APP:-/Applications/DSH Desktop.app}"
# 资源根双形态：no-ASAR `Resources/app` ⇄ 旧 2.0.5 `app.asar.unpacked`。
# 判定规则唯一家是主仓 scripts/lib/app-resources.mjs；此处内联等价判定（随包分发不能 import）。
_RES="$DSH_APP/Contents/Resources"
if [ -d "$_RES/app" ] && [ ! -e "$_RES/app.asar" ] && [ ! -e "$_RES/app.asar.unpacked" ]; then
  UNP="$_RES/app"
else
  UNP="$_RES/app.asar.unpacked"
fi
TARGET="$UNP/lib/client.js"
MODE="${1:-apply}"

if [ ! -d "$UNP" ]; then
  echo "[boot-health-retry] ✗ 找不到 app 资源根（双形态探测均落空）: 期望 $_RES/app（no-ASAR）或 $_RES/app.asar.unpacked（ASAR）" >&2
  exit 1
fi
if [ ! -f "$TARGET" ]; then
  echo "[boot-health-retry] ✗ 目标文件不存在: $TARGET" >&2
  exit 1
fi

python3 - "$MODE" "$TARGET" <<'PY'
import sys, subprocess, pathlib, shutil

mode = sys.argv[1]
target = pathlib.Path(sys.argv[2])
ORIG = target.with_name(target.name + ".orig-boot-health-retry")
MARK = "LUTE(2026-09-18): 把一次性上报改成确认式重试"

OLD = """\t\tasync function postRendererBootReport(report, request) {
\t\t\tconst response = await request(RENDERER_BOOT_REPORT_PATH, {
\t\t\t\tmethod: \"POST\",
\t\t\t\tcache: \"no-store\",
\t\t\t\theaders: { \"content-type\": \"application/json\" },
\t\t\t\tbody: JSON.stringify(report)
\t\t\t});
\t\t\tif (!response.ok) throw new Error(`dsh-plugin-desktop: renderer boot report failed with HTTP ${String(response.status)}`);
\t\t}"""

NEW = """\t\tasync function postRendererBootReport(report, request) {
\t\t\t/* %s。
\t\t\t * 根因：该端点由 dsh-plugin-desktop 宿主插件的 ctx.effect 注册（effect 会晚于
\t\t\t * renderer.boot.started 就绪）。实测同一端点在启动后 +6s 返回 404（路由未注册）、
\t\t\t * +10s 返回 401（路由已注册）；同一套配置连续两次启动，一次 renderer.boot.completed
\t\t\t * (healthy)、一次 renderer.boot.timeout。即\"上报 vs 路由就绪\"是竞态。
\t\t\t * 一次性 POST 落在路由就绪之前就永久失败——宿主等到 30s 超时。
\t\t\t * 这里退避重试直到拿到 2xx 或窗口耗尽；发送失败按 503 处理继续重试。 */
\t\t\tconst ATTEMPTS = 40;
\t\t\tconst DELAY_MS = 500;
\t\t\tconst body = JSON.stringify(report);
\t\t\tlet lastFailure = \"no attempt\";
\t\t\tfor (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
\t\t\t\tlet status = 503;
\t\t\t\tlet failure;
\t\t\t\ttry {
\t\t\t\t\tconst response = await request(RENDERER_BOOT_REPORT_PATH, {
\t\t\t\t\t\tmethod: \"POST\",
\t\t\t\t\t\tcache: \"no-store\",
\t\t\t\t\t\theaders: { \"content-type\": \"application/json\" },
\t\t\t\t\t\tbody
\t\t\t\t\t});
\t\t\t\t\tif (response.ok) {
\t\t\t\t\t\tif (attempt > 1) console.log(`dsh-plugin-desktop: renderer boot health accepted on attempt ${String(attempt)}`);
\t\t\t\t\t\treturn;
\t\t\t\t\t}
\t\t\t\t\tstatus = response.status;
\t\t\t\t} catch (cause) {
\t\t\t\t\tfailure = cause;
\t\t\t\t}
\t\t\t\tlastFailure = failure === void 0 ? `HTTP ${String(status)}` : String((failure && failure.message) || failure);
\t\t\t\tif (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
\t\t\t}
\t\t\tthrow new Error(`dsh-plugin-desktop: renderer boot report failed with ${lastFailure} after ${String(ATTEMPTS)} attempts`);
\t\t}""" % MARK


def read(p):
    return p.read_text(encoding="utf-8")


def state(text):
    if MARK in text:
        return "patched"
    if OLD in text:
        return "original"
    return "unknown"


def verify_anchors():
    """对 .orig 基线验证锚点唯一；无基线则对当前文件（仅当它仍为 original）。"""
    base = ORIG if ORIG.exists() else target
    text = read(base)
    n = text.count(OLD)
    src = "基线 " + base.name
    if n == 1:
        print(f"[boot-health-retry] ✓ 锚点唯一（{src}）")
        return 0
    print(f"[boot-health-retry] ✗ 锚点命中 {n} 次（应为 1）于 {src} — 上游可能已改动该函数，需重锚", file=sys.stderr)
    return 1


if mode == "--verify-anchors":
    sys.exit(verify_anchors())

text = read(target)
st = state(text)

if mode == "--check":
    print(f"[boot-health-retry] 状态: {st}  ({target})")
    sys.exit(0 if st in ("patched", "original") else 1)

if mode == "--rollback":
    if not ORIG.exists():
        print(f"[boot-health-retry] ✗ 无备份 {ORIG.name}，无法回滚", file=sys.stderr)
        sys.exit(1)
    shutil.copy2(ORIG, target)
    print(f"[boot-health-retry] 已从 {ORIG.name} 还原 {target.name}")
    sys.exit(0)

# apply
if st == "patched":
    print("[boot-health-retry] == already patched, skip")
    sys.exit(0)
if st == "unknown":
    print("[boot-health-retry] ✗ 锚点未命中且无补丁标记——上游已改动 postRendererBootReport，需重锚", file=sys.stderr)
    sys.exit(1)

if not ORIG.exists():
    shutil.copy2(target, ORIG)
    print(f"[boot-health-retry] 已写备份 {ORIG.name}")

patched = text.replace(OLD, NEW, 1)
target.write_text(patched, encoding="utf-8")

rc = subprocess.run(["node", "--check", str(target)], capture_output=True, text=True)
if rc.returncode != 0:
    shutil.copy2(ORIG, target)
    print(f"[boot-health-retry] !! node --check 失败，已回滚：{rc.stderr.strip()[:400]}", file=sys.stderr)
    sys.exit(1)
print(f"[boot-health-retry] == patched OK（{target}）")
PY
