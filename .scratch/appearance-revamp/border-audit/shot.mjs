#!/usr/bin/env node
/**
 * 紧裁截图：对某个元素的某一条边取一条很窄的像素带（默认 24×8 CSS px），
 * 用于在像素级测量「边框到底画成了几个设备像素、什么颜色」。
 *
 * 紧裁是**隐私纪律**：只取边框附近几个像素，不把会话内容截进来。
 *
 * 只读：不发任何改变页面的求值，只做 Page.captureScreenshot。
 */
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};

const PORT = Number(arg("port", 9333));
const TARGET = arg("target", "127.0.0.1:43120");
const SELECTOR = arg("selector");
const INDEX = Number(arg("index", 0));
const SIDE = arg("side", "top");
const OUT = arg("out", "/tmp/border-strip.png");
const PAD = Number(arg("pad", 4));
const SPAN = Number(arg("span", 24));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === "page" && t.url.includes(TARGET));
if (!page) {
  console.error("no target");
  process.exit(2);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((res, rej) => {
    const m = ++id;
    pending.set(m, { res, rej });
    ws.send(JSON.stringify({ id: m, method, params }));
  });
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
});
await new Promise((r) => ws.addEventListener("open", r));

const expr = `(() => {
  const els = document.querySelectorAll(${JSON.stringify(SELECTOR)});
  const el = els[${INDEX}];
  if (!el) return { error: "selector matched " + els.length + " elements" };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    dpr: devicePixelRatio,
    className: String(el.className).slice(0, 60),
    border: {
      top: [cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor],
      bottom: [cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor],
      left: [cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor],
      right: [cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor],
    },
  };
})()`;

const info = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
const v = info.result.value;
if (v.error) {
  console.error(v.error);
  process.exit(1);
}

const r = v.rect;
const pad = PAD;
const span = Math.min(SPAN, SIDE === "top" || SIDE === "bottom" ? r.w : r.h);
const clip =
  SIDE === "top"
    ? { x: r.x + 2, y: r.y - pad, width: span, height: pad + 2 }
    : SIDE === "bottom"
      ? { x: r.x + 2, y: r.y + r.h - 2, width: span, height: pad + 2 }
      : SIDE === "left"
        ? { x: r.x - pad, y: r.y + 2, width: pad + 2, height: span }
        : { x: r.x + r.w - 2, y: r.y + 2, width: pad + 2, height: span };

const shot = await send("Page.captureScreenshot", {
  format: "png",
  clip: { ...clip, scale: v.dpr },
  captureBeyondViewport: false,
});
writeFileSync(OUT, Buffer.from(shot.data, "base64"));

console.log(
  JSON.stringify(
    {
      out: OUT,
      selector: SELECTOR,
      index: INDEX,
      side: SIDE,
      className: v.className,
      dpr: v.dpr,
      rect: r,
      clip,
      border: v.border,
    },
    null,
    2,
  ),
);
ws.close();
