/**
 * dsh-update 的判据。跑法：node --test test/*.spec.mjs
 *
 * 两条纪律：
 *  - **交叉钉**：本包 `lib/feed.js` 是 feed 契约的消费侧实现，生产侧是仓库里的
 *    `scripts/lib/update-feed.mjs`。两份必须同源——同一张突变表上两份判据必须给出同样的结论。
 *  - **恒真桩突变**：把 judgeUpdate 换成恒返回 `{state:'up-to-date'}` 的桩，负向用例必须全红。
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  FEED_CHANNELS,
  FEED_FIELDS,
  compareVersions,
  judgeUpdate,
  parseLuteVersion,
  validateFeed
} from "../lib/feed.js";
import { appBundleFromExecPath, fetchFeed, readBundleVersion } from "../lib/index.js";

const GOOD_FEED = Object.freeze({
  schema_version: 1,
  version: "2.5.0",
  dmg: "DSH-Desktop-LUTE-2.5.0-mac-arm64.dmg",
  sha256: "9c9e44f7bb035d671dfa3affb3545e059c8c8d3f9032d55597bba2b2411365c2",
  build: "20260917-203118",
  source_commit: "605a15916e7b6dd03ca2f21ddb53c7e5c20f44f2",
  profile_snapshot: "5f6ca254d10a00d0",
  min_os: "12.0",
  channel: "stable",
  notes: ""
});

function withField(key, value) {
  return { ...GOOD_FEED, [key]: value };
}

/** 换版本时 dmg 名要跟着换，否则撞的是 dmg/version 一致性那条规则而不是本用例要测的东西。 */
function withVersion(version) {
  return { ...GOOD_FEED, version, dmg: `DSH-Desktop-LUTE-${version}-mac-arm64.dmg` };
}

/**
 * 收窄到失败分支（断言 detail/reason 用；`assert.equal(x.reason, …)` 这种
 * 属性访问链不会被断言签名收窄）。
 * @param {import("../lib/feed.js").ParsedLuteVersion} parsed
 */
function failed(parsed) {
  if (parsed.ok) throw new Error(`期望失败读数，实得 ${JSON.stringify(parsed)}`);
  return parsed;
}

// ---------------------------------------------------------------- parseLuteVersion

test("parseLuteVersion: 取出 -lute. 后面的版本", () => {
  const r = parseLuteVersion("2.0.10-lute.2.5.0");
  assert.equal(r.ok, true);
  assert.equal(r.lute, "2.5.0");
  assert.equal(r.upstream, "2.0.10");
});

test("parseLuteVersion: 没有 -lute. 后缀是具名状态 not-lute（不是错误也不是最新）", () => {
  const r = parseLuteVersion("2.0.10");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not-lute");
  assert.match(r.detail, /2\.0\.10/);
});

test("parseLuteVersion: 空串是 unreadable", () => {
  assert.equal(failed(parseLuteVersion("")).reason, "unreadable");
  assert.equal(failed(parseLuteVersion(null)).reason, "unreadable");
});

// ---------------------------------------------------------------- compareVersions

test("compareVersions: 数字段比较（不是字符串比较）", () => {
  /** @type {Array<[string, string, number]>} */
  const cases = [
    ["2.10.0", "2.9.0", 1],
    ["2.5.0", "2.5.0", 0],
    ["2.5.0", "2.5.1", -1],
    ["1.0", "1.0.0", 0],
    ["10.0.0", "9.9.9", 1]
  ];
  for (const [a, b, want] of cases) {
    assert.equal(compareVersions(a, b), want, `${a} vs ${b}`);
  }
});

test("compareVersions: 形状不支持时抛（不静默返回 0）", () => {
  assert.throws(() => compareVersions("2.5", "stable"), /版本形状不支持/);
});

// ---------------------------------------------------------------- validateFeed

test("validateFeed: 合规 feed 通过", () => {
  const r = validateFeed(GOOD_FEED);
  assert.deepEqual(r, { passed: true, violations: [] });
});

