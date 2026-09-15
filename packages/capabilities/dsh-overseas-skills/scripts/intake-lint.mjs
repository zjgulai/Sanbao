#!/usr/bin/env node
/**
 * intake-lint.mjs — 第三方技能结构体检（SOP §12.1 落目录前的准入）
 *
 * 判据全部来自实测缺陷，不是想象出来的：
 *   F1 坏文件        chart-gen/scripts/package.json 在来件里是二进制垃圾 → 依赖抽取与脚本都跑不了
 *   F2 硬编码沙箱路径 chart-gen 正文写死 `/data/clawd/skills/chart-image/scripts`
 *                     —— 那是原厂沙箱里的路径，本机必然不存在，技能"装了但跑不起来"的另一种形态
 *   F3 双层嵌套      stock-analysis/stock-analysis/SKILL.md（解包时多套了一层）
 *   F4 __MACOSX 垃圾 skill-creator 携带 __MACOSX/ 与 ._* 资源分支文件
 *   F5 断引用        引用 ../../CONNECTORS.md 之类未随附的文件（技能里点了打不开）
 *   F6 带 .git       入库会改写 frontmatter，带 .git 每次更新都要 stash 重放（§12.2）
 *   F7 frontmatter   缺 name / 无 frontmatter → 装了也不会被识别
 *   F8 name 不符     frontmatter name 与目录名不一致 → preset subset 引不到
 *
 * fatal = 拒绝安装；warn = 装但在报告里点名。
 * 退出码：有 fatal 为 1，仅 warn 为 0。
 *
 * 用法：
 *   node scripts/intake-lint.mjs              # 扫全部来件，出汇总
 *   node scripts/intake-lint.mjs --skills a,b
 *   node scripts/intake-lint.mjs --json
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectUnits, listUnit, readEntry, readEntryRaw, innerPath, parseFrontmatter } from "./intake-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FROM = process.env.DSH_INTAKE_FROM || path.join(process.env.HOME, "Downloads", "skills");

const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const si = argv.indexOf("--skills");
const ONLY = si >= 0 ? (argv[si + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];

/** 原厂沙箱/作者机器的绝对路径前缀 —— 在本机一定不存在。 */
const FOREIGN_ROOTS = ["/data/clawd", "/home/oai", "/home/user", "/mnt/data", "/workspace", "/app/", "/root/"];
/** 二进制/损坏文件的判据：含 NUL 字节。 */
const hasNul = (buf) => buf.subarray(0, 4096).includes(0);

/**
 * 损坏文件分两档 —— 差别是「技能还能不能用」：
 *   代码/数据被毁 → 技能真的跑不起来 → 致命
 *   厂商标记被毁 → 删掉即可，技能不受影响 → 告警
 * 实测 kimi 批次有系统性的 `_meta.json` 损坏（14+ 条），把它算致命会让整批看起来全废。
 */
const VENDOR_META = /(^|\/)(_meta\.json|metadata\.json|clawhub\.json|skill-info\.json|LICENSE(\.txt|\.md)?|THIRD_PARTY_NOTICES(\.txt|\.md)?|env\.example\.txt|test_[a-z_]*\.json|\.DS_Store)$/i;
const CODE_EXT = /\.(js|mjs|cjs|py|sh|ts)$/i;

