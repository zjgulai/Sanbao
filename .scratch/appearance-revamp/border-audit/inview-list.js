/** 视口内每条边框的归属清单：谁、多宽、哪个 token。只读。 */
(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const norm = (v) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const cs0 = getComputedStyle(document.body);
  const tokens = {};
  for (const t of ["--dsw-alias-border-l1", "--dsw-alias-border-l2", "--dsw-alias-border-l3", "--dsw-alias-border-l4"]) {
    tokens[t] = norm(cs0.getPropertyValue(t).trim());
  }

  const sides = ["Top", "Right", "Bottom", "Left"];
  const rows = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!(r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0 && r.height > 0)) continue;
    for (const s of sides) {
      const w = parseFloat(cs[`border${s}Width`]) || 0;
      if (w === 0 || cs[`border${s}Style`] === "none") continue;
      const c = norm(cs[`border${s}Color`]);
      if (!c || c.a < 0.001) continue;
      let owner = null;
      for (const [t, v] of Object.entries(tokens)) {
        if (Math.abs(v.r - c.r) <= 1 && Math.abs(v.g - c.g) <= 1 && Math.abs(v.b - c.b) <= 1) { owner = t.replace("--dsw-alias-border-", ""); break; }
      }
      rows.push({ side: s, tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 30), w, owner: owner || "?" });
    }
  }
  const key = (r) => `${r.tag}.${r.cls.split(" ")[0]}|${r.w}px|${r.owner}`;
  const counts = {};
  for (const r of rows) counts[key(r)] = (counts[key(r)] || 0) + 1;
  return {
    inViewBorderLines: rows.length,
    byElement: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`),
  };
})();
