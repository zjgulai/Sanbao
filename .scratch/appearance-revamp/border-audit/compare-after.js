/**
 * 「改后」等口径对比：把新供给函数产出的 token 值，投进真实 CSS 引擎（canvas 归一化）
 * 与上游 shipped 值比对比度。**只读**——canvas 不挂进文档，页面一个字节都不改。
 *
 * 说明：活动页面此刻仍跑旧主题（新值生效需重启），所以这里测的是「按新值会画成什么」，
 * 用的是**本页真实引擎**与**本页真实底色**，不是静态推演。
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
    const a = lum(x);
    const b = lum(y);
    return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(3);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const hex = (c) =>
    "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  const liveBg = norm(getComputedStyle(document.body).getPropertyValue("--dsw-alias-bg-base").trim());
  const upstreamBg = norm("#151517");

  // 上游 shipped（dsh-client-ui-theme，dark 段原文）
  const upstream = { l1: "#ffffff0f", l2: "#ffffff1f", l3: "#ffffff29", l4: "#ffffff33" };
  // 新供给函数产出（tsx 实跑 buildThemeTokenOverrides 打印，dark 侧）
  const after = {
    l1: "rgb(255 255 255 / 0.059)",
    l2: "rgb(255 255 255 / 0.122)",
    l3: "rgb(255 255 255 / 0.161)",
    l4: "rgb(255 255 255 / 0.2)",
  };
  // 改前（本会话实测的活动值，dark 侧不透明 oklch 混合）
  const before = {
    l1: "color-mix(in oklch, #FFFFFF 10%, #181C1A)",
    l2: "color-mix(in oklch, #FFFFFF 16%, #181C1A)",
    l3: "color-mix(in oklch, #FFFFFF 22%, #181C1A)",
    l4: "color-mix(in oklch, #FFFFFF 30%, #181C1A)",
  };

  const rows = [];
  for (const level of ["l1", "l2", "l3", "l4"]) {
    const up = norm(upstream[level]);
    const upPainted = over(up, upstreamBg);
    const upC = contrast(upPainted, upstreamBg);

    const af = norm(after[level]);
    const afPainted = over(af, liveBg);
    const afC = contrast(afPainted, liveBg);

    const bf = norm(before[level]);
    const bfPainted = bf.a > 0.999 ? bf : over(bf, liveBg);
    const bfC = contrast(bfPainted, liveBg);

    rows.push({
      level,
      before: { raw: before[level], painted: hex(bfPainted), contrast: bfC },
      after: { raw: after[level], painted: hex(afPainted), contrast: afC },
      upstream: { raw: upstream[level], painted: hex(upPainted), contrast: upC },
      afterVsUpstream: +((afC - 1) / (upC - 1)).toFixed(2),
      beforeVsUpstream: +((bfC - 1) / (upC - 1)).toFixed(2),
      alphaParsedCorrectly: +af.a.toFixed(4),
    });
  }

  return {
    note: "afterVsUpstream=1.00 表示与 Harness shipped 等重；alphaParsedCorrectly 证明引擎真的把 rgb(r g b / a) 解析成了对应 alpha",
    engine: { dpr: devicePixelRatio, dark: document.body.hasAttribute("data-ds-dark-theme") },
    liveBackground: hex(liveBg),
    upstreamBackground: hex(upstreamBg),
    rows,
  };
})();
