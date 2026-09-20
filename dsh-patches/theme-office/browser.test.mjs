#!/usr/bin/env node
/** Real Office factory + both React iframe components + full viewer module.
 * --red proves rejection of unpatched Office. --document additionally requires the real preview renderer.
 * Only the DSH registry and gateway document-list endpoints are test adapters.
 * All file writes, including Chromium's disposable profile, stay under this directory.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { home, repo, ts, parse, nodes, one, discover, viewerStructure } from './transform.mjs';
import { patchPackage } from './patch.mjs';

const input = process.argv[2];
assert(input?.startsWith('/'), 'Usage: node browser.test.mjs /absolute/office-package [--red]');
const root = mkdtempSync(join(home, '.browser-copy-'));
const originalTmp = process.env.TMPDIR;
process.env.TMPDIR = root;
let browser;
const servers = [];
const errors = [];
try {
  for (const file of ['package.json', 'lib/client.js', 'artifacts/viewer']) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(input, file), join(root, file), { recursive: true });
  }
  const files = discover(root);
  const inputHashes = new Map(Object.values(files).map(file => [file, createHash('sha256').update(readFileSync(join(input, file))).digest('hex')]));
  const assertInputsUntouched = () => {
    for (const [file, expected] of inputHashes) assert.equal(createHash('sha256').update(readFileSync(join(input, file))).digest('hex'), expected, `Installed input changed: ${file}`);
  };
  const originalViewer = readFileSync(join(root, files.viewer), 'utf8');
  const structure = viewerStructure(originalViewer);
  if (!process.argv.includes('--red')) await patchPackage(root, true);
  let host = readFileSync(join(root, files.host), 'utf8');
  const ast = parse(host);
  const frameCalls = nodes(ast, n => ts.isCallExpression(n) &&
    (n.arguments[0]?.text === 'iframe' || n.arguments[0]?.getText(ast) === '__LuteOfficeFrame') &&
    n.arguments[1]?.getText(ast).includes('uvf_'));
  const components = frameCalls.map(n => { while (n && !ts.isFunctionDeclaration(n)) n = n.parent; return n.name.text; });
  assert.equal(components.length, 2);
  // Expose existing private components without replacing their props, hooks or iframe render sites.
  const returned = one(nodes(ast, n => ts.isReturnStatement(n) && n.expression?.getText(ast) === 'module.exports'), 'factory return');
  host = host.slice(0, returned.getStart(ast)) + `window.__officeComponents=[${components.join(',')}];` + host.slice(returned.getStart(ast));
  let viewer = readFileSync(join(root, files.viewer), 'utf8');
  // Capture the REAL controller instance before the module's unchanged startup branch executes.
  const viewerAst = parse(viewer);
  const cls = one(nodes(viewerAst, n => ts.isClassExpression(n) && n.members.some(m => m.name?.getText(viewerAst) === 'chooseAppearance')), 'viewer controller');
  const ctor = one(cls.members.filter(ts.isConstructorDeclaration), 'viewer constructor');
  viewer = viewer.slice(0, ctor.body.end - 1) + ';window.__officeController=this;' + viewer.slice(ctor.body.end - 1);
  const previewAst = parse(viewer);
  const previewFactory = one(nodes(previewAst, n => ts.isFunctionDeclaration(n) &&
    n.getText(previewAst).includes('.changesets') && nodes(n, c => ts.isCallExpression(c) &&
      ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === 'createUnit').length >= 2), 'real preview factory');
  const creates = nodes(previewFactory, c => ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === 'createUnit');
  for (const call of creates.sort((a, b) => b.pos - a.pos)) viewer = viewer.slice(0, call.getStart(previewAst)) +
    `(window.__previewUnit=${call.getText(previewAst)})` + viewer.slice(call.end);
  const pkgRequire = createRequire(join(repo, 'packages/platform/dsh-theme-local/package.json'));
  const toolRequire = createRequire(pkgRequire.resolve('tsdown'));
  const { rolldown } = await import(pathToFileURL(toolRequire.resolve('rolldown')).href);
  const entry = '\0office-browser-host';
  const bundle = await rolldown({ input: entry, platform: 'browser', plugins: [{ name: 'host-boundary',
    resolveId(source) { if (source === entry) return entry; },
    load(id) { if (id !== entry) return; return `
      import React from ${JSON.stringify(pkgRequire.resolve('react'))};
      import * as jsx from ${JSON.stringify(pkgRequire.resolve('react/jsx-runtime'))};
      import {createRoot} from ${JSON.stringify(pkgRequire.resolve('react-dom/client'))};
      window.__ModuleLoader__={load({factory}){window.__office=factory(name=>{if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;throw Error(name)})}};
      window.__mountOffice=(url)=>{
        const disposers=[], roots=[];
        const ctx={effect(fn){const dispose=fn();if(typeof dispose==='function')disposers.push(dispose)},
          locale:{getSnapshot:()=>({active:'en-US'}),register:()=>()=>{}},
          get:name=>name==='uiConversation'?{events:{register(){}}}:undefined,
          slots:{inject:(slot,fn)=>fn(),register:()=>()=>{}},inject(){}};
        window.__office.apply(ctx);
        window.__disposeHost=()=>disposers.splice(0).reverse().forEach(fn=>fn());
        const props={state:{viewerUrl:url,worktrees:[]},file:'fixture.univer',worktreeId:null,preferredUnitId:null,
          historical:false,viewerLocale:'en-US',stackIndex:0,t:key=>key,onDismiss(){}};
        window.__officeComponents.forEach((C,i)=>{const root=createRoot(document.getElementById('frame'+i));roots.push(root);root.render(React.createElement(C,props))});
        window.__rerenderOffice=()=>roots.forEach((root,i)=>root.render(React.createElement(window.__officeComponents[i],{...props})));
        window.__unmountOffice=()=>roots.forEach(root=>root.unmount());
      };
    `; } }] });
  const { output } = await bundle.generate({ format: 'iife', codeSplitting: false });
  await bundle.close();
  const hostBundle = output[0].code;
  async function server(handler) {
    const s = createServer(handler); servers.push(s);
    await new Promise(r => s.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${s.address().port}`;
  }
  const mime = path => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
  const gateway = await server((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (path.endsWith('/units') || path.endsWith('/worktrees')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(path.endsWith('/units') ? { units: [] } : { worktrees: [] })); return;
    }
    if (path === '/attacker') { res.end('<!doctype html><title>other source</title>'); return; }
    const file = path === '/' ? join(root, files.html) : resolve(root, 'artifacts/viewer', `.${path}`);
    if (!file.startsWith(join(root, 'artifacts/viewer') + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', mime(file)); res.end(file === join(root, files.viewer) ? viewer : readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  const hostOrigin = await server((req, res) => {
    res.setHeader('Content-Type', req.url?.endsWith('.js') ? 'text/javascript' : 'text/html');
    if (req.url === '/runtime.js') { res.end(hostBundle); return; }
    if (req.url === '/office.js') { res.end(host); return; }
    res.end(`<!doctype html><body data-sanbao-theme="warm-pink"><div id="frame0"></div><div id="frame1"></div>
      <script src="/runtime.js"></script><script src="/office.js"></script>
      <script>__mountOffice(${JSON.stringify(gateway + '/?file=fixture.univer')})</script></body>`);
  });
  const tools = process.env.DSH_TEST_TOOLS_ROOT ?? resolve(repo, '../..');
  const browserRequire = createRequire(join(tools, 'packages/capabilities/dsh-browser-local/package.json'));
  const { chromium } = browserRequire('playwright-core');
  browser = await chromium.launchPersistentContext(join(root, 'chromium'), {
    headless: true, executablePath: chromium.executablePath(), chromiumSandbox: true,
    viewport: { width: 1440, height: 1000 },
  });
  await browser.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' ? route.continue() : route.abort();
  });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(hostOrigin);
  await page.locator('iframe.uvf_panelFrame').waitFor();
  await page.locator('iframe.uvf_frame').waitFor();
  const frames = await Promise.all(['uvf_panelFrame', 'uvf_frame'].map(async name => (await page.locator(`iframe.${name}`).elementHandle()).contentFrame()));
  for (const frame of frames) {
    await frame.waitForFunction(() => window.__officeController);
    assert.equal(await frame.evaluate(() => document.body.dataset.sanbaoTheme), 'warm-pink', 'real iframe initial query');
  }
  const expectTheme = async id => {
    for (const frame of frames) await frame.waitForFunction(id => document.body.dataset.sanbaoTheme === id &&
      getComputedStyle(document.documentElement).colorScheme === (id === 'dark' ? 'dark' : 'light'), id);
  };
  const colors = {
    light: ['rgb(253, 253, 253)', 'rgb(56, 105, 64)'],
    dark: ['rgb(35, 37, 35)', 'rgb(92, 147, 99)'],
    'warm-pink': ['rgb(255, 248, 247)', 'rgb(143, 83, 97)'],
  };
  for (const id of ['dark', 'light', 'warm-pink']) {
    await page.evaluate(id => document.body.dataset.sanbaoTheme = id, id); await expectTheme(id);
    for (const frame of frames) {
      const urlBeforeRender = await frame.evaluate(() => { window.__renderSentinel = 'survives'; return location.href; });
      await page.evaluate(() => window.__rerenderOffice());
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await frame.waitForLoadState();
      assert.equal(await frame.evaluate(() => window.__renderSentinel), 'survives', 'Unrelated React render must not reload the Office document');
      assert.equal(frame.url(), urlBeforeRender);
      const actual = await frame.evaluate(() => {
        const el = document.createElement('button'); el.className = 'univer-bg-primary-600'; document.body.append(el);
        const out = [getComputedStyle(document.body).backgroundColor, getComputedStyle(el).backgroundColor]; el.remove(); return out;
      });
      assert.deepEqual(actual, colors[id], `Real native CSS + Univer CSS ${id}`);
    }
  }
  const frame = frames[0];
  let documentSnapshot;
  if (process.argv.includes('--document')) {
  const preview = await frame.evaluate(async () => {
    const container = document.createElement('div'); container.style.cssText = 'position:fixed;inset:0'; document.body.append(container);
    const viewer = window.__officeController.viewer; viewer.bind(container);
    await viewer.showPreview('fixture', { unitId: 'office-doc', type: 2, name: 'Workbook' }, {
      snapshot: { workbook: { unitID: 'office-doc', rev: 1, name: 'Workbook', sheetOrder: ['sheet1'],
        sheets: { sheet1: { id: 'sheet1', name: 'Sheet1', rowCount: 20, columnCount: 10, originalMeta: new TextEncoder().encode('{}') } },
        originalMeta: new TextEncoder().encode(JSON.stringify({ styles: { custom: { bg: { rgb: '#123456' }, cl: { rgb: '#789012' } } } })),
        resources: [] } }, changesets: [], sheetBlocks: [],
    });
    return { handle: !!viewer.handle, unit: !!window.__previewUnit, error: container.textContent?.slice(-600) };
  });
  assert(preview.handle && preview.unit, JSON.stringify(preview));
  documentSnapshot = await frame.evaluate(() => JSON.stringify(window.__previewUnit.getSnapshot()));
  }
  await frame.evaluate(() => {
    window.__uiCalls = [];
    const viewer = window.__officeController.viewer, original = viewer.setDarkMode.bind(viewer);
    viewer.setDarkMode = value => { window.__uiCalls.push(value); return original(value); };
    const sheet = document.createElement('div'); sheet.id = 'content-sentinel';
    sheet.setAttribute('style', 'background: rgb(12, 34, 56); color: rgb(78, 90, 12)'); document.body.append(sheet);
  });
  const send = async data => page.evaluate(({ data, gateway }) => document.querySelector('iframe.uvf_panelFrame').contentWindow.postMessage(data, gateway), { data, gateway });
  // MessageChannel barrier: preceding posted messages have been delivered without sleeps.
  const barrier = async () => { await frame.evaluate(() => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); c.port2.close(); r(); }; c.port2.postMessage(0); })); };
  for (const data of [{ type: 'lute:office-theme', themeId: 'system' }, { type: 'other', themeId: 'dark' },
    { type: 'lute:office-theme', themeId: 'dark', css: 'body{display:none}' }, 'dark', null]) await send(data);
  await page.evaluate(gateway => {
    const f = document.createElement('iframe'); f.id = 'attacker'; f.src = gateway + '/attacker'; document.body.append(f);
  }, gateway);
  const attacker = await (await page.locator('#attacker').elementHandle()).contentFrame();
  await attacker.waitForLoadState();
  await attacker.evaluate(gateway => parent.frames[0].postMessage({ type: 'lute:office-theme', themeId: 'dark' }, gateway), gateway);
  await barrier();
  assert.equal(await frame.evaluate(() => document.body.dataset.sanbaoTheme), 'warm-pink', 'Reject foreign source and malformed messages');
  await frame.evaluate(hostOrigin => {
    window.dispatchEvent(new MessageEvent('message', { source: parent, origin: hostOrigin.replace('127.0.0.1', 'localhost'), data: { type: 'lute:office-theme', themeId: 'dark' } }));
  }, hostOrigin);
  assert.equal(await frame.evaluate(() => document.body.dataset.sanbaoTheme), 'warm-pink', 'Reject wrong exact origin');
  for (const id of ['dark', 'warm-pink', 'light']) {
    await page.evaluate(id => document.body.dataset.sanbaoTheme = id, id); await expectTheme(id);
    if (documentSnapshot !== undefined) {
      assert.equal(await frame.evaluate(() => JSON.stringify(window.__previewUnit.getSnapshot())), documentSnapshot, `${id}: real document snapshot unchanged`);
      assert.equal(await frame.locator('.univer-dark').count() > 0, id === 'dark', `${id}: real Univer dark-mode class`);
    }
  }
  assert.deepEqual(await frame.evaluate(() => window.__uiCalls), [true, false, false], 'Actual viewer UI API sees the triad');
  assert.equal(await frame.locator('#content-sentinel').getAttribute('style'), 'background: rgb(12, 34, 56); color: rgb(78, 90, 12)', 'No content style writes');
  await frame.evaluate(() => window.__officeController.chooseAppearance('dark'));
  assert.equal(await frame.evaluate(() => document.body.dataset.sanbaoTheme), 'light', 'Office local appearance write disabled');
  assert.equal(await frame.evaluate(() => localStorage.getItem('univer-collab-client-appearance')), null);
  const menuFrame = frames[1];
  await menuFrame.locator('.settings-row').click();
  await menuFrame.getByRole('menuitem', { name: '简体中文', exact: true }).waitFor({ state: 'attached' });
  assert.equal(await menuFrame.getByRole('menuitem', { name: 'Light', exact: true }).count(), 0);
  assert.equal(await menuFrame.getByRole('menuitem', { name: 'Dark', exact: true }).count(), 0);
  assert(await menuFrame.getByRole('menuitem', { name: '简体中文', exact: true }).count(), 'Language menu preserved');
  await menuFrame.getByRole('menuitem', { name: '简体中文', exact: true }).focus();
  await menuFrame.getByRole('menuitem', { name: '简体中文', exact: true }).press('Enter');
  await menuFrame.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  await page.evaluate(() => document.body.dataset.sanbaoTheme = 'dark'); await expectTheme('dark');
  await frame.evaluate(() => {
    const url = new URL(location.href); url.searchParams.set('luteTheme', 'light'); history.replaceState(null, '', url);
  });
  await Promise.all([frame.waitForNavigation({ waitUntil: 'load' }), frame.evaluate(() => location.reload())]);
  await frame.waitForFunction(() => window.__officeController && document.body.dataset.sanbaoTheme === 'dark');
  assert.equal(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor), colors.dark[0], 'Reload onLoad resends current theme despite old query');
  await frame.evaluate(() => window.__officeController.dispose());
  await send({ type: 'lute:office-theme', themeId: 'warm-pink' }); await barrier();
  assert.equal(await frame.evaluate(() => document.body.dataset.sanbaoTheme), 'dark', 'Viewer dispose removes listener');
  await page.evaluate(() => { window.__disposeHost(); document.body.dataset.sanbaoTheme = 'light'; });
  await barrier();
  assert.equal(await frames[1].evaluate(() => document.body.dataset.sanbaoTheme), 'dark', 'Host dispose disconnects body observer');
  await frames[1].goto(frames[1].url());
  await frames[1].waitForFunction(() => window.__officeController);
  assert.notEqual(await frames[1].evaluate(() => document.body.dataset.sanbaoTheme), 'light', 'Host disposed onLoad is inactive');
  await page.evaluate(gateway => { window.__unmountOffice(); window.__mountOffice(gateway + '/?file=fixture.univer'); }, gateway);
  const remounted = await (await page.locator('iframe.uvf_panelFrame').elementHandle()).contentFrame();
  await remounted.waitForFunction(() => window.__officeController);
  await page.evaluate(() => document.body.dataset.sanbaoTheme = 'warm-pink');
  await remounted.waitForFunction(() => document.body.dataset.sanbaoTheme === 'warm-pink');
  assert.equal(await remounted.evaluate(() => getComputedStyle(document.body).backgroundColor), colors['warm-pink'][0], 'Dispose then fresh apply resumes one live channel');
  await page.evaluate(() => window.__disposeHost());
  const standalone = await browser.newPage(); await standalone.goto(gateway + '/?file=fixture.univer&luteTheme=dark');
  await standalone.waitForFunction(() => window.__officeController);
  assert.equal(await standalone.evaluate(() => document.body.dataset.sanbaoTheme), 'light', 'No parent channel: query is not claimed as sync');
  const probes = [
    { key: 'empty-referrer', suffix: '&luteTheme=dark', expected: 'light' },
    { key: 'remote-origin', suffix: '&luteTheme=dark&luteHostOrigin=https%3A%2F%2Fevil.example', expected: 'light' },
    { key: 'unknown-query', suffix: `&luteTheme=unknown&luteHostOrigin=${encodeURIComponent(hostOrigin)}`, expected: 'light' },
    { key: 'controlled-local', suffix: `&luteTheme=dark&luteHostOrigin=${encodeURIComponent(hostOrigin)}`, expected: 'dark' },
  ];
  for (const probe of probes) {
    await page.evaluate(({ gateway, probe }) => {
      const node = document.createElement('iframe'); node.id = probe.key; node.referrerPolicy = 'no-referrer';
      node.src = gateway + '/?file=fixture.univer' + probe.suffix; document.body.append(node);
    }, { gateway, probe });
    const target = await (await page.locator(`#${probe.key}`).elementHandle()).contentFrame();
    await target.waitForFunction(() => window.__officeController);
    assert.equal(await target.evaluate(() => document.body.dataset.sanbaoTheme), probe.expected, probe.key);
    if (probe.key === 'empty-referrer' || probe.key === 'remote-origin') {
      await page.evaluate(({ key, gateway }) => document.getElementById(key).contentWindow.postMessage({ type: 'lute:office-theme', themeId: 'dark' }, gateway), { key: probe.key, gateway });
      await target.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      assert.equal(await target.evaluate(() => document.body.dataset.sanbaoTheme), 'light', `${probe.key} rejects messages`);
    }
    await page.locator(`#${probe.key}`).evaluate(node => node.remove());
  }
  assert.deepEqual(errors, [], 'No page script errors');
  assertInputsUntouched();
  console.log(JSON.stringify({ status: 'passed', scope: 'real Office factory/components and full viewer module, empty gateway document-list adapter',
    cases: ['two iframes initial query', 'three native/Univer colors', 'unrelated React render does not reload documents', 'enum/source/origin rejection', 'UI setDarkMode and content DOM invariance',
      'local write disabled; language keyboard selection', 'stale-query iframe reload', 'viewer/host disposal and reapply', 'controlled-query whitelist', 'standalone blocked', 'installed input hashes unchanged'],
    pending: [...(documentSnapshot === undefined ? ['real document snapshot invariance: --document currently fails in preview dependency H9'] : []), 'independent gateway transport'],
    controller: structure.controllerName }, null, 2));
} finally {
  await browser?.close();
  for (const server of servers) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  if (originalTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = originalTmp;
  rmSync(root, { recursive: true, force: true });
}