test("validateFeed: 每个字段被突变都必须判红并点名", () => {
  /** @type {Array<[string, unknown, string]>} */
  const mutations = [
    ["schema_version", 2, "schema_version"],
    ["version", "9.9", "version"],
    ["version", "stable", "version"],
    ["dmg", "DSH-Desktop-LUTE-2.5.0-mac-arm64.zip", "dmg"],
    ["dmg", "DSH-Desktop-LUTE-2.4.0-mac-arm64.dmg", "dmg"],
    ["sha256", "9C9E44F7", "sha256"],
    ["build", "", "build"],
    ["source_commit", "zzz", "source_commit"],
    ["profile_snapshot", "   ", "profile_snapshot"],
    ["min_os", "twelve", "min_os"],
    ["channel", "beta", "channel"],
    ["notes", 42, "notes"]
  ];
  for (const [key, value, named] of mutations) {
    const r = validateFeed(withField(key, value));
    assert.equal(r.passed, false, `${key}=${JSON.stringify(value)} 应当判红`);
    assert.ok(
      r.violations.some((v) => v.includes(named)),
      `${key} 判红要点名 ${named}，实得：${r.violations.join("；")}`
    );
  }
});

test("validateFeed: 未知字段判违规（为签名等将来字段留一次公开的 schema 变更）", () => {
  const r = validateFeed({ ...GOOD_FEED, signature: "deadbeef" });
  assert.equal(r.passed, false);
  assert.ok(r.violations.some((v) => v.includes("未知字段 signature")));
});

