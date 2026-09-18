/**
 * 边框审计 v2（只读）。
 *
 * v1 的仪器缺陷：Chromium 把 color-mix 派生的 border-color 序列化成
 * `oklch(L C none)`，v1 的正则只认 rgb()，于是 155 条边框被误判成 2 条。
 * v2 改用 canvas 的 fillStyle 做颜色归一化——canvas 不挂进文档，无可见副作用。
 *
 * 新增两项关键测量：
 *   · 对比度分档：每条边框相对它背后的底色有多可见
 *   · 设备像素对齐：0.5px 线落在非整数设备像素上会被抗锯齿摊成 2 个像素
 */
(() => {
  const dpr = window.devicePixelRatio;

  // —— 颜色归一化（canvas 不挂进文档）——
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const normCache = new Map();
  const norm = (value) => {
    if (!value) return null;
    if (normCache.has(value)) return normCache.get(value);
    let out = null;
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = value; // 不被识别就保留上一个值 → 用哨兵检测
      const s = ctx.fillStyle;
      if (s === "#000" && !/^#000000?$|^black$|^rgb\(0, 0, 0\)$/.test(value.trim())) {
        out = null;
      } else {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        out = { r, g, b, a: a / 255, hex: s };
      }
    } catch {
      out = null;
    }
    normCache.set(value, out);
    return out;
  };

  const lum = ({ r, g, b }) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(3);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  });

  // —— 解析 token 的实际颜色，供归属用 ——
  const bodyCs = getComputedStyle(document.body);
  const tokenNames = [
    "--dsw-alias-border-l1",
    "--dsw-alias-border-l2",
    "--dsw-alias-border-l3",
    "--dsw-alias-border-l4",
    "--dsw-alias-border-l2-darkmode-thin",
  ];
  const tokenColors = {};
  for (const t of tokenNames) {
    const raw = bodyCs.getPropertyValue(t).trim();
    tokenColors[t] = { raw, rgb: norm(raw) };
  }

  const bgBase = norm(bodyCs.getPropertyValue("--dsw-alias-bg-base").trim());
  const bgLayer1 = norm(bodyCs.getPropertyValue("--dsw-alias-bg-layer-1").trim());

  // —— 遍历 ——
  const sides = ["Top", "Right", "Bottom", "Left"];
  const attributed = Object.fromEntries(tokenNames.map((t) => [t, 0]));
  const unattributed = [];
  const widthHist = {};
  const contrastBuckets = {
    "≤1.10 几乎不可见": 0,
    "1.10–1.25 克制": 0,
    "1.25–1.5 清晰可见": 0,
    ">1.5 重": 0,
  };
  let bordered = 0;
  let offGrid = 0;
  let subPx = 0;
  const rows = [];

  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    let maxW = 0;
    let pick = null;
    for (const s of sides) {
      const w = parseFloat(cs[`border${s}Width`]) || 0;
      const st = cs[`border${s}Style`];
      const col = norm(cs[`border${s}Color`]);
      if (w > 0 && st !== "none" && col && col.a > 0.001) {
        if (w > maxW) {
          maxW = w;
          pick = { side: s, w, col, raw: cs[`border${s}Color`] };
        }
      }
    }
    if (!pick) continue;
    bordered++;
    widthHist[`${maxW}px`] = (widthHist[`${maxW}px`] || 0) + 1;
    if (maxW < 1) subPx++;

    // 归属 token
    let owner = null;
    for (const [t, v] of Object.entries(tokenColors)) {
      if (v.rgb && Math.abs(v.rgb.r - pick.col.r) <= 1 && Math.abs(v.rgb.g - pick.col.g) <= 1 && Math.abs(v.rgb.b - pick.col.b) <= 1) {
        owner = t;
        break;
      }
    }
    if (owner) attributed[owner]++;
    else if (unattributed.length < 10) unattributed.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 40), raw: pick.raw });

    // 背后底色：逐级向上找第一个不透明背景
    let bg = null;
    for (let n = el; n; n = n.parentElement) {
      const c = norm(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.999) {
        bg = c;
        break;
      }
    }
    if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };

    const painted = pick.col.a > 0.999 ? pick.col : over(pick.col, bg);
    const cr = contrast(painted, bg);
    if (cr <= 1.1) contrastBuckets["≤1.10 几乎不可见"]++;
    else if (cr <= 1.25) contrastBuckets["1.10–1.25 克制"]++;
    else if (cr <= 1.5) contrastBuckets["1.25–1.5 清晰可见"]++;
    else contrastBuckets[">1.5 重"]++;

    // 设备像素对齐：线在设备像素网格上的起始分数偏移
    const rect = el.getBoundingClientRect();
    const frac = (v) => Math.abs(v * dpr - Math.round(v * dpr));
    const offset = Math.max(frac(rect.left), frac(rect.top), frac(rect.right), frac(rect.bottom));
    if (maxW < 1 && offset > 0.25) offGrid++;

    if (rows.length < 400) {
      rows.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 44), w: maxW, owner, cr, offset: +offset.toFixed(3) });
    }
  }

  const byContrast = rows
    .filter((r) => r.cr !== null)
    .sort((a, b) => b.cr - a.cr)
    .slice(0, 15)
    .map((r) => `${r.tag}.${r.cls.split(" ")[0]} | ${r.w}px | ${r.owner || "?"} | contrast=${r.cr} | offGrid=${r.offset}`);

  return {
    environment: { dpr, innerWidth: window.innerWidth, innerHeight: window.innerHeight, dark: document.body.hasAttribute("data-ds-dark-theme") },
    tokenResolved: Object.fromEntries(
      Object.entries(tokenColors).map(([k, v]) => [k, { raw: v.raw, rgb: v.rgb ? `rgb(${v.rgb.r},${v.rgb.g},${v.rgb.b})` : null, alpha: v.rgb ? v.rgb.a : null }]),
    ),
    bgResolved: { base: bgBase && `rgb(${bgBase.r},${bgBase.g},${bgBase.b})`, layer1: bgLayer1 && `rgb(${bgLayer1.r},${bgLayer1.g},${bgLayer1.b})` },
    counts: { elements: document.querySelectorAll("*").length, bordered, subPixelBorders: subPx },
    borderWidthHistogram: widthHist,
    tokenAttribution: attributed,
    unattributedSamples: unattributed,
    contrastBuckets,
    offGridHairlines: offGrid,
    offGridShare: subPx ? +(offGrid / subPx).toFixed(3) : null,
    heaviestSamples: byContrast,
  };
})();
