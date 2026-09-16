/**
 * 真实产物 `lib/client.js` 的行为用例。
 *
 * 覆盖的是**会决定用户能不能点到设置项**的那几条：
 *   - 数量一致时注入分组标题，且标题落在正确的按钮前面；
 *   - 数量不一致 / 注册表读不到时**放弃注入**（宁可不分组，也不能错位）；
 *   - 重复同步不重复写 DOM（MutationObserver 监听 body，写就会自激）；
 *   - disposer 只回收自己的节点。
 */

import { describe, expect, it } from "vitest";

// seam：真实产物 lib/client.js —— 经 ModuleLoader 桩载入后直接驱动。
import "../lib/client.js";

import { loaderEntries } from "./setup.js";
import {
  groupTitles,
  MEASURED_SECTIONS,
  settingsShellFixture,
} from "./fixtures/settings-shell.js";

interface Registry {
  entries?(key: string): readonly { options?: { id?: string } }[];
}

interface ShellSyncState {
  sawShell: boolean;
}

interface ClientExports {
  apply(ctx: { effect: (fn: () => () => void, label: string) => void; slots?: unknown }): void;
  createShellSyncState(): ShellSyncState;
  syncShell(doc: Document, slots: Registry | undefined, state?: ShellSyncState): string;
  installSettingsShell(doc: Document, slots: Registry | undefined): () => void;
}

/** 一个行为良好的注册表桩。 */
function registryOf(ids: readonly string[]): Registry {
  return {
    entries(key: string) {
      if (key !== "settings.section") return [];
      return ids.map((id) => ({ options: { id } }));
    },
  };
}

async function loadClient(): Promise<ClientExports> {
  const entries = loaderEntries();
  const entry = entries.find((e) => e.id === "dsh-settings-shell");
  if (entry === undefined) {
    throw new Error(
      `bundle did not register dsh-settings-shell; captured ids: ${entries.map((e) => e.id).join(", ")}`,
    );
  }
  return entry.factory((id: string) => {
    throw new Error(`client bundle must not require(${id}) at module scope`);
  }) as ClientExports;
}