test("validateFeed: 非对象一律判红", () => {
  for (const bad of [null, "{}", [], 42]) {
    assert.equal(validateFeed(bad).passed, false, JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------- judgeUpdate

const CURRENT = parseLuteVersion("2.0.10-lute.2.5.0");

test("judgeUpdate: feed 更新 → update-available（附 dmg / sha256 / min_os）", () => {
  const r = judgeUpdate({ current: CURRENT, feed: { ok: true, data: withVersion("2.6.0") } });
  assert.equal(r.state, "update-available");
  assert.equal(r.latest, "2.6.0");
  assert.equal(r.current, "2.5.0");
  assert.match(String(r.dmg), /2\.6\.0/);
  assert.match(r.message, /有新版 2\.6\.0/);
});

test("judgeUpdate: 同版 → up-to-date", () => {
  const r = judgeUpdate({ current: CURRENT, feed: { ok: true, data: GOOD_FEED } });
  assert.equal(r.state, "up-to-date");
});

test("judgeUpdate: feed 比本机旧 → feed-behind（不是「已是最新」）", () => {
  const r = judgeUpdate({ current: CURRENT, feed: { ok: true, data: withVersion("2.4.0") } });
  assert.equal(r.state, "feed-behind");
  assert.match(r.message, /没跟上/);
});

test("judgeUpdate: 通道不匹配不判新版", () => {
  const r = judgeUpdate({
    current: CURRENT,
    feed: { ok: true, data: withField("channel", "canary") },
    channel: "stable"
  });
  assert.equal(r.state, "channel-mismatch");
});

test("judgeUpdate: feed 读不到 → feed-unreadable（绝不折叠成「已是最新」）", () => {
  const r = judgeUpdate({
    current: CURRENT,
    feed: { ok: false, state: "unreachable", detail: "getaddrinfo ENOTFOUND" }
  });
  assert.equal(r.state, "feed-unreadable");
  assert.match(r.message, /读不到/);
});

test("judgeUpdate: feed 形状不合法 → feed-invalid 并带上违规清单", () => {
  const r = judgeUpdate({ current: CURRENT, feed: { ok: true, data: withField("sha256", "short") } });
  assert.equal(r.state, "feed-invalid");
  assert.ok((r.violations ?? []).some((v) => v.includes("sha256")));
});

test("judgeUpdate: 本机版本读不出 / 非 LUTE 构建是两个具名状态", () => {
  const unreadable = judgeUpdate({
    current: { ok: false, reason: "unreadable", detail: "找不到 Info.plist" },
    feed: { ok: true, data: GOOD_FEED }
  });
  assert.equal(unreadable.state, "current-unreadable");

  const notLute = judgeUpdate({
    current: parseLuteVersion("2.0.10"),
    feed: { ok: true, data: GOOD_FEED }
  });
  assert.equal(notLute.state, "current-not-lute");
});

// ---------------------------------------------------------------- 交叉钉（与生产侧同源）

test("交叉钉：本包的字段表与生产侧「派生出来的 feed」逐字一致", async () => {
  const producer = await loadProducer();
  // 钉真实产物的键序，而不是生产侧的某个内部常量：内部常量可以不动而产物变了。
  const manifest = producer.parseReleaseManifest(
    [
      "# version=2.5.0",
      "# dmg=DSH-Desktop-LUTE-2.5.0-mac-arm64.dmg",
      "# build=20260917-203118",
      "# source_commit=605a15916e7b6dd03ca2f21ddb53c7e5c20f44f2",
      "# source_dirty=0",
      "# profile_snapshot=5f6ca254d10a00d0",
      "9c9e44f7bb035d671dfa3affb3545e059c8c8d3f9032d55597bba2b2411365c2  DSH-Desktop-LUTE-2.5.0-mac-arm64.dmg",
      ""
    ].join("\n")
  );
  const feed = producer.buildUpdateFeed({ manifest, minOs: "12.0", notes: "" });
  assert.deepEqual(Object.keys(feed), [...FEED_FIELDS], "消费侧的字段表与生产侧产物的键序分家");
  assert.deepEqual([...FEED_CHANNELS], [...producer.FEED_CHANNELS]);
});

test("交叉钉：真实回填快照必须能被消费侧判据放行", () => {
  const snapshot = path.resolve(import.meta.dirname, "../../../../release/2.5.0.latest.json");
  assert.ok(fs.existsSync(snapshot), `回填快照不在场：${snapshot}`);
  const r = validateFeed(JSON.parse(fs.readFileSync(snapshot, "utf8")));
  assert.deepEqual(r, { passed: true, violations: [] });
});

const PRODUCER_PATH = path.resolve(import.meta.dirname, "../../../../scripts/lib/update-feed.mjs");

async function loadProducer() {
  assert.ok(fs.existsSync(PRODUCER_PATH), `生产侧实现不在场：${PRODUCER_PATH}`);
  return import(PRODUCER_PATH);
}

test("交叉钉：同一张突变表，两份判据给出同样的结论", async () => {
  const repoLib = await loadProducer();
  const mutations = [
    GOOD_FEED,
    withField("version", "9.9"),
    withField("dmg", "x.zip"),
    withField("sha256", "ABC"),
    withField("build", ""),
    withField("source_commit", "nope"),
    withField("min_os", "twelve"),
    withField("channel", "beta"),
    { ...GOOD_FEED, extra: 1 }
  ];
  for (const feed of mutations) {
    const mine = validateFeed(feed).passed;
    const theirs = repoLib.validateUpdateFeed(feed).passed;
    assert.equal(mine, theirs, `两份判据在 ${JSON.stringify(feed).slice(0, 80)} 上分家`);
  }
});

test("交叉钉：版本比较表两份一致", async () => {
  const repoLib = await loadProducer();
  const pairs = [["2.5.0", "2.5.0"], ["2.10.0", "2.9.0"], ["1.0", "1.0.0"], ["2.5.0", "2.5.1"]];
  for (const [a, b] of pairs) {
    assert.equal(compareVersions(a, b), repoLib.compareVersions(a, b), `${a} vs ${b}`);
  }
});

// ---------------------------------------------------------------- fetchFeed（真 HTTP，不打桩）

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  try {
    return await fn(`http://127.0.0.1:${port}/latest.json`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("fetchFeed: 正常 JSON 取回对象", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(GOOD_FEED));
    },
    async (url) => {
      const r = await fetchFeed(url);
      assert.equal(r.ok, true);
      assert.equal(/** @type {any} */ (r.data).version, "2.5.0");
    }
  );
});

test("fetchFeed: 404 是 http-error（具名，不折叠成空对象）", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(404);
      res.end("not found");
    },
    async (url) => {
      const r = await fetchFeed(url);
      assert.equal(r.ok, false);
      assert.equal(r.state, "http-error");
      assert.match(r.detail, /404/);
    }
  );
});

