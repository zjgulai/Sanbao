#!/usr/bin/env node
/**
 * 只读 CDP 求值器：在**正在运行的** DSH 渲染进程里跑一段表达式并把结果按值取回。
 *
 * 只读纪律：本脚本只发 Runtime.evaluate，且**从不**把改写 DOM 的表达式交给它。
 * 它不切主题、不写变量、不改可见状态。唯一的能力是「读」。
 *
 * 用法：
 *   node cdp-eval.mjs --target <url 子串> --expr-file <文件>
 *   node cdp-eval.mjs --list
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const PORT = Number(arg("port", 9333));
const LIST = argv.includes("--list");
const TARGET = arg("target", "127.0.0.1:43120");
const EXPR_FILE = arg("expr-file");

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

const all = await targets();
if (LIST) {
  for (const t of all) {
    console.log(`${t.type}\t${t.url}\t${t.webSocketDebuggerUrl}`);
  }
  process.exit(0);
}

const page = all.find((t) => t.type === "page" && t.url.includes(TARGET));
if (!page) {
  console.error(
    `no page target matching "${TARGET}". available:\n` +
      all.map((t) => `  ${t.type}  ${t.url}`).join("\n"),
  );
  process.exit(2);
}
if (!EXPR_FILE) {
  console.error("--expr-file is required");
  process.exit(2);
}

const expression = readFileSync(EXPR_FILE, "utf8");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

function send(method, params) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});

ws.addEventListener("error", (e) => {
  console.error("ws error", e.message ?? e);
  process.exit(2);
});

await new Promise((resolve) => ws.addEventListener("open", resolve));

try {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    console.error(
      "page threw:",
      JSON.stringify(result.exceptionDetails, null, 2).slice(0, 2000),
    );
    process.exit(1);
  }
  console.log(
    typeof result.result.value === "string"
      ? result.result.value
      : JSON.stringify(result.result.value, null, 2),
  );
} finally {
  ws.close();
}
