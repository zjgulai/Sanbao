#!/usr/bin/env node
/**
 * promote-intake-batch.mjs — 把「本批新技能的四件套片段」提升为四处落点（SOP §12.4 / §12.9）。
 *
 * ## 为什么要有这个脚本
 *
 * 一批技能的四件套（name/title/summaryZh/triggers/notUse/…）落地时要写进**四个不同文件**：
 *
 *  ① `staging/intake-localize.json`   —— 安装器读它写 frontmatter（四件套）
 *  ② `scripts/fullstack-mapping.json` —— 安装与图标管线的事实源（src/name/title/cat/summaryZh）
 *  ③ `manifest/fullstack-skills.json` —— catalog 构建读的发布副本
 *  ④ `manifest/taxonomy-v3.json`      —— `fullstackNames` 名单 + `mapping[name]`
 *
 * 这四处的事实源**是同一份**（就是本批的四件套）。分开手写就会漂移，而漂移的形态很隐蔽：
 * `verify_static.mjs` 有一条判据在锁 ③ 与 ④ 的名单一致，所以手写漏一处会红；但 ① 与 ② 之间
 * 没有任何判据，漏写只会表现为「这条技能装了但没进全栈页」。一个脚本写四处，把「记得改」变成
 * 「改不了漏」（ADR-0009）。
 *
 * ## 排版不许被顺手改掉
 *
 * 四个文件的排版风格**不一样**：`fullstack-mapping.json` 是手写的一个对象一行，另外三个是
 * 标准缩进。用同一种序列化器重写前者会炸出两百多行格式噪音，把真实改动埋掉。
 * 所以每个文件配自己的 writer，并在**写盘之前**做一次「零改动往返必须逐字节相同」的自检——
 * 自检不过就拒绝写盘，而不是写完再让人去 diff 里找噪音。
 *
 * ## 用法
 *
 *   node scripts/promote-intake-batch.mjs --fragments a.json b.json --dry   # 只看计划
 *   node scripts/promote-intake-batch.mjs --fragments /tmp/fs40-out/batch-*.json
 *
 * 幂等：按 `name` 判重。**已存在即报冲突并退出 1**，绝不静默覆盖——
 * 覆盖一条已发布的手写四件套是数据损失。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const LOCALIZE = path.join(ROOT, "staging", "intake-localize.json");
const MAPPING = path.join(HERE, "fullstack-mapping.json");
const SKILLS_FS = path.join(ROOT, "manifest", "fullstack-skills.json");
const TAXONOMY = path.join(ROOT, "manifest", "taxonomy-v3.json");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
/**
 * `--refresh`：允许更新**已存在**的条目，并逐字段打印「旧 → 新」。
 *
 * 为什么需要它：四件套是人和子代理**写出来的**，写完还会改措辞（实测本批 40 条里有 8 条、
 * 共 9 个字段在首轮归位之后被改过）。默认的追加模式按 name 判重、冲突即停——那是为了防止
 * 「静默覆盖已发布的手写数据」，这个保护是对的；但缺了受控的更新通路，结果会是
 * 「事实源里躺着旧措辞，而没人知道」。所以：更新必须显式要求，且必须把每一处改动打出来。
 */
const REFRESH = argv.includes("--refresh");
const fi = argv.indexOf("--fragments");
const FRAGMENTS = fi >= 0 ? argv.slice(fi + 1).filter((a) => !a.startsWith("--")) : [];

/** 全栈线共享的 taxonomy 落点（SOP §12.9：`mapping["<name>"] = "h2-agent-skill"`）。 */
const FS_SUB = "h2-agent-skill";
const REQUIRED = ["src", "name", "source", "title", "summaryZh", "triggers", "catalog", "license"];

/** 四件套落点允许写入的键（片段里的临时字段如 `_from` 不进事实源）。 */
const SCHEMA = ["src", "name", "source", "title", "summaryZh", "userSummary", "triggers",
  "notUse", "userTry", "catalog", "cat", "genericGroup", "noRoleKind", "noRoleReason",
  "scenario", "sub", "license", "upstream"];

