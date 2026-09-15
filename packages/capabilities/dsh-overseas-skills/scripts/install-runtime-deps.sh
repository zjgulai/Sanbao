#!/usr/bin/env bash
# install-runtime-deps.sh — 装技能的运行时前提（SOP §12.10 第三步）
#
# 设计取舍：
#   · Python 依赖**不进系统 Python**，走 uv 受管 venv。本机系统 Python 是 3.14.7，
#     太新——轮子覆盖不全，且装崩了会波及 DSH 自身。
#   · venv 落在 ~/.dsh/skills-runtime/ 而**不是** ~/.dsh/skills/：
#     后者是技能目录，每个子目录都会被当成一条技能；把几万个文件的 venv 放进去
#     会污染 verify_static.mjs 的悬空引用判定（它 readdir 后并进「合法名字」集合）。
#   · Python 钉 3.12 而不是最新：PyMuPDF / scikit-learn / scipy / pandas 的
#     manylinux+macOS 轮子在 3.12 上齐全，3.14 上不一定。
#
# 幂等：只装探测为缺的。重跑安全。
#
# 用法：
#   scripts/install-runtime-deps.sh --dry-run          # 只看计划
#   scripts/install-runtime-deps.sh                    # 装硬依赖
#   scripts/install-runtime-deps.sh --with-optional     # 连软依赖一起装（如 libreoffice）
#   scripts/install-runtime-deps.sh --skills a,b        # 只装这两条技能需要的
#   scripts/install-runtime-deps.sh --python-only       # 只装 Python 侧
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RUNTIME="${DSH_SKILLS_RUNTIME:-$HOME/.dsh/skills-runtime}"
VENV="${RUNTIME}/.venv"
VENV_PY="$VENV/bin/python"
SKILLS_DIR="${DSH_SKILLS_DIR:-$HOME/.dsh/skills}"
PYVER="3.12"

DRY=0; WITH_OPT=0; ONLY_SKILLS=""; MODE="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --with-optional) WITH_OPT=1 ;;
    --skills) ONLY_SKILLS="$2"; shift ;;
    --python-only|--cli-only|--node-only) MODE="${1#--}"; MODE="${MODE%-only}" ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
run() { if [ "$DRY" = 1 ]; then say "  [dry] $*"; else "$@"; fi; }

command -v uv  >/dev/null || { echo "✗ 缺 uv（brew install uv）" >&2; exit 1; }
command -v node >/dev/null || { echo "✗ 缺 node" >&2; exit 1; }

# ── 先建 venv，再探测 ────────────────────────────────────────
# 顺序不能反。探测的解释器口径是「venv 存在就只看 venv」（见 scan-runtime-deps.mjs）。
# 第一次实测就踩了：venv 还没建时探测回退到系统 python3，系统里恰好有 scipy/scikit-learn，
# 于是计划里没它们；venv 建好之后才发现缺 —— 得跑第二遍才收敛。
# 先建 venv（幂等、极快）让探测一次就对准最终解释器。
if [ "$MODE" = "all" ] || [ "$MODE" = "python" ]; then
  if [ ! -x "$VENV_PY" ]; then
    say "== 先建受管 venv（python ${PYVER}） =="
    if [ "$DRY" = 1 ]; then say "  [dry] uv venv --python ${PYVER} ${VENV}"
    else uv venv --python "$PYVER" "$VENV" || { echo "✗ venv 创建失败" >&2; exit 1; }; fi
  fi
fi

say "== 探测当前缺失 =="
PROBE_ARGS=(--probe --json)
[ -n "$ONLY_SKILLS" ] && PROBE_ARGS+=(--skills "$ONLY_SKILLS")
JSON="$(cd "$ROOT" && node scripts/scan-runtime-deps.mjs "${PROBE_ARGS[@]}")" || { echo "✗ 探测失败" >&2; exit 1; }

# 从探测结果里收集缺失项（optional 视 --with-optional 决定收不收）
# node 额外回传安装通道：skill-local / global（TAB 分隔）
collect() { # $1 = "python" | "cli" | "node"
  printf '%s' "$JSON" | node -e '
    const kind = process.argv[1], withOpt = process.argv[2] === "1";
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const d = JSON.parse(s); const out = new Map();
      for (const sk of d.skills) for (const m of sk.missing || []) {
        const opt = m.endsWith("(optional)");
        const body = opt ? m.slice(0, -10) : m;
        const [k, name] = body.split(":");
        if (k !== kind) continue;
        if (opt && !withOpt) continue;
        const [pkg, ch] = name.split("@");
        out.set(pkg, ch || "global");
      }
      console.log([...out.entries()].sort()
        .map(([n, c]) => (kind === "node" ? `${n}\t${c}` : n)).join("\n"));
    });
  ' "$1" "$([ "$WITH_OPT" = 1 ] && echo 1 || echo 0)"
}