export function lintUnit(unit) {
  const fatal = [], warn = [];
  const entries = listUnit(unit.unit);
  if (!entries.length) { fatal.push("来件为空或无法读取"); return { fatal, warn, stats: {} }; }

  const rels = entries.map(innerPath);
  const skillEntries = rels.filter((r) => /(^|\/)SKILL\.md$/i.test(r));
  const stats = { files: rels.length, skillMd: skillEntries.length };

  // F3 根级无 SKILL.md —— 要分清两种截然不同的情况：
  //   (a) 多技能包：来件里有 N 个子技能，需要**拆成 N 条**，不是坏了（实测 gitlab-cli-guide 有 glab-mr/glab-gpg-key）
  //   (b) 双层嵌套：只有一个子 SKILL.md 且子目录名 == 单元名，是解包多套了一层，**拆壳即可**
  const rootSkill = skillEntries.find((r) => r.split("/").length === 1);
  let unwrapPrefix = null;
  if (!rootSkill) {
    const deep = skillEntries.filter((r) => r.split("/").length >= 2);
    const firstSeg = new Set(deep.map((r) => r.split("/")[0]));
    if (deep.length > 1 && firstSeg.size > 1) {
      warn.push(`多技能包：含 ${deep.length} 个子技能（${[...firstSeg].slice(0, 3).join(", ")}），需拆成多条，不是单条技能`);
    } else if (deep.length >= 1 && (firstSeg.size === 1) && [...firstSeg][0] === unit.name) {
      unwrapPrefix = [...firstSeg][0];
      warn.push(`双层嵌套：实际技能在 ${unwrapPrefix}/ 下，拆壳即可（安装时自动拆）`);
    } else if (deep.length === 0) {
      fatal.push("无 SKILL.md");
    } else {
      warn.push(`根级无 SKILL.md，子技能在 ${[...firstSeg].slice(0, 3).join(", ")}/ 下`);
    }
  }
  // F4 __MACOSX / ._ 资源分支
  const junk = rels.filter((r) => /(^|\/)__MACOSX(\/|$)/.test(r) || /(^|\/)\._/.test(r) || /(^|\/)\.DS_Store$/.test(r));
  if (junk.length) warn.push(`__MACOSX/._ 垃圾 ${junk.length} 项（安装时已过滤）`);
  // F6 .git
  if (rels.some((r) => /(^|\/)\.git(\/|$)/.test(r))) fatal.push("带 .git（§12.2 明令不得保留）");

  // F1 坏文件 —— 跳过 __MACOSX/.（已单独告警；它们永远是坏的，不是新信息）
  const corruptVendor = [], corruptCode = [];
  for (const e of entries) {
    const rel = innerPath(e);
    if (/(^|\/)(__MACOSX|\._)/.test(rel)) continue;
    if (!/\.(json|md|py|js|mjs|cjs|ts|sh|ya?ml|toml|csv|txt|html)$/i.test(rel)) continue;
    const buf = readEntryRaw(e);
    if (!buf.length || !hasNul(buf)) continue;
    (VENDOR_META.test(rel) ? corruptVendor : corruptCode).push(rel);
  }
  if (corruptCode.length) {
    const essential = corruptCode.filter((r) => CODE_EXT.test(r));
    fatal.push(`坏文件（含 NUL 字节）${corruptCode.length} 个${essential.length ? "，含可执行代码" : ""}：${corruptCode.slice(0, 4).join(", ")}`);
  }
  if (corruptVendor.length) warn.push(`厂商标记文件损坏 ${corruptVendor.length} 个（安装时丢弃）：${corruptVendor.slice(0, 4).join(", ")}`);

  // 只扫正文类文件做 F2/F5
  const textFiles = entries.filter((e) => /\.(md|txt|py|js|mjs|sh|ya?ml|toml|json)$/i.test(innerPath(e)));
  const foreign = new Map();
  const brokenRefs = new Map();
  const present = new Set(rels);

  for (const e of textFiles) {
    const rel = innerPath(e);
    const text = readEntry(e);
    if (!text) continue;
    // F2 硬编码外部绝对路径
    for (const m of text.matchAll(/(?:^|[\s"'`(=[])((?:\/data\/clawd|\/home\/oai|\/home\/user|\/mnt\/data|\/workspace|\/root)\/[\w./@-]*)/g)) {
      if (!foreign.has(m[1])) foreign.set(m[1], rel);
    }
    // 射程的三种形态都不是想象出来的——②③ 是 2026-09-15 实测补上的，此前它的名字比射程大：
    //   ① markdown 链接 `](./x.md)` / `](../x.md)`（原实现，至今仍是最准的一类）
    //   ② 裸相对链接 `](references/x.md)` —— 不带 ./ 前缀，同样是相对引用，此前一条都不查
    //   ③ **SKILL.md 里以 `references/` 开头的行内代码路径**（见下方窄射程说明）
    // 为什么 ③ 的射程这么窄：实测根因是「判据分不出『这个文件必须存在』与『举例时提到一个路径』」。
    // 放开成「SKILL.md 里所有行内代码路径」→ 40 条来件得 9 条告警，其中 8 条假红，全是
    // **技能将要创建的文件**或**模板占位**：`tasks/plan.md`、`skills/*/SKILL.md`、
    // `exact/path/to/file.py`、`.claude/typescript.md`、`references/[domain].md`。
    // 收到「`references/` 前缀 + 排除 `[ < * {` 占位符」后，只剩真缺陷。
    // ② 保留但**噪声明确**：40 条来件里它贡献的 3 条全是示例路径（`.claude/*.md`、`docs/CONTRIBUTING.md`）。
    // 之所以不revert ②：一种是「技能让用户自己建的文件」（假红），另一种是「随包该有却漏了」
    // （真缺陷），两者文字上分不开；宁可让人扫一眼 3 条清单，也不要让真断链一条都报不出来。
    // 注意：`../../` 形态按下面的 `startsWith("..")` 一律跳过，所以 observability 那条
    // （`../../references/observability-checklist.md`）**不在这条判据的射程内**——它是登记在
    // staging/intake-repairs.json 的已知缺口，不是被这条判据抓到的。别把两者混起来读。
    if (/\.md$/i.test(rel)) {
      const dir = path.posix.dirname(rel);
      const cands = [];
      for (const m of text.matchAll(/\]\(([^)#\s]+?)\)/g)) cands.push(m[1]);
      // 行内代码形态：**只认 SKILL.md 里以 `references/` 开头的那一类**，且排除占位符。
      //
      // 这个窄射程是量出来的，不是省事：
      //   · 放开成「SKILL.md 里所有行内代码路径」→ 40 条来件得 9 条告警，其中 8 条是假红，
      //     它们全是**技能将要创建的文件**或**模板占位**：`tasks/plan.md`、`skills/*/SKILL.md`、
      //     `exact/path/to/file.py`、`.claude/typescript.md`、`references/[domain].md`。
      //     判据分不出「这个文件必须存在」与「举例时提到一个路径」，而假红会让人学会绕过它。
      //   · 放到 references/ 里查 → 同样是举例占多数。
      //   · 只认 `references/` 前缀 + 排除 `[ < * {` 占位符 → 实测只留下真缺陷（slo-implementation
      //     引用的 references/slo-definitions.md 与 references/error-budget.md 未随包）。
      // 另外：`../../` 形态按下面的 `startsWith("..")` 一律跳过，所以 observability 那条
      // （`../../references/observability-checklist.md`）**不在这条判据的射程内**——它是登记在
      // staging/intake-repairs.json 的已知缺口，不是被这条判据抓到的。别把两者混起来读。
      if (/^skill\.md$/i.test(rel)) {
        for (const m of text.matchAll(/`(references\/[^`\s]+?\.(?:md|json|ya?ml|sh|py))`/g)) {
          if (/[[\]<>*{]/.test(m[1])) continue;            // 模板占位符
          cands.push(m[1]);
        }
      }
      for (const raw of cands) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;        // 绝对 URL / mailto
        if (raw.startsWith("#")) continue;                     // 纯锚点
        if (raw.startsWith("/")) continue;                     // 站点绝对路径（/docs/auth 之类），不是文件引用
        if (!raw.includes("/")) continue;                      // 裸文件名不算路径
        const target = path.posix.normalize(path.posix.join(dir, raw));
        if (target.startsWith("..")) continue;                 // 指向来件之外，本来就不该随附
        if (present.has(target)) continue;
        if (!brokenRefs.has(raw)) brokenRefs.set(raw, rel);
      }
    }
  }
  if (foreign.size) {
    // 分两档，因为它们后果不同：
    //   指向技能自身安装位置（…/skills/…） → 命令照抄必然找不到文件，**致命**
    //   指向原厂沙箱的工作目录（/mnt/data/out.xlsx 之类） → 是示例里的输出路径，
    //     模型照抄会写到 /mnt/data，但技能本身能跑 → **告警**，改写正文即可
    const selfRef = [...foreign.entries()].filter(([p]) => /\/skills\//.test(p));
    const example = [...foreign.entries()].filter(([p]) => !/\/skills\//.test(p));
    if (selfRef.length) {
      fatal.push(`硬编码技能自身路径 ${selfRef.length} 处（本机不存在）：` +
        selfRef.slice(0, 3).map(([p, f]) => `${p}（${f}）`).join("；"));
    }
    if (example.length) {
      warn.push(`正文示例用原厂沙箱路径 ${example.length} 处（应在入库时改写）：` +
        example.slice(0, 3).map(([p]) => p).join(", "));
    }
  }
  if (brokenRefs.size) {
    // **必须点名文件**：首版只报路径不报文件，读者（人和 agent）只能猜「这处引用在哪」——
    // 2026-09-15 实测就照这个缺口把两条缺口登记写错了位置（都写成「正文引用」，实际都在 references/ 里），
    // 而错的事实会一路进 provenance 与侧车。报出文件名是判据的一部分，不是装饰。
    const shown = [...brokenRefs.entries()].slice(0, 4).map(([ref, file]) => `${ref}（见 ${file}）`);
    warn.push(`断引用 ${brokenRefs.size} 处：${shown.join(", ")}`);
  }

  // F7/F8 frontmatter（双层嵌套时，实际要检查的是壳内那份）
  const effectiveSkill = rootSkill ?? (unwrapPrefix ? `${unwrapPrefix}/SKILL.md` : null);
  if (effectiveSkill) {
    const src = readEntry(entries.find((e) => innerPath(e) === effectiveSkill));
    const { fields } = parseFrontmatter(src);
    if (!fields) fatal.push("SKILL.md 无 frontmatter");
    else {
      if (!fields.name) fatal.push("frontmatter 缺 name");
      else if (fields.name.replace(/^["']|["']$/g, "") !== unit.name) {
        warn.push(`frontmatter name「${fields.name}」与目录名「${unit.name}」不一致`);
      }
      if (!fields.description) warn.push("frontmatter 缺 description");
    }
  }

  stats.foreignPaths = foreign.size;
  stats.brokenRefs = brokenRefs.size;
  return { fatal, warn, stats, unwrapPrefix, foreign: [...foreign.keys()], brokenRefs: [...brokenRefs.keys()] };
}

function main() {
  const units = collectUnits(FROM, { only: ONLY });
  const rows = [];
  for (const u of units) {
    let r;
    try { r = lintUnit(u); } catch (e) { r = { fatal: [`体检异常：${e.message}`], warn: [], stats: {} }; }
    rows.push({ name: u.name, source: u.source, ...r });
  }
  const bad = rows.filter((r) => r.fatal.length);
  const noisy = rows.filter((r) => !r.fatal.length && r.warn.length);

  if (AS_JSON) {
    console.log(JSON.stringify({ units: rows.length, fatal: bad.length, warn: noisy.length, rows }, null, 2));
    process.exit(bad.length ? 1 : 0);
  }

  console.log(`体检 ${rows.length} 个来件单元｜致命 ${bad.length}｜告警 ${noisy.length}\n`);
  const byKind = new Map();
  for (const r of bad) for (const f of r.fatal) {
    const kind = f.split("（")[0].split(" ")[0];
    byKind.set(kind, (byKind.get(kind) || 0) + 1);
  }
  if (byKind.size) {
    console.log("致命缺陷分布：");
    for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
    console.log();
  }
  for (const r of bad.slice(0, 40)) console.log(`  ✗ ${r.name} [${r.source}] ${r.fatal.join("；")}`);
  if (bad.length > 40) console.log(`  … 另 ${bad.length - 40} 条`);
  if (noisy.length) {
    console.log(`\n告警（不阻断）：`);
    for (const r of noisy.slice(0, 25)) console.log(`  ~ ${r.name} [${r.source}] ${r.warn.join("；")}`);
    if (noisy.length > 25) console.log(`  … 另 ${noisy.length - 25} 条`);
  }
  process.exit(bad.length ? 1 : 0);
}

// 被 import 时只导出 lintUnit，不跑 CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
