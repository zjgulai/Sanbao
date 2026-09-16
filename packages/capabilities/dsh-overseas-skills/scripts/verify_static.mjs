#!/usr/bin/env node
/**
 * verify_static.mjs — 静态闸门（重建后 / 交付前必跑）
 * 检查：① 目录行 name 唯一 ② 图标覆盖（分类头像 + 行级回退后无空）③ 81 系 + 存量精修的路由引用无悬空
 *      ④ 已接线技能的运行时前提齐备（SOP §12.10）
 * 退出码 0=通过，1=失败。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { nodeCommand } from "../../../../scripts/lib/real-node.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SKILLS_DIR = join(homedir(), ".dsh", "skills");
const DEPS_FILE = join(ROOT, "manifest", "runtime-deps.json");

const catSrc = readFileSync(join(ROOT, "lib", "catalog.js"), "utf8");
const CATEGORIES = JSON.parse(/export const CATEGORIES = (\[[\s\S]*?\]);\n/.exec(catSrc)[1]);
const SKILLS = JSON.parse(/export const SKILLS = (\[[\s\S]*?\]);\n/.exec(catSrc)[1]);
const FS_M = /export const CATEGORIES_FS = (\[[\s\S]*?\]);\n/.exec(catSrc);
const CATEGORIES_FS = FS_M ? JSON.parse(FS_M[1]) : [];
// 注意：SKILLS_FS 的捕获**不能**再锚 `$`（文件末尾）——通用线（GN）在它后面。
// 锚 $ 会让正则整条失配，而失配的默认值是空数组，于是「AI全栈 30 条」会静默变成 0 条，
// 图标覆盖判据恒过。这类「判据悄悄失效」正是 P-02 的形态，故此处只锚分号。
const SKILLS_FS_M = /export const SKILLS_FS = (\[[\s\S]*?\]);\n/.exec(catSrc);
const SKILLS_FS = SKILLS_FS_M ? JSON.parse(SKILLS_FS_M[1]) : [];
const GN_CAT_M = /export const CATEGORIES_GN = (\[[\s\S]*?\]);\n/.exec(catSrc);
const CATEGORIES_GN = GN_CAT_M ? JSON.parse(GN_CAT_M[1]) : [];
const GN_SKILL_M = /export const SKILLS_GN = (\[[\s\S]*?\]);\n/.exec(catSrc);
const SKILLS_GN = GN_SKILL_M ? JSON.parse(GN_SKILL_M[1]) : [];

const errors = [];
let iconPaintNote = "";
// ① 名字唯一
const names = SKILLS.map((s) => s.name);
if (new Set(names).size !== names.length) {
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  errors.push(`catalog 重名: ${[...new Set(dup)].join(", ")}`);
}
// ② 图标覆盖
const catIcon = new Map([...CATEGORIES, ...CATEGORIES_FS, ...CATEGORIES_GN].map((c) => [c.key, c.icon]));
const noCatIcon = CATEGORIES.filter((c) => !(c.icon || "").startsWith("data:image/svg+xml;base64,"));
if (noCatIcon.length) errors.push(`无头像分组: ${noCatIcon.map((c) => c.key).join(", ")}`);
const noGnCatIcon = CATEGORIES_GN.filter((c) => !(c.icon || "").startsWith("data:image/svg+xml;base64,"));
if (noGnCatIcon.length) errors.push(`通用线无头像分组: ${noGnCatIcon.map((c) => c.key).join(", ")}`);
// ②b AI全栈线：分组轴 = M00–M13 十四个交付节点。
//
// 2026-09-16 之前这里**只**查了出海线与通用线的分组头像，全栈线一条判据都没有：
// 全栈线那时是 8 个「做法类」分组，头像由 `assign_lute_icons.py` 从品牌清单直接取，
// 没人觉得它会缺，于是它缺的时候也没人知道（`emptyIcon` 只在**行**没有回落时说话，
// 而回落串是 `s.icon || catIcon.get(...)` —— 分组头像为空时它才顺带红，且报的是「无图标行」，
// 指向的是行不是分组）。现在分组轴换成节点，分组数从 8 变 14、行数从 70 变 138，
// 这条轴必须有自己的一条判据，否则「少一个节点」「多一个幽灵分组」都只能靠肉眼。
{
  const noFsCatIcon = CATEGORIES_FS.filter((c) => !(c.icon || "").startsWith("data:image/svg+xml;base64,"));
  if (noFsCatIcon.length) errors.push(`全栈线无头像分组: ${noFsCatIcon.map((c) => c.key).join(", ")}`);
  // 头像必须**互不相同**：`build_preset_catalog.py` 在 `category-icons-fs.json` 缺某个键时
  // 会回落到 `cat_svg['agent-tools']` —— 那是出海线的「工具管家」头像，不是空值，
  // 所以上面那条「是合法 data URI」的判据**看不见**这个回落，14 个节点会一起顶着同一张脸。
  const fsIcons = CATEGORIES_FS.map((c) => c.icon || "");
  if (new Set(fsIcons).size !== fsIcons.length) {
    errors.push(`全栈线 ${fsIcons.length} 个分组只有 ${new Set(fsIcons).size} 张不同头像 —— 疑似回落到了同一个默认头像（category-icons-fs.json 缺键）`);
  }
  // 分组键与标题的事实源是派生器里的 NODES，行集的事实源是它归并出来的 138 行 ——
  // 所以这里**不写任何数字**：数字写在这里就是第三个家，而第三个家只会靠人对齐。
  const { NODES, mergeRows } = await import("./build-fullstack-catalog.mjs");
  const want = NODES.map((n) => `${n.key}\u0000${n.title}`);
  const got = CATEGORIES_FS.map((c) => `${c.key}\u0000${c.title}`);
  if (want.join("|") !== got.join("|")) {
    errors.push(`全栈线分组轴与事实源不符：期望 ${want.length} 组（M00–M13），实际 ${got.length} 组`
      + `（缺 ${want.filter((w) => !got.includes(w)).length} / 多 ${got.filter((g) => !want.includes(g)).length}）`);
  }
  const { rows: wantRows, problems: wantProblems } = mergeRows();
  if (wantProblems.length) errors.push(`全栈线事实源自身有问题: ${wantProblems.slice(0, 4).join(" / ")}`);
  if (SKILLS_FS.length !== wantRows.length) {
    errors.push(`全栈线行数 ${SKILLS_FS.length} ≠ 事实源 ${wantRows.length} —— 页面会静默多/少卡片`);
  }
  const nodeKeys = new Set(NODES.map((n) => n.key));
  const stray = SKILLS_FS.filter((s) => !nodeKeys.has(s.category));
  if (stray.length) errors.push(`全栈线挂在未知分组上的行: ${stray.map((s) => `${s.name}→${s.category}`).slice(0, 8).join(", ")}`);
}
const emptyIcon = [];
for (const s of [...SKILLS, ...SKILLS_FS, ...SKILLS_GN]) {
  const icon = s.icon || catIcon.get(s.category) || "";
  if (!icon) emptyIcon.push(s.name);
}
if (emptyIcon.length) errors.push(`无图标行: ${emptyIcon.join(", ")}`);

// ②-2 头像 SVG 的 paint 值必须合法（2026-09-15 新增，ADR-0090）
//
// 起源是一次**没有任何判据在看**的缺陷：生成器 `lute-brand-icons/lib/generator.js`
// 把衬衫**名**（`G`/`GD`/`GL`/`MINT`/`W`）当作颜色**值**传进 `shoulders()`，产物里于是
// 写着 `fill="W"` / `fill="GD"`——都不是合法 CSS 颜色，SVG 按规范回落到默认黑，
// **每一枚图标的下装都是纯黑**。它活了很久，因为「深色下装」看着像设计而不像坏值。
//
// 「图标覆盖」那一项只问「这一行有没有图」，不问「这张图能不能正确渲染」——
// 两者是不同的断言，正是本仓库记的 P-02（仪器量错了对象）。
// 判据挂在这里而不是生成器里：生成器在本机 `~/.dsh/skills/` 下、不进仓库，
// 而门禁能守的只有**被消费的那份产物**。
{
  const paint = /(?:fill|stroke)="([^"]*)"/g;
  // 合法取值：颜色字面量 / 本文件内的渐变引用 / none / rgba() / transparent
  const ok = /^(?:#[0-9A-Fa-f]{3,8}|url\(#[\w-]+\)|none|rgba?\([^)]*\)|transparent)$/;
  const uris = new Set();
  for (const uri of [...catIcon.values(), ...SKILLS.map((s) => s.icon), ...SKILLS_FS.map((s) => s.icon), ...SKILLS_GN.map((s) => s.icon)]) {
    if (typeof uri === "string" && uri.startsWith("data:image/svg+xml;base64,")) uris.add(uri);
  }
  const bad = [];
  let attrs = 0;
  for (const uri of uris) {
    const svg = Buffer.from(uri.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8");
    if (!svg.startsWith("<svg")) {
      bad.push(`data URI 解不出 SVG（前 40 字符：${svg.slice(0, 40)}）`);
      continue;
    }
    for (const m of svg.matchAll(paint)) {
      attrs += 1;
      if (!ok.test(m[1])) bad.push(`${m[0]}`);
    }
  }
  // 空转哨兵：一批 SVG 里一个 fill/stroke 都没解出来 ⇒ 判据在骗人（切片口径写错就会这样），
  // 而「零违规」与「什么都没看」必须在读数上不同形。
  if (uris.size > 0 && attrs === 0) {
    errors.push(`头像判据空转：解出 ${uris.size} 枚 SVG 却一个 fill/stroke 都没有 —— 先确认 base64 切片口径`);
  }
  if (bad.length) {
    errors.push(`头像 paint 值非法（${bad.length} 处，SVG 会回落到默认黑）：${[...new Set(bad)].slice(0, 6).join(" / ")}`);
  }
  iconPaintNote = `${uris.size} 枚 / ${attrs} 个 paint 值全合法`;
}
// ②b v3 二级结构：8 大场景 / 28 细分 / 行级 subcategory 全覆盖 / 无 preset 残留
const scenCount = CATEGORIES.length;
const subCount = CATEGORIES.reduce((n, c) => n + (c.subs || []).length, 0);
if (scenCount !== 8) errors.push(`大场景数应为 8，实际 ${scenCount}`);
if (subCount !== 28) errors.push(`细分场景数应为 28，实际 ${subCount}`);
const noSub = SKILLS.filter((s) => !s.subcategory);
if (noSub.length) errors.push(`缺 subcategory 行: ${noSub.map((s) => s.name).slice(0, 8).join(", ")}`);
const presetRows = SKILLS.filter((s) => s.category.startsWith("preset-"));
if (presetRows.length) errors.push(`preset 残留: ${presetRows.map((s) => s.name).join(", ")}`);
// ②c 通用线：分组数 / 行数 / tier 唯一事实源（taxonomy 的 genericNames 与 manifest 不许漂移）
{
  const { command, env } = nodeCommand();
  const r = spawnSync(command, [join(HERE, "build-generic-manifest.mjs"), "--check"], { cwd: ROOT, encoding: "utf8", env });
  // 退出码 2 = 派生源 staging/ 不在本机（不入库）。那是环境事实，不是清单坏了：
  // 报成同一条红会让「别跑这一项」与「重建清单」两条修法混在一句话里，两条都不会被走。
  if (r.status === 2) {
    console.log(`⏭ 通用线清单比对跳过：${(r.stdout || "").trim().split("\n")[0] || "派生源不在本机"}`);
  } else if (r.status !== 0) {
    errors.push(`通用线清单与派生源不一致：${(r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" / ") || "无输出"}`);
  }
  const gnm = /export const SKILLS_GN/.test(catSrc);
  if (!gnm) errors.push("lib/catalog.js 缺 SKILLS_GN —— 通用线未接线，设置页第 28 项会是空页");
  let tax = null;
  try { tax = JSON.parse(readFileSync(join(ROOT, "manifest", "taxonomy-v3.json"), "utf8")); } catch { /* 下面报 */ }
  if (!tax) errors.push("manifest/taxonomy-v3.json 读不到");
  else {
    const a = [...(tax.genericNames || [])].sort().join(",");
    const b = SKILLS_GN.map((s) => s.name).sort().join(",");
    if (a !== b) errors.push(`通用线名单漂移：taxonomy.genericNames(${(tax.genericNames || []).length}) ≠ catalog SKILLS_GN(${SKILLS_GN.length})`);
    // overseas / fullstack 的同形名单一直是**人手维护、无人校验**的死数据（写进 SOP §12 却没有消费者）。
    // 顺手把它变成活的：一条判据同时锁三个名单，成本近乎为零。
    const cmp = (label, taxList, rows) => {
      const x = [...(taxList || [])].sort().join(",");
      const y = rows.map((s) => s.name).sort().join(",");
      if (x !== y) errors.push(`${label}名单漂移：taxonomy(${(taxList || []).length}) ≠ catalog(${rows.length})`);
    };
    cmp("出海", tax.overseasNames, SKILLS);
    cmp("AI全栈", tax.fullstackNames, SKILLS_FS);
  }
  const tiers = [...new Set(SKILLS_GN.map((s) => s.tier))].filter(Boolean);
  const noTier = SKILLS_GN.filter((s) => !s.tier).map((s) => s.name);
  if (noTier.length) errors.push(`通用线缺 tier 行: ${noTier.join(", ")}`);
  if (tiers.some((t) => !["T0", "T1", "T2"].includes(t))) errors.push(`通用线未知 tier: ${tiers.join(", ")}`);
}