PY_MISS="$(collect python)"
CLI_MISS="$(collect cli)"
NODE_MISS="$(collect node)"
NODE_GLOBAL="$(printf '%s' "$NODE_MISS" | awk -F'\t' '$2!="skill-local"{print $1}')"
NODE_LOCAL="$(printf '%s' "$NODE_MISS" | awk -F'\t' '$2=="skill-local"{print $1}')"

say "  python 缺: ${PY_MISS//$'\n'/ }${PY_MISS:+}"
say "  cli    缺: ${CLI_MISS//$'\n'/ }${CLI_MISS:+}"
say "  node   缺: $(printf "%s" "$NODE_MISS" | tr "\n\t" "  ")"
[ "$WITH_OPT" = 0 ] && say "  （软依赖未计入；加 --with-optional 一并处理）"

# ── Python：uv 受管 venv ──────────────────────────────────────
if [ "$MODE" = "all" ] || [ "$MODE" = "python" ]; then
  if [ -n "$PY_MISS" ]; then
    say ""
    say "== Python 落 ${VENV}（python ${PYVER}） =="
    if [ ! -x "$VENV_PY" ]; then
      run uv venv --python "$PYVER" "$VENV"
    else
      say "  venv 已存在：$("$VENV_PY" --version 2>&1)"
    fi
    PKGS="$(printf '%s' "$PY_MISS" | tr '\n' ' ')"
    say "  装: $PKGS"
    # shellcheck disable=SC2086
    run uv pip install --python "$VENV_PY" $PKGS
  else
    say ""
    say "== Python 无缺失，跳过 =="
  fi
fi

# ── 环境前提（非包类）────────────────────────────────────────
# 有些前提不是"装个包"就能满足的，但同样会让技能产出坏结果。中文渲染就是典型：
# matplotlib 默认 DejaVu Sans 无 CJK 字形 → 中文标题渲染成豆腐块，
# **脚本不报错、退出码 0、图也生成了**，坏在交付物里。只查"matplotlib 装没装"永远拦不住。
# 所以这一步的判据是**真实渲染一次中文并断言零缺字警告**。
if [ "$MODE" = "all" ] || [ "$MODE" = "python" ]; then
  if [ -x "$VENV_PY" ] && "$VENV_PY" -c "import matplotlib" 2>/dev/null; then
    say ""
    say "== 环境前提：中文渲染 =="
    SP="$("$VENV_PY" -c 'import site;print(site.getsitepackages()[0])' 2>/dev/null)"
    RCDIR="${VENV}/etc/matplotlib"
    if [ "$DRY" = 1 ]; then
      say "  [dry] 写 ${RCDIR}/matplotlibrc 与 ${SP}/sitecustomize.py，并做一次中文渲染自检"
    else
      mkdir -p "$RCDIR"
      cat > "${RCDIR}/matplotlibrc" <<'RCEOF'
# 由 dsh-overseas-skills/scripts/install-runtime-deps.sh 生成（维护 SOP §12.10）。
# 字体按本机实测可用性排序：Hiragino Sans GB / Heiti SC / Songti SC / Arial Unicode MS 可渲染中文；
# PingFang SC 与 STHeiti 是 .ttc 集合，matplotlib 3.11 加载失败，故不列。
font.family: sans-serif
font.sans-serif: Hiragino Sans GB, Heiti SC, Songti SC, Arial Unicode MS, DejaVu Sans
axes.unicode_minus: false
RCEOF
      cat > "${SP}/sitecustomize.py" <<'SCEOF'
"""由 dsh-overseas-skills/scripts/install-runtime-deps.sh 生成（维护 SOP §12.10）。

只做一件事：把 matplotlib 的配置目录指到本 venv 的 etc/matplotlib。

· 不用 ~/.matplotlib 或 ~/.config/matplotlib：那会作用于**所有** Python，
  包括系统 Python 与 DSH 自身，属于越界污染。
· 不把 rc 直接放 venv/etc/matplotlibrc：matplotlib 3.11 已不再搜索该路径
  （实测 matplotlib_fname() 直接落到 site-packages/mpl-data）。
· 不改 mpl-data/matplotlibrc：那会被 `uv pip install --reinstall matplotlib` 抹掉；
  这里只动环境变量，零 import 开销。
"""
import os
import sys

