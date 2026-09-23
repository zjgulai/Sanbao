/**
 * dsh-update — 更新检查骨架（host-only）。**只检查、只报告，不下载、不安装**。
 *
 * 为什么存在：人工交付阶段没有任何读数能回答「现在有没有新版」。本插件把
 * `release/<版本>.latest.json`（ADR-0151 的派生契约）读回来，与本机 app 的
 * `CFBundleVersion`（形如 `2.0.10-lute.2.5.0`）比一下，给出一个具名结论。
 *
 * 边界（计划 docs/plans/2026-09-13-auto-update-route.md §5）：自动下载/校验/调 install.sh
 * 是第 ⑤ 步，要等 Developer ID 与公证（不然用户看到的是「更新完打不开」）。
 * 本插件不碰那条路径一眼——没有下载、没有写盘、没有调安装器。
 *
 * 工具：
 *  - upd_check  检查更新：报状态（有新版 / 已是最新 / feed 读不到 / feed 形状不合法 /
 *               通道不匹配 / 本机版本读不出 / feed 落后于本机），有新版时附 dmg 名与 sha256。
 *
 * 口径要点：所有失败路径都是**具名状态**，绝不折叠成「没有新版」（P-15）。
 * 启动时的自动检查只做一次、延迟执行、离线失败只记日志不打扰。
 */

import fs from "node:fs";
import path from "node:path";
import { judgeUpdate, parseLuteVersion } from "./feed.js";

const name = "dsh-update";
const inject = ["tools"];

const DEFAULT_FEED_URL = "https://github.com/zjgulai/Sanbao/releases/latest/download/latest.json";
const DEFAULT_TIMEOUT_MS = 8000;
/** 启动检查延后执行：让出启动路径，失败也只记日志。 */
const START_DELAY_MS = 20000;

/**
 * 从可执行文件路径往上找 .app bundle，返回**最外层**的 .app。
 * 必须取最外层：host 插件跑在 node.mojom NodeService utility 进程里时
 * execPath 是嵌套的 Helper 二进制（`<主 app>.app/Contents/Frameworks/<Helper>.app/...`），
 * Helper 的 CFBundleVersion 是短版本（无 -lute. 后缀）——停在第一个 .app 会把
 * LUTE 构建误判成 current-not-lute（DA-10 实机读数，2026-09-23）。
 * @param {string} execPath
 * @returns {string | null}
 */
export function appBundleFromExecPath(execPath) {
  let dir = path.dirname(String(execPath ?? ""));
  let outermost = null;
  while (dir !== path.dirname(dir)) {
    if (dir.endsWith(".app")) outermost = dir;
    dir = path.dirname(dir);
  }
  return outermost;
}

/** @typedef {{ok: true, value: string} | {ok: false, detail: string}} BundleVersionRead */

/**
 * 读 app 的 CFBundleVersion（XML plist 文本解析）。
 * 不用 plutil：测试在 Linux CI 上跑，子进程依赖会让「读不出」与「平台没有这个工具」混为一谈；
 * 二进制 plist（bplist00）是**具名失败**，不许猜。
 * @param {string} bundlePath
 * @returns {BundleVersionRead}
 */
export function readBundleVersion(bundlePath) {
  const plist = path.join(bundlePath, "Contents", "Info.plist");
  if (!fs.existsSync(plist)) return { ok: false, detail: `找不到 ${plist}` };
  let text;
  try {
    text = fs.readFileSync(plist, "utf8");
  } catch (error) {
    return { ok: false, detail: `读不了 ${plist}：${error instanceof Error ? error.message : String(error)}` };
  }
  if (text.startsWith("bplist00")) {
    return { ok: false, detail: `${plist} 是二进制 plist（本读取器只认 XML）` };
  }
  const m = /<key>\s*CFBundleVersion\s*<\/key>\s*<string>([^<]*)<\/string>/.exec(text);
  if (!m) return { ok: false, detail: `${plist} 里没有 CFBundleVersion` };
  const value = m[1].trim();
  if (value === "") return { ok: false, detail: "CFBundleVersion 为空" };
  return { ok: true, value };
}

/**
 * 取 feed。所有失败都是具名状态；没有重试、没有缓存（骨架阶段保持可解释）。
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<{ok: true, data: unknown} | {ok: false, state: 'unreachable' | 'http-error' | 'invalid-json', detail: string}>}
 */