// ③ 路由引用悬空（union：catalog + 实际技能目录）
const dirs = new Set(readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
// v3：路由引用可指向 agent 预设（已从技能目录移出，但仍是合法目标）
let presetIds = [];
try {
  const ps = JSON.parse(readFileSync(join(ROOT, "presets", "preset-skills.json"), "utf8"));
  presetIds = (ps.presets || []).map((x) => x.id);
} catch {}
const all = new Set([...names, ...dirs, ...presetIds]);
const refineFiles = ["unify-refine-batch1.json", "unify-refine-batch2.json", "unify-refine-batch3.json"];
let refs = 0, dangling = [];
for (const f of refineFiles) {
  const p = join(ROOT, "scripts", f);
  if (!existsSync(p)) continue;
  const refine = JSON.parse(readFileSync(p, "utf8"));
  for (const [name, spec] of Object.entries(refine)) {
    for (const line of (spec.notUse || [])) {
      for (const ref of line.matchAll(/走\s*([a-z0-9-]+)/g)) {
        refs++;
        if (!all.has(ref[1])) dangling.push(`${name}→${ref[1]}`);
      }
    }
  }
}
if (dangling.length) errors.push(`悬空路由引用 ${dangling.length}: ${dangling.slice(0, 8).join(", ")}`);

// ④ 运行时前提（SOP §12.10）—— 补掉「装了但跑不起来」的假绿。
//    上面三条查的都是「技能引用的 skill id 存在吗」，没有一条查「技能跑得起来吗」。
//    实测 T0 15 条里 4 条装完直接 ImportError / Module not found，而门禁是全绿的。
//
//    判定范围**只包括真正会被挂载的技能**（各 agt preset 的 skill-subset）：一条还没接线
//    的技能不该把所有门禁拖红；但一旦接线，它的运行时前提就必须齐备。
const PRESET_DIR = join(homedir(), ".dsh", ".agent-presets");
const wired = new Set();
if (existsSync(PRESET_DIR)) {
  for (const d of readdirSync(PRESET_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const yml = join(PRESET_DIR, d.name, "agent.cordis.yml");
    if (!existsSync(yml)) continue;
    const m = /id:\s*skill-subset[\s\S]{0,600}?skills:\s*\[([^\]]*)\]/.exec(readFileSync(yml, "utf8"));
    if (!m) continue;
    for (const raw of m[1].split(",")) {
      const name = raw.trim().replace(/^['"]|['"]$/g, "");
      if (name) wired.add(name);
    }
  }
}

let runtimeNote = "未接线（跳过）";
if (!existsSync(DEPS_FILE)) {
  runtimeNote = "无 runtime-deps.json（先跑 scan-runtime-deps.mjs）";
} else if (!wired.size) {
  runtimeNote = "无已接线技能（跳过）";
} else {
  // 走 real-node：pnpm 下 process.execPath 是宿主 Electron，子进程会「退出码 0 且没有输出」（ADR-0040）
  const { command, env } = nodeCommand();
  const r = spawnSync(command, [join(HERE, "scan-runtime-deps.mjs"), "--check", "--json",
    "--subset", [...wired].join(",")], { cwd: ROOT, encoding: "utf8", env });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout || "{}"); } catch { /* 交给下面的报错分支 */ }
  if (!parsed) {
    errors.push(`运行时前提检查未能执行：${(r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" / ") || "无输出"}`);
  } else if (parsed.red?.length) {
    for (const s of parsed.red) errors.push(`运行时前提缺失：${s.skill} 缺 ${s.missing.join(", ")}（跑 scripts/install-runtime-deps.sh）`);
  } else {
    runtimeNote = `已接线 ${parsed.subset} 条 / 需探测 ${parsed.checked} 条 / 全绿`;
  }
}

if (errors.length) {
  console.error("✗ verify_static 失败:");
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
console.log(`✓ verify_static 通过：${CATEGORIES.length} 大场景/${subCount} 细分 + FS ${CATEGORIES_FS.length} 组 / ${SKILLS.length}+${SKILLS_FS.length} 行 + GN ${CATEGORIES_GN.length} 组 / ${SKILLS_GN.length} 行 / 名字唯一 / 图标覆盖（${iconPaintNote}） / ${refs} 条路由引用无悬空 / 三线名单无漂移 / 运行时前提：${runtimeNote}`);