const say = (s = "") => console.log(s);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** 紧凑 writer：复现 `fullstack-mapping.json` 手写的「一个对象一行」风格。 */
function writeCompact(obj, keys, lastKey) {
  const L = ["{"];
  for (const k of keys) {
    const arr = obj[k];
    L.push(`  ${JSON.stringify(k)}: [`);
    arr.forEach((item, i) => {
      const body = Object.entries(item).map(([kk, vv]) => `${JSON.stringify(kk)}: ${JSON.stringify(vv)}`).join(", ");
      L.push(`    { ${body} }${i < arr.length - 1 ? "," : ""}`);
    });
    L.push(`  ]${k === lastKey ? "" : ","}`);
  }
  L.push("}");
  return L.join("\n") + "\n";
}

const WRITERS = {
  [LOCALIZE]: (o) => JSON.stringify(o, null, 2) + "\n",
  [MAPPING]: (o) => writeCompact(o, ["categories", "skills"], "skills"),
  // 尾随换行不是风格问题：`build-fullstack-catalog.mjs:201` 写这份文件时就是
  // `${JSON.stringify(manifest, null, 2)}\n`，而本函数原先漏了 `+ "\n"`，
  // 于是下面那条「零改动往返必须逐字节相同」的自检**对任何输入都失败**——
  // 它挡住的是它自己。实测（2026-09-18）：本工具自那次改动起一直退出 2，
  // 因为没有任何调用方而无人察觉（P-03「写了但从没跑到」的同族）。
  [SKILLS_FS]: (o) => JSON.stringify(o, null, 2) + "\n",
  // 同一条：taxonomy-v3.json 也带尾随换行（实测 file 26,317B / writer 26,316B）。
  [TAXONOMY]: (o) => JSON.stringify(o, null, 2) + "\n",
};

if (!FRAGMENTS.length) {
  console.error("✗ 用法：node scripts/promote-intake-batch.mjs --fragments <片段.json> [更多片段…] [--dry]");
  process.exit(2);
}

// ── 读片段 ──────────────────────────────────────────────────────────────
const entries = [];
for (const f of FRAGMENTS) {
  if (!fs.existsSync(f)) { console.error(`✗ 片段不存在：${f}`); process.exit(2); }
  const arr = readJson(f);
  if (!Array.isArray(arr)) { console.error(`✗ 片段不是数组：${f}`); process.exit(2); }
  for (const e of arr) entries.push({ ...e, _from: path.basename(f) });
}

