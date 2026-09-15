import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_ASSIGNMENTS, ROLE_ASSIGNMENT_META } from "../lib/role-map.js";

/**
 * 归位表的「产物 vs 事实源」契约。
 *
 * `manifest/role-assignments.json` 是事实源（人可读、可 diff、带证据），
 * `lib/role-map.js` 是宿主 import 的构建产物。两者一旦不同步，页面会安静地
 * 按旧判定渲染——没有任何红灯，只有数字悄悄变了。所以这里锁三件事：
 *
 *  1. 每个技能都有记录，且 `roles` 里的岗位 id 形状合法（AGT-NNN）；
 *  2. `source` 只能是 skill-map / assigned，`role` 为空时必须给 noRoleKind；
 *  3. 跑生成器的 --check：它自己会断言 lib 是 manifest 的精确投影。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const BUILD = join(PKG, "scripts", "build_role_map.py");
const MANIFEST = join(PKG, "manifest", "role-assignments.json");

test("归位表：形状合法（岗位 id / source / 无岗必须给分型）", () => {
  const names = Object.keys(ROLE_ASSIGNMENTS);
  assert.ok(names.length >= 250, `技能条数异常：${names.length}`);
  const sources = new Set(["skill-map", "assigned"]);
  const kinds = new Set(["GENERIC_METHOD", "TOOL_ONLY", "OUT_OF_SCOPE", "OTHER"]);
  for (const [name, rec] of Object.entries(ROLE_ASSIGNMENTS)) {
    for (const r of rec.roles) {
      assert.match(r.id, /^AGT-\d{3}$/, `${name}: 岗位 id 形状不对 ${r.id}`);
      assert.ok(sources.has(r.source), `${name}/${r.id}: source 非法 ${r.source}`);
    }
    const ids = rec.roles.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `${name}: 同一岗位重复挂载`);
    if (rec.roles.length === 0) {
      const kind = rec.noRoleKind;
      assert.ok(kind !== null && kinds.has(kind), `${name}: 无岗却没给合法分型（${kind}）`);
    }
  }
});

test("归位表：meta 计数与 manifest 的 coverage 一致", () => {
  assert.ok(Number.isInteger(ROLE_ASSIGNMENT_META.skills), "缺 skills 计数");
  assert.equal(
    ROLE_ASSIGNMENT_META.withRoles + ROLE_ASSIGNMENT_META.withoutRoles,
    ROLE_ASSIGNMENT_META.skills,
    "有岗 + 无岗必须等于总数"
  );
  assert.equal(Object.keys(ROLE_ASSIGNMENTS).length, ROLE_ASSIGNMENT_META.skills);
});

test("归位表：lib/role-map.js 是 manifest 的精确投影（跑生成器的 --check）", { skip: !existsSync(MANIFEST) ? "manifest 缺失" : false }, () => {
  const out = execFileSync("python3", [BUILD, "--check"], { cwd: PKG, encoding: "utf8" });
  assert.match(out, /与 manifest 一致/, `生成器 --check 的输出不合预期：${out}`);
});

/**
 * SOP §12.5 的分型表 vs 校验器的 `NO_ROLE_KINDS` —— 一张**文档承诺**与
 * **实际拦住的东西**之间的对账。
 *
 * 由来（2026-09-15，40 条全栈件入库时实测）：SOP §12.5 在 2026-09-14 宣布把
 * `no_role_kind` 扩到 7 类，但只改了文档 —— 校验器、测试、manifest 里一条都没有。
 * 于是**照文档判就会撞红**：写 `DEV_ENGINEERING` 的条目被判 `J4-NO-ROLE-KIND`，
 * 而报错把责任指向判定人。这正是本仓库反复记录的「知道没有变成拦住」。
 *
 * 判据：SOP 表里**没有**标「未生效」的行，必须与校验器的 `NO_ROLE_KINDS` 逐字相等；
 * 标了「未生效」的，必须**不**在校验器里。两侧任一漂移，这条测试当场红。
 */
test("SOP §12.5 的分型表与校验器逐字对账（文档不许承诺没被守住的东西）", () => {
  const sop = readFileSync(join(PKG, "docs", "maintenance-sop.md"), "utf8");
  const validator = readFileSync(join(PKG, "scripts", "validate_assignments.py"), "utf8");

  const m = /^NO_ROLE_KINDS\s*=\s*\(([^)]*)\)/m.exec(validator);
  assert.ok(m, "在 validate_assignments.py 里找不到 NO_ROLE_KINDS");
  const enforced = [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]).sort();

  // 从 §12.5 的表里抓 `| `KIND` | 状态 | 含义 | 典型 |` 行。
  // 状态列含「未生效」= 未启用的提议；典型列为空或「—」= 文档自己声明它没有用例。
  const rows = [...sop.matchAll(/^\|\s*`([A-Z_]+)`\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/gm)]
    .map(([, kind, status, , examples]) => ({
      kind,
      pending: status.includes("未生效"),
      examples: examples.trim(),
    }));
  assert.ok(rows.length >= 4, `§12.5 分型表解析出 ${rows.length} 行，预期至少 4 行`);

  const docLive = rows.filter((r) => !r.pending).map((r) => r.kind).sort();
  const docPending = rows.filter((r) => r.pending).map((r) => r.kind).sort();

  assert.deepEqual(
    docLive,
    enforced,
    `SOP 标为生效的分型与校验器不一致 —— 文档：(必)${docLive} / 校验器：(必)${enforced}`
  );
  const leaked = docPending.filter((k) => enforced.includes(k));
  assert.deepEqual(leaked, [], `SOP 标为「未生效」的分型却已被校验器接受：${leaked}（两处必居其一地改）`);

  // 文档举了例子的分型，必须真在 manifest 里用过 —— 否则那是一句没人会发现的空头承诺。
  // 反过来，典型列为「—」的分型（现为 `OTHER`）**不**要求用例：它同时是
  // `lib/org-tree.js` 的运行时兜底（`?? "OTHER"`），命中场景是「技能压根不在归位表里」，
  // 而不是某条判定被写成 OTHER。要求它有 manifest 用例等于把兜底当成判据来考核。
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const used = new Set(
    Object.values(manifest.skills).filter((e) => !(e.roles || []).length).map((e) => e.no_role_kind)
  );
  for (const row of rows.filter((r) => !r.pending && r.examples && r.examples !== "—")) {
    assert.ok(
      used.has(row.kind),
      `SOP 为分型 ${row.kind} 举了例子（${row.examples}），但 manifest 里没有一条用它 —— 判据从没跑到`
    );
  }
});
