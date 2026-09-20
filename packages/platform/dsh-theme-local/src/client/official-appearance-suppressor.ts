/**
 * 官方双色道外观行（浅色/深色/跟随系统）的遮蔽器。
 *
 * 本产品的三身份 studio 与它同页并存时，两个控件都能决定主题，等于两个权威。
 * 官方行由 `@deepseek-ai/dsh-client-ui-theme` 的 AppearanceRow 渲染（`.group` 里
 * 一个标题 + 三个 cube），其 i18n 只有 zh/en 两套，系统项文案固定为「跟随系统」/「System」；
 * 三身份里没有这一项，所以它是唯一的语义锚——不钉 CSS 模块哈希（ADR-0019）。
 *
 * 状态只有一处：元素 → 它原来的 inline display。标记属性既是「已处理」的凭据，
 * 也让观察器对被遮蔽的子树不再重复命中（AGENTS.md 的观察器不变量）。
 */
export const OFFICIAL_ROW_ATTR = "data-sanbao-official-appearance-hidden";

/** 官方系统项的全部文案（装机产物里逐字读得，非推测）。 */
const SYSTEM_LABELS = new Set(["跟随系统", "System"]);

/** 本产品三身份的指纹；含它的祖先一定不是官方行，遮蔽射程必须在此停下。 */
const OWN_FINGERPRINT = ["暖粉白", "Warm pink"];

function isOfficialLabel(node: Element): boolean {
  return node.children.length === 0 && SYSTEM_LABELS.has((node.textContent ?? "").trim());
}

function containsOwnStudio(element: Element): boolean {
  const text = element.textContent ?? "";
  return OWN_FINGERPRINT.some(label => text.includes(label));
}

export interface OfficialAppearanceSuppressor {
  /** 遮蔽 root 内每一棵官方行，返回本次新遮蔽的棵数。 */
  suppress(): number;
  /** 已记录在案的官方行棵数。 */
  hiddenCount(): number;
  /** 还原全部并断开观察器。 */
  release(): void;
}

export function createOfficialAppearanceSuppressor(root: HTMLElement): OfficialAppearanceSuppressor {
  const hidden = new Map<HTMLElement, string>();

  /** 从系统项文案上爬到「仍含官方指纹、且不含我们 studio」的最高祖先。 */
  function officialRowOf(label: Element): HTMLElement | undefined {
    let row: HTMLElement | undefined;
    for (let node = label.parentElement; node && node !== root.parentElement; node = node.parentElement) {
      if (containsOwnStudio(node)) break;
      if (!Array.from(node.querySelectorAll("*")).some(isOfficialLabel)) break;
      row = node;
    }
    return row;
  }

  function suppress(): number {
    let added = 0;
    for (const label of Array.from(root.querySelectorAll("*"))) {
      if (!isOfficialLabel(label)) continue;
      const row = officialRowOf(label);
      if (row === undefined || hidden.has(row) || row.hasAttribute(OFFICIAL_ROW_ATTR)) continue;
      hidden.set(row, row.style.display);
      row.style.display = "none";
      row.setAttribute(OFFICIAL_ROW_ATTR, "");
      added += 1;
    }
    return added;
  }

  const observer = new MutationObserver(() => { suppress(); });
  observer.observe(root, { childList: true, subtree: true });
  suppress();

  return {
    suppress,
    hiddenCount: () => hidden.size,
    release() {
      observer.disconnect();
      for (const [row, display] of hidden) {
        row.removeAttribute(OFFICIAL_ROW_ATTR);
        // 只还原 inline 值：观察器写什么就收回什么，不动样式表带来的 display。
        if (display === "") row.style.removeProperty("display");
        else row.style.display = display;
      }
      hidden.clear();
    },
  };
}
