/**
 * 只测**视口内**的发丝线：视口外/被裁剪的元素不参与统计（上一版把滚动到 -25658px
 * 的元素算进来了，那是仪器缺陷而非事实）。只读。
 */
(() => {
  const dpr = devicePixelRatio;
  const frac = (v) => Math.abs(v * dpr - Math.round(v * dpr));
  const sides = ["Top", "Right", "Bottom", "Left"];
  const posOf = (r, s) =>
    s === "Top" ? r.top : s === "Bottom" ? r.bottom : s === "Left" ? r.left : r.right;

  const inView = (r) =>
    r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth &&
    r.width > 0 && r.height > 0;

  const stats = Object.fromEntries(sides.map((s) => [s, { total: 0, aligned: 0, offGrid: 0 }]));
  const allWidths = { inViewTotal: 0, subPixel: 0, onePx: 0, other: 0 };
  const offGridSamples = [];

  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const widths = sides.map((s) => parseFloat(cs[`border${s}Width`]) || 0);
    if (!widths.some((w) => w > 0 && w !== 0)) continue;
    const r = el.getBoundingClientRect();
    if (!inView(r)) continue;
    allWidths.inViewTotal++;
    const maxW = Math.max(...widths);
    if (maxW === 0.5) allWidths.subPixel++;
    else if (maxW === 1) allWidths.onePx++;
    else allWidths.other++;

    sides.forEach((s, i) => {
      const w = widths[i];
      if (w !== 0.5 || cs[`border${s}Style`] === "none") return;
      const off = frac(posOf(r, s));
      stats[s].total++;
      if (off <= 0.02) stats[s].aligned++;
      else {
        stats[s].offGrid++;
        if (offGridSamples.length < 8) {
          offGridSamples.push({
            side: s,
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || "").slice(0, 34),
            off: +off.toFixed(3),
            size: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
          });
        }
      }
    });
  }

  const perSide = {};
  for (const s of sides) {
    perSide[s] = {
      ...stats[s],
      offGridShare: stats[s].total ? +(stats[s].offGrid / stats[s].total).toFixed(3) : null,
    };
  }
  const tot = sides.reduce((a, s) => a + stats[s].total, 0);
  const off = sides.reduce((a, s) => a + stats[s].offGrid, 0);

  return {
    dpr,
    viewport: { w: innerWidth, h: innerHeight },
    inViewBorderedElements: allWidths.inViewTotal,
    inViewWidthMix: { subPixel: allWidths.subPixel, onePx: allWidths.onePx, other: allWidths.other },
    hairlinesInView: tot,
    hairlinesOffGrid: off,
    offGridShareOverall: tot ? +(off / tot).toFixed(3) : null,
    perSide,
    offGridSamples,
  };
})();