export async function fetchFeed(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" }
    });
  } catch (error) {
    return { ok: false, state: "unreachable", detail: error instanceof Error ? error.message : String(error) };
  }
  if (!response.ok) {
    return { ok: false, state: "http-error", detail: `HTTP ${response.status}` };
  }
  const text = await response.text();
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (error) {
    return { ok: false, state: "invalid-json", detail: error instanceof Error ? error.message : String(error) };
  }
}

export function apply(ctx, config) {
  const cfg = config && typeof config === "object" ? config : {};
  const feedUrl = typeof cfg.feedUrl === "string" && cfg.feedUrl !== "" ? cfg.feedUrl : DEFAULT_FEED_URL;
  const channel = typeof cfg.channel === "string" && cfg.channel !== "" ? cfg.channel : "stable";
  const timeoutMs = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const appPath = typeof cfg.appPath === "string" && cfg.appPath !== "" ? cfg.appPath : appBundleFromExecPath(process.execPath);
  const checkOnStart = cfg.checkOnStart !== false;

  /**
   * 本机当前版本（可被参数覆盖，便于在别处核对其它安装）。
   * @param {string | undefined} overrideAppPath
   * @returns {import("./feed.js").ParsedLuteVersion}
   */
  function currentVersion(overrideAppPath) {
    const bundle = overrideAppPath ?? appPath;
    if (!bundle) {
      return { ok: false, reason: "unreadable", detail: `从 ${process.execPath} 找不到 .app bundle` };
    }
    const read = readBundleVersion(bundle);
    if (!read.ok) return { ok: false, reason: "unreadable", detail: read.detail };
    return parseLuteVersion(read.value);
  }

  /**
   * @param {{ appPath?: string, feedUrl?: string }} args
   */
  async function check(args) {
    const url = typeof args.feedUrl === "string" && args.feedUrl !== "" ? args.feedUrl : feedUrl;
    const current = currentVersion(typeof args.appPath === "string" && args.appPath !== "" ? args.appPath : undefined);
    const feed = await fetchFeed(url, timeoutMs);
    const verdict = judgeUpdate({ current, feed, channel });
    return {
      ...verdict,
      checkedAt: new Date().toISOString(),
      feedUrl: url,
      channel,
      appBundle: appPath,
      current: verdict.current ?? (current.ok ? current.lute : undefined),
      upstreamVersion: current.ok ? current.upstream : undefined
    };
  }

  ctx.tools.register({
    name: "upd_check",
    description:
      "检查 Sanbao 是否有新版本（只读，不下载不安装）：读 feed（release/<版本>.latest.json，ADR-0151 契约），" +
      "与本机 app 的 CFBundleVersion（形如 2.0.10-lute.2.5.0）比较，返回具名状态——update-available / up-to-date / " +
      "feed-behind / channel-mismatch / feed-unreadable / feed-invalid / current-unreadable / current-not-lute。" +
      "有新版时附 dmg 名、sha256、最低系统与发布说明。**失败状态不等于「已是最新」**：读不到会如实报读不到。" +
      "安装路径未实现（待 Developer ID 与公证，见 docs/plans/2026-09-13-auto-update-route.md §5）。",
    parameters: {
      type: "object",
      properties: {
        appPath: { type: "string", description: "改用这个 .app 路径的本机版本（缺省=当前运行实例）" },
        feedUrl: { type: "string", description: "改用这个 feed 地址（缺省=配置的 releases/latest）" }
      },
      required: []
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (a, v) => [{ type: "text", text: JSON.stringify(v, null, 2) }]
    },
    timeoutMs: 60000,
    execute: async (args) => {
      const a = args && typeof args === "object" ? args : {};
      const result = await check({ appPath: a.appPath, feedUrl: a.feedUrl });
      ctx.logger.info(`dsh-update: upd_check → ${result.state}（${result.message}）`);
      return result;
    }
  });

  if (checkOnStart) {
    ctx.effect(() => {
      const timer = setTimeout(() => {
        check({})
          .then((result) => {
            if (result.state === "update-available") {
              ctx.logger.info(`dsh-update: 有新版 ${result.latest}（本机 ${result.current}）——${result.dmg}`);
            } else if (result.state !== "up-to-date") {
              ctx.logger.warn(`dsh-update: 启动检查未得出「已是最新」：${result.state}——${result.message}`);
            }
          })
          .catch((error) => {
            ctx.logger.warn(`dsh-update: 启动检查异常：${error instanceof Error ? error.message : String(error)}`);
          });
      }, START_DELAY_MS);
      timer.unref();
      return () => clearTimeout(timer);
    }, "dsh-update: 启动检查");
  }
}

export { name, inject };
