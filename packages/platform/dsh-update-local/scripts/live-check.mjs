#!/usr/bin/env node
/**
 * 实机读数：真 app bundle + 本地 feed 服务，跑完四种状态各一次。
 *
 * 为什么不用真 URL 做主读数：GitHub Releases 的 latest 附件要机制后第一版才上传，
 * 现在去拉只会得到 http-error——那也是一个读数（诚实地报「读不到」），放在最后一条。
 *
 * 用法：node scripts/live-check.mjs [--app /Applications/DSH\ Desktop.app]
 * 退出码：0 = 全部符合预期；1 = 有读数与预期不符；2 = 用法错误。
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

import { judgeUpdate } from "../lib/feed.js";
import { fetchFeed, readBundleVersion } from "../lib/index.js";
import { parseLuteVersion } from "../lib/feed.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const DEFAULT_APP = "/Applications/DSH Desktop.app";
const DEFAULT_FEED_URL = "https://github.com/zjgulai/Sanbao/releases/latest/download/latest.json";

function parseArgs(argv) {
  let app = DEFAULT_APP;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--app") {
      if (argv[i + 1] === undefined) return { error: "--app 缺少值" };
      app = argv[i + 1];
      i += 1;
    } else {
      return { error: `未知参数：${argv[i]}` };
    }
  }
  return { app };
}

async function withServer(payloads, fn) {
  const server = http.createServer((req, res) => {
    const body = payloads[req.url ?? ""];
    if (body === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(`用法错误：${args.error}\n`);
    return 2;
  }

  const read = readBundleVersion(args.app ?? DEFAULT_APP);
  if (!read.ok) {
    process.stderr.write(`读不出本机版本：${read.detail}\n`);
    return 1;
  }
  const current = parseLuteVersion(read.value);
  if (!current.ok) {
    process.stderr.write(`本机版本不是 LUTE 构建：${current.detail}\n`);
    return 1;
  }
  process.stdout.write(`本机：${read.value} → LUTE ${current.lute}（${args.app}）\n`);

  const snapshotPath = path.join(repoRoot, "release/2.5.0.latest.json");
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const newer = { ...snapshot, version: "2.6.0", dmg: "DSH-Desktop-LUTE-2.6.0-mac-arm64.dmg" };
  const older = { ...snapshot, version: "2.4.0", dmg: "DSH-Desktop-LUTE-2.4.0-mac-arm64.dmg" };
  const broken = { ...snapshot, sha256: "not-a-hash" };

  const rows = [];
  await withServer(
    { "/latest.json": snapshot, "/newer.json": newer, "/older.json": older, "/broken.json": broken },
    async (base) => {
      for (const [label, url, want] of [
        ["回填快照（同版）", `${base}/latest.json`, "up-to-date"],
        ["构造的更高版本", `${base}/newer.json`, "update-available"],
        ["构造的更低版本", `${base}/older.json`, "feed-behind"],
        ["构造的坏形状", `${base}/broken.json`, "feed-invalid"],
        ["404", `${base}/missing.json`, "feed-unreadable"]
      ]) {
        const feed = await fetchFeed(url, 5000);
        const verdict = judgeUpdate({ current, feed, channel: "stable" });
        rows.push({ label, want, got: verdict.state, message: verdict.message });
      }
    }
  );

  const realFeed = await fetchFeed(DEFAULT_FEED_URL, 8000);
  const realVerdict = judgeUpdate({ current, feed: realFeed, channel: "stable" });
  rows.push({
    label: "真 Releases latest（机制后第一版才上传附件）",
    want: "feed-unreadable",
    got: realVerdict.state,
    message: realVerdict.message,
    informational: true
  });

  let failed = 0;
  for (const row of rows) {
    const ok = row.informational ? true : row.got === row.want;
    if (!ok) failed += 1;
    process.stdout.write(`${ok ? "ok  " : "FAIL"} [${row.got}] ${row.label}：${row.message}\n`);
  }
  process.stdout.write(failed === 0 ? "live-check: 全部符合预期\n" : `live-check: ${failed} 条不符预期\n`);
  return failed === 0 ? 0 : 1;
}

process.exit(await main());
