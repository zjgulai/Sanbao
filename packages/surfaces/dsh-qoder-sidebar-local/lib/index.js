import { execFile } from "node:child_process";
import { promisify } from "node:util";
//#region src/loopback.ts
/** IPv4 127/8 predicate (four decimal octets, first == 127). */
function isIPv4Loopback(v4) {
	const parts = v4.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Whether a socket remote address names the loopback range (127/8, ::1, IPv4-mapped). */
function isLoopbackAddress(address) {
	if (address === void 0) return false;
	const normalized = address.toLowerCase();
	if (normalized === "::1") return true;
	if (normalized.startsWith("::ffff:")) return isIPv4Loopback(normalized.slice(7));
	return isIPv4Loopback(normalized);
}
/** Whether a normalized URL hostname names the loopback authority (localhost, [::1], 127/8). */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	return isIPv4Loopback(hostname);
}
/**
* Request-level trust fence: a loopback socket address AND a loopback Host
* header, plus browser same-origin markers. The socket address is
* authoritative; X-Forwarded-For is never trusted.
*/
function isLoopbackRequest(request) {
	if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL("http://" + host);
	} catch {
		return false;
	}
	if (!isLoopbackHostname(hostUrl.hostname)) return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region src/index.ts
/**
* 宿主半：只提供**渲染进程做不到的那一件事**——读 git 状态。
*
* 客户端 bundle 的模块表里没有 `node:child_process`，在那里 import 会让整个
* 插件在启动时挂掉（本仓库踩过：missed the module table）。所以读操作留在这一侧，
* 经**只认 loopback** 的 HTTP 路由暴露；客户端半（`src/client/git-api.ts`）是它
* 的薄封装。
*/
const name = "qoder-sidebar-local";
/** Services required before the git route can mount. */
const inject = ["webServer"];
/** Route paths (the client bundle mirrors these literals). */
const ROUTES = { gitStatus: "/api/dsh-qoder-sidebar/git-status" };
const execFileAsync = promisify(execFile);
/** One git invocation in `cwd`; throws with git's own stderr on failure. */
async function git(cwd, args) {
	const { stdout } = await execFileAsync("git", args, {
		cwd,
		maxBuffer: 4 * 1024 * 1024
	});
	return stdout;
}
async function collectGitStatus(cwd) {
	const branch = (await git(cwd, ["branch", "--show-current"])).trim() || "unknown";
	const uncommittedFiles = (await git(cwd, ["status", "--porcelain"])).split("\n").filter((line) => line.trim() !== "").length;
	let ahead = 0;
	let behind = 0;
	try {
		const [behindCount, aheadCount] = (await git(cwd, [
			"rev-list",
			"--left-right",
			"--count",
			"@{upstream}...HEAD"
		])).trim().split(/\s+/);
		ahead = Number.parseInt(aheadCount ?? "0", 10) || 0;
		behind = Number.parseInt(behindCount ?? "0", 10) || 0;
	} catch {}
	let lastCommit;
	try {
		const [hash, message] = (await git(cwd, [
			"log",
			"-1",
			"--format=%H%n%s"
		])).split("\n");
		if (hash !== void 0 && message !== void 0) lastCommit = {
			hash,
			message
		};
	} catch {}
	return {
		branch,
		uncommittedFiles,
		ahead,
		behind,
		...lastCommit === void 0 ? {} : { lastCommit }
	};
}
/** First session workspace path, or undefined when the registry is absent. */
function activeSessionCwd(ctx) {
	try {
		const sessions = ctx.get("sessions");
		if (typeof sessions?.list !== "function") return void 0;
		return sessions.list().map((session) => session.header?.cwd).find((cwd) => typeof cwd === "string" && cwd !== "");
	} catch {
		return;
	}
}
/** Minimal JSON writer for this route family. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
function apply(ctx) {
	const route = {
		kind: "exact",
		path: ROUTES.gitStatus,
		handler: async (req, res) => {
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "loopback only" });
				return;
			}
			if (req.method !== "GET") {
				writeJson(res, 405, { error: "GET only" });
				return;
			}
			const cwd = new URL(req.url ?? "/", "http://x").searchParams.get("cwd") ?? activeSessionCwd(ctx) ?? process.cwd();
			try {
				writeJson(res, 200, await collectGitStatus(cwd));
			} catch (error) {
				writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	};
	ctx.effect(() => {
		const dispose = ctx.webServer.register(route);
		return () => dispose();
	}, "qoder-sidebar-local: git status route");
}
//#endregion
export { ROUTES, apply, inject, name };
