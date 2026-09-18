/** 找出可测的 0.5px 边框样本：分别取「对齐」与「最坏偏移」各若干条。只读。 */
(() => {
  const dpr = devicePixelRatio;
  const frac = (v) => Math.abs(v * dpr - Math.round(v * dpr));
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.borderTopStyle === "none") continue;
    const w = parseFloat(cs.borderTopWidth) || 0;
    if (w !== 0.5) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 12) continue;
    if (r.y < 40 || r.y > innerHeight - 20) continue;
    out.push({
      cls: String(el.className || "").slice(0, 40),
      tag: el.tagName.toLowerCase(),
      y: +r.y.toFixed(3),
      x: +r.x.toFixed(3),
      h: +r.height.toFixed(2),
      w: +r.width.toFixed(2),
      topDeviceOffset: +frac(r.y).toFixed(3),
      color: cs.borderTopColor,
    });
  }
  const aligned = out.filter((o) => o.topDeviceOffset <= 0.02).slice(0, 4);
  const worst = out.filter((o) => o.topDeviceOffset > 0.4).slice(0, 4);
  return { total: out.length, alignedSamples: aligned, worstOffsetSamples: worst };
})();
