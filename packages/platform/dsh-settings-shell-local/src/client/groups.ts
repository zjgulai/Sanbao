/**
 * 设置导航的分组映射 —— **这份表是本包唯一的事实源**。
 *
 * 官方 `settings.section` slot 只投影 `id` / `order` / `label`（见
 * `@deepseek-ai/dsh-client-ui-settings` 的 `contract/slots.d.ts`），**没有 group 字段**，
 * 而 shell 自己「零自有文案、纯组合面」。所以分组这件事在契约里不存在，
 * 只能在呈现层旁路建立，并且必须有一处**登记即权威**的映射表（而不是靠猜 DOM 顺序
 * 或匹配本地化文案 —— 后者会在插件改文案时静默错位）。
 *
 * 未登记的 section **不会被丢弃**，落到 {@link FALLBACK_GROUP}：
 * 新装插件即使没人更新这张表，也只是少一个分组标题，不会消失或错位。
 */

/** 设置分组：`id` 稳定（写进 DOM dataset 供测试与诊断），文案双语。 */
export interface SettingsGroupSpec {
  readonly id: string;
  readonly zh: string;
  readonly en: string;
  /** 属于本组的 section id（官方 slot 注册时声明的 `id`）。 */
  readonly ids: readonly string[];
}

/**
 * 分组表。顺序只影响「同一次出现位置相同时」的稳定排序，
 * 实际显示位置由**成员在渲染顺序中的首次出现位置**决定（见 {@link planGroups}），
 * 所以插件增删不会让分组整体错位。
 *
 * **每组必须在渲染顺序里连续** —— 这不是审美要求，是正确性要求：
 * 分组标题是「插在某一条目之前」的，若一个组被别的组打断，
 * 打断点之后的同组成员就会显示在**别人的标题**下面（归属错位）。
 * {@link planGroups} 会自检连续性，不连续时**拒绝分组**而不是错着显示。
 *
 * 依据 2026-09-15 实测的 18 个 section（`ctx.slots.entries` 与实际 DOM 逐项对照，
 * order 依次为 0,1,5,10,15,20,21,25,26,27,28,28,29,40,60,98,100,100）。
 */
export const SETTINGS_GROUPS: readonly SettingsGroupSpec[] = [
  {
    id: "general",
    zh: "通用",
    en: "General",
    ids: ["general", "pocket", "dsh-theme", "models", "plugins"],
  },
  {
    id: "agents",
    zh: "智能体",
    en: "Agents",
    ids: ["agent-presets", "xmanrui-dsh-im", "agent-teams"],
  },
  {
    // 26/27/28/28/29 连续：LUTE 的能力包都在这一段里，
    // 其中 28 上挂了两个（generic-skills 与 wanzh-hulian），
    // 拆到两个组会让 algo-skills(29) 落到别人的标题下。
    id: "skills",
    zh: "技能与能力",
    en: "Skills & Capabilities",
    ids: [
      "overseas-skills",
      "fullstack-skills",
      "generic-skills",
      "wanzh-hulian",
      "algo-skills",
    ],
  },
  {
    id: "extensions",
    zh: "扩展",
    en: "Extensions",
    ids: ["market", "noema-memory"],
  },
  {
    id: "personal",
    zh: "界面与个人",
    en: "Interface & Personal",
    ids: ["my-quotes", "better-sidebar", "desktop"],
  },
] as const;

/** 未登记 section 的归属：**必须存在**，否则新插件会从导航里消失。 */
export const FALLBACK_GROUP: SettingsGroupSpec = {
  id: "other",
  zh: "其他",
  en: "Other",
  ids: [],
};

/** 语言选择：只区分中文与其余（本包不做完整 i18n，够用即可）。 */
export type GroupLang = "zh" | "en";

/** 从 DOM 的 `lang` 推语言；读不到时按中文界面处理（本机默认语言）。 */
export function groupLang(doc: Document): GroupLang {
  const lang = doc.documentElement?.lang ?? "";
  return lang.toLowerCase().startsWith("zh") ? "zh" : lang === "" ? "zh" : "en";
}

/** 组文案。 */
export function groupTitle(group: SettingsGroupSpec, lang: GroupLang): string {
  return lang === "zh" ? group.zh : group.en;
}

/** section id → 组；未登记返回兜底组。 */
export function groupForSection(sectionId: string): SettingsGroupSpec {
  for (const group of SETTINGS_GROUPS) {
    if (group.ids.includes(sectionId)) return group;
  }
  return FALLBACK_GROUP;
}

/** 一个已排定的分组：标题插在 `startIndex` 之前，覆盖 `count` 个连续成员。 */
export interface PlannedGroup {
  readonly group: SettingsGroupSpec;
  readonly title: string;
  readonly startIndex: number;
  readonly count: number;
}

/** 排定结果：要么给出分组，要么给出**拒绝分组的原因**（不静默降级）。 */
export type GroupPlanResult =
  | { readonly kind: "planned"; readonly groups: readonly PlannedGroup[] }
  | { readonly kind: "none"; readonly reason: string };

/**
 * 按**渲染顺序**排定分组。
 *
 * 组的显示位置取「该组第一个成员在 `sectionIds` 中的下标」，
 * 因此组顺序自动跟随实际 order 分布：插件增删只会让某个组出现或消失，
 * 不会让整张导航错位。
 *
 * **连续性自检**：分组标题是插在条目之前的锚点，若某组在序列里被别的组打断，
 * 打断点之后的同组成员会显示在**别人的标题**下。与其错着显示，不如拒绝分组
 * （调用方保留 L1 样式层：可达性与尺寸照旧生效，只是没有分组标题）。
 */
export function planGroups(
  sectionIds: readonly string[],
  lang: GroupLang,
): GroupPlanResult {
  const order: string[] = [];
  const byGroup = new Map<string, { group: SettingsGroupSpec; startIndex: number; count: number }>();

  for (const [index, sectionId] of sectionIds.entries()) {
    const group = groupForSection(sectionId);
    const existing = byGroup.get(group.id);
    if (existing === undefined) {
      byGroup.set(group.id, { group, startIndex: index, count: 1 });
      order.push(group.id);
      continue;
    }
    existing.count += 1;

    // 连续性：本组成员必须紧接在上一个成员之后
    const previousIndex = index - 1;
    const previousId = sectionIds[previousIndex];
    if (previousId !== undefined && groupForSection(previousId).id !== group.id) {
      return {
        kind: "none",
        reason: `non-contiguous group "${group.id}" at index ${index}`,
      };
    }
  }

  // 只有一个组时不分组：一个孤零零的组标题只是噪声。
  if (order.length < 2) return { kind: "none", reason: "single-group" };

  const groups = order.map((groupId) => {
    const entry = byGroup.get(groupId);
    // order 里的每个 id 都来自 byGroup，这里不可能为空。
    if (entry === undefined) throw new Error(`unreachable: missing group ${groupId}`);
    return {
      group: entry.group,
      title: groupTitle(entry.group, lang),
      startIndex: entry.startIndex,
      count: entry.count,
    };
  });

  return { kind: "planned", groups };
}
