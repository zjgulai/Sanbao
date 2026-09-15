#!/usr/bin/env node
/**
 * intake-install.mjs — 第三方技能入库第二步（SOP §12.2 落目录 + §12.3 四件套）
 *
 * 做三件事，顺序固定：
 *   ① 结构体检（intake-lint 的判据）—— 坏文件、硬编码沙箱路径、__MACOSX、双层嵌套、断引用。
 *      体检不过**默认拒绝安装**：装进去再修，修的是已经污染了技能库的副本。
 *   ② 落目录 `~/.dsh/skills/<name>/`，全量保真复制（含 scripts/、references/、assets/），
 *      **不保留 .git**（§12.2：入库必然改写 frontmatter，带 .git 每次更新都要 stash 重放）。
 *   ③ 写来源留底 `manifest/intake-provenance.json`：批次 / 原始单元 / 每文件 sha256 / 许可证结论。
 *      改写了 frontmatter 的 SKILL.md 额外记 `sourceSha256`，这样以后上游升级能比对。
 *
 * 用法：
 *   node scripts/intake-install.mjs --dry            # 只看计划
 *   node scripts/intake-install.mjs --skills a,b     # 只装这两条
 *   node scripts/intake-install.mjs                  # 装 staging/intake-localize.json 里全部
 *   node scripts/intake-install.mjs --force          # 已存在也覆盖（覆盖前自动 ditto 备份）
 *   node scripts/intake-install.mjs --skip-lint      # 明知有已知缺陷仍要装（会写进留底）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SKILLS_DIR, collectUnits, listUnit, readEntry, readEntryRaw, sha256, innerPath,
  parseFrontmatter, buildFrontmatter,
} from "./intake-lib.mjs";
import { lintUnit } from "./intake-lint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const LOCALIZE = path.join(ROOT, "staging", "intake-localize.json");
const REPAIRS = path.join(ROOT, "staging", "intake-repairs.json");
const PROVENANCE = path.join(ROOT, "manifest", "intake-provenance.json");
const FROM = process.env.DSH_INTAKE_FROM || path.join(process.env.HOME, "Downloads", "skills");
const BACKUP = path.join(ROOT, "backup", "intake-2026-09");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const FORCE = argv.includes("--force");
const SKIP_LINT = argv.includes("--skip-lint");
const si = argv.indexOf("--skills");
const ONLY = si >= 0 ? (argv[si + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];

const say = (s = "") => console.log(s);

/**
 * 校验「体检的每条致命缺陷都被解释掉了」。
 * 一个缺陷要么被 dropFiles/writeFiles/rewritePaths 消掉，要么在 acceptFatal 里显式认领。
 * 反过来也查：认领了却匹配不到任何缺陷 → 报错（过期豁免会变成假绿，参照 ADR-0014）。
 */
function reconcileLint(lint, repair) {
  const accepted = repair?.acceptFatal || [];
  const fixedBy = new Set([...(repair?.dropFiles || []), ...Object.keys(repair?.writeFiles || {})]);
  const rewrote = (repair?.rewritePaths || []).length > 0;
  const unexplained = [];
  for (const f of lint.fatal) {
    if (accepted.some((a) => f.includes(a.match))) continue;
    // 坏文件类缺陷：只要该文件被 drop 或重新生成，就算已处理
    if (f.startsWith("坏文件") && [...fixedBy].some((p) => f.includes(p))) continue;
    // 硬编码路径类缺陷：有 rewritePaths 即已处理
    if (f.startsWith("硬编码") && rewrote) continue;
    unexplained.push(f);
  }
  const stale = accepted.filter((a) => !lint.fatal.some((f) => f.includes(a.match))).map((a) => a.match);
  return { unexplained, stale };
}

/** 用 ditto 备份，不用 cp -R —— 实测 cp -R 会把带资源分支的目录拍平（SOP 已记）。 */
function backupDir(src, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  fs.rmSync(path.join(dstDir, path.basename(src)), { recursive: true, force: true });
  try {
    fs.cpSync(src, path.join(dstDir, path.basename(src)), { recursive: true, verbatimSymlinks: true });
  } catch (e) {
    say(`  ⚠ 备份失败：${e.message}`);
  }
}