// ── 片段形状校验（在写盘之前停住）──────────────────────────────────────
const problems = [];
const seen = new Set();
for (const e of entries) {
  const miss = REQUIRED.filter((k) => e[k] === undefined || e[k] === "");
  if (miss.length) problems.push(`${e.name || e.src || "?"}（${e._from}）：缺字段 ${miss.join(", ")}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.name || "")) problems.push(`${e.name}：name 不是 kebab-case`);
  if (e.name !== e.src) problems.push(`${e.name}：name 与 src 不一致（src=${e.src}）——安装器按键匹配来件单元`);
  if (!Array.isArray(e.triggers) || !e.triggers.length) problems.push(`${e.name}：triggers 为空数组`);
  if (seen.has(e.name)) problems.push(`${e.name}：片段内重复`);
  seen.add(e.name);
  // 全栈线的正文汉译是**强制**的（SOP §12.9）。缺译文时安装器不会报错——它会回退英文原文，
  // 只在报告里轻声写一句「未汉译」。那正是「假绿」的形态：门禁全过，线上一半是英文。
  // 所以在归位这一步就把它挡住：没有译文，四条落点一条都不写。
  if (e.catalog === "fs") {
    const zh = path.join(ROOT, "staging", "translations", `${e.name}.body.md`);
    if (!fs.existsSync(zh)) problems.push(`${e.name}：缺正文汉译 staging/translations/${e.name}.body.md（全栈线强制）`);
    else if (fs.statSync(zh).size < 400) problems.push(`${e.name}：译文只有 ${fs.statSync(zh).size} 字节，疑似空壳或截断`);
  }
}
if (problems.length) {
  say("✗ 片段校验不通过：");
  for (const p of problems) say(`  - ${p}`);
  process.exit(1);
}

// ── 读四个落点 ──────────────────────────────────────────────────────────
const files = { [LOCALIZE]: readJson(LOCALIZE), [MAPPING]: readJson(MAPPING), [SKILLS_FS]: readJson(SKILLS_FS), [TAXONOMY]: readJson(TAXONOMY) };

// ── 写盘前自检：零改动往返必须逐字节相同 ─────────────────────────────────
// 这一条防的是「一次加 40 条，顺手把几百行格式改了」——那种 diff 里真实改动会被噪音埋掉，
// 而 review 的人只会看到「好多行」。
for (const [p, w] of Object.entries(WRITERS)) {
  const before = fs.readFileSync(p, "utf8");
  if (w(files[p]) !== before) {
    say(`✗ 排版自检失败：${path.relative(ROOT, p)} 的 writer 不能逐字节复现原文件。`);
    say("  先修 writer 再跑——否则本次提交会带上大量格式噪音。");
    process.exit(2);
  }
}

// ── 冲突检查（四处都查；`--refresh` 下改为「更新」而不是报错）──────────────
const loc = files[LOCALIZE], mapping = files[MAPPING], skillsFs = files[SKILLS_FS], tax = files[TAXONOMY];
const catTitle = Object.fromEntries(mapping.categories.map((c) => [c.key, c.title]));
const conflicts = [];
for (const e of entries) {
  if (e.catalog === "fs" && e.cat && !catTitle[e.cat]) {
    conflicts.push(`${e.name}: 未知分组 ${e.cat}（可用：${Object.keys(catTitle).join(", ")}）`);
  }
  if (REFRESH) continue;
  if ((loc.skills || []).some((s) => s.name === e.name)) conflicts.push(`intake-localize.json 已有 ${e.name}`);
  if (e.catalog === "fs") {
    if ((mapping.skills || []).some((s) => s.name === e.name)) conflicts.push(`fullstack-mapping.json 已有 ${e.name}`);
    if ((skillsFs.skills || []).some((s) => s.name === e.name)) conflicts.push(`fullstack-skills.json 已有 ${e.name}`);
    if ((tax.fullstackNames || []).includes(e.name)) conflicts.push(`taxonomy.fullstackNames 已有 ${e.name}`);
  }
}
if (conflicts.length) {
  say(`✗ ${REFRESH ? "分组校验不通过" : "冲突（已存在，不覆盖；要更新请显式加 --refresh）"}：`);
  for (const c of conflicts) say(`  - ${c}`);
  process.exit(1);
}

// ── 计划 ────────────────────────────────────────────────────────────────
const fsEntries = entries.filter((e) => e.catalog === "fs");
const newEntries = entries.filter((e) => !(loc.skills || []).some((s) => s.name === e.name));
say(`片段 ${FRAGMENTS.length} 个 · 条目 ${entries.length} 条（其中 catalog=fs ${fsEntries.length} 条）`);
if (REFRESH) {
  say(`  新增 ${newEntries.length} 条 / 更新 ${entries.length - newEntries.length} 条（--refresh）`);
} else {
  say(`  ① intake-localize.json   : ${(loc.skills || []).length} → ${(loc.skills || []).length + entries.length}`);
  if (fsEntries.length) {
    say(`  ② fullstack-mapping.json : ${mapping.skills.length} → ${mapping.skills.length + fsEntries.length}`);
    say(`  ③ fullstack-skills.json  : ${skillsFs.skills.length} → ${skillsFs.skills.length + fsEntries.length}`);
    say(`  ④ taxonomy.fullstackNames: ${tax.fullstackNames.length} → ${tax.fullstackNames.length + fsEntries.length}（追加到末尾，不重排）`);
  }
}

if (DRY) { say("\n（--dry：未写盘）"); process.exit(0); }

// ── 应用 ────────────────────────────────────────────────────────────────
const changes = [];
const trimmed = (e) => {
  const out = {};
  for (const k of SCHEMA) if (e[k] !== undefined) out[k] = e[k];
  return out;
};

if (REFRESH) {
  // 更新已存在条目：只动片段里给了的字段，逐字段记差异。
  for (const e of entries) {
    const i = (loc.skills || []).findIndex((s) => s.name === e.name);
    const patch = trimmed(e);
    if (i < 0) { loc.skills = [...(loc.skills || []), patch]; continue; }
    for (const [k, v] of Object.entries(patch)) {
      if (JSON.stringify(loc.skills[i][k]) === JSON.stringify(v)) continue;
      changes.push(`intake-localize.json ${e.name}.${k}\n      旧: ${JSON.stringify(loc.skills[i][k])}\n      新: ${JSON.stringify(v)}`);
      loc.skills[i] = { ...loc.skills[i], [k]: v };
    }
  }
  for (const e of fsEntries) {
    const m = mapping.skills.find((s) => s.name === e.name);
    if (m) {
      for (const [k, v] of Object.entries({ title: e.title, cat: e.cat, summaryZh: e.summaryZh })) {
        if (m[k] === v) continue;
        changes.push(`fullstack-mapping.json ${e.name}.${k}\n      旧: ${JSON.stringify(m[k])}\n      新: ${JSON.stringify(v)}`);
        m[k] = v;
      }
    } else mapping.skills.push({ src: e.src, name: e.name, title: e.title, cat: e.cat, summaryZh: e.summaryZh });

    const s = skillsFs.skills.find((x) => x.name === e.name);
    const row = {
      name: e.name, title: e.title, category: e.cat, categoryTitle: catTitle[e.cat],
      toolBacked: false, summaryZh: e.summaryZh, toolGap: "", icon: s?.icon ?? "",
    };
    if (s) {
      for (const k of ["title", "category", "categoryTitle", "summaryZh"]) {
        if (JSON.stringify(s[k]) === JSON.stringify(row[k])) continue;
        changes.push(`fullstack-skills.json ${e.name}.${k}\n      旧: ${JSON.stringify(s[k])}\n      新: ${JSON.stringify(row[k])}`);
        s[k] = row[k];
      }
    } else skillsFs.skills.push(row);

    if (!(tax.fullstackNames || []).includes(e.name)) tax.fullstackNames = [...tax.fullstackNames, e.name];
    tax.mapping = { ...tax.mapping, [e.name]: FS_SUB };
  }
} else {
  loc.skills = [...(loc.skills || []), ...entries.map(trimmed)];
  if (fsEntries.length) {
    mapping.skills = [...mapping.skills, ...fsEntries.map((e) => ({
      src: e.src, name: e.name, title: e.title, cat: e.cat, summaryZh: e.summaryZh,
    }))];
    skillsFs.skills = [...skillsFs.skills, ...fsEntries.map((e) => ({
      name: e.name, title: e.title, category: e.cat, categoryTitle: catTitle[e.cat],
      toolBacked: false, summaryZh: e.summaryZh, toolGap: "", icon: "",
    }))];
    // 追加而不是重排：这个名单一直是这样长出来的（末尾那条 simplify-codebase 就是上次追加的），
    // 排序会把那一条挪位置、给 diff 添一处与本次无关的改动。
    tax.fullstackNames = [...(tax.fullstackNames || []), ...fsEntries.map((e) => e.name)];
    tax.mapping = { ...tax.mapping };
    for (const e of fsEntries) tax.mapping[e.name] = FS_SUB;
  }
}

if (changes.length) {
  say(`\n改动 ${changes.length} 处：`);
  for (const c of changes) say(`  · ${c}`);
}

for (const [p, w] of Object.entries(WRITERS)) fs.writeFileSync(p, w(files[p]));

say("\n✓ 已写盘：");
say(`  ${path.relative(ROOT, LOCALIZE)}`);
if (fsEntries.length) {
  for (const p of [MAPPING, SKILLS_FS, TAXONOMY]) say(`  ${path.relative(ROOT, p)}`);
}
if (changes.length) {
  say("\n注意：改了措辞的条目要重装才会反映到技能目录的 frontmatter：");
  say("  node scripts/intake-install.mjs --skills <改动过的名字> --force");
}
say("\n下一步：intake-install.mjs --skills <名单> → 图标 → build_preset_catalog.py → 门禁");
