import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequestHandler } from "../src/server.mjs";
import { defaultConfig } from "../src/config.mjs";
import { createUser } from "../src/users.mjs";
import { issueSession, resetSessionStores } from "../src/auth.mjs";
import { createAdminApi } from "../src/admin-api.mjs";
import { createOwnership } from "../src/policy.mjs";
import { AuditLog } from "../src/audit.mjs";

export const appearanceValue = (themeId = "light") => ({
  themeId, uiFont: "serif", codeFont: "menlo", uiFontSize: 16, codeFontSize: 15
});

/** @param {any} value Deliberately includes malformed wire fixtures. @returns {any} */
export function describeAppearance(value = appearanceValue()) {
  return {
    writable: true, hasDocument: true,
    namespaces: [
      { ns: "credentials", value: { secret: "SENSITIVE_OTHER_NAMESPACE" }, schema: { title: "PRIVATE_SCHEMA" } },
      { ns: "sanbao-appearance", value, user: { ...value }, revision: 7,
        schema: { title: "PRIVATE_SCHEMA" }, base: { private: "PRIVATE_BASE" }, applies: "live", secrets: [] }
    ]
  };
}

async function listen(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

/** Synthetic upstream only; all storage is inside this package and removed on close. */
export async function appearanceFixture() {
  const home = fs.mkdtempSync(fileURLToPath(new URL("./.appearance-", import.meta.url)));
  const state = {
    describe: describeAppearance(), mode: "ok",
    requests: /** @type {{ method?: string, url?: string, headers: http.IncomingHttpHeaders, body: string }[]} */ ([]),
    aborted: 0, closed: /** @type {Promise<void>[]} */ ([])
  };
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    state.requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
    if (state.mode === "timeout") {
      state.closed.push(new Promise(resolve => res.on("close", () => { state.aborted++; resolve(); })));
      return;
    }
    if (state.mode === "body-timeout") {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"result":');
      state.closed.push(new Promise(resolve => res.on("close", () => { state.aborted++; resolve(); })));
      return;
    }
    if (state.mode === "redirect") {
      res.writeHead(302, { location: "/PRIVATE_REDIRECT" });
      res.end();
      return;
    }
    res.writeHead(state.mode === "http-error" ? 500 : 200, { "content-type": "application/json" });
    res.end(state.mode === "malformed" ? "PRIVATE_INVALID_JSON" : JSON.stringify({
      result: state.mode === "rpc-error" ? { ok: false, error: { message: "PRIVATE_UPSTREAM_ERROR" } }
        : { ok: true, value: state.describe }
    }));
  });
  const upstreamUrl = await listen(upstream);
  const config = { ...defaultConfig(home), upstream: upstreamUrl,
    // Synthetic in-memory bridge key; never read a developer profile or environment credential.
    browserSessionSecret: Buffer.alloc(32, 19).toString("base64url") };
  for (const [name, role] of [["fixture-admin", "admin"], ["fixture-member", "member"], ["fixture-change", "member"]]) {
    const { user } = createUser(config, { name, role, password: "synthetic-test-password" });
    user.mustChangePassword = name === "fixture-change";
  }
  const audit = new AuditLog(home);
  const ownership = createOwnership();
  const adminApi = createAdminApi({ home, getConfig: () => config, save: () => {}, ownership, audit });
  const context = { home, config, audit, ownership, adminApi };
  const server = http.createServer(createRequestHandler({ context, reloadConfigIfChanged() {} }));
  const url = await listen(server);
  const tokens = Object.fromEntries(config.users.map(user => [user.name, issueSession(home, user.name).token]));
  return {
    url, home, state, context, tokens,
    cookie(name = "fixture-admin") { return `dsh_team_hub_session=${tokens[name]}`; },
    async close() {
      await close(server);
      await close(upstream);
      resetSessionStores(home);
      fs.rmSync(home, { recursive: true, force: true });
    }
  };
}
