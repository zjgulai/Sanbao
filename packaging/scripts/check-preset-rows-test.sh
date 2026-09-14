#!/bin/bash
# check-preset-rows-test.sh —— 「出货 preset 的每一行都必须能在出货面里解析」这条判据的反向自测
#
# 为什么存在：2026-09-14 实测，2.4.0 的 payload 里 `presets/agt-033/agent.cordis.yml` 带着
# 「本机装配」的产品行 `dsh-kol-hunter-local`，而客户机的出货 profile 里没有该包 →
# 客户打开 DSH 时「结伴 · 达人与联盟合作」这个 preset 加载失败。原有的
# `strip-local-products.mjs` 看不见它：那条判据先在**本机 profile** 的 file: 依赖里算
# 「外部产品名」，而装配那一刻本机的那半事实早已被上一次安装抹掉，于是脚本如实报告
# 「✓ 出货面没有本机装配的外部产品」。修法是把判据的事实来源换成**出货面**（正向闭合）。
#
# 一条判据如果没人证明过它**会说「不」**，它就只是纸面上的。所以这里逐条喂坏输入，并用
# 恒真桩突变证明这些断言钉的是判据本身。
#
# 用法: bash packaging/scripts/check-preset-rows-test.sh
# 退出码: 0 = 全部通过；1 = 有断言失败
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/check-preset-rows.mjs"
[ -f "$SRC" ] || { echo "找不到待测脚本: $SRC" >&2; exit 1; }

PASS=0
FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/check-preset-rows-test.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT

PRESETS="$SANDBOX/presets"
NM="$SANDBOX/nm"
CFG="$SANDBOX/config.json"

# 出货面（假的 node_modules）：skill-subset 与 tool-subagent-control 在，kol-hunter-local 不在。
# 「谁在解析面里」是各用例唯一的自变量——判据必须随它改变结论。
make_surface(){
  rm -rf "$NM"; mkdir -p "$NM/dsh-skill-subset" "$NM/@deepseek-ai/dsh-tool-subagent-control" "$NM/@deepseek-ai/dsh-command-goal"
}

# 出厂 preset：一条普通行 + 一条内置行 + （可选）那条**真实的**本机装配行（注释逐字来自出货副本）
write_preset(){ # <预设名> <with-leak: yes|no>
  local dir="$PRESETS/$1"
  mkdir -p "$dir"
  {
    printf 'plugins:\n'
    printf -- "- id: skill-subset\n  name: 'dsh-skill-subset'\n\n"
    printf -- "- id: delegation\n  name: cordis:group\n  config:\n"
    printf -- "    - id: tool-subagent-list-agents\n      name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'\n\n"
    if [ "$2" = "yes" ]; then
      # 逐字来自 2026-09-14 实测的出货副本（含它上面那三行注释——注释属于这条行）
      printf '# 本机装配：深链星探 KOL Hunter（ADR-0061）\n'
      printf '# 这条只在本机 profile 生效，不进仓库出货物；运行 scripts/role-presets/generate.mjs\n'
      printf '# 会重写本文件，届时需重新插入本行。\n'
      printf -- "- id: product-kol-hunter\n  name: 'dsh-kol-hunter-local'\n\n"
    fi
    printf -- "- id: command-goal\n  name: '@deepseek-ai/dsh-command-goal'\n"
  } > "$dir/agent.cordis.yml"
}

# 登记处：默认登记那条本机行（这是修复后的正确配置）
# 注意 `${2:-…}` 那种写法在这里**不能用**：默认值里 `{"name":…}` 的内层 `}` 会提前闭合参数
# 展开，生成出一段坏 JSON（自测第一版就是这样坏掉了 13 条用例，读数全是「JSON 解析失败」）。
write_config(){ # <localOnly-json> [builtins-json]
  local builtins="${2-}"
  if [ -z "$builtins" ]; then
    builtins='[{"name":"cordis:group","why":"Cordis 运行时分组的命名空间"}]'
  fi
  cat > "$CFG" <<JSON
{ "note": "自测夹具",
  "builtins": $builtins,
  "localOnly": $1 }
JSON
}

run(){ # [script] [extra args] → stdout+stderr
  local script="$1"; shift
  node "$script" --presets "$PRESETS" --node-modules "$NM" --config "$CFG" "$@" 2>&1
}

DECL='[{"preset":"agt-033","id":"product-kol-hunter","name":"dsh-kol-hunter-local","why":"ADR-0061：本机装配行"}]'

# ── S1 正常面：全部解析得到 → 绿 ────────────────────────────────────────────
make_surface; write_preset agt-033 no; write_config "$DECL"
out="$(run "$SRC")"; rc=$?
if [ "${rc}" = "0" ] && printf '%s' "$out" | grep -q '全部在解析面内'; then
  ok "S1 解析得全 → 绿（4 条顶层行 + 1 条容器内行）"
else
  no "S1 应判绿（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S2 回归钉：那条真实的本机装配行**未登记** → 中止并点名到「文件 + 行 + 包名」────
