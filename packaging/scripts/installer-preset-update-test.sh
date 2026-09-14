#!/bin/bash
# installer-preset-update-test.sh —— 安装器 5/6「技能合并不覆盖 / 预设按产品内容替换」的反向自测
#
# ## 为什么必须有它
#
# 2026-09-14 实测：2.4.0 的 payload 里 `presets/agt-033` 带着一条本机装配行，而出货 profile 里
# 没有那个包 ⇒ 客户机「结伴 · 达人与联盟合作」preset 加载失败。更糟的是当时安装器对 presets 用
# `cp -Rn`（合并、不覆盖已有）：**修好的下一版也覆盖不上已装机器**，修正交付不到客户手里
# （ADR-0084 的已知缺口）。修法是把「载荷里的预设」按产品内容处理（有差异先备份、再整体替换），
# 而**载荷里没有的预设一律不动**（客户自建的预设不是产品内容）。
#
# 这条语义是「按谁的内容」区分的，一不小心就会退回全量覆盖或全量不覆盖，两种都错：
#   · 退回 `cp -Rn` → 已装机器永远收不到修正（本次缺陷的形状）；
#   · 改成 `cp -R` 全量覆盖 → 客户自建的预设被载荷「替换」，等于删人东西。
# 所以这里两条边界都要钉住，外加一条：**技能那一半必须仍然是合并不覆盖**（技能文件里住着
# 用户状态：算法技能页的开关写在 SKILL.md 的 frontmatter 上，ADR-0083）。
#
# ## 为什么不跑整个安装器
#
# 跑 `install.sh` 会替换本机 `/Applications/DSH Desktop.app`，还会动真实的 `~/.dsh`——
# 开发机上不能这么测。所以本自测**按哨兵逐字节抽出 5/6 那一段**（`# >>> preset-update:begin`
# 到 `# <<< preset-update:end`），配桩运行。抽出来的就是要跑的那些行：安装器改了语义、
# 本自测跟着改；抽不到内容则判红，不会静默变成空转。
#
# 用法: bash packaging/scripts/installer-preset-update-test.sh
# 退出码: 0 = 全绿；1 = 有断言失败
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
INSTALLER="$HERE/../installer/install.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/installer-preset-update.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  [PASS] %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  [FAIL] %s\n' "$1"; }

[ -f "$INSTALLER" ] || { echo "[自测] 找不到安装器: $INSTALLER" >&2; exit 1; }

# ── 按哨兵抽出 5/6 那一段 ────────────────────────────────────────────────────
awk '/^# >>> preset-update:begin/{f=1} f{print} /^# <<< preset-update:end/{f=0}' "$INSTALLER" > "$TMP/block.sh"
if [ ! -s "$TMP/block.sh" ] \
  || ! head -1 "$TMP/block.sh" | grep -q 'preset-update:begin' \
  || ! tail -1 "$TMP/block.sh" | grep -q 'preset-update:end'; then
  echo "[自测] 抽不出完整的 5/6 块（哨兵不见了或块被截断）——自测失效，判红" >&2
  exit 1
fi
BLOCK_LINES="$(wc -l < "$TMP/block.sh" | tr -d ' ')"