os.environ.setdefault("MPLCONFIGDIR", os.path.join(sys.prefix, "etc", "matplotlib"))
SCEOF
      # 自检：真实渲染中文，缺字即红（-W error::UserWarning 把警告升级为异常）
      if "$VENV_PY" -W error::UserWarning -c "
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig, ax = plt.subplots(); ax.set_title('季度销量趋势'); ax.set_ylabel('销量（件）')
fig.savefig('/dev/null', format='png')" 2>/dev/null; then
        say "  ✓ 中文渲染自检通过（零缺字警告）"
      else
        say "  ✗ 中文渲染自检失败：matplotlib 缺 CJK 字形，图表里的中文会变豆腐块"
        say "    当前 rc: $("$VENV_PY" -c 'import matplotlib;print(matplotlib.matplotlib_fname())' 2>/dev/null)"
        exit 1
      fi
    fi
  fi
fi

# ── CLI：brew ────────────────────────────────────────────────
if [ "$MODE" = "all" ] || [ "$MODE" = "cli" ]; then
  if [ -n "$CLI_MISS" ]; then
    say ""
    say "== 外部 CLI 走 brew =="
    command -v brew >/dev/null || { echo "✗ 缺 brew，无法装 CLI：$(printf '%s' "$CLI_MISS" | tr '\n' ' ')" >&2; exit 1; }
    for bin in $CLI_MISS; do
      formula="$(printf '%s' "$JSON" | node -e '
        let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
          const want=process.argv[1];
          // 公式名从脚本里的 CLI_BREW 拿不到，这里用固定映射表兜底
          const M={libreoffice:"libreoffice",pandoc:"pandoc",typst:"typst",magick:"imagemagick",
                   convert:"imagemagick",wkhtmltopdf:"wkhtmltopdf",ffmpeg:"ffmpeg",qpdf:"qpdf",
                   gs:"ghostscript",tesseract:"tesseract",imagemagick:"imagemagick",
                   jq:"jq","rsvg-convert":"librsvg",inkscape:"inkscape",gnuplot:"gnuplot",
                   plantuml:"plantuml",graphviz:"graphviz",dot:"graphviz",uv:"uv",
                   "pandoc-crossref":"pandoc-crossref"};
          console.log(M[want]||"");
        });' "$bin")"
      if [ -z "$formula" ]; then say "  ⚠ $bin 无 brew 公式映射，跳过（需人工处理）"; continue; fi
      if brew list --formula "$formula" >/dev/null 2>&1; then say "  ✓ $formula 已装"; continue; fi
      say "  brew install $formula   # 为 $bin"
      run brew install "$formula"
    done
  else
    say ""
    say "== 外部 CLI 无缺失，跳过 =="
  fi
fi

# ── Node：全局 npm 包 ─────────────────────────────────────────
if [ "$MODE" = "all" ] || [ "$MODE" = "node" ]; then
  if [ -n "$NODE_GLOBAL" ]; then
    say ""
    say "== Node 全局包 =="
    for pkg in $NODE_GLOBAL; do
      say "  npm install -g $pkg"
      run npm install -g "$pkg"
    done
    case " $NODE_GLOBAL " in
      *" playwright "*)
        say "  npx playwright install chromium"
        run npx --yes playwright install chromium ;;
    esac
  else
    say ""
    say "== Node 全局包无缺失，跳过 =="
  fi

  # ── Node：技能本地包（在技能自己的目录里 npm install） ──────
  #    为什么不能装全局：像 chart.mjs 是 `import 'vega'` 按模块解析的，
  #    全局包不在 Node 的解析路径上，装完照样 Module not found。
  if [ -n "$NODE_LOCAL" ]; then
    say ""
    say "== Node 技能本地包（须先 P1 安装技能） =="
    for pkg in $NODE_LOCAL; do
      owner="$(printf '%s' "$JSON" | node -e '
        let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
          const want=process.argv[1];const d=JSON.parse(s);
          for (const sk of d.skills)
            for (const m of sk.missing||[])
              if (m === "node:"+want || m === "node:"+want+"@skill-local") { console.log(sk.skill); return; }
          console.log("");
        });' "$pkg")"
      target="$SKILLS_DIR/$owner/scripts"
      [ -d "$target" ] || target="$SKILLS_DIR/$owner"
      if [ ! -d "$target" ]; then
        say "  ⏭ $pkg → $owner 尚未安装到 ${SKILLS_DIR}，等 P1 之后再跑"
        continue
      fi
      say "  (cd $target && npm install $pkg)"
      if [ "$DRY" = 1 ]; then say "  [dry] npm install --prefix $target $pkg"
      else (cd "$target" && npm install --no-audit --no-fund "$pkg") ; fi
    done
  fi
fi

say ""
say "== 复探 =="
if [ "$DRY" = 1 ]; then
  say "  [dry] 跳过复探（未做任何改动）"
else
  (cd "$ROOT" && node scripts/scan-runtime-deps.mjs --probe ${ONLY_SKILLS:+--skills "$ONLY_SKILLS"}) || true
fi
