#!/usr/bin/env node
/**
 * 证据语料补齐器 —— 把 AI全栈线上**尚未收录**的技能正文快照补进
 * `manifest/skill-evidence-corpus.json`。
 *
 * ## 为什么需要它（而不是再手写一次 JSON）
 *
 * `scripts/validate_assignments.py` 的 J2 判据要求 `evidence.from_skill` 是
 * **技能原文的连续子串**。原文从哪来？就是这份语料。语料缺一条技能意味着：
 * 该技能的归位判定**无法被机械复核**——校验器会把 `from_skill` 记成
 * 「不可复核」并单独计数（绝不计入通过）。于是「覆盖率」就成了归位表可信度的
 * 分母，而分母只能靠手工补 JSON 来维持，这在本仓库是已知的复发故障形态
 * （「一条事实多个家」+「写了但从没跑到」）。
 *
 * 本批 40 条全栈件入场时，语料仍是 T0 那批的 251 条快照——40 条新技能
 * 全在语料之外。这个脚本把「语料覆盖 = 目录里每条技能」变成一条**可重跑的
 * 机械断言**，而不是一次性的手工补齐。
 *
 * ## 两条不可牺牲的纪律
 *
 * 1. **既有条目逐字节不动。** 出海线 251 条的 `body_excerpt` 抓自 Accio 导入时
 *    的另一份源头，本机已无那份原文。用「当前已装技能」去重算它们，等于**悄悄
 *    换掉判据的基准**——昨天复核通过的证据今天可能不再成立，而没有任何输出会
 *    提示这件事。所以本脚本只**追加**，绝不重写既有键。
 * 2. **序列化格式必须与既有文件同形。** 文件是 `json.dumps(indent=1) + "\n"`。
 *    写盘前先证明「零改动往返逐字节相同」，不相同就拒绝写盘（--write 时）。
 *    否则一次补齐会炸出全文件 diff，把真实改动埋掉。
 *
 * ## 用法
 *
 *     node scripts/build-evidence-corpus.mjs            # 只报告缺口（默认，不写盘）
 *     node scripts/build-evidence-corpus.mjs --write    # 补齐并写盘
 *     node scripts/build-evidence-corpus.mjs --check    # 有缺口即退出码 1（供门禁用）
 *
 * 退出码：0 = 无缺口（或 --write 成功）；1 = 有缺口（--check）；2 = 输入缺失/格式不符。
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SKILLS_DIR, parseFrontmatter } from "./intake-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const CORPUS = join(ROOT, "manifest", "skill-evidence-corpus.json");
const FULLSTACK = join(ROOT, "manifest", "fullstack-skills.json");

/** `body_excerpt` 的长度上限 —— 既有 251 条里最长的一条正好是 1400。 */
const EXCERPT_MAX = 1400;

/** 与既有文件同形：indent=1、保留键序、不转义非 ASCII、末尾换行。 */
const serialize = (obj) => JSON.stringify(obj, null, 1) + "\n";

/** 找已装技能正文；SKILL.md / skill.md 两种大小写都认（与 intake-lib 同口径）。 */
function readInstalledBody(name) {
  for (const fname of ["SKILL.md", "skill.md"]) {
    const p = join(SKILLS_DIR, name, fname);
    if (!existsSync(p)) continue;
    const { fields, body } = parseFrontmatter(readFileSync(p, "utf8"));
    return { path: p, fields: fields || {}, body };
  }
  return null;
}

/** frontmatter 的标量值可能被 JSON 引号化（本包 buildFrontmatter 就是这么写的）。 */
function scalar(v) {
  if (typeof v !== "string") return "";
  const m = /^"(.*)"$/s.exec(v.trim());
  if (!m) return v.trim();
  try {
    return JSON.parse(v.trim());
  } catch {
    return m[1];
  }
}