# ── 夹具：一个假 $DSH_HOME（skills + .agent-presets）+ 一个真 tarball 载荷 ──────
# 载荷要走**真的那一步**（`tar -xzf skills-presets.tar.gz`），所以夹具打成真 tarball 再抽——
# 桩掉解包就等于自测自己把被测路径绕过去了（0b 自测文件里记着同一条教训）。
# 桩只提供真实代码用到的那些：say / clear_qa / STAMP / HERE / STAGING_DIR / DSH_HOME_DIR。
mkharness(){
  rm -rf "$TMP/home" "$TMP/stage" "$TMP/src" "$TMP/here"
  mkdir -p "$TMP/home/.agent-presets" "$TMP/home/skills" "$TMP/src/skills" "$TMP/src/presets" \
           "$TMP/stage" "$TMP/here"
  repack
  cat > "$TMP/run.sh" <<RUNNER
set -uo pipefail
HERE="$TMP/here"
DSH_HOME_DIR="$TMP/home"
STAGING_DIR="$TMP/stage"
STAMP="20260914-120000"
say(){ printf '[say] %s\n' "\$1"; }
clear_qa(){ :; }
. "$TMP/block.sh"
RUNNER
}
repack(){ tar -czf "$TMP/here/skills-presets.tar.gz" -C "$TMP/src" skills presets; }
mkskill(){  # <installed|shipped> <名字> <内容>
  if [ "$1" = "installed" ]; then mkdir -p "$TMP/home/skills/$2"; printf '%s\n' "$3" > "$TMP/home/skills/$2/SKILL.md"
  else mkdir -p "$TMP/src/skills/$2"; printf '%s\n' "$3" > "$TMP/src/skills/$2/SKILL.md"; repack; fi
}
mkpreset(){ # <installed|shipped> <名字> <内容>
  if [ "$1" = "installed" ]; then mkdir -p "$TMP/home/.agent-presets/$2"; printf '%s\n' "$3" > "$TMP/home/.agent-presets/$2/agent.cordis.yml"
  else mkdir -p "$TMP/src/presets/$2"; printf '%s\n' "$3" > "$TMP/src/presets/$2/agent.cordis.yml"; repack; fi
}
run(){ bash "$TMP/run.sh" 2>&1; }

# ── T1 载荷里的预设：有差异 → 整体替换为载荷内容，旧副本进备份 ──────────────────
mkharness
mkpreset installed agt-001 'old-content'
mkpreset shipped agt-001 'new-content'
mkskill installed s1 'user-edit'
mkskill shipped s1 'shipped'
out="$(run)"; rc=$?
got="$(cat "$TMP/home/.agent-presets/agt-001/agent.cordis.yml" 2>/dev/null)"
bak="$(cat "$TMP/home/.agent-presets.pre-lute-20260914-120000/agt-001/agent.cordis.yml" 2>/dev/null)"
if [ "$rc" = "0" ] && [ "$got" = "new-content" ] && [ "$bak" = "old-content" ]; then
  ok "T1 载荷里的预设被替换为载荷内容，旧副本进 .pre-lute-<stamp> 备份"
else
  no "T1 预设替换/备份不对（rc=${rc} got=${got:-无} bak=${bak:-无}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── T2 技能那一半必须**仍然**是合并不覆盖（用户状态不许被洗掉）────────────────────
skill="$(cat "$TMP/home/skills/s1/SKILL.md" 2>/dev/null)"
if [ "$skill" = "user-edit" ]; then
  ok "T2 技能仍是合并不覆盖（用户改过的 shipped 技能不被载荷洗掉）"
else
  no "T2 技能被覆盖了（=${skill:-无}）——技能文件里住着用户状态，覆盖它等于把用户的选择洗掉"
fi

# ── T3 载荷里没有的预设：一律不动，且不进备份 ───────────────────────────────────
mkharness
mkpreset installed bobo-cto 'customer-own'
mkpreset shipped agt-001 'new-content'
out="$(run)"; rc=$?
got="$(cat "$TMP/home/.agent-presets/bobo-cto/agent.cordis.yml" 2>/dev/null)"
if [ "$rc" = "0" ] && [ "$got" = "customer-own" ] \
  && [ ! -e "$TMP/home/.agent-presets.pre-lute-20260914-120000/bobo-cto" ]; then
  ok "T3 载荷里没有的预设原样保留（客户自建的预设不是产品内容）"
else
  no "T3 客户自建预设被动了（rc=${rc} got=${got:-无}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── T4 内容一致 → 不替换、也不堆同内容备份 ─────────────────────────────────────
mkharness
mkpreset installed agt-002 'same'
mkpreset shipped agt-002 'same'
out="$(run)"; rc=$?
if [ "$rc" = "0" ] && [ ! -e "$TMP/home/.agent-presets.pre-lute-20260914-120000" ] \
  && printf '%s' "$out" | grep -q '未变 1'; then
  ok "T4 内容一致 → 不动它、不留备份（读数写明「未变 1」）"
else
  no "T4 一致项应被跳过且不备份（rc=${rc}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── T5 载荷新增的预设 → 装上（且不算「替换」，不留备份）──────────────────────────
