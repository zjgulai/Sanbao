import test from "node:test";
import assert from "node:assert/strict";
import { appearanceFixture, appearanceValue, describeAppearance } from "./appearance-fixture.mjs";

const endpoint = "/__teamhub/appearance";
const assets = ["appearance.generated.css", "appearance.generated.js", "appearance.js", "styles.css"];

test("public appearance projects only confirmed Host identity and typography over real HTTP", async t => {
  const f = await appearanceFixture();
  t.after(() => f.close());
  for (const themeId of ["light", "dark", "warm-pink"]) {
    f.state.describe = describeAppearance(appearanceValue(themeId));
    const res = await fetch(f.url + endpoint, { redirect: "manual", headers: { cookie: "untrusted=PRIVATE_CLIENT_COOKIE" } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("set-cookie"), null);
    assert.deepEqual(await res.json(), { status: "confirmed", ...appearanceValue(themeId) });
    const request = f.state.requests.at(-1);
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/settings/describe");
    const body = JSON.parse(request.body);
    assert.equal(body.type, "client-request");
    assert.equal(body.method, "settings/describe");
    assert.equal(typeof body.rpcId, "string");
    assert.deepEqual(body.payload, {});
    assert.ok(request.headers.cookie);
    assert.match(request.headers.cookie, /^dsh-auth-/);
    assert.doesNotMatch(request.headers.cookie, /PRIVATE_CLIENT_COOKIE/);
  }
  const polluted = describeAppearance({ ...appearanceValue("dark"), userId: "PRIVATE_ID", credentials: "PRIVATE_CREDENTIALS", accent: "#BADBAD" });
  f.state.describe = polluted;
  const scoped = await fetch(f.url + endpoint + "?ns=credentials&method=settings/mutate&themeId=warm-pink");
  assert.deepEqual(await scoped.json(), { status: "confirmed", ...appearanceValue("dark") });
  assert.equal(f.state.requests.at(-1)?.url, "/api/settings/describe");
});

test("public read surface permits only GET and exact asset paths, without opening admin/settings", async t => {
  const f = await appearanceFixture();
  t.after(() => f.close());
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const res = await fetch(f.url + endpoint, { method, redirect: "manual" });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get("allow"), "GET");
  }
  for (const name of assets) {
    const url = f.url + "/__teamhub/assets/" + name;
    assert.equal((await fetch(url, { redirect: "manual" })).status, 200, name);
    assert.equal((await fetch(url, { method: "POST", redirect: "manual" })).status, 405, name);
  }
  for (const name of ["app.js", "index.html", "server.mjs", "appearance.js/extra"]) {
    assert.equal((await fetch(f.url + "/__teamhub/assets/" + name, { redirect: "manual" })).status, 404);
  }
  assert.equal(f.state.requests.length, 0);
  for (const pathname of ["/admin/", "/admin/app.js", "/__teamhub/api/users"]) {
    assert.equal((await fetch(f.url + pathname, { redirect: "manual" })).status, 302);
    assert.equal((await fetch(f.url + pathname, { headers: { cookie: f.cookie("fixture-member") } })).status, 403);
    assert.equal((await fetch(f.url + pathname, { headers: { cookie: f.cookie() } })).status, 200);
  }
  for (const pathname of ["/api/settings/describe", "/api/settings/mutate", "/api/unknown"]) {
    assert.equal((await fetch(f.url + pathname, { method: "POST" })).status, 401);
    assert.equal((await fetch(f.url + pathname, { headers: { cookie: f.cookie("fixture-member") } })).status, 403);
  }
  assert.equal(f.state.requests.length, 0);
  // Existing POST RPC delegation is unchanged; this public read surface must not alter permissions.
  assert.equal((await fetch(f.url + "/api/settings/describe", { method: "POST", headers: { cookie: f.cookie("fixture-member") } })).status, 200);
  for (const pathname of ["/api/dsh-ssh/run", "/api/task-board/state"]) {
    assert.equal((await fetch(f.url + pathname, { method: "POST", headers: { cookie: f.cookie("fixture-member") } })).status, 403);
  }
  assert.equal(f.state.requests.length, 1);
});

test("malformed and unconfirmed settings fail closed without schema, config or upstream errors", async t => {
  const f = await appearanceFixture();
  t.after(() => f.close());
  const badValues = [null, [], {}, { ...appearanceValue(), themeId: "system" },
    { ...appearanceValue(), uiFont: "url(PRIVATE_FONT)" }, { ...appearanceValue(), codeFontSize: "15" }];
  const badDescriptions = [null, {}, { namespaces: {} }, ...badValues.map(value => describeAppearance(value))];
  const missing = describeAppearance(); missing.namespaces.pop(); badDescriptions.push(missing);
  const duplicate = describeAppearance(); duplicate.namespaces.push(duplicate.namespaces[1]); badDescriptions.push(duplicate);
  for (const edit of [row => { delete row.user; }, row => { row.user = {}; },
    row => { row.user.themeId = "dark"; }, row => { row.revision = "PRIVATE_REVISION"; }]) {
    const description = describeAppearance(); edit(description.namespaces[1]); badDescriptions.push(description);
  }
  for (const description of badDescriptions) {
    f.state.describe = description;
    const res = await fetch(f.url + endpoint, { redirect: "manual" });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: "unavailable" });
  }
  for (const mode of ["malformed", "rpc-error", "http-error", "redirect", "timeout", "body-timeout"]) {
    f.state.describe = describeAppearance(); f.state.mode = mode;
    const before = performance.now();
    const res = await fetch(f.url + endpoint, { redirect: "manual", signal: AbortSignal.timeout(6000) });
    assert.equal(res.status, 503, mode);
    assert.deepEqual(await res.json(), { status: "unavailable" }, mode);
    assert.ok(performance.now() - before < 5000, "upstream timeout includes body consumption");
  }
  await Promise.all(f.state.closed);
  assert.equal(f.state.aborted, 2);
  assert.ok(f.state.requests.every(req => req.url === "/api/settings/describe"), "never follow upstream redirects");
});

test("login, password change and admin load identical public appearance resources", async t => {
  const f = await appearanceFixture();
  t.after(() => f.close());
  for (const [pathname, cookie] of [["/login", ""], ["/change-password", f.cookie("fixture-change")], ["/admin/", f.cookie()]]) {
    const res = await fetch(f.url + pathname, { headers: { cookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    for (const name of ["appearance.generated.css", "appearance.js"]) assert.ok(html.includes("/__teamhub/assets/" + name), pathname + name);
    assert.match(html, /data-sanbao-theme="light"/);
    assert.doesNotMatch(html, /background:\s*(#|white)|color:\s*(#|white)/);
  }
});
