/** 设置页当前是否开着？L1 导轨此时此刻的真实滚动读数（只读）。 */
(() => {
  const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
  const texts = document.body.innerText.slice(0, 200);
  // 找所有可滚动容器，报告它们的滚动状态
  const scrollables = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const oy = cs.overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      scrollables.push({
        cls: String(el.className || "").slice(0, 40),
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        couldScroll: el.scrollHeight - el.clientHeight,
      });
    }
  }
  return {
    hasDialog: !!dialog,
    dialogCls: dialog ? String(dialog.className).slice(0, 60) : null,
    bodyTextHead: texts.replace(/\s+/g, " ").slice(0, 160),
    scrollableCount: scrollables.length,
    scrollables: scrollables
      .sort((a, b) => b.couldScroll - a.couldScroll)
      .slice(0, 8),
  };
})();
