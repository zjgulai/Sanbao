/**
 * 边框审计（在 DSH 渲染进程里求值，只读）。
 *
 * 回答三个问题：
 *   1. 「所有组件都有边框」这句话的量级是多少？—— 有边框元素数 / 总元素数
 *   2. 画出来的是多粗的线？—— 线宽直方图（上游设计语言是 .5px 发丝线）
 *   3. 颜色多重？—— 解析后的 border-color 直方图 + 相对自身背景的对比度分档
 *
 * 本表达式**只读**：不写样式、不改 DOM、不切主题。
 */
(() => {
  const ratio = (a, b) => (b === 0 ? 0 : +(a / b).toFixed(4));

  // —— 1. 收集所有元素（含 shadow root）——
  const elements = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      elements.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);

  const parseColor = (value) => {
    const m = value.match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/,
    );
    if (!m) return null;
    return {
      r: +m[1],
      g: +m[2],
      b: +m[3],
      a: m[4] === undefined ? 1 : +m[4],
      raw: value,
    };
  };

  // 相对亮度（WCAG）
  const lum = ({ r, g, b }) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const sides = ["Top", "Right", "Bottom", "Left"];
  const widthHist = {};
  const colorHist = {};
  const bordered = [];

  for (const el of elements) {
    const cs = getComputedStyle(el);
    const widths = {};
    let maxWidth = 0;
    let hasBorder = false;
    for (const s of sides) {
      const w = parseFloat(cs[`border${s}Width`]) || 0;
      const style = cs[`border${s}Style`];
      const col = parseColor(cs[`border${s}Color`]);
      const drawn = w > 0 && style !== "none" && col && col.a > 0.001;
      widths[s] = drawn ? w : 0;
      if (drawn) {
        hasBorder = true;
        maxWidth = Math.max(maxWidth, w);
      }
    }
    if (!hasBorder) continue;

    const key = `${maxWidth}px`;
    widthHist[key] = (widthHist[key] || 0) + 1;

    // 取最粗那一侧的颜色作为该元素的代表色
    let rep = null;
    for (const s of sides) {
      if (widths[s] === maxWidth && widths[s] > 0) {
        rep = parseColor(cs[`border${s}Color`]);
        break;
      }
    }
    if (rep) {
      const ck = rep.raw;
      colorHist[ck] = (colorHist[ck] || 0) + 1;
    }

    const ownBg = parseColor(cs.backgroundColor);
    const parent = el.parentElement;
    const bgBehind =
      ownBg && ownBg.a > 0.999
        ? ownBg
        : parseColor(getComputedStyle(parent || document.body).backgroundColor) ||
          { r: 255, g: 255, b: 255, a: 1 };

    let contrast = null;
    if (rep && rep.a > 0.001) {
      // 边框半透明时，先把它与背后底色合成，再算对比度
      const comp = {
        r: rep.r * rep.a + bgBehind.r * (1 - rep.a),
        g: rep.g * rep.a + bgBehind.g * (1 - rep.a),
        b: rep.b * rep.a + bgBehind.b * (1 - rep.a),
      };
      const l1 = lum(comp);
      const l2 = lum(bgBehind);
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      contrast = +((hi + 0.05) / (lo + 0.05)).toFixed(3);
    }

    bordered.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && String(el.className).slice(0, 60)) || "",
      w: maxWidth,
      color: rep ? rep.raw : null,
      alpha: rep ? rep.a : null,
      contrast,
      shadow: cs.boxShadow !== "none" ? cs.boxShadow.slice(0, 60) : null,
      bg: cs.backgroundColor,
    });
  }

  // —— 2. token 解析值（body 与 html 上都读，看是否有局部覆盖）——
  const readTokens = (el) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const t of [
      "--dsw-alias-border-l1",
      "--dsw-alias-border-l2",
      "--dsw-alias-border-l3",
      "--dsw-alias-border-l4",
      "--dsw-alias-border-l2-darkmode-thin",
      "--dsw-alias-bg-base",
      "--dsw-alias-bg-layer-1",
      "--dsw-alias-bg-layer-2",
    ]) {
      out[t] = cs.getPropertyValue(t).trim();
    }
    return out;
  };

  // —— 3. 对比度分档 ——
  const buckets = { "≤1.15 (发丝/几乎不可见)": 0, "1.15–1.35 (克制)": 0, "1.35–1.6 (可见)": 0, ">1.6 (重)": 0 };
  for (const b of bordered) {
    if (b.contrast === null) continue;
    if (b.contrast <= 1.15) buckets["≤1.15 (发丝/几乎不可见)"]++;
    else if (b.contrast <= 1.35) buckets["1.15–1.35 (克制)"]++;
    else if (b.contrast <= 1.6) buckets["1.35–1.6 (可见)"]++;
    else buckets[">1.6 (重)"]++;
  }

  const topColors = Object.entries(colorHist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([color, count]) => ({ color, count, alpha: parseColor(color)?.a ?? null }));

  // 最"重"的元素样本：先按对比度、再按线宽
  const heaviest = bordered
    .filter((b) => b.contrast !== null)
    .sort((a, b) => b.contrast - a.contrast || b.w - a.w)
    .slice(0, 12)
    .map((b) => `${b.tag}.${b.cls.split(" ")[0]} | ${b.w}px | a=${b.alpha} | contrast=${b.contrast}`);

  return {
    environment: {
      href: location.href,
      devicePixelRatio: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      darkTheme: document.body.hasAttribute("data-ds-dark-theme"),
    },
    counts: {
      totalElements: elements.length,
      borderedElements: bordered.length,
      borderedShare: ratio(bordered.length, elements.length),
      withBoxShadow: bordered.filter((b) => b.shadow).length,
    },
    borderWidthHistogram: widthHist,
    borderColorHistogram: topColors,
    contrastBuckets: buckets,
    resolvedTokens: {
      body: readTokens(document.body),
      html: readTokens(document.documentElement),
    },
    heaviestSamples: heaviest,
  };
})();