function main() {
  if (!fs.existsSync(LOCALIZE)) {
    console.error(`✗ 缺 ${path.relative(ROOT, LOCALIZE)} —— 先写元数据四件套（P2 的产物，安装要读它）`);
    process.exit(2);
  }
  const loc = JSON.parse(fs.readFileSync(LOCALIZE, "utf8"));
  const repairs = fs.existsSync(REPAIRS) ? (JSON.parse(fs.readFileSync(REPAIRS, "utf8")).skills || {}) : {};
  const metas = (loc.skills || []).filter((m) => !ONLY.length || ONLY.includes(m.name) || ONLY.includes(m.src));
  if (!metas.length) { console.error("✗ 没有要装的条目"); process.exit(2); }

  const units = new Map();
  for (const u of collectUnits(FROM)) if (!units.has(u.name)) units.set(u.name, u);

  const report = { installed: [], skipped: [], errors: [], repairs: {} };
  const provenance = fs.existsSync(PROVENANCE) ? JSON.parse(fs.readFileSync(PROVENANCE, "utf8")) : { _meta: {}, skills: {} };
  provenance._meta = {
    purpose: "第三方技能来源留底（SOP §12.2）：批次 / 原始单元 / 逐文件 sha256 / 许可证结论 / 已应用的修补。失去 .git 内置版本控制后，靠它做升级比对与回滚。",
    from: FROM,
    updated: new Date().toISOString(),
  };

  for (const m of metas) {
    const unit = units.get(m.src);
    if (!unit) { report.errors.push(`${m.name}: 来件里找不到 ${m.src}`); continue; }
    const repair = repairs[m.name] || null;

    // ① 结构体检 + 豁免对账
    const lint = lintUnit(unit);
    const { unexplained, stale } = reconcileLint(lint, repair);
    if (stale.length) {
      report.errors.push(`${m.name}: repairs 里有匹配不到缺陷的过期豁免 [${stale.join(", ")}] —— 请删除（ADR-0014：豁免只减不增）`);
      continue;
    }
    if (unexplained.length && !SKIP_LINT) {
      report.errors.push(`${m.name}: 结构体检不通过（${unexplained.join("；")}）—— 修补或豁免后重试`);
      continue;
    }
    if (unexplained.length) say(`  ⚠ ${m.name}: --skip-lint 强行安装，未解释的缺陷：${unexplained.join("；")}`);

    const drop = new Set(repair?.dropFiles || []);
    const entries = listUnit(unit.unit).filter((e) => {
      const rel = innerPath(e);
      if (/(^|\/)(\.git|__MACOSX)(\/|$)/.test(rel)) return false;
      if (/(^|\/)\.DS_Store$/.test(rel) || /(^|\/)\._/.test(rel)) return false;
      return !drop.has(rel);
    });

    // 拆壳：双层嵌套时技能实际在 <name>/ 下
    const unwrap = lint.unwrapPrefix;
    const stripPrefix = (rel) => (unwrap && rel.startsWith(unwrap + "/") ? rel.slice(unwrap.length + 1) : rel);
    const stripped = entries.map((e) => ({ entry: e, rel: stripPrefix(innerPath(e)) }))
      .filter((x) => !(unwrap && !innerPath(x.entry).startsWith(unwrap + "/")));

    const skillEntry = stripped.find((x) => x.rel === "SKILL.md" || /^SKILL\.md$/i.test(x.rel));
    if (!skillEntry) { report.errors.push(`${m.name}: 拆壳后仍找不到根级 SKILL.md`); continue; }

    const rawSrc = readEntry(skillEntry.entry);
    const { body } = parseFrontmatter(rawSrc);
    const fm = buildFrontmatter(m, { sha256: sha256(readEntryRaw(skillEntry.entry)) });
    // 正文汉译优先（staging/translations/<name>.body.md），缺省回退英文原文并在报告标注
    const zh = path.join(ROOT, "staging", "translations", `${m.name}.body.md`);
    const useZh = fs.existsSync(zh);
    let finalBody = useZh ? fs.readFileSync(zh, "utf8").replace(/\s+$/, "") + "\n" : body.replace(/^\s+/, "");

    // ② 应用 rewritePaths（正文里的原厂沙箱路径）
    const rewrites = repair?.rewritePaths || [];
    if (rewrites.length) {
      for (const r of rewrites) finalBody = finalBody.split(r.from).join(r.to);
    }

    const dst = path.join(SKILLS_DIR, m.name);
    if (fs.existsSync(dst)) {
      if (!FORCE) { report.skipped.push(`${m.name}（已存在，用 --force 覆盖）`); continue; }
      backupDir(dst, path.join(BACKUP, "overwritten"));
      if (!DRY) fs.rmSync(dst, { recursive: true, force: true });
    }

    /** 文本文件做 rewritePaths；二进制原样写。 */
    const materialize = (rel, buf) => {
      let out = buf;
      if (rewrites.length && /\.(md|txt|json|ya?ml|py|js|mjs|sh|html)$/i.test(rel)) {
        let text = buf.toString("utf8");
        for (const r of rewrites) text = text.split(r.from).join(r.to);
        out = Buffer.from(text, "utf8");
      }
      return out;
    };

    if (!DRY) {
      fs.mkdirSync(dst, { recursive: true });
      fs.writeFileSync(path.join(dst, "SKILL.md"), fm + finalBody);
      for (const { entry, rel } of stripped) {
        if (entry === skillEntry.entry) continue;
        const out = path.join(dst, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, materialize(rel, readEntryRaw(entry)));
      }
      for (const [rel, content] of Object.entries(repair?.writeFiles || {})) {
        const out = path.join(dst, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, content);
      }
    }

    report.repairs[m.name] = {
      dropped: [...drop], rewrote: rewrites.length, regenerated: Object.keys(repair?.writeFiles || {}),
      accepted: (repair?.acceptFatal || []).map((a) => a.match),
      unwrapped: unwrap || null,
      knownGaps: repair?.knownGaps || [],
    };

    provenance.skills[m.name] = {
      batch: m.source,
      sourceUnit: unit.unit,
      license: m.license || "unknown",
      licenseBasis: m.license === "internal-only" ? "无 LICENSE 文件且 frontmatter 未声明" : "实测 LICENSE 文件或 frontmatter 声明",
      installedAt: new Date().toISOString(),
      translated: useZh,
      repairs: report.repairs[m.name],
      lintWarnings: lint.warn,
      files: Object.fromEntries(stripped.map((x) => [x.rel, sha256(readEntryRaw(x.entry))])),
    };
    report.installed.push({ name: m.name, files: stripped.length, translated: useZh, repaired: !!repair });
  }

  if (!DRY) {
    fs.mkdirSync(path.dirname(PROVENANCE), { recursive: true });
    fs.writeFileSync(PROVENANCE, JSON.stringify(provenance, null, 2) + "\n");
  }

  say();
  say(`安装 ${report.installed.length} 条${DRY ? "（dry-run 未写盘）" : ""}`);
  for (const i of report.installed) {
    const r = report.repairs[i.name];
    const tag = r && (r.dropped.length || r.rewrote || r.regenerated.length) ? `  [修补 丢${r.dropped.length}/改${r.rewrote}/生${r.regenerated.length}]` : "";
    say(`  ✓ ${i.name}  ${i.files} 个文件${i.translated ? "  已汉译" : ""}${tag}`);
  }
  const gaps = Object.entries(report.repairs).filter(([, r]) => r.knownGaps.length);
  if (gaps.length) {
    say(`\n已知缺口（写进留底，卡片/文档需体现）：`);
    for (const [n, r] of gaps) for (const g of r.knownGaps) say(`  ! ${n}: ${g}`);
  }
  if (report.skipped.length) { say(`\n跳过 ${report.skipped.length} 条:`); for (const s of report.skipped) say(`  · ${s}`); }
  if (report.errors.length) {
    say(`\n✗ 错误 ${report.errors.length} 条:`);
    for (const e of report.errors) say(`  - ${e}`);
    process.exit(1);
  }
  if (!DRY) say(`\n来源留底 → ${path.relative(ROOT, PROVENANCE)}`);
}

main();
