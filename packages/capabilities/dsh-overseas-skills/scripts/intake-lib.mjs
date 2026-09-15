/**
 * intake-lib.mjs — 新技能入库的共享底座（SOP §12）
 *
 * 抽出来是因为「怎么读一个来件单元」这件事有多个消费者：scan-runtime-deps（抽依赖）、
 * intake-install（装）、intake-lint（结构体检）、intake-dedupe（择优比对）。
 * 一份事实只有一个家 —— 来件布局变了只改这里。
 *
 * 来件布局：<root>/<batch>/{skills/ | skill02/ | *.zip}
 *   kimi          目录      kimi/skills/<name>/
 *   Manus         目录+zip   Manus/skill02/<name>/{,*.zip}   ← 实测是 zip
 *   MinMax        目录      MinMax/skills/<name>/
 *   MinMaxDesign  目录      MinMaxDesign/<name>/
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, extname, relative } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const SKILLS_DIR = process.env.DSH_SKILLS_DIR || join(homedir(), ".dsh", "skills");

export const BATCHES = [
  { dir: "kimi", source: "kimi", nested: "skills" },
  { dir: "Manus", source: "manus", nested: "skill02" },
  { dir: "MinMax", source: "minmax", nested: "skills" },
  { dir: "MinMaxDesign", source: "minmaxdesign", nested: null },
];

/** zip 内条目与目录条目统一用 \0 分成「容器 + 单元内相对路径」两段。 */
const SEP = "\u0000";
export const isZipEntry = (p) => p.includes(SEP);
/** 单元内相对路径 —— 对 zip 与目录**都**成立（早期只处理 zip，导致目录来件的相对路径算成绝对路径，
 *  于是「根级 SKILL.md」这种判据全线误报：实测 15 条里 9 条被误判为"根级无 SKILL.md"）。 */
export const innerPath = (p) => (p.includes(SEP) ? p.split(SEP)[1] : p);
export const isZipContainer = (p) => isZipEntry(p) && p.split(SEP)[0].endsWith(".zip");

const TEXT_EXT = new Set([".md", ".txt", ".py", ".sh", ".js", ".mjs", ".cjs", ".ts", ".json",
  ".yml", ".yaml", ".toml", ".html", ".css", ".csv", ".xml", ".svg", ".ini", ".cfg"]);

/** 列出单元内所有文件（zip 或目录皆可），返回 `<容器>\0<相对路径>` 形式的条目。 */
export function listUnit(unitPath) {
  let st;
  try { st = statSync(unitPath); } catch { return []; }
  if (st.isDirectory()) {
    const out = [];
    const walk = (d, rel) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(p, r);
        else if (e.isFile()) out.push(`${unitPath}${SEP}${r}`);
      }
    };
    walk(unitPath, "");
    return out;
  }
  if (extname(unitPath) === ".zip") {
    try {
      return execFileSync("unzip", ["-Z1", unitPath], { encoding: "utf8" })
        .split("\n").map((s) => s.trim()).filter(Boolean)
        .filter((n) => !n.endsWith("/"))
        .map((n) => `${unitPath}${SEP}${n}`);
    } catch { return []; }
  }
  return [];
}

/** 读一个文件（zip 内条目或目录文件）；非文本/读失败返回 ""。 */
export function readEntry(entry) {
  const rel = innerPath(entry);
  if (!TEXT_EXT.has(extname(rel).toLowerCase())) return "";
  try { return readEntryRaw(entry).toString("utf8"); } catch { return ""; }
}