mkharness
mkpreset shipped agt-003 'brand-new'
out="$(run)"; rc=$?
got="$(cat "$TMP/home/.agent-presets/agt-003/agent.cordis.yml" 2>/dev/null)"
if [ "$rc" = "0" ] && [ "$got" = "brand-new" ] && printf '%s' "$out" | grep -q '新增 1' \
  && [ ! -e "$TMP/home/.agent-presets.pre-lute-20260914-120000" ]; then
  ok "T5 载荷新增的预设装上，读数为「新增 1」、不产生备份"
else
  no "T5 新增预设处理不对（rc=${rc} got=${got:-无}）"; printf '%s\n' "$out" | sed 's/^/       /'
fi

# ── T6 回滚接线：替换过的预设必须能被 rollback 搬回 ─────────────────────────────
# 这一条查的是**接线**而不是语义：RESTORE_PRESETS 没被设上时，安装失败就会留下一个半新的
# 预设目录而不自知（与 app / profile 同一失效方向）。
mkharness
mkpreset installed agt-001 'old-content'
mkpreset shipped agt-001 'new-content'
cat > "$TMP/rollback-probe.sh" <<PROBE
set -uo pipefail
HERE="$TMP/here"
DSH_HOME_DIR="$TMP/home"
STAGING_DIR="$TMP/stage"
STAMP="20260914-120000"
say(){ :; }
clear_qa(){ :; }
RESTORE_PRESETS=""
. "$TMP/block.sh"
printf 'RESTORE_PRESETS=%s\n' "\$RESTORE_PRESETS"
PROBE
out="$(bash "$TMP/rollback-probe.sh" 2>&1)"
if printf '%s' "$out" | grep -q "RESTORE_PRESETS=$TMP/home/.agent-presets.pre-lute-20260914-120000"; then
  ok "T6 替换过的预设把 RESTORE_PRESETS 指向备份目录（回滚能搬回）"
else
  no "T6 RESTORE_PRESETS 没接上（${out}）——安装失败会留下半新的预设目录"
fi

# ── M1 恒真桩突变：把「整体替换」退回旧的 `cp -Rn`（合并、不覆盖）→ T1 必须失效 ──
# 这一条是自测自己的判据：如果 T1 在突变下照样绿，说明 T1 钉的不是「覆盖」这件事
# （比如被别的动作顺带做成了），那它就不是一条有效的回归钉。
MUT="$TMP/mutant-block.sh"
node -e '
const fs=require("fs");const src=process.argv[1],dst=process.argv[2];
let t=fs.readFileSync(src,"utf8");const before=t;
// 把「删掉旧目录再拷新的」退回「合并拷贝（不覆盖已有）」——正是本次要修掉的那一版
t=t.replace(/  rm -rf "\$target"\n  cp -R "\$src" "\$target"/, "  cp -Rn \"\$src/.\" \"\$target/\"");
if(t===before){console.error("突变未生效：找不到替换判据");process.exit(3)}
fs.writeFileSync(dst,t);
' "$TMP/block.sh" "$MUT" || no "M1 突变注入失败（判据形状变了？）"
if [ -f "$MUT" ]; then
  mkharness
  mkpreset installed agt-001 'old-content'
  mkpreset shipped agt-001 'new-content'
  cp "$MUT" "$TMP/block.sh"
  out="$(run)"; rc=$?
  got="$(cat "$TMP/home/.agent-presets/agt-001/agent.cordis.yml" 2>/dev/null)"
  if [ "$got" != "new-content" ]; then
    ok "M1 退回 cp -Rn 后 T1 失效（内容仍是 ${got}）→ T1 确实钉住了「整体替换」这条语义"
  else
    no "M1 突变后 T1 仍然成立——T1 钉的判据不明"
  fi
  awk '/^# >>> preset-update:begin/{f=1} f{print} /^# <<< preset-update:end/{f=0}' "$INSTALLER" > "$TMP/block.sh"
fi

echo
echo "[installer-preset-update-test] 抽出 ${BLOCK_LINES} 行、通过 ${PASS}，失败 ${FAIL}"
[ "$FAIL" = "0" ] || exit 1
