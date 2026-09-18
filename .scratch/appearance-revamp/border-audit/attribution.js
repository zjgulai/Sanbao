/**
 * 归因校验：把上游 shipped 值与我们新值放在**同一个底色**上比较。
 * 若两者同底同色，则 afterVsUpstream 应为 1.00 —— 从而证明残差来自底色而非 token。只读。
 */
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
  const lum = ({ r, g, b }) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (x, y) => { const a = lum(x), b = lum(y); return +(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05))).toFixed(4); };
  const over = (fg, bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a), b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 });

  const liveBg = norm(getComputedStyle(document.body).getPropertyValue("--dsw-alias-bg-base").trim());
  const upstreamBg = norm("#151517");

  const pairs = [
    ["l1", "#ffffff0f", "rgb(255 255 255 / 0.059)"],
    ["l2", "#ffffff1f", "rgb(255 255 255 / 0.122)"],
    ["l3", "#ffffff29", "rgb(255 255 255 / 0.161)"],
    ["l4", "#ffffff33", "rgb(255 255 255 / 0.2)"],
  ];

  const rows = [];
  for (const [level, upRaw, ourRaw] of pairs) {
    const up = norm(upRaw), our = norm(ourRaw);
    // 同底（我们自己的底色）：两者应完全同重
    const upOnLive = contrast(over(up, liveBg), liveBg);
    const ourOnLive = contrast(over(our, liveBg), liveBg);
    // 同底（上游底色）
    const upOnUp = contrast(over(up, upstreamBg), upstreamBg);
    const ourOnUp = contrast(over(our, upstreamBg), upstreamBg);
    // alpha 是否逐位相等
    rows.push({
      level,
      alphaEqual: Math.abs(up.a - our.a) < 1e-9,
      upstreamAlpha: +up.a.toFixed(6),
      ourAlpha: +our.a.toFixed(6),
      sameBackgroundRatio: +((ourOnLive - 1) / (upOnLive - 1)).toFixed(4),
      onUpstreamBgRatio: +((ourOnUp - 1) / (upOnUp - 1)).toFixed(4),
      crossBackgroundRatio: +((ourOnLive - 1) / (upOnUp - 1)).toFixed(4),
    });
  }

  return {
    liveBackground: `rgb(${liveBg.r},${liveBg.g},${liveBg.b})`,
    upstreamBackground: `rgb(${upstreamBg.r},${upstreamBg.g},${upstreamBg.b})`,
    reading:
      "sameBackgroundRatio/onUpstreamBgRatio 应恒为 1.0000（同底同值）。crossBackgroundRatio 才是先前 1.04–1.10 的来源。",
    rows,
  };
})();