# 这就是 2.4.0 出给客户的那份字节的形态。判据必须能对它说「不」。
make_surface; write_preset agt-033 yes; write_config '[]'
out="$(run "$SRC")"; rc=$?
if [ "${rc}" = "1" ] && printf '%s' "$out" | grep -q 'dsh-kol-hunter-local' \
  && printf '%s' "$out" | grep -q 'presets/agt-033/agent.cordis.yml:'; then
  ok "S2 未登记的本机行 → 中止，且点名文件:行 + 包名"
else
  no "S2 必须判红并点名（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S3 登记之后：出货副本剥掉它（含它上面那三行注释），其余字节不动 ──────────────
make_surface; write_preset agt-033 yes; write_config "$DECL"
before_head="$(sed -n '1,6p' "$PRESETS/agt-033/agent.cordis.yml")"
out="$(run "$SRC" --strip)"; rc=$?
after="$(cat "$PRESETS/agt-033/agent.cordis.yml")"
if [ "${rc}" = "0" ] && printf '%s' "$out" | grep -q '已剥离本机行' \
  && ! printf '%s' "$after" | grep -q 'dsh-kol-hunter-local' \
  && ! printf '%s' "$after" | grep -q 'KOL Hunter' \
  && printf '%s' "$after" | grep -q 'tool-subagent-control/list-agents'; then
  ok "S3 已登记的行被剥掉（含紧贴其上的注释），兄弟行原样保留"
else
  no "S3 剥离结果不对（rc=${rc}）"; printf '%s\n' "$after" | sed 's/^/       /'
fi
# 被剥掉之后，顶层行数应从 4 降到 3——数错说明剥多了或剥少了
rows_after="$(grep -c '^- ' "$PRESETS/agt-033/agent.cordis.yml")"
if [ "$rows_after" = "3" ]; then
  ok "S3 顶层行数 4 → 3（只少被登记的那一条）"
else
  no "S3 顶层行数应为 3，实为 $rows_after"
fi

# ── S4 登记即权威：本机**真的装了这个包**时也必须剥掉 ────────────────────────
# 这一条钉的是根因：上一版判据问的是「本机此刻有没有」，而本机状态会被安装/清理抹掉。
# 出货面装没装，与开发机装没装，是两件事。
mkdir -p "$NM/dsh-kol-hunter-local"
write_preset agt-033 yes; write_config "$DECL"
out="$(run "$SRC" --strip)"; rc=$?
if [ "${rc}" = "0" ] && ! grep -q 'dsh-kol-hunter-local' "$PRESETS/agt-033/agent.cordis.yml"; then
  ok "S4 解析面里**有**该包时，已登记的行照样被剥（登记即权威，不看本机状态）"
else
  no "S4 包在解析面里就不剥 = 又回到「本机状态决定出货面」的老路（rc=${rc}）"
fi
rmdir "$NM/dsh-kol-hunter-local"

# ── S5 同一个字节，解析面一换结论就翻 → 证明判据真的在看文件系统 ──────────────
# 与 S2 成对：唯一自变量是「出货面里有没有这个包」。若判据只看配置或恒判红/恒判绿，
# 这一对必有一条过不去。
make_surface; write_preset agt-033 yes; write_config '[]'
mkdir -p "$NM/dsh-kol-hunter-local"          # 同一份字节，这一次包在面里
out="$(run "$SRC")"; rc=$?
if [ "${rc}" = "0" ]; then
  ok "S5 未登记但**在**出货面里 → 绿（S2 与 S5 只差解析面，结论相反）"
else
  no "S5 包在出货面里却仍判红（rc=${rc}）——判据可能没在看文件系统"; printf '%s\n' "$out" | sed 's/^/       /'
fi
rmdir "$NM/dsh-kol-hunter-local"

# ── S6 路径引用行未登记 → 红（ADR-0056：出货 preset 里不烘焙外部路径）────────────
make_surface; write_preset agt-033 no; write_config '[]'
printf -- "- id: product-x\n  name: '/Users/someone/project/Product/lib/index.js'\n" >> "$PRESETS/agt-033/agent.cordis.yml"
out="$(run "$SRC")"; rc=$?
if [ "${rc}" = "1" ] && printf '%s' "$out" | grep -q '路径形态'; then
  ok "S6 未登记的路径形态行 → 中止（消息说清是 ADR-0056 的那种坏法）"
else
  no "S6 路径引用行必须判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S7 解析面不存在 → rc 2（看不见出货面就不能报「没问题」）────────────────────
make_surface; write_preset agt-033 no; write_config "$DECL"
out="$(node "$SRC" --presets "$PRESETS" --node-modules "$SANDBOX/does-not-exist" --config "$CFG" 2>&1)"; rc=$?
if [ "${rc}" = "2" ] && printf '%s' "$out" | grep -q '解析面不存在'; then
  ok "S7 解析面缺失 → rc 2 响亮失败（不退化成「无发现」）"
else
  no "S7 解析面缺失必须 rc 2（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S8 登记处不存在 → rc 2（「读不到就当没有本机行」正是这一版缺陷的死法）────────