function buildEntry(name) {
  const src = readInstalledBody(name);
  if (!src) return { error: `已装目录里找不到 ${name}/SKILL.md（技能未安装？）` };
  const title = scalar(src.fields.title);
  const description = scalar(src.fields.description);
  if (!description) return { error: `${name}/SKILL.md 的 frontmatter 没有 description` };
  const body = src.body.replace(/^\n+/, "");
  return {
    entry: {
      title,
      summary_zh: "",
      description,
      body_excerpt: body.slice(0, EXCERPT_MAX),
    },
    src: src.path,
    bodyLen: body.length,
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const check = args.has("--check");

  if (!existsSync(CORPUS)) {
    console.error(`✗ 语料文件不存在：${CORPUS}`);
    process.exit(2);
  }
  if (!existsSync(FULLSTACK)) {
    console.error(`✗ 全栈目录不存在：${FULLSTACK}`);
    process.exit(2);
  }

  const raw = readFileSync(CORPUS, "utf8");
  const corpus = JSON.parse(raw);

  // 格式守卫：先证明零改动往返逐字节相同，否则后续写入会污染全文件 diff。
  if (serialize(corpus) !== raw) {
    console.error("✗ 序列化守卫失败：重新序列化语料与磁盘文件不一致。");
    console.error("  说明该文件的排版口径与本脚本不同（期望 indent=1 + 末尾换行）。");
    console.error("  拒绝继续——否则补齐会炸出全文件 diff，把真实改动埋掉。");
    process.exit(2);
  }

  const skills = corpus.skills || {};
  const catalog = JSON.parse(readFileSync(FULLSTACK, "utf8"));
  const names = (catalog.skills || []).map((s) => s.name);

  const missing = names.filter((n) => !(n in skills));
  if (!missing.length) {
    console.log(`✓ 语料已覆盖全部 ${names.length} 条全栈技能，无缺口（既有 ${Object.keys(skills).length} 条）`);
    process.exit(0);
  }

  console.log(`语料缺口 ${missing.length} 条（既有 ${Object.keys(skills).length} 条 / 全栈目录 ${names.length} 条）：`);
  const built = [];
  const errors = [];
  for (const name of missing) {
    const r = buildEntry(name);
    if (r.error) {
      errors.push(`${name}：${r.error}`);
      console.log(`  ✗ ${name} — ${r.error}`);
      continue;
    }
    built.push([name, r.entry]);
    console.log(`  · ${name} → ${r.entry.body_excerpt.length}/${r.bodyLen} 字符  〔${r.src}〕`);
  }

  if (errors.length) {
    console.error(`\n✗ ${errors.length} 条无法构造，未写盘。`);
    process.exit(2);
  }

  if (check) {
    console.error(`\n✗ --check：语料缺 ${built.length} 条，需运行 --write 补齐。`);
    process.exit(1);
  }
  if (!write) {
    console.log(`\n（默认只报告。加 --write 补进 manifest/skill-evidence-corpus.json）`);
    process.exit(0);
  }

  // 按全栈目录顺序追加到末尾，保持既有 251 条的相对顺序不变。
  for (const [name, entry] of built) skills[name] = entry;

  const total = Object.keys(skills).length;
  const meta = corpus._meta || (corpus._meta = {});
  meta.what = `${total} 条技能正文的**证据快照**，供 scripts/validate_assignments.py 复核 from_skill 是否为原文连续子串。`;
  meta.generated = `${(meta.generated || "").split(" / ")[0] || "2026-09-12（原抓取）"} / ${
    new Date().toISOString().slice(0, 10)
  } 由 scripts/build-evidence-corpus.mjs 补齐 AI全栈线`;
  meta.scope_limit = `覆盖 ${total} 条（出海线 251 条取自 Accio 导入时的正文抓取；AI全栈线由 scripts/build-evidence-corpus.mjs 从**已装技能**的 SKILL.md 抽取）。复核时按**覆盖率**报，覆盖不到的按「不可复核」计数，不得计入通过。`;

  writeFileSync(CORPUS, serialize(corpus), "utf8");
  console.log(`\n✓ 已补齐 ${built.length} 条 → 语料共 ${total} 条`);
}

main();
