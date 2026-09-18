/**
 * 逐边测量 0.5px 发丝：每一条边单独判断是否落在设备像素网格上。只读。
 *
 * 上一版把四个边的偏移取 max，口径不对——top 边框只该看 rect.top 的偏移。
 */
(() => {
  const dpr = devicePixelRatio;
  const frac = (v) => Math.abs(v * dpr - Math.round(v * dpr));
  const sides = ["Top", "Right", "Bottom", "Left"];
  const posOf = (r, s) =>
    s === "Top" ? r.top : s === "Bottom" ? r.bottom : s === "Left" ? r.left : r.right;

  const stats = {};
  for (const s of sides) stats[s] = { total: 0, aligned: 0, offGrid: 0, worst: [] };

  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    let has = false;
    for (const s of sides) {
      const w = parseFloat(cs[`border${s}Width`]) || 0;
      if (w !== 0.5 || cs[`border${s}Style`] === "none") continue;
      has = true;
      
    }
    if (!has) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    for (const s of sides) {
      const w = parseFloat(cs[`border${s}Width`]) || 0;
      if (w !== 0.5 || cs[`border${s}Style`] === "none") continue;
      const off = frac(posOf(r, s));
      stats[s].total++;
      if (off <= 0.02) stats[s].aligned++;
      else stats[s].offGrid++;
      if (stats[s].worst.length < 5 && off > 0.02) {
        stats[s].worst.push({
          cls: String(el.className || "").slice(0, 36),
          tag: el.tagName.toLowerCase(),
          off: +off.toFixed(3),
          pos: +posOf(r, s).toFixed(3),
          size: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
          inView: r.top > 30 && r.bottom < innerHeight - 10,
        });
      }
    }
  }

  const summary = {};
  for (const s of sides) {
    summary[s] = {
      total: stats[s].total,
      aligned: stats[s].aligned,
      offGrid: stats[s].offGrid,
      offGridShare: stats[s].total ? +(stats[s].offGrid / stats[s].total).toFixed(3) : null,
      worst: stats[s].worst,
    };
  }

  // 截图可测样本：视口内、尺寸够大、需要 top 边 0.5px
  const measurable = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.borderTopWidth) !== 0.5 || cs.borderTopStyle === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.top < 40 || r.bottom > innerHeight - 20) continue;
    measurable.push({
      cls: String(el.className || "").slice(0, 36),
      tag: el.tagName.toLowerCase(),
      index: -1,
      top: +r.top.toFixed(3),
      deviceOffset: +frac(r.top).toFixed(3),
      size: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
    });
  }

  return { dpr, perSide: summary, measurableTopCandidates: measurable.slice(0, 10) };
})();
