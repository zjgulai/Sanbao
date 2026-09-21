/**
 * Feed 契约的消费侧实现（纯函数，无 IO）。
 *
 * 为什么这份实现与 `scripts/lib/update-feed.mjs` 并存：那个是**生产侧**（从入库清单派生 feed，
 * 住仓库里，只有发布机跑）；这份是**消费侧**（宿主插件读过来的 feed），随包物化进 profile，
 * 装载点上没有仓库脚本可 import。两份必须同源，靠 test/update.spec.mjs 的交叉钉守住
 * （同一张突变表两份判据必须给出同样的通过/拒绝结论）。
 *
 * 「读不到」与「没有新版」是两个读数：本文件的所有失败路径都返回**具名状态**，
 * 绝不折叠成 false/undefined 让调用方误读成「已是最新」（P-15）。
 */

export const FEED_SCHEMA_VERSION = 1;

export const FEED_CHANNELS = Object.freeze(["stable", "canary"]);

/** 键序与生产侧逐字一致。 */
export const FEED_FIELDS = Object.freeze([
  "schema_version",
  "version",
  "dmg",
  "sha256",
  "build",
  "source_commit",
  "profile_snapshot",
  "min_os",
  "channel",
  "notes"
]);

/** feed 里的版本必须是发布用的三段式（x.y.z）。 */
const FEED_VERSION_RE = /^\d+\.\d+\.\d+$/;
const MIN_OS_RE = /^\d+(\.\d+){0,2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/;
/** 运行时版本取自 app Info.plist 的 CFBundleVersion（形如 `2.0.10-lute.2.5.0`）。 */
const LUTE_VERSION_RE = /-lute\.(\d+(?:\.\d+)*)$/;

/** 本机版本读数：`{ok:true, …}` 或具名失败。 */
/**
 * @typedef {{ok: true, upstream: string, lute: string} | {ok: false, reason: 'not-lute' | 'unreadable', detail: string}} ParsedLuteVersion
 */

/**
 * 从 CFBundleVersion 里取出本机的 LUTE 版本。
 * 上游自带的 Electron 版本（没有 `-lute.` 后缀）不是我们发的包——那是一个**具名状态**，不是错误。
 *
 * @param {unknown} cfBundleVersion
 * @returns {ParsedLuteVersion}
 */
export function parseLuteVersion(cfBundleVersion) {
  const raw = typeof cfBundleVersion === "string" ? cfBundleVersion.trim() : "";
  if (raw === "") {
    return { ok: false, reason: "unreadable", detail: "CFBundleVersion 为空" };
  }
  const m = LUTE_VERSION_RE.exec(raw);
  if (!m) {
    return {
      ok: false,
      reason: "not-lute",
      detail: `CFBundleVersion=${raw} 没有 -lute.<版本> 后缀（非 LUTE 构建）`
    };
  }
  return { ok: true, upstream: raw.slice(0, m.index), lute: m[1] };
}

/**
 * 数字段版本比较（左 > 右 → 1，相等 → 0，左 < 右 → -1）。形状不支持时抛。
 * @param {string} left
 * @param {string} right
 */
export function compareVersions(left, right) {
  const parts = (v) => {
    const s = String(v ?? "").trim();
    if (!/^\d+(\.\d+)*$/.test(s)) throw new Error(`版本形状不支持：${JSON.stringify(v)}`);
    return s.split(".").map((n) => Number(n));
  };
  const a = parts(left);
  const b = parts(right);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * feed 形状校验（不看清单——消费侧没有清单）。
 * @param {unknown} feed
 * @returns {{passed: boolean, violations: string[]}}
 */
export function validateFeed(feed) {
  const violations = [];
  if (feed === null || typeof feed !== "object" || Array.isArray(feed)) {
    return { passed: false, violations: ["feed 不是对象"] };
  }
  const record = /** @type {Record<string, unknown>} */ (feed);
  for (const key of Object.keys(record)) {
    if (!FEED_FIELDS.includes(key)) violations.push(`未知字段 ${key}`);
  }
  if (record.schema_version !== FEED_SCHEMA_VERSION) {
    violations.push(`schema_version 必须是 ${FEED_SCHEMA_VERSION}（读到 ${JSON.stringify(record.schema_version)}）`);
  }
  const version = record.version;
  if (typeof version !== "string" || !FEED_VERSION_RE.test(version)) {
    violations.push(`version 必须是三段式 x.y.z（读到 ${JSON.stringify(version)}）`);
  }
  if (typeof record.dmg !== "string" || !record.dmg.endsWith(".dmg")) {
    violations.push(`dmg 必须以 .dmg 结尾（读到 ${JSON.stringify(record.dmg)}）`);
  } else if (typeof version === "string" && !record.dmg.includes(version)) {
    violations.push(`dmg 名字里应含 version=${version}（读到 ${record.dmg}）`);
  }
  if (typeof record.sha256 !== "string" || !SHA256_RE.test(record.sha256)) {
    violations.push(`sha256 必须是 64 位小写十六进制（读到 ${JSON.stringify(record.sha256)}）`);
  }
  if (typeof record.build !== "string" || record.build.trim() === "") {
    violations.push("build 不能为空");
  }
  if (typeof record.source_commit !== "string" || !COMMIT_RE.test(record.source_commit)) {
    violations.push(`source_commit 必须是 7-40 位十六进制（读到 ${JSON.stringify(record.source_commit)}）`);
  }
  if (typeof record.profile_snapshot !== "string" || record.profile_snapshot.trim() === "") {
    violations.push("profile_snapshot 不能为空");
  }
  if (typeof record.min_os !== "string" || !MIN_OS_RE.test(record.min_os)) {
    violations.push(`min_os 必须是 1-3 段数字（读到 ${JSON.stringify(record.min_os)}）`);
  }
  if (typeof record.channel !== "string" || !FEED_CHANNELS.includes(record.channel)) {
    violations.push(`channel 必须是 ${FEED_CHANNELS.join(" / ")}（读到 ${JSON.stringify(record.channel)}）`);
  }
  if (typeof record.notes !== "string") {
    violations.push(`notes 必须是字符串（读到 ${JSON.stringify(record.notes)}）`);
  }
  return { passed: violations.length === 0, violations };
}

/**
 * 判断本机与 feed 的关系。
 *
 * 返回的 `state` 是**具名状态**：调用方（工具/日志）必须能分辨「已是最新」与「读不到」——
 * 把后者当好消息是本条契约唯一真正的危险形态。
 *
 * @param {{
 *   current: ReturnType<typeof parseLuteVersion>,
 *   feed: {ok: true, data: unknown} | {ok: false, state: 'unreachable' | 'http-error' | 'invalid-json', detail: string},
 *   channel?: string,
 * }} input
 */
export function judgeUpdate({ current, feed, channel = "stable" }) {
  if (!current || current.ok !== true) {
    return {
      state: current?.reason === "not-lute" ? "current-not-lute" : "current-unreadable",
      message: `本机版本读不出 LUTE 版本：${current?.detail ?? "未知原因"}`
    };
  }
  if (!feed || feed.ok !== true) {
    return {
      state: "feed-unreadable",
      message: `feed 读不到（${feed?.state ?? "unknown"}）：${feed?.detail ?? "未知原因"}`
    };
  }
  const shape = validateFeed(feed.data);
  if (!shape.passed) {
    return {
      state: "feed-invalid",
      message: `feed 形状不合法（${shape.violations.length} 处）：${shape.violations.join("；")}`,
      violations: shape.violations
    };
  }
  const latest = /** @type {Record<string, string>} */ (feed.data);
  const currentChannel = typeof channel === "string" && channel !== "" ? channel : "stable";
  if (latest.channel !== currentChannel) {
    return {
      state: "channel-mismatch",
      message: `feed 通道是 ${latest.channel}，本机只认 ${currentChannel}——不判新版`,
      latest: latest.version,
      latestChannel: latest.channel
    };
  }
  const cmp = compareVersions(latest.version, current.lute);
  if (cmp > 0) {
    return {
      state: "update-available",
      message: `有新版 ${latest.version}（本机 ${current.lute}）；包 ${latest.dmg}，最低系统 ${latest.min_os}`,
      current: current.lute,
      latest: latest.version,
      dmg: latest.dmg,
      sha256: latest.sha256,
      minOs: latest.min_os,
      notes: latest.notes,
      channel: latest.channel
    };
  }
  if (cmp === 0) {
    return { state: "up-to-date", message: `已是最新（${current.lute}）`, current: current.lute, latest: latest.version };
  }
  return {
    state: "feed-behind",
    message: `feed 里的最新版 ${latest.version} 比本机 ${current.lute} 旧——feed 没跟上，或本机是未发布的本地构建`,
    current: current.lute,
    latest: latest.version
  };
}