make_surface; write_preset agt-033 yes
out="$(node "$SRC" --presets "$PRESETS" --node-modules "$NM" --config "$SANDBOX/no-config.json" 2>&1)"; rc=$?
if [ "${rc}" = "2" ] && printf '%s' "$out" | grep -q '登记处不存在'; then
  ok "S8 登记处缺失 → rc 2"
else
  no "S8 登记处缺失必须 rc 2（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S9 登记项缺 why → rc 2（名单会腐烂成谎话）──────────────────────────────────
make_surface; write_preset agt-033 yes
write_config '[{"preset":"agt-033","id":"product-kol-hunter","name":"dsh-kol-hunter-local"}]'
out="$(run "$SRC")"; rc=$?
if [ "${rc}" = "2" ] && printf '%s' "$out" | grep -q 'why'; then
  ok "S9 登记缺 why → 配置判坏（rc=2）"
else
  no "S9 缺 why 必须被拒（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S10 名单过期（登记了、出货副本里没有这条行）→ 告警不判红 ────────────────────
make_surface; write_preset agt-033 no; write_config "$DECL"
out="$(run "$SRC")"; rc=$?
if [ "${rc}" = "0" ] && printf '%s' "$out" | grep -q '名单过期'; then
  ok "S10 过期的登记 → 告警但不判红（失效方向是安全的）"
else
  no "S10 过期登记应告警且不判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S11 内置名未登记 → 红；登记后 → 绿（内置也要有人表过态）────────────────────
make_surface; write_preset agt-033 no
write_config '[]' '[]'
out="$(run "$SRC")"; rc=$?
if [ "${rc}" = "1" ] && printf '%s' "$out" | grep -q 'cordis:group'; then
  ok "S11 内置名未登记 → 中止并点名"
else
  no "S11 未登记的内置名必须判红（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── S12 子路径形态（pkg/entry）按**包**判定：包在面里就绿 ────────────────────────
make_surface; write_preset agt-033 no; write_config "$DECL"
out="$(run "$SRC")"; rc=$?
if [ "${rc}" = "0" ]; then
  ok "S12 \`@scope/pkg/entry\` 取包名判定（字面路径不在 node_modules 里也判绿）"
else
  no "S12 子路径形态被误判（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── P1 入口判定：脚本从沙箱副本里跑也必须真的干活 ───────────────────────────────
# 回归钉：`import.meta.url` 是 realpath、`process.argv[1]` 保留传入形式，macOS 的 $TMPDIR
# 走 /var → /private/var，字符串比较会判成「被 import」→ main 不执行、**静默退出 0**
# （= 一条行都没查，装配却报成功）。这个坑在 select-presets.mjs 上实测过。
mkdir -p "$SANDBOX/copy/scripts"
cp "$SRC" "$SANDBOX/copy/scripts/check-preset-rows.mjs"
cp -R "$HERE/lib" "$SANDBOX/copy/scripts/lib"
make_surface; write_preset agt-033 yes; write_config '[]'
out="$(run "$SANDBOX/copy/scripts/check-preset-rows.mjs")"; rc=$?
if [ "${rc}" = "1" ] && printf '%s' "$out" | grep -q 'dsh-kol-hunter-local'; then
  ok "P1 沙箱副本（符号链接路径）里仍真的判定"
else
  no "P1 沙箱副本静默不干活（rc=${rc}，应为 1）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── M1 恒真桩突变：把「解析不到就违规」判空，S2 必须失效 ────────────────────────
# 这一条是自测自己的判据：如果 S2 在突变下照样绿，说明 S2 钉的不是那条判据
# （比如被别的检查顺带拦住了），那它就不是一条有效的回归钉。
MUT="$SANDBOX/copy/scripts/mutant.mjs"
node -e '
const fs=require("fs");const src=process.argv[1],dst=process.argv[2];
let t=fs.readFileSync(src,"utf8");const before=t;
// 桩掉「解析不到 → 记违规」这条判据本身（恒不执行）
t=t.replace(/if \(!resolvable\(name, surface\.roots, surface\.builtins\)\) \{/, "if (false) {");
if(t===before){console.error("突变未生效：找不到 resolvable 判据的使用处");process.exit(3)}
fs.writeFileSync(dst,t);
' "$SRC" "$MUT" || no "M1 突变注入失败（判据形状变了？）"
if [ -f "$MUT" ]; then
  make_surface; write_preset agt-033 yes; write_config '[]'
  out="$(run "$MUT")"; rc=$?
  if [ "${rc}" = "0" ]; then
    ok "M1 恒真桩突变下 S2 失效 → S2 确实钉住了「解析不到即中止」这条判据"
  else
    no "M1 突变后仍判红（rc=${rc}）——S2 可能被别的检查顺带拦住，钉的判据不明"
    printf '%s\n' "$out" | sed 's/^/       /'
  fi
fi

echo
echo "[check-preset-rows-test] 通过 ${PASS}，失败 $FAIL"
[ "$FAIL" = "0" ] || exit 1