/** 读原始字节（算 sha256 用；文本读会改字节）。 */
export function readEntryRaw(entry) {
  const [container, rel] = isZipEntry(entry) ? entry.split(SEP) : [null, entry];
  try {
    if (container && container.endsWith(".zip")) {
      return execFileSync("unzip", ["-p", container, rel], { maxBuffer: 64 * 1024 * 1024 });
    }
    return readFileSync(container ? join(container, rel) : entry);
  } catch { return Buffer.alloc(0); }
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** 扫全部来件 → [{ name, source, unit, isZip, files:[entryPath] }] */
export function collectUnits(from, { only = [] } = {}) {
  const out = [];
  for (const b of BATCHES) {
    const base = join(from, b.dir);
    if (!existsSync(base)) continue;
    const scanDir = b.nested ? join(base, b.nested) : base;
    if (!existsSync(scanDir)) continue;
    for (const ent of readdirSync(scanDir)) {
      if (ent.startsWith(".") || ent === "__MACOSX") continue;
      const p = join(scanDir, ent);
      const name = basename(ent, extname(ent));
      const isZip = extname(ent) === ".zip";
      const hasSkill = !isZip && (existsSync(join(p, "SKILL.md")) || existsSync(join(p, "skill.md")));
      if (hasSkill || isZip) out.push({ name, source: b.source, unit: p, isZip, batch: b.dir });
    }
  }
  return only.length ? out.filter((u) => only.includes(u.name)) : out;
}

// ─────────────────────────── frontmatter ───────────────────────────

/** 解析 frontmatter：只认顶层标量行与 `key:` 开头的块，够用且不做 YAML 全解析。 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fields: null, body: text };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line)) continue;   // 跳过缩进的嵌套块
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2];
  }
  return { fields, body: m[2], raw: m[1] };
}

export const jstr = (v) => JSON.stringify(v);

/**
 * 描述行的组合口径 —— 两条线**共用**这一份，只有写进 frontmatter 的形态不同。
 *
 * 片段之间必须带句号 —— 早期用 join("") 会产出「…结构化纪要触发词：会议纪要、…」这种黏连句。
 * 不要在数据侧给 summaryZh 手补句号来绕：那样摘要末尾会多出一个句号，是拿数据补代码的漏。
 */
export function composeDescription(meta) {
  const triggers = (meta.triggers || []).join("、");
  return [
    meta.summaryZh,
    `触发词：${triggers ? triggers + "、" : ""}${meta.name}。`,
    meta.notUse ? `何时不用：${meta.notUse}` : "",
  ].filter(Boolean).map((s) => (/[。！？]$/.test(s) ? s : s + "。")).join("");
}

/**
 * 生成出海/通用线的 frontmatter（§12.3 四件套 + provenance 块）。
 * 值一律 JSON 引号化 —— 中文里的冒号、逗号、引号都会破坏未引号的标量。
 */
export function buildFrontmatter(meta, extra = {}) {
  const description = composeDescription(meta);
  const userSummary = meta.userSummary || meta.summaryZh;

  const lines = ["---", `name: ${jstr(meta.name)}`];
  if (meta.title) lines.push(`title: ${jstr(meta.title)}`);
  if (userSummary) lines.push(`user_summary: ${jstr(userSummary)}`);
  if (meta.userTry) lines.push(`user_try: ${jstr(meta.userTry)}`);
  lines.push(`description: ${jstr(description)}`);
  lines.push("enabled: \"true\"");
  lines.push("user-invocable: true");

  const md = {
    source: "third-party",
    batch: meta.source,
    ...(meta.license ? { license: meta.license } : {}),
    ...(meta.upstream ? { upstream: meta.upstream } : {}),
    ...(extra.sha256 ? { sha256: extra.sha256 } : {}),
    classified_by: "lute-overseas-skills",
    ...(meta.scenario ? { scenario: meta.scenario } : {}),
    ...(meta.sub ? { subcategory: meta.sub } : {}),
  };
  lines.push("metadata:");
  for (const [k, v] of Object.entries(md)) lines.push(`  ${k}: ${jstr(String(v))}`);
  lines.push("---", "");
  return lines.join("\n");
}

/**
 * 生成 AI 全栈线的 frontmatter（SOP §12.9「全栈标准形态」）。
 *
 * 三处与出海/通用线的差异都是**有意**的，不是漏写：
 *
 * 1. 只允许**纯标量行** —— `verify-fullstack.mjs` 的正则就是对这条形状约定的执行。
 * 2. 没有 `user_summary` / `user_try` —— 全栈页的卡片数据取自 `manifest/fullstack-skills.json`，
 *    不读技能自身的 frontmatter，写了也没有消费者。
 * 3. 没有 `metadata:` 块 —— 溯源写进技能目录的 `README.usage.md`（见 intake-install 的 writeUsageReadme）。
 *    这一条是 §12.9 写明的：全栈线把溯源放在侧车里，不放 frontmatter。
 *
 * 实测（2026-09-15）库里 30 条全栈件 30/30 是扁平形态，其中只有 1 条有 README.usage.md——
 * 即那条约定是最近一次单条入库才立的。本函数与 writeUsageReadme 一起把两者都补齐。
 */
export function buildFrontmatterFlat(meta) {
  return [
    "---",
    `name: ${jstr(meta.name)}`,
    `title: ${jstr(meta.title)}`,
    `description: ${jstr(composeDescription(meta))}`,
    "enabled: \"true\"",
    "disable-model-invocation: false",
    "user-invocable: true",
    "---",
    "",
  ].join("\n");
}
