/**
 * 等口径对比：上游设计意图的边框 vs 我们覆写后的边框，在同一个引擎里算对比度（只读）。
 *
 * 上游值取自 dsh-client-ui-theme/lib/client.js 里 design_platform_css_default 的
 * body / body[data-ds-dark-theme] 两段原文。我们当前值从活动页的 body 变量读。
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
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (x, y) => {
    const l1 = lum(x);
    const l2 = lum(y);
    return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(3);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  const bodyCs = getComputedStyle(document.body);
  const ourBg = norm(bodyCs.getPropertyValue("--dsw-alias-bg-base").trim());

  // 上游 dark 的 bg-base = --dsw-static-neutral-bluish-950 = #151517
  const upstreamBg = norm("#151517");

  const upstreamDark = {
    l1: "#ffffff0f",
    l2: "#ffffff1f",
    l3: "#ffffff29",
    l4: "#fff3",
  };

  const rows = [];
  for (const level of ["l1", "l2", "l3", "l4"]) {
    const upRaw = upstreamDark[level];
    const up = norm(upRaw);
    const upPainted = over(up, upstreamBg);

    const ourRaw = bodyCs.getPropertyValue(`--dsw-alias-border-${level}`).trim();
    const our = norm(ourRaw);
    const ourPainted = our.a > 0.999 ? our : over(our, ourBg);

    const upC = contrast(upPainted, upstreamBg);
    const ourC = contrast(ourPainted, ourBg);
    rows.push({
      level,
      upstream: { raw: upRaw, alpha: +up.a.toFixed(3), painted: hex(upPainted), contrastVsBg: upC },
      ours: { raw: ourRaw, alpha: +our.a.toFixed(3), painted: hex(ourPainted), contrastVsBg: ourC, hex: hex(our) },
      // 可见度倍数：以「相对底色的对比度超出 1 的部分」为尺度
      visibilityRatio: +((ourC - 1) / (upC - 1)).toFixed(2),
    });
  }

  return {
    note: "contrastVsBg = 边框与它所在底色的 WCAG 对比度；visibilityRatio = 我们相对上游的可见度倍数",
    environment: { dark: document.body.hasAttribute("data-ds-dark-theme"), dpr: devicePixelRatio },
    upstreamBg: hex(upstreamBg),
    ourBg: hex(ourBg),
    rows,
  };
})();
