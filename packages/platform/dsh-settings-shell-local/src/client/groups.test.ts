/**
 * 分组排定的纯函数用例。
 *
 * 输入一律用**真实形状**：2026-09-15 实测的 18 个 section id，
 * 按 `ctx.slots.entries("settings.section")` 的实际返回顺序（= 渲染顺序）。
 */

import { describe, expect, it } from "vitest";

import { MEASURED_SECTIONS } from "../../test/fixtures/settings-shell.js";
import {
  FALLBACK_GROUP,
  groupForSection,
  groupLang,
  groupTitle,
  planGroups,
  SETTINGS_GROUPS,
  type PlannedGroup,
} from "./groups.js";

/** 取排定结果里的分组；断言 kind 便于失败时看清原因。 */
function groupsOf(ids: readonly string[], lang: "zh" | "en" = "zh"): readonly PlannedGroup[] {
  const plan = planGroups(ids, lang);
  expect(plan.kind, `expected planned, got ${plan.kind === "none" ? plan.reason : ""}`).toBe(
    "planned",
  );
  return plan.kind === "planned" ? plan.groups : [];
}

describe("groupForSection", () => {
  it("每个实测 section 都有归属，且不是兜底组", () => {
    for (const id of MEASURED_SECTIONS) {
      expect(groupForSection(id).id, `${id} 落到了兜底组`).not.toBe(FALLBACK_GROUP.id);
    }
  });

  it("未登记的 section 落到兜底组，而不是被丢弃", () => {
    expect(groupForSection("some-future-plugin").id).toBe(FALLBACK_GROUP.id);
  });
});

describe("planGroups", () => {
  it("18 项排成 5 组，且覆盖全部条目", () => {
    const groups = groupsOf(MEASURED_SECTIONS);
    expect(groups).toHaveLength(5);
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(18);
  });

  it("每组在渲染顺序里是连续的一整段（归属错位的充分必要条件）", () => {
    const groups = groupsOf(MEASURED_SECTIONS);
    for (const group of groups) {
      for (let offset = 0; offset < group.count; offset += 1) {
        const id = MEASURED_SECTIONS[group.startIndex + offset];
        expect(id).toBeDefined();
        expect(groupForSection(id as string).id, `${id} 出现在 ${group.group.id} 段里`).toBe(
          group.group.id,
        );
      }
    }
  });

  it("组标题落在该组第一个成员的位置上", () => {
    const byId = new Map(groupsOf(MEASURED_SECTIONS).map((g) => [g.group.id, g]));
    expect(byId.get("general")?.startIndex).toBe(0);
    expect(byId.get("general")?.count).toBe(5);
    expect(byId.get("agents")?.startIndex).toBe(5);
    expect(byId.get("agents")?.count).toBe(3);
    expect(byId.get("skills")?.startIndex).toBe(8);
    // overseas, fullstack, generic, wanzh, algo —— 含 order 28 上的两个
    expect(byId.get("skills")?.count).toBe(5);
    expect(byId.get("extensions")?.startIndex).toBe(13);
    expect(byId.get("personal")?.startIndex).toBe(15);
  });

  it("组顺序跟随实际渲染顺序，不跟随表里的书写顺序", () => {
    const groups = groupsOf(["market", "general", "models"]);
    expect(groups.map((g) => g.group.id)).toEqual(["extensions", "general"]);
    expect(groups[0]?.startIndex).toBe(0);
    expect(groups[1]?.startIndex).toBe(1);
  });

  it("**某组被别的组打断时拒绝分组**（宁可没有标题，也不能让条目挂到别人的标题下）", () => {
    // 把 wanzh-hulian 从 skills 段里挪走，skills 就被 extensions 打断：
    // overseas, fullstack, generic, [market], algo —— algo 会落到「扩展」标题下。
    const interleaved = [
      "overseas-skills",
      "fullstack-skills",
      "generic-skills",
      "market",
      "algo-skills",
    ];
    const plan = planGroups(interleaved, "zh");
    expect(plan.kind).toBe("none");
    if (plan.kind !== "none") return;
    expect(plan.reason).toContain("non-contiguous");
  });

  it("只有一个有效组时不分组（避免孤零零一个组标题）", () => {
    const plan = planGroups(["general", "models", "plugins"], "zh");
    expect(plan.kind).toBe("none");
    if (plan.kind !== "none") return;
    expect(plan.reason).toBe("single-group");
  });

  it("没有 section 时不分组", () => {
    expect(planGroups([], "zh").kind).toBe("none");
  });

  it("未登记 section 进入兜底组，且兜底组也能拿到标题", () => {
    const groups = groupsOf(["general", "brand-new-thing"]);
    expect(groups.map((g) => g.group.id)).toEqual(["general", "other"]);
    expect(groups[1]?.startIndex).toBe(1);
    expect(groups[1]?.title).toBe("其他");
  });

  it("登记表里的每个 id 至多属于一个组（防重复归属）", () => {
    const seen = new Set<string>();
    for (const group of SETTINGS_GROUPS) {
      for (const id of group.ids) {
        expect(seen.has(id), `${id} 在多个组里出现`).toBe(false);
        seen.add(id);
      }
    }
  });

  it("英文界面取英文标题", () => {
    const groups = groupsOf(["general", "models", "plugins", "market", "noema-memory"], "en");
    expect(groups.map((g) => g.title)).toEqual(["General", "Extensions"]);
  });
});

describe("groupLang / groupTitle", () => {
  it("zh 文档判为中文", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.documentElement.lang = "zh-CN";
    expect(groupLang(doc)).toBe("zh");
  });

  it("无 lang 属性时按中文界面处理（本机默认）", () => {
    const doc = document.implementation.createHTMLDocument();
    expect(groupLang(doc)).toBe("zh");
  });

  it("en 文档判为英文", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.documentElement.lang = "en";
    expect(groupLang(doc)).toBe("en");
  });

  it("双语标题都非空", () => {
    for (const group of [...SETTINGS_GROUPS, FALLBACK_GROUP]) {
      expect(groupTitle(group, "zh").length).toBeGreaterThan(0);
      expect(groupTitle(group, "en").length).toBeGreaterThan(0);
    }
  });
});
