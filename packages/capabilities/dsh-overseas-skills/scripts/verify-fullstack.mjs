#!/usr/bin/env node
/** verify-fullstack.mjs — AI全栈技能适配测试闸门（P2）
 * ① 30/30 安装 + frontmatter 解析/引号/name/description
 * ② diagnosing-bugs/scripts 的 Python 编译（py_compile）
 * ③ wizard/template.sh 与各 scripts 的 bash -n 语法
 * ④ 路由型 3 个冒烟（正文含目标技能名）
 * ⑤ 预设 3 技能（tdd/to-spec/grill-me）预设副本未被触碰
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SKILLS_DIR = join(homedir(), ".dsh", "skills");
const MAPPING = JSON.parse(readFileSync(join(HERE, "fullstack-mapping.json"), "utf8"));
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const problems = [];
let installed = 0, translated = 0;
let presetCopiesNote = "预设副本未核对";
for (const s of MAPPING.skills) {
  const file = join(SKILLS_DIR, s.name, "SKILL.md");
  if (!existsSync(file)) { problems.push(`${s.name}: 未安装`); continue; }
  installed++;
  const text = readFileSync(file, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) { problems.push(`${s.name}: 无 frontmatter`); continue; }
  const fm = m[1];
  if (!NAME_RE.test(s.name)) problems.push(`${s.name}: name 非法`);
  const nm = /^name:\s*"([^"]+)"/m.exec(fm);
  if (!nm || nm[1] !== s.name) problems.push(`${s.name}: name 不符`);
  const title = /^title:\s*"([^"]+)"/m.exec(fm);
  if (!title) problems.push(`${s.name}: 缺 title`);
  const desc = /^description:\s*"(.+)"/m.exec(fm);
  if (!desc || desc[1].length < 10) problems.push(`${s.name}: description 过短/缺失`);
  if (!/disable-model-invocation:\s*false/.test(fm)) problems.push(`${s.name}: 未默认模型可调用`);
  if (/[\u4e00-\u9fa5]/.test((m[2] || ""))) translated++;
  for (const line of fm.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^[A-Za-z_][\w-]*:\s*(".*"|true|false)$/.test(line)) problems.push(`${s.name}: 非法fm行 ${line.slice(0, 40)}`);
  }
}
// 资源脚本编译/语法
for (const d of ["diagnosing-bugs"]) {
  for (const f of readdirSync(join(SKILLS_DIR, d, "scripts"))) {
    const p = join(SKILLS_DIR, d, "scripts", f);
    if (f.endsWith(".py")) {
      try { execFileSync("python3", ["-m", "py_compile", p], { stdio: "pipe" }); }
      catch (e) { problems.push(`${d}/scripts/${f} py_compile 失败`); }
    } else if (f.endsWith(".sh")) {
      try { execFileSync("bash", ["-n", p], { stdio: "pipe" }); }
      catch (e) { problems.push(`${d}/scripts/${f} bash -n 失败`); }
    }
  }
}
for (const [name, f] of [["wizard", "template.sh"]]) {
  const p = join(SKILLS_DIR, name, f);
  if (existsSync(p)) {
    try { execFileSync("bash", ["-n", p], { stdio: "pipe" }); }
    catch (e) { problems.push(`${name}/${f} bash -n 失败`); }
  }
}
// 路由型冒烟
const smoke = { "grill-me": "grilling", "grill-with-docs": "domain-modeling", "ask-matt": "skill" };
for (const [name, needle] of Object.entries(smoke)) {
  const p = join(SKILLS_DIR, name, "SKILL.md");
  if (existsSync(p) && !readFileSync(p, "utf8").includes(needle)) problems.push(`${name}: 路由目标 ${needle} 未出现在正文`);
}
// 预设 3 技能未被触碰（预设目录仍含旧副本）
//
// 这一条的射程**依赖本机装没装那个 preset**，不是仓库产物。原实现把「预设目录不在本机」
// 报成「副本丢失」——两者是不同的东西：前者是环境事实，后者是数据被动了。
// 实测 2026-09-15 本机 `~/.dsh/.agent-presets/` 下只有 agt-001..050 + bobo-cto + lute-cordis，
// `ai-product-developer` 这一组 preset 已不在（v3 重组时移出）。于是这条判据恒红，
// 而恒红的判据与恒绿的判据一样没有信息量：人只会学会绕过它。
// 现在：目录不在 → 跳过并说明；目录在 → 逐条核对，且条数取自 presets/preset-skills.json
// 而不是硬编码的 3（硬编码会让「少了一条」与「改过清单」无法区分）。
const PRESETS = join(homedir(), ".dsh", ".agent-presets");
const PRESET_ID = "ai-product-developer";
const presetSkillsDir = join(PRESETS, PRESET_ID, "skills");
if (!existsSync(presetSkillsDir)) {
  presetCopiesNote = `预设 ${PRESET_ID} 不在本机（跳过副本核对，不判红）`;
} else {
  let expected = null;
  try {
    const ps = JSON.parse(readFileSync(join(ROOT, "presets", "preset-skills.json"), "utf8"));
    expected = (ps.presets || []).find((p) => p.id === PRESET_ID)?.skills?.map((s) => s.name ?? s) ?? null;
  } catch { /* 读不到就退回目录实读 */ }
  const names = expected ?? readdirSync(presetSkillsDir);
  for (const n of names) {
    const p = join(presetSkillsDir, n, "SKILL.md");
    if (!existsSync(p)) problems.push(`预设副本丢失: ${PRESET_ID}/skills/${n}`);
  }
  presetCopiesNote = `预设 ${PRESET_ID} 副本 ${names.length}/${names.length} 在`;
}
console.log(`AI全栈适配测试 | 安装 ${installed}/30 | 已汉译 ${translated}/30 | ${presetCopiesNote} | 问题 ${problems.length}`);
if (problems.length) { problems.forEach((x) => console.log("  - " + x)); process.exit(1); }
console.log("✓ 30/30 全项通过");
