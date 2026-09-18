/** 诊断：Chromium 对 color-mix 派生的 border-color 到底序列化成什么。只读。 */
(() => {
  const samples = [];
  const widthHist = {};
  const styleHist = {};
  let withWidth = 0;

  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.borderTopWidth) || 0;
    const st = cs.borderTopStyle;
    if (w > 0 && st !== "none") {
      withWidth++;
      widthHist[`${w}px`] = (widthHist[`${w}px`] || 0) + 1;
      styleHist[st] = (styleHist[st] || 0) + 1;
      if (samples.length < 12) {
        samples.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 44),
          w: cs.borderTopWidth,
          style: st,
          colorRaw: cs.borderTopColor,
          colorType: /^rgba?\(/.test(cs.borderTopColor)
            ? "rgb()"
            : /^color\(/.test(cs.borderTopColor)
              ? "color()"
              : /^(oklch|oklab|lab|lch)\(/.test(cs.borderTopColor)
                ? "oklch()/oklab()"
                : /^color-mix\(/.test(cs.borderTopColor)
                  ? "color-mix()"
                  : "OTHER",
        });
      }
    }
  }

  return {
    elementsWithBorderWidth: withWidth,
    widthHistogram: widthHist,
    styleHistogram: styleHist,
    rawSamples: samples,
    // 一个已知带边框的容器：看它的完整 border 相关计算值
    probeCard: (() => {
      const el = document.querySelector('[class*="card"], [class*="Card"], [class*="panel"], [class*="Panel"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        cls: String(el.className).slice(0, 80),
        borderTopWidth: cs.borderTopWidth,
        borderTopStyle: cs.borderTopStyle,
        borderTopColor: cs.borderTopColor,
        boxShadow: cs.boxShadow.slice(0, 80),
        background: cs.backgroundColor,
      };
    })(),
  };
})();
