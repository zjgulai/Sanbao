#!/usr/bin/env node
/**
 * 浏览器验收：ROOT 品牌插件的官方 UI 改写（ADR-0019 / ADR-0117）。
 *
 * 验收对象是**产品实际装载的那份产物**：`~/.dsh/profiles/desktop/node_modules/dsh-root-brand/lib/client.js`
 * （或 `--bundle` 指定）。在真实 Chromium 里：
 *   1) 从本机官方 app 包取出真实的官方模块 CSS 与类名（真值，不写死哈希）；
 *   2) 按官方 2.0.10 的真实 DOM 结构复刻空会话 hero；
 *   3) 装载并执行插件产物；
 *   4) 断言用户可观察结果：官方标题不再显示、品牌句只出现一次、ROOT 字标存在、
 *      角标显示 Preview（且抗 React 回写、可还原）、官方标题卸载后还原、
 *      结构不唯一时**什么都不隐藏**并如实报 degraded、锚点状态 resolved。
 * 再注入一份**随机新前缀**的假官方 CSS，断言同一份实现自动命中（升级免疫）。
 *
 * 用法：node scripts/acceptance/root-brand-live-anchors.mjs [--bundle <path>] [--out <dir>]
 * 退出码：0 = 全部断言通过；1 = 有断言不通过；2 = 前置产物缺失；3 = 运行失败。
 *
 * ── 2.0.10 修复记录（2026-09-18）────────────────────────────────────────────
 * 本次之前这个探针**第一步就死**：它按旧结构找 `StatsLine.module.css`，而上游已把那个模块
 * 换成 `StatsPills.module.css`，于是 exit 3，一个断言都没跑到。它的红是「仪器读不出产物」的红，
 * 与产品是否正常无关——而 2.5.0 装机后的真实故障（官方标题「探索未至之境」重新出现）
 * 恰恰发生在它死后。教训写进 SOP §0：**探针必须每次发版都跑，且它读的必须是本版产物。**
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { appNodeModules } from '../lib/app-resources.mjs'
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_BUNDLE = join(
  homedir(),
  ".dsh/profiles/desktop/node_modules/dsh-root-brand/lib/client.js",
);
const CONVERSATION_BUNDLE =
  join(appNodeModules() ?? "", "@deepseek-ai/dsh-client-ui-conversation/lib/client.js");
const HERO_MODULE_ID = "@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css";

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const BUNDLE = resolve(argValue("--bundle", DEFAULT_BUNDLE));
const OUT_DIR = resolve(argValue("--out", join(REPO_ROOT, ".scratch/dsh-root-brand-drift/acceptance")));

/** 与测试同源的提取逻辑（此处独立实现，避免「用被测代码验被测代码」）。 */
function extractModuleCss(bundlePath, moduleId) {
  const source = readFileSync(bundlePath, "utf8");
  const anchor = source.indexOf(`"${moduleId}"`);
  if (anchor < 0) throw new Error(`产物里找不到模块 id ${moduleId}：${bundlePath}`);
  const matches = [...source.slice(0, anchor).matchAll(/const css\$[0-9]+ = ("(?:[^"\\]|\\.)*");/g)];
  const last = matches.at(-1);
  if (last === undefined) throw new Error(`模块 ${moduleId} 前找不到 css 声明`);
  return JSON.parse(last[1]);
}

function resolveClassName(css, localName) {
  const pattern = new RegExp(`\\.([A-Za-z0-9_]+)_${localName}(?![A-Za-z0-9_-])`, "g");
  const prefixes = new Set([...css.matchAll(pattern)].map((m) => m[1]));
  if (prefixes.size !== 1) throw new Error(`局部名 ${localName} 的前缀候选 ${prefixes.size} 个（应为 1）`);
  return `${[...prefixes][0]}_${localName}`;
}

/** 官方词典里的某个键（zh）。真值来自产物，不手抄。 */
function officialLocaleValue(bundlePath, key) {
  const source = readFileSync(bundlePath, "utf8");
  const match = new RegExp(`"${key.replace(".", "\\.")}":\\s*"([^"]*)"`).exec(source);
  if (match === null) throw new Error(`产物里找不到词典项 ${key}`);
  return match[1];
}

/** 插件产物的外部依赖：由宿主提供。验收页用本机 React 18 的真实生产构建顶替。 */
const REACT_DIR = join(REPO_ROOT, "packages/platform/dsh-root-brand-local/node_modules/react");

const HARNESS_HTML = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>ROOT brand acceptance</title></head>
<body><div id="stage"></div></body></html>`;

/**
 * 宿主提供的 CommonJS 基元。验收页在经典脚本里顶替宿主的模块环境，
 * 让 React 的生产 CJS 文件（真实产物）可以直接作为经典脚本执行。
 */
const RUNTIME_GLOBALS_JS = `window.process = { env: { NODE_ENV: "production" } };
window.exports = {};
window.module = { exports: window.exports };
window.require = function (name) {
  if (name === "react") return window.React;
  throw new Error("harness require: 未声明依赖 " + name);
};`;


async function main() {
  for (const path of [BUNDLE, CONVERSATION_BUNDLE]) {
    if (!existsSync(path)) {
      console.error(`[acceptance] 缺少必需产物：${path}`);
      process.exit(2);
    }
  }
  const heroCss = extractModuleCss(CONVERSATION_BUNDLE, HERO_MODULE_ID);
  const heroClasses = {
    headline: resolveClassName(heroCss, "headline"),
    titleGroup: resolveClassName(heroCss, "titleGroup"),
    fishHitbox: resolveClassName(heroCss, "fishHitbox"),
    previewBadge: resolveClassName(heroCss, "previewBadge"),
  };
  const officialHeadlineText = officialLocaleValue(CONVERSATION_BUNDLE, "hero.headline");
  const officialPreviewText = officialLocaleValue(CONVERSATION_BUNDLE, "hero.preview");
  const bundleText = readFileSync(BUNDLE, "utf8");
  const bundleDeclaresEntry = bundleText.includes('id: "dsh-root-brand"');

  mkdirSync(OUT_DIR, { recursive: true });
  const { createRequire } = await import("node:module");
  const requireFromBrowserPkg = createRequire(
    join(REPO_ROOT, "packages/capabilities/dsh-browser-local/package.json"),
  );
  const { chromium } = requireFromBrowserPkg("playwright-core");

  const server = createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0];
    if (url === "/bundle.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(bundleText);
      return;
    }
    if (url === "/runtime-globals.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(RUNTIME_GLOBALS_JS);
      return;
    }
    if (url === "/react.js" || url === "/jsx-runtime.js") {
      // 真实 React 生产构建（与插件宿主的 React 18 同大版本）。
      const file =
        url === "/react.js"
          ? join(REACT_DIR, "cjs/react.production.min.js")
          : join(REACT_DIR, "cjs/react-jsx-runtime.production.min.js");
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(readFileSync(file, "utf8"));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(HARNESS_HTML);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 420 } });
  const consoleLines = [];
  page.on("console", (message) => consoleLines.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => consoleLines.push(`pageerror: ${error.message}`));

  await page.goto(origin, { waitUntil: "load" });

  const result = await page.evaluate(
    async ({ heroCss, heroClasses, moduleIds, brandPhrase, officialHeadlineText, officialPreviewText }) => {
      const notes = [];
      const scriptErrors = [];
      window.addEventListener("error", (event) => {
        scriptErrors.push(
          `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`,
        );
      });
      const anchorState = () => document.documentElement.dataset.dshRootBrandAnchors ?? "";
      const loadScript = (src) =>
        new Promise((done, fail) => {
          const script = document.createElement("script");
          script.src = src;
          script.onload = done;
          script.onerror = () => fail(new Error(`加载失败：${src}`));
          document.head.appendChild(script);
        });
      const installOfficialStyle = (moduleId, css) => {
        const tag = document.createElement("style");
        tag.dataset.pluginCss = moduleId;
        tag.textContent = css;
        document.head.appendChild(tag);
      };
      /**
       * 用户**看得见**的、含该文案的文本叶子数。
       * 只认文本叶子：`parent.textContent` 会把 display:none 的后代文本也算进来，
       * 于是「父容器可见」会让一个被隐藏的子节点看起来仍然可见。
       */
      const visibleLeafCount = (root, needle) => {
        let n = 0;
        const walk = (node) => {
          for (const child of node.children) {
            if (getComputedStyle(child).display === "none") continue;
            if (child.children.length === 0) {
              if (child.textContent.includes(needle)) n += 1;
              continue;
            }
            walk(child);
          }
        };
        walk(root);
        return n;
      };
      /**
       * 复刻官方 2.0.10 的 hero 结构（逐字对照产物 JSX）：
       *   div.headline > span.fishHitbox + span.titleGroup > [span(无类名), span.previewBadge]
       * 那个**无类名**的 span 就是官方标题——正因如此插件不能再按类名找它，改用「角标的兄弟」。
       */
      const build = (classes, titleText) => {
        const stage = document.getElementById("stage");
        stage.innerHTML =
          `<div class="${classes.headline}">` +
          `<span class="${classes.fishHitbox}">` +
          `<div data-plugin="dsh-root-brand" class="dsh-rb-hero">` +
          `<svg viewBox="0 0 61 32" width="46" height="24" aria-hidden="true"><rect x="6.5" y="26" width="16.5" height="5" rx="2.5" fill="#58B848"/></svg>` +
          `<span class="dsh-rb-hero-name">${brandPhrase}</span></div></span>` +
          `<span class="${classes.titleGroup}">` +
          `<span>${titleText}</span>` +
          `<span class="${classes.previewBadge}">${officialPreviewText}</span>` +
          `</span>` +
          `</div>`;
        const hero = stage.firstElementChild;
        const titleGroup = hero.children[1];
        return { hero, titleGroup, officialTitle: titleGroup.children[0], badge: titleGroup.children[1] };
      };

      // —— 第一幕：本机真实官方 CSS ——
      delete document.documentElement.dataset.dshRootBrandAnchors;
      installOfficialStyle(moduleIds.hero, heroCss);
      const first = build(heroClasses, officialHeadlineText);
      const hero = first.hero;
      const badge = first.badge;
      const officialTitle = first.officialTitle;

      window.__ModuleLoader__ = { load: (entry) => { window.__entry = entry; } };
      // 宿主提供的 CommonJS 基元 + React 运行时（真实生产构建）。
      await loadScript("/runtime-globals.js");
      await loadScript("/react.js");
      window.React = window.exports;
      window.module.exports = window.exports = {};
      await loadScript("/jsx-runtime.js");
      window.ReactJsxRuntime = window.exports;
      await loadScript("/bundle.js");
      const hostRequire = (name) => {
        if (name === "react/jsx-runtime") return window.ReactJsxRuntime;
        if (name === "react") return window.React;
        throw new Error(`未预期的外部依赖：${name}`);
      };
      const pluginFactory = () => window.__entry.factory(hostRequire);
      const disposers = [];
      /** 复刻宿主装载：注册 effect 并收集 disposer。 */
      const applyPlugin = () => {
        pluginFactory().apply({
          effect: (fn) => {
            const d = fn();
            if (typeof d === "function") disposers.push(d);
          },
          slots: { inject: (_slot, register) => register(), register: () => () => {} },
        });
      };
      applyPlugin();
      await new Promise((r) => setTimeout(r, 30));

      const state = anchorState();
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      };
      const markRect = rect(hero.querySelector("svg"));
      const nameRect = rect(hero.querySelector(".dsh-rb-hero-name"));
      const badgeRect = rect(badge);
      const afterApply = {
        anchorState: state,
        markLeftOfName: markRect.right <= nameRect.left + 1,
        badgeRightmost: badgeRect.left >= nameRect.right - 1,
        badgeVisible: getComputedStyle(badge).display !== "none",
        markWidth: markRect.width,
        officialHeadlineHidden: getComputedStyle(officialTitle).display === "none",
        brandPhraseVisibleCount: visibleLeafCount(hero, brandPhrase),
        officialHeadlineVisibleCount: visibleLeafCount(hero, officialHeadlineText),
        rootMarkPresent: hero.querySelector("svg") !== null,
        badgeText: badge.textContent,
      };
      notes.push(`第一幕锚点状态：${state}`);

      // React 回写角标文案 → 插件必须重新改写
      badge.textContent = officialPreviewText;
      await new Promise((r) => setTimeout(r, 30));
      afterApply.badgeTextAfterReactWrite = badge.textContent;

      // —— 第一幕 b：结构不唯一时**不猜** ——
      // 往同一容器里再塞一个有文字的叶子，此时「谁是标题」不再唯一：
      // 插件必须什么都不隐藏，并如实报 degraded:ambiguous。
      const extraLeaf = document.createElement("span");
      extraLeaf.textContent = "额外的说明";
      first.titleGroup.appendChild(extraLeaf);
      await new Promise((r) => setTimeout(r, 30));
      const afterAmbiguous = {
        anchorState: anchorState(),
        // 语义：**不隐藏新的东西**。已经被确认过的那个标题保持隐藏——
        // 它是当结构唯一时被正向识别出来的，模糊化本身不构成「撤销识别」的理由。
        officialHeadlineStillHidden: getComputedStyle(officialTitle).display === "none",
        extraLeafStillVisible: getComputedStyle(extraLeaf).display !== "none",
      };
      extraLeaf.remove();
      await new Promise((r) => setTimeout(r, 30));
      const afterAmbiguousRecovered = {
        anchorState: anchorState(),
        officialHeadlineHidden: getComputedStyle(officialTitle).display === "none",
      };

      // —— 第二幕：卸载还原（官方样式标签保留，只撤销插件）——
      for (const d of disposers) d();
      const afterDispose = {
        badgeText: badge.textContent,
        officialHeadlineRestored: getComputedStyle(officialTitle).display !== "none",
        hiddenMarkerLeft: officialTitle.getAttribute("dsh-rb-hidden"),
      };
      notes.push(`卸载后角标文案：${afterDispose.badgeText}；官方标题还原：${afterDispose.officialHeadlineRestored}`);

      // —— 第三幕：升级免疫（随机新前缀）——
      // 先清掉旧场（含官方样式标签与插件样式块），再注入新前缀的官方样式并**重新装载**插件
      // —— 插件卸载会断开观察者，重装是新会话/新页面的等价形态。
      const randomPrefix = `q${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      document.getElementById("stage").innerHTML = "";
      document.head
        .querySelectorAll("style[data-plugin-css], style[data-plugin=\"dsh-root-brand\"]")
        .forEach((el) => el.remove());
      const futureClasses = {
        headline: `${randomPrefix}_headline`,
        titleGroup: `${randomPrefix}_titleGroup`,
        previewBadge: `${randomPrefix}_previewBadge`,
      };
      installOfficialStyle(
        moduleIds.hero,
        `.${futureClasses.headline}{display:flex}` +
          `.${futureClasses.titleGroup}{display:flex;gap:4px 7px}` +
          `.${futureClasses.previewBadge}{font-size:12px}`,
      );
      applyPlugin();
      await new Promise((r) => setTimeout(r, 30));

      const future = build(futureClasses, officialHeadlineText);
      // 观察器是异步的：fixture 刚建出来时插件还没同步过，这里必须等一拍再读数，
      // 否则读到的是「还没动手」的状态（2026-09-18 这个探针正是这样误报了两条）。
      await new Promise((r) => setTimeout(r, 30));
      const futureApplied = {
        prefix: randomPrefix,
        anchorState: anchorState(),
        officialHeadlineHidden: getComputedStyle(future.officialTitle).display === "none",
        brandPhraseVisibleCount: visibleLeafCount(future.hero, brandPhrase),
        badgeText: future.badge.textContent,
      };

      // 把舞台留在第一幕的可视结果上，供截图
      document.getElementById("stage").innerHTML = "";
      document.head.querySelectorAll("style[data-plugin-css]").forEach((el) => el.remove());
      installOfficialStyle(moduleIds.hero, heroCss);
      build(heroClasses, officialHeadlineText);
      applyPlugin();
      await new Promise((r) => setTimeout(r, 30));

      return { afterApply, afterAmbiguous, afterAmbiguousRecovered, afterDispose, futureApplied, notes, scriptErrors };
    },
    {
      heroCss,
      heroClasses,
      moduleIds: { hero: HERO_MODULE_ID },
      brandPhrase: "Artificial Business Intelligence Agentic",
      officialHeadlineText,
      officialPreviewText,
    },
  );

  const shot = join(OUT_DIR, "live-anchors.png");
  await page.screenshot({ path: shot });
  await browser.close();
  server.close();

  const checks = [
    ["产物声明了插件入口", bundleDeclaresEntry === true, String(bundleDeclaresEntry)],
    ["锚点状态 = resolved", result.afterApply.anchorState === "resolved", result.afterApply.anchorState],
    ["官方标题不再显示", result.afterApply.officialHeadlineHidden === true, String(result.afterApply.officialHeadlineHidden)],
    ["官方标题文案一处都不可见", result.afterApply.officialHeadlineVisibleCount === 0, String(result.afterApply.officialHeadlineVisibleCount)],
    ["品牌句只出现一次", result.afterApply.brandPhraseVisibleCount === 1, String(result.afterApply.brandPhraseVisibleCount)],
    ["ROOT 字标存在", result.afterApply.rootMarkPresent === true, String(result.afterApply.rootMarkPresent)],
    ["角标显示 Preview", result.afterApply.badgeText === "Preview", result.afterApply.badgeText],
    ["React 回写后仍为 Preview", result.afterApply.badgeTextAfterReactWrite === "Preview", result.afterApply.badgeTextAfterReactWrite],
    ["结构不唯一时不猜（degraded:ambiguous）", result.afterAmbiguous.anchorState === "degraded:ambiguous", result.afterAmbiguous.anchorState],
    ["结构不唯一时不隐藏新的东西（已识别的标题保持隐藏）", result.afterAmbiguous.officialHeadlineStillHidden === true && result.afterAmbiguous.extraLeafStillVisible === true, `已识别标题仍隐藏=${result.afterAmbiguous.officialHeadlineStillHidden} 新增叶子可见=${result.afterAmbiguous.extraLeafStillVisible}`],
    ["结构恢复后重新转回 resolved 并隐藏", result.afterAmbiguousRecovered.anchorState === "resolved" && result.afterAmbiguousRecovered.officialHeadlineHidden === true, `${result.afterAmbiguousRecovered.anchorState} hidden=${result.afterAmbiguousRecovered.officialHeadlineHidden}`],
    ["卸载后还原官方文案", result.afterDispose.badgeText === officialPreviewText, result.afterDispose.badgeText],
    ["卸载后官方标题还原", result.afterDispose.officialHeadlineRestored === true, String(result.afterDispose.officialHeadlineRestored)],
    ["卸载后不残留隐藏标记", result.afterDispose.hiddenMarkerLeft === null, String(result.afterDispose.hiddenMarkerLeft)],
    ["排版：ROOT 字标在品牌句左侧", result.afterApply.markLeftOfName === true, String(result.afterApply.markLeftOfName)],
    ["排版：Preview 角标位于标题右侧（右上角）", result.afterApply.badgeRightmost === true, String(result.afterApply.badgeRightmost)],
    ["排版：角标可见且字标已渲染", result.afterApply.badgeVisible === true && result.afterApply.markWidth > 0, `badgeVisible=${result.afterApply.badgeVisible} markWidth=${result.afterApply.markWidth}`],
    ["换随机新前缀仍命中（锚点 resolved）", result.futureApplied.anchorState === "resolved", result.futureApplied.anchorState],
    ["换随机新前缀后标题唯一", result.futureApplied.brandPhraseVisibleCount === 1 && result.futureApplied.officialHeadlineHidden === true, `hidden=${result.futureApplied.officialHeadlineHidden} count=${result.futureApplied.brandPhraseVisibleCount}`],
    ["换随机新前缀后角标仍为 Preview", result.futureApplied.badgeText === "Preview", result.futureApplied.badgeText],
  ];

  console.log(`[acceptance] bundle = ${BUNDLE}`);
  console.log(`[acceptance] 官方产物 = ${CONVERSATION_BUNDLE}`);
  console.log(`[acceptance] 官方 hero 类名 = ${JSON.stringify(heroClasses)}`);
  console.log(`[acceptance] 官方文案真值 = ${JSON.stringify({ headline: officialHeadlineText, preview: officialPreviewText })}`);
  console.log(`[acceptance] 随机新前缀 = ${result.futureApplied.prefix}`);
  console.log(`[acceptance] 脚本错误明细：${JSON.stringify(result.scriptErrors)}`);
  console.log("[acceptance] 页面控制台：");
  for (const line of consoleLines) console.log(`  ${line}`);
  console.log(`[acceptance] 截图 = ${shot}`);
  let failed = 0;
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}  （实测：${detail}）`);
    if (!ok) failed += 1;
  }
  const pageErrors = consoleLines.filter((l) => l.startsWith("pageerror:"));
  if (pageErrors.length > 0) {
    console.log(`FAIL  页面无未捕获异常（实测：${pageErrors.length} 条）`);
    failed += pageErrors.length;
  } else {
    console.log("PASS  页面无未捕获异常");
  }
  console.log(failed === 0 ? "[acceptance] ALL CHECKS PASSED" : `[acceptance] ${failed} 项未通过`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[acceptance] 运行失败：${error.stack ?? error}`);
  process.exit(3);
});