test("fetchFeed: 非 JSON 是 invalid-json（页面/网关错误页不许当 feed）", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html>hello</html>");
    },
    async (url) => {
      const r = await fetchFeed(url);
      assert.equal(r.ok, false);
      assert.equal(r.state, "invalid-json");
    }
  );
});

test("fetchFeed: 连不上是 unreachable", async () => {
  const r = await fetchFeed("http://127.0.0.1:1/latest.json", 2000);
  assert.equal(r.ok, false);
  assert.equal(r.state, "unreachable");
});

// ---------------------------------------------------------------- 本机版本读取

test("readBundleVersion: 从 XML plist 里读 CFBundleVersion", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-update-"));
  const bundle = path.join(dir, "Fake.app");
  fs.mkdirSync(path.join(bundle, "Contents"), { recursive: true });
  fs.writeFileSync(
    path.join(bundle, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Sanbao</string>
  <key>CFBundleVersion</key><string>2.0.10-lute.2.5.0</string>
  <key>CFBundleShortVersionString</key><string>2.0.10</string>
</dict></plist>
`,
    "utf8"
  );
  const r = readBundleVersion(bundle);
  assert.equal(r.ok, true);
  assert.equal(r.value, "2.0.10-lute.2.5.0");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("readBundleVersion: 缺 plist / 二进制 plist / 缺键都是具名失败", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-update-"));
  const bundle = path.join(dir, "Fake.app");
  fs.mkdirSync(path.join(bundle, "Contents"), { recursive: true });

  const missing = readBundleVersion(bundle);
  assert.equal(missing.ok, false);
  assert.match(missing.detail, /找不到/);

  fs.writeFileSync(path.join(bundle, "Contents", "Info.plist"), "bplist00\u0000\u0001binary", "utf8");
  const binary = readBundleVersion(bundle);
  assert.equal(binary.ok, false);
  assert.match(binary.detail, /二进制 plist/);

  fs.writeFileSync(
    path.join(bundle, "Contents", "Info.plist"),
    `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleName</key><string>Sanbao</string></dict></plist>`,
    "utf8"
  );
  const noKey = readBundleVersion(bundle);
  assert.equal(noKey.ok, false);
  assert.match(noKey.detail, /没有 CFBundleVersion/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("appBundleFromExecPath: 从 Contents/MacOS/<exe> 上溯到 .app", () => {
  assert.equal(
    appBundleFromExecPath("/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop"),
    "/Applications/DSH Desktop.app"
  );
  assert.equal(appBundleFromExecPath("/usr/local/bin/node"), null);
});

// ---------------------------------------------------------------- 恒真桩突变

test("恒真桩突变：判据必须能说「不」", () => {
  /** @param {any} input */
  const naive = (input) => ({ state: "up-to-date", message: "已是最新", input });
  /** @type {Array<any>} 夹具刻意混形状：判据必须逐条给出自己的结论 */
  const negatives = [
    { current: CURRENT, feed: { ok: false, state: "unreachable", detail: "offline" } },
    { current: CURRENT, feed: { ok: true, data: withField("sha256", "short") } },
    { current: CURRENT, feed: { ok: true, data: withField("channel", "canary") } },
    { current: CURRENT, feed: { ok: true, data: withVersion("2.6.0") } },
    { current: parseLuteVersion("2.0.10"), feed: { ok: true, data: GOOD_FEED } }
  ];
  for (const input of negatives) {
    assert.notEqual(naive(input).state, judgeUpdate(input).state, JSON.stringify(input).slice(0, 60));
  }
});
