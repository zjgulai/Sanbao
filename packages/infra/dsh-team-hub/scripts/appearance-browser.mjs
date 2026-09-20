import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { appearanceFixture, appearanceValue, describeAppearance } from "../test/appearance-fixture.mjs";

// Reuse an explicitly supplied existing installation; never install or use a real browser profile.
if (!process.env.THEME_BROWSER_PACKAGE) throw new Error("Set THEME_BROWSER_PACKAGE to an existing playwright-core consumer package.json");
const { chromium } = createRequire(process.env.THEME_BROWSER_PACKAGE)("playwright-core");
const f = await appearanceFixture();
let browser;
try {
  browser = await chromium.launchPersistentContext(path.join(f.home, "browser"), {
    channel: "chrome", headless: true, viewport: { width: 1280, height: 900 },
    artifactsDir: f.home, downloadsPath: f.home,
    env: { ...process.env, HOME: f.home, TMPDIR: f.home }, colorScheme: "dark"
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const expected = {
    light: { canvas: "rgb(253, 253, 253)", panel: "rgb(255, 255, 255)", text: "rgb(32, 33, 32)", button: "rgb(56, 105, 64)", onButton: "rgb(255, 255, 255)" },
    dark: { canvas: "rgb(35, 37, 35)", panel: "rgb(25, 27, 26)", text: "rgb(236, 237, 235)", button: "rgb(92, 147, 99)", onButton: "rgb(16, 28, 18)" },
    "warm-pink": { canvas: "rgb(255, 248, 247)", panel: "rgb(255, 253, 252)", text: "rgb(56, 46, 48)", button: "rgb(143, 83, 97)", onButton: "rgb(255, 255, 255)" }
  };
  const routes = [
    ["/login", null, "dsh-team-hub"], ["/change-password", "fixture-change", "首次登录，请修改密码"],
    ...[["overview", "总览"], ["users", "用户"], ["workspaces", "工作区"], ["audit", "审计"], ["system", "系统"]]
      .map(([route, heading]) => ["/admin/#" + route, "fixture-admin", heading])
  ];
  async function authenticate(name) {
    await browser.clearCookies();
    if (name) await browser.addCookies([{ name: "dsh_team_hub_session", value: f.tokens[name], url: f.url }]);
  }
  async function confirmed(themeId) {
    await page.waitForFunction(id => document.body.dataset.sanbaoTheme === id && document.body.dataset.appearanceStatus === "confirmed", themeId);
  }
  async function focusSync() { await page.evaluate(() => window.dispatchEvent(new Event("focus"))); }

  // Initial failure must not use OS dark preference or localStorage as authority.
  f.state.mode = "malformed";
  await page.goto(f.url + "/login");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), expected.light.canvas);
  assert.equal(await page.evaluate(() => document.body.dataset.appearanceStatus), "unavailable");
  await page.evaluate(() => localStorage.setItem("sanbao-appearance", JSON.stringify({ themeId: "dark", private: "sentinel" })));
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));

  f.state.mode = "ok";
  let cases = 0;
  for (const themeId of Object.keys(expected)) {
    f.state.describe = describeAppearance(appearanceValue(themeId));
    for (const [route, name, heading] of routes) {
      await authenticate(name);
      await page.goto(f.url + route);
      await confirmed(themeId);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
      const result = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const root = getComputedStyle(document.documentElement);
        const card = getComputedStyle(document.querySelector(".card, form"));
        const button = document.querySelector("button");
        const mono = document.querySelector(".mono");
        const sheets = [...document.styleSheets];
        const variables = [...body].filter(key => key.startsWith("--sanbao-") || key.startsWith("--dsw-") || key.startsWith("--ds-font-"));
        return { canvas: body.backgroundColor, panel: card.backgroundColor, text: body.color,
          font: body.fontFamily, size: body.fontSize, rootSize: root.fontSize, scheme: root.colorScheme,
          button: button && getComputedStyle(button).backgroundColor, onButton: button && getComputedStyle(button).color,
          codeFont: mono && getComputedStyle(mono).fontFamily, codeSize: mono && getComputedStyle(mono).fontSize,
          unresolved: variables.filter(key => !body.getPropertyValue(key).trim() || body.getPropertyValue(key).includes("var(")),
          rules: sheets.reduce((n, sheet) => n + sheet.cssRules.length, 0),
          generated: sheets.some(sheet => sheet.href?.endsWith("appearance.generated.css")) };
      });
      assert.equal(result.canvas, expected[themeId].canvas, route);
      assert.equal(result.panel, expected[themeId].panel, route);
      assert.equal(result.text, expected[themeId].text, route);
      assert.match(result.font, /Iowan Old Style/);
      assert.equal(result.size, "16px"); assert.equal(result.rootSize, "16px");
      assert.equal(result.scheme, themeId === "dark" ? "dark" : "light");
      if (result.button) {
        assert.equal(result.button, expected[themeId].button);
        assert.equal(result.onButton, expected[themeId].onButton);
      }
      if (result.codeFont) { assert.match(result.codeFont, /Menlo/); assert.equal(result.codeSize, "15px"); }
      assert.deepEqual(result.unresolved, []);
      assert.ok(result.generated && result.rules > 30);
      if (themeId === "warm-pink") {
        // Exercise failure/recovery in every entry point without navigating away.
        f.state.mode = "malformed";
        await focusSync();
        await page.waitForFunction(() => document.body.dataset.appearanceStatus === "unavailable");
        assert.equal(await page.evaluate(() => document.body.dataset.sanbaoTheme), "warm-pink");
        f.state.mode = "ok"; f.state.describe = describeAppearance(appearanceValue("dark"));
        await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        await confirmed("dark");
        f.state.describe = describeAppearance(appearanceValue("warm-pink"));
      }
      cases++;
    }
  }
  // Change on the Host while the page stays open: focus, visibility, then periodic polling.
  f.state.describe = describeAppearance(appearanceValue("dark"));
  await focusSync(); await confirmed("dark");
  f.state.mode = "malformed";
  await focusSync();
  await page.waitForFunction(() => document.body.dataset.appearanceStatus === "unavailable");
  assert.equal(await page.evaluate(() => document.body.dataset.sanbaoTheme), "dark");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), expected.dark.canvas);
  f.state.mode = "ok"; f.state.describe = describeAppearance(appearanceValue("warm-pink"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await confirmed("warm-pink");
  f.state.describe = describeAppearance(appearanceValue("light"));
  await page.waitForFunction(() => document.body.dataset.sanbaoTheme === "light", null, { timeout: 20000 });
  const before = f.state.requests.length;
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith("/__teamhub/appearance")),
    page.evaluate(() => { for (let i = 0; i < 100; i++) window.dispatchEvent(new Event("focus")); })
  ]);
  assert.ok(f.state.requests.length - before <= 1, "focus bursts must be coalesced");
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore);
  assert.deepEqual(errors, []);
  console.log(`PASS browser: ${cases}/21 route-theme combinations; CSS parsed/resolved; UI/code roles; initial fallback; Host focus/visibility/poll sync; last-confirmed failure; bounded requests; unchanged localStorage; no page errors`);
} finally {
  await browser?.close();
  await f.close();
}