describe("syncShell", () => {
  it("数量一致时注入 5 个分组标题，位置与按钮对应", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    const state = client.syncShell(doc, registryOf(MEASURED_SECTIONS));

    expect(state).toBe("grouped:5");
    expect(groupTitles(doc)).toEqual(["通用", "智能体", "技能与能力", "扩展", "界面与个人"]);
    expect(doc.documentElement.dataset.dshSettingsShell).toBe("grouped:5");

    // 每个标题后面紧跟的必须是该组的第一个成员按钮
    const titles = Array.from(doc.querySelectorAll<HTMLElement>("[data-dsh-ss-group]"));
    expect(titles[0]?.nextElementSibling?.textContent).toBe("general");
    expect(titles[1]?.nextElementSibling?.textContent).toBe("agent-presets");
    expect(titles[2]?.nextElementSibling?.textContent).toBe("overseas-skills");
    expect(titles[3]?.nextElementSibling?.textContent).toBe("market");
    expect(titles[4]?.nextElementSibling?.textContent).toBe("my-quotes");
  });

  it("分组标题之下不会出现别组的条目（段内归属逐项核对）", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    client.syncShell(doc, registryOf(MEASURED_SECTIONS));

    // 按 DOM 顺序重建「标题 → 成员」的映射，逐项核对归属
    const groupsInDom: { title: string; members: string[] }[] = [];
    for (const child of Array.from(doc.querySelectorAll("nav > div")[1]?.children ?? [])) {
      if (child.hasAttribute?.("data-dsh-ss-group")) {
        groupsInDom.push({ title: child.textContent ?? "", members: [] });
      } else if (child.tagName === "BUTTON") {
        groupsInDom[groupsInDom.length - 1]?.members.push(child.textContent ?? "");
      }
    }

    expect(groupsInDom.map((g) => [g.title, g.members])).toEqual([
      ["通用", ["general", "pocket", "dsh-theme", "models", "plugins"]],
      ["智能体", ["agent-presets", "xmanrui-dsh-im", "agent-teams"]],
      ["技能与能力", ["overseas-skills", "fullstack-skills", "generic-skills", "wanzh-hulian", "algo-skills"]],
      ["扩展", ["market", "noema-memory"]],
      ["界面与个人", ["my-quotes", "better-sidebar", "desktop"]],
    ]);
  });

  it("导航按钮总数不变（只插标题，不动按钮）", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    const before = doc.querySelectorAll("nav button").length;
    client.syncShell(doc, registryOf(MEASURED_SECTIONS));
    expect(doc.querySelectorAll("nav button").length).toBe(before);
  });

  it("注册表与 DOM 数量不一致时**放弃注入**，并报出两个数字", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: ["general", "models"] });
    const state = client.syncShell(doc, registryOf(MEASURED_SECTIONS));

    expect(state).toBe("ungrouped:count 18!=2");
    expect(groupTitles(doc)).toEqual([]);
  });

  it("注册表读不到时不猜 DOM 顺序，只保留样式层", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    expect(client.syncShell(doc, undefined)).toBe("ungrouped:no-registry");
    expect(groupTitles(doc)).toEqual([]);
  });

  it("entries 抛异常时按读不到处理，不往外抛", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    const throwing: Registry = {
      entries() {
        throw new Error("registry exploded");
      },
    };
    expect(client.syncShell(doc, throwing)).toBe("ungrouped:no-registry");
  });

  it("设置页没打开时状态为 absent，不报 drift", async () => {
    const client = await loadClient();
    const doc = document.implementation.createHTMLDocument("empty");
    expect(client.syncShell(doc, registryOf(MEASURED_SECTIONS))).toBe("absent");
  });

  it("结构漂移（按钮不同父）时状态带 drift 前缀", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ broken: "split-parents" });
    const state = client.syncShell(doc, registryOf(MEASURED_SECTIONS));
    expect(state.startsWith("drift:")).toBe(true);
    expect(doc.documentElement.dataset.dshSettingsShell?.startsWith("drift:")).toBe(true);
  });

  it("同一文档：见过面板之后再丢 nav，才算 drift（别的 modal 不误报）", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    const state = client.createShellSyncState();
    const registry = registryOf(MEASURED_SECTIONS);

    expect(client.syncShell(doc, registry, state)).toBe("grouped:5");

    // 官方结构变了：nav 整个消失，但 dialog 还在
    doc.querySelector("nav")?.remove();
    const after = client.syncShell(doc, registry, state);
    expect(after.startsWith("drift:")).toBe(true);
    expect(after).toContain("lost its direct <nav>");
  });

  it("只有一个有效组时清掉既有标题，不留下假分组", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: ["general", "models", "plugins"] });
    client.syncShell(doc, registryOf(MEASURED_SECTIONS)); // 先按 18 项注入
    const state = client.syncShell(doc, registryOf(["general", "models", "plugins"]));
    expect(state).toBe("ungrouped:single-group");
    expect(groupTitles(doc)).toEqual([]);
  });

  it("分组会错位时拒绝注入，并保留官方原样", async () => {
    const client = await loadClient();
    // algo-skills 被 market 从 skills 段里隔开
    const interleaved = [
      "overseas-skills",
      "fullstack-skills",
      "generic-skills",
      "market",
      "algo-skills",
    ];
    const doc = settingsShellFixture({ sectionIds: interleaved });
    const state = client.syncShell(doc, registryOf(interleaved));
    expect(state.startsWith("ungrouped:non-contiguous")).toBe(true);
    expect(groupTitles(doc)).toEqual([]);
  });

  it("重复同步是幂等的：标题数量与文案都不翻倍", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    const registry = registryOf(MEASURED_SECTIONS);
    for (let i = 0; i < 5; i += 1) client.syncShell(doc, registry);
    expect(groupTitles(doc)).toEqual(["通用", "智能体", "技能与能力", "扩展", "界面与个人"]);
  });

  it("已成立状态下不写 DOM（否则 MutationObserver 会自激成死循环）", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    const registry = registryOf(MEASURED_SECTIONS);
    client.syncShell(doc, registry);

    const firstTitle = doc.querySelector("[data-dsh-ss-group]");
    expect(firstTitle).not.toBeNull();
    // 第二次同步后，节点必须是**同一个对象**（没被删掉重建）
    client.syncShell(doc, registry);
    expect(doc.querySelector("[data-dsh-ss-group]")).toBe(firstTitle);
  });

  it("未登记 section 归入「其他」组，而不是消失", async () => {
    const client = await loadClient();
    const ids = ["general", "models", "brand-new-plugin"];
    const doc = settingsShellFixture({ sectionIds: ids });
    expect(client.syncShell(doc, registryOf(ids))).toBe("grouped:2");
    expect(groupTitles(doc)).toEqual(["通用", "其他"]);
  });
});

describe("installSettingsShell", () => {
  it("disposer 移除自己插入的标题并清掉诊断属性", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    const dispose = client.installSettingsShell(doc, registryOf(MEASURED_SECTIONS));

    expect(groupTitles(doc)).toHaveLength(5);
    expect(doc.documentElement.dataset.dshSettingsShell).toBe("grouped:5");

    dispose();
    expect(groupTitles(doc)).toEqual([]);
    expect(doc.documentElement.dataset.dshSettingsShell).toBeUndefined();
    // 按钮仍原样保留 —— disposer 只回收自己的节点
    expect(doc.querySelectorAll("nav button")).toHaveLength(18);
  });

  it("React 重建导航后能自动补回标题", async () => {
    const client = await loadClient();
    const doc = settingsShellFixture({ sectionIds: MEASURED_SECTIONS });
    const dispose = client.installSettingsShell(doc, registryOf(MEASURED_SECTIONS));

    // 模拟 React 重渲染：把 navList 整个换掉（内容相同）
    const navList = doc.querySelectorAll("nav > div")[1];
    expect(navList).toBeDefined();
    const rebuilt = navList?.cloneNode(false) as HTMLElement;
    for (const button of Array.from(navList?.children ?? [])) {
      if (button.tagName === "BUTTON") rebuilt.appendChild(button.cloneNode(true));
    }
    navList?.replaceWith(rebuilt);

    // 观察器是异步的（合并到一帧）
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(groupTitles(doc)).toHaveLength(5);

    dispose();
  });
});
