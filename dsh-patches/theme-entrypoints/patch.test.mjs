import assert from 'node:assert/strict';
import { readFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = join(root, '../../packages/platform/dsh-theme-local/package.json');
const require = createRequire(pkg);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Window } = createRequire(join(root, '../../packages/platform/dsh-root-brand-local/package.json'))('happy-dom');
const officialFile = 'app/Contents/Resources/app/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js';
const read = path => readFileSync(path, 'utf8');
const pristine = path => read(join(root, 'fixtures/pristine', path === officialFile ? 'official-client.js' : path));
function copyFixture(temp) {
  cpSync(join(root, 'fixtures/pristine/market'), join(temp, 'market'), { recursive: true });
  mkdirSync(dirname(join(temp, officialFile)), { recursive: true });
  cpSync(join(root, 'fixtures/pristine/official-client.js'), join(temp, officialFile));
}
// Tests execute functions extracted from complete copied artifacts, not parallel implementations.
function nodes(source, predicate) {
  const file = ts.createSourceFile('artifact.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(file);
  return found.map(node => node.getText(file));
}
function declaration(source, name) {
  const found = nodes(source, node => (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText() === name);
  assert.equal(found.length, 1, name);
  return found[0];
}
async function implementation() {
  const module = await import('./transform.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof module.transformOfficial, 'function', 'official artifact transformer must exist');
  return module;
}

function env(doc) {
  return {
    document: doc, require,
    react: React, react_jsx_runtime: require('react/jsx-runtime'),
    _deepseek_ai_dsh_client_ui_primitives: { IconLightOutline16: 'i', IconDarkOutline16: 'i', IconFollowsystemOutline16: 'i', Button: 'button' },
    AppearanceRow_module_css_default: {}, Market_module_css_default: {},
    clsx: (...values) => values.filter(Boolean).join(' '),
  };
}
function elements(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  const children = React.Children.toArray(tree.props?.children).flatMap(child => elements(child, predicate));
  return predicate(tree) ? [tree, ...children] : children;
}

test('official patched component uses three identities, bilingual labels and only document selection', async () => {
  const { transformOfficial, loadPalette } = await implementation();
  const palette = await loadPalette();
  const source = transformOfficial(pristine(officialFile), palette);
  const original = pristine(officialFile);
  // All bytes outside the component and its constants survive, including runtime and registration.
  const mask = text => text.replace(declaration(text, 'CUBES'), '<CUBES>').replace(declaration(text, 'AppearanceRow'), '<ROW>');
  assert.equal(mask(source), mask(original));
  const browser = new Window();
  try {
    const Component = runInNewContext(`const ${declaration(source, 'CUBES')}; ${declaration(source, 'AppearanceRow')}; AppearanceRow`, env(browser.document));
    for (const lang of ['zh', 'en']) for (const id of ['light', 'dark', 'warm-pink']) {
      browser.document.body.dataset.sanbaoTheme = id;
      const html = renderToStaticMarkup(React.createElement(Component, {
        t: key => key === 'appearance.title' ? (lang === 'zh' ? '外观' : 'Appearance') : key,
        setTheme() { assert.fail('official setTheme must not be invoked'); },
        useStore() { assert.fail('official preference is not product identity'); },
      }));
      browser.document.body.innerHTML = html;
      const buttons = [...browser.document.querySelectorAll('button')];
      assert.equal(buttons.length, 3);
      assert.deepEqual(buttons.map(button => button.textContent), lang === 'zh' ? ['亮色', '暗色', '暖粉白'] : ['Light', 'Dark', 'Warm pink']);
      assert.equal(buttons.filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
      assert.equal(buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true'), ['light', 'dark', 'warm-pink'].indexOf(id));
    }
    // Hook-free extraction still executes the transformed callback itself.
    const callbacks = nodes(source, node => ts.isPropertyAssignment(node) && node.name.getText() === 'onClick');
    const click = callbacks.find(text => text.includes('sanbao:select-theme'));
    assert.ok(click);
    const received = [];
    browser.document.addEventListener('sanbao:select-theme', event => received.push(event.detail));
    for (const id of ['light', 'dark', 'warm-pink']) runInNewContext(`({${click}}).onClick()`, { ...env(browser.document), id, CUBES: palette });
    assert.deepEqual(JSON.parse(JSON.stringify(received)), ['light', 'dark', 'warm-pink'].map(themeId => ({ themeId })));
  } finally { browser.close(); }
});

test('market fixed cards ignore official light echoes; gallery remains browse-only', async () => {
  const { transformMarketClient, loadPalette } = await implementation();
  const palette = await loadPalette();
  const source = transformMarketClient(pristine('market/client/client.js'), palette);
  const browser = new Window();
  try {
    const received = [];
    browser.document.addEventListener('sanbao:select-theme', event => received.push(event.detail));
    const [grid] = nodes(source, node => ts.isArrowFunction(node) && ts.isBlock(node.body) && node.body.statements[0]?.getText() === 'const extra = SANBAO_PALETTE;');
    assert.ok(grid);
    const renderGrid = runInNewContext(`(${grid})`, {
      ...env(browser.document), SANBAO_PALETTE: palette, lang: 'zh',
      themeSnap: { themes: [{ id: 'foreign' }] },
      themeCard: (id, label, swatch) => React.createElement('article', { key: id, 'data-theme-id': id }, label, ...swatch.map((color, key) => React.createElement('i', { key, style: { background: color } }))),
    });
    const cards = elements(renderGrid(), node => node.type === 'article');
    assert.deepEqual(cards.map(card => card.props['data-theme-id']), ['light', 'dark', 'warm-pink']);
    assert.deepEqual(cards.map(card => React.Children.toArray(card.props.children)[0]), ['亮色', '暗色', '暖粉白']);
    assert.deepEqual(cards.map(card => elements(card, node => node.type === 'i')[0].props.style.background), ['#FDFDFD', '#232523', '#FFF8F7']);
    for (const id of ['light', 'dark', 'warm-pink']) {
      const card = runInNewContext(`const ${declaration(source, 'themeCard')}; themeCard`, {
        ...env(browser.document), sanbaoThemeId: id, themeSnap: { preference: 'light' },
        props: { theme: { setTheme() { assert.fail('market must not set official preference'); } } }, t: key => key,
      });
      const trees = palette.map(def => card(def.id, def.label.en, def.swatch));
      assert.equal(trees.filter(tree => elements(tree, node => node.props?.children === 'themeActive').length).length, 1);
      trees.forEach((tree, index) => {
        for (const button of elements(tree, node => node.type === 'button')) {
          button.props.onClick();
          assert.equal(received.at(-1).themeId, palette[index].id);
        }
      });
    }
    const gallery = runInNewContext(`const ${declaration(source, 'themePluginCard')}; themePluginCard`, {
      ...env(browser.document), lang: 'en', t: key => key,
      installedNameOf: () => null, replacementOf: () => undefined, doneUrls: [], hotUrls: [], busyUrl: null,
      records: [], recordForUrl: () => null, skins: [], bootEntries: [], effectiveDisabledSet: new Set(),
      ThemeCover: 'cover', OwnerAvatar: 'owner', GithubRepoMark: 'mark', pluginName: x => x,
      renderFavoriteControl: () => null, openLightbox: () => {},
    });
    const tree = gallery({ url: 'https://example.test/skin', name: 'foreign-skin', description: { en: 'Skin details' } });
    assert.equal(elements(tree, node => node.type === 'button').length, 0);
    assert.equal(elements(tree, node => node.type === 'a' && node.props.href === 'https://example.test/skin').length, 1);
    assert.equal(elements(tree, node => node.type === 'cover').length, 1);
    assert.equal(elements(tree, node => node.props?.children === 'Skin details').length, 1);
  } finally { browser.close(); }
});

test('host rejects foreign activation before any side effect', async () => {
  const { transformThemes } = await implementation();
  const source = transformThemes(pristine('market/lib/themes.js'));
  const calls = [];
  const activate = runInNewContext(`(${declaration(source, 'activateTheme')})`, {
    installedThemeNames: async () => { calls.push('classify'); return new Set(['dsh-theme', 'foreign']); },
    listHotMounts: () => [], hotUnmount: () => calls.push('unmount'),
    setEntryDisabled: () => calls.push('entry'), disabledThemes: new Set(['foreign']),
    writeDisabled: () => calls.push('write'), hotMount: () => calls.push('mount'), activeProfileDir: '/not-used',
  });
  await assert.rejects(activate('foreign'), /配色由全局外观管理/);
  assert.deepEqual(calls, []);
});

test('classification failure cannot permit a theme enable, including npm and repository aliases', async () => {
  const { transformThemes } = await implementation();
  const source = transformThemes(pristine('market/lib/themes.js'));
  const classify = runInNewContext(`(${declaration(source, 'installedThemeNames')})`, {
    loadRegistry: async () => { throw new Error('catalog unavailable'); },
  });
  await assert.rejects(classify(), /catalog unavailable/);
  const aliases = runInNewContext(`(${declaration(source, 'installedThemeNames')})`, {
    loadRegistry: async () => ({ plugins: [{ name: 'Display name', npm: '@skin/npm', url: 'https://github.com/team/skins', category: 'theme' }] }),
    pluginCategories: entry => [entry.category], repoOf: () => 'team/skins',
    findInstalledAlias: (_entry, installed) => Object.keys(installed).find(name => name === '@skin/npm' || installed[name].includes('team/skins')) ?? null,
    readInstalled: () => ({ '@skin/npm': '1.0', alias: 'https://codeload.github.com/team/skins/tar.gz/123', utility: '1.0' }),
    profile: 'desktop', activeProfileDir: '/fixture',
  });
  assert.deepEqual([...await aliases()].sort(), ['@skin/npm', 'alias', 'dsh-theme']);
});

test('route executors refuse only theme mutations before writes and leave ordinary installation usable', async () => {
  const { transformRoutes, transformHot } = await implementation();
  const source = transformRoutes(pristine('market/lib/routes.js'));
  const catalog = [{ name: 'foreign', npm: '@skin/foreign', url: 'github:team/skins', category: 'theme' },
    { name: 'utility', url: 'github:team/utility', category: 'tool' }];
  const effects = [];
  const shared = {
    loadRegistry: async () => ({ plugins: catalog }),
    pluginCategories: entry => [entry.category],
    installTargetFor: entry => entry.url,
    repoOfTarget: spec => spec?.startsWith('github:') ? spec.slice(7).split('#')[0] + (spec.includes('#path:') ? spec.slice(spec.indexOf('#path:')) : '') : null,
    commands: { runPlugin: () => {} }, activeProfileDir: '/fixture',
    withHoistRecovery: async (_run, profile, args, dir) => { effects.push({ profile, args, dir }); return { exitCode: 0 }; },
  };
  const run = runInNewContext(`const ${declaration(source, 'runPlugin')}; runPlugin`, shared);
  for (const target of ['foreign', '@skin/foreign@1.0', 'github:team/skins', 'github:team/skins#path:/pink']) {
    await assert.rejects(run('desktop', ['add', target]), /配色由全局外观管理/);
    assert.equal(effects.length, 0);
  }
  assert.equal((await run('desktop', ['add', 'utility@1.0'])).exitCode, 0);
  assert.equal((await run('desktop', ['remove', 'foreign'])).exitCode, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(effects)).map(effect => effect.args), [['add', 'utility@1.0'], ['remove', 'foreign']]);

  function route(path, body, overrides = {}) {
    const [object] = nodes(source, node => ts.isObjectLiteralExpression(node) && node.properties.some(p =>
      ts.isPropertyAssignment(p) && p.name.getText() === 'path' && p.initializer.text === path));
    assert.ok(object, path);
    const state = { response: null, writes: 0 };
    const value = runInNewContext(`(${object})`, {
      ...shared, Error, sameOrigin: () => true, readJsonBody: async () => body,
      config: { profile: 'desktop' }, pendingRollbacks: { clear: () => { state.writes++; } },
      readInstalled: () => ({ foreign: '1', 'dsh-theme': '1', utility: '1' }),
      runningAgentsForGuard: () => [], withMutationLock: (_res, _kind, fn) => fn(),
      themes: { installedThemeNames: async () => new Set(['foreign', 'dsh-theme']), activateTheme: async () => { state.writes++; } },
      host: {}, groups: { mixed: ['utility', 'foreign'] }, logEvent() {},
      sendJson: (_res, status, value) => { state.response = { status, value }; },
      ...overrides,
    });
    return value.handler({ method: 'POST' }, {}).then(() => state);
  }
  for (const [path, body] of [
    ['/dsh-market/install', { url: 'github:team/skins' }],
    ['/dsh-market/use-skin', { name: 'foreign' }],
    ['/dsh-market/toggle', { name: 'foreign', enabled: true }],
    ['/dsh-market/toggle', { name: 'dsh-theme', enabled: false }],
    ['/dsh-market/groups', { action: 'toggle', name: 'mixed', enabled: true }],
  ]) {
    const state = await route(path, body);
    assert.equal(state.writes, 0, path);
    assert.match(state.response.value.error, /配色由全局外观管理/, path);
    assert.ok(state.response.status >= 400);
  }
  const hot = transformHot(pristine('market/lib/hot.js'));
  let mounts = 0;
  const mount = runInNewContext(`(${declaration(hot, 'hotMount').replace(/^export /, '')})`, {
    ...shared, readInstalled: () => ({ foreign: '1' }), findInstalledAlias: entry => entry.name === 'foreign' ? 'foreign' : null,
    loadHotTreeClass: async () => { mounts++; return null; },
  });
  assert.match((await mount({}, '/fixture', 'foreign')).reason, /配色由全局外观管理/);
  assert.equal(mounts, 0);
  assert.match((await mount({}, '/fixture', 'utility')).reason, /include plugin unavailable/);
  assert.equal(mounts, 1);
  const unavailable = runInNewContext(`(${declaration(hot, 'hotMount').replace(/^export /, '')})`, {
    Error, loadRegistry: async () => { throw new Error('catalog unavailable'); },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await unavailable({}, '/fixture', 'foreign'))), {
    ok: false, reason: 'catalog unavailable',
  });
});

test('mounted official and market components subscribe to controller identity and dispose cleanly', async () => {
  const { transformOfficial, transformMarketClient, loadPalette } = await implementation();
  const { loadPureModules } = await import('../../scripts/lib/theme-source-loader.mjs');
  const modules = await loadPureModules({
    controller: join(root, '../../packages/platform/dsh-theme-local/src/client/theme-controller.ts'),
    adapter: join(root, '../../packages/platform/dsh-theme-local/src/client/appearance-events.ts'),
  }, pkg);
  const palette = await loadPalette();
  const official = transformOfficial(pristine(officialFile), palette);
  const market = transformMarketClient(pristine('market/client/client.js'), palette);
  const browser = new Window({ url: 'http://localhost/' });
  const globals = new Map(['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = require('react-dom/client');
  const host = browser.document.createElement('main'); browser.document.body.append(host);
  const mounted = createRoot(host);
  const defaults = { themeId: 'light', uiFont: 'system', codeFont: 'sf-mono', uiFontSize: 14, codeFontSize: 12 };
  let state = { status: 'ready', value: defaults, user: defaults, base: defaults, revision: 1, writable: true, mode: 'host' };
  const listeners = new Set();
  const scope = {
    getSnapshot: () => state, subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb); },
    mutate: async ops => {
      const value = { ...state.value, [ops[0].path[0]]: ops[0].value };
      state = { ...state, value, user: value, revision: state.revision + 1 };
      listeners.forEach(fn => fn());
    },
  };
  const controller = modules.controller.createThemeController({ scope, initialScheme: 'light', storage: undefined,
    render: settings => { browser.document.body.dataset.sanbaoTheme = settings.themeId; } });
  const release = modules.adapter.bindAppearanceEvents(browser.document, controller);
  const subscriptions = new Set();
  const add = browser.document.addEventListener.bind(browser.document);
  const remove = browser.document.removeEventListener.bind(browser.document);
  browser.document.addEventListener = (name, callback, ...rest) => { if (name === 'sanbao:appearance-change') subscriptions.add(callback); return add(name, callback, ...rest); };
  browser.document.removeEventListener = (name, callback, ...rest) => { if (name === 'sanbao:appearance-change') subscriptions.delete(callback); return remove(name, callback, ...rest); };
  try {
    const Official = runInNewContext(`const ${declaration(official, 'CUBES')}; ${declaration(official, 'AppearanceRow')}; AppearanceRow`, env(browser.document));
    const MarketCards = runInNewContext(`const ${declaration(market, 'sanbaoThemeSnapshot')}; const ${declaration(market, 'sanbaoSubscribe')};
      function Cards() { const sanbaoThemeId = react.useSyncExternalStore(sanbaoSubscribe, sanbaoThemeSnapshot, sanbaoThemeSnapshot);
        const ${declaration(market, 'themeCard')}; return palette.map(def => themeCard(def.id, def.label.en, def.swatch)); } Cards`,
    { ...env(browser.document), palette, t: key => key, themeSnap: { preference: 'light' } });
    const render = () => mounted.render(React.createElement(React.Fragment, {},
      React.createElement('section', { id: 'official' }, React.createElement(Official, { t: () => 'Appearance' })),
      React.createElement('section', { id: 'market' }, React.createElement(MarketCards))));
    await React.act(async () => render());
    for (const [id, index] of [['dark', 1], ['warm-pink', 2], ['light', 0]]) {
      await React.act(async () => host.querySelectorAll('#official button')[index].click());
      assert.equal(controller.getSnapshot().settings.themeId, id);
      assert.equal(controller.getSnapshot().saveStatus, 'saved');
      assert.equal(host.querySelectorAll('#official button')[index].getAttribute('aria-pressed'), 'true');
      assert.equal(host.querySelector('#market').textContent.split('themeActive').length - 1, 1);
    }
    await React.act(async () => host.querySelector('#market').lastElementChild.querySelector('button').click());
    assert.equal(controller.getSnapshot().settings.themeId, 'warm-pink');
    assert.equal(host.querySelectorAll('#official button')[2].getAttribute('aria-pressed'), 'true');
    assert.equal(state.user.themeId, 'warm-pink');
    assert.equal(subscriptions.size, 2);
    await React.act(async () => mounted.unmount());
    assert.equal(subscriptions.size, 0);
  } finally {
    release(); controller.dispose(); browser.close();
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('CLI defaults to zero-write dry-run and only applies copied fixtures', async () => {
  const temp = mkdtempSync(join(root, 'fixtures/cli-'));
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'patch.mjs'), ...args], { encoding: 'utf8' });
  try {
    copyFixture(temp);
    const args = ['--app-root', join(temp, 'app'), '--market-root', join(temp, 'market')];
    const before = readdirSync(temp, { recursive: true });
    let result = cli(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).mode, 'dry-run');
    assert.deepEqual(readdirSync(temp, { recursive: true }), before);
    result = cli(...args, '--apply');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).files.filter(row => row.changed).length, 5);
    result = cli(...args, '--apply');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).files.filter(row => row.changed).length, 0);
    result = cli('--app-root', join(temp, 'app'), '--market-root', join(root, 'fixtures/pristine/market'), '--apply');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /only accepts copied fixtures/);
    assert.equal(cli().status, 1);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('batch patch dry-run, bad anchors, hash changes, backups and replay are fail-closed', async () => {
  await implementation();
  const { planPatch, applyPlan } = await import('./patch.mjs');
  const temp = mkdtempSync(join(root, 'fixtures/run-'));
  try {
    copyFixture(temp);
    const options = { appRoot: join(temp, 'app'), marketRoot: join(temp, 'market') };
    const before = readdirSync(temp, { recursive: true });
    const plan = await planPatch(options);
    assert.ok(plan.entries.length >= 4);
    assert.throws(() => applyPlan({ ...plan, appRoot: root }), /only accepts copied fixtures/);
    assert.deepEqual(readdirSync(temp, { recursive: true }), before);
    for (const entry of plan.entries) assert.equal(read(entry.path), entry.before);
    const last = plan.entries.at(-1);
    writeFileSync(last.path, last.before + '\n// raced\n');
    assert.throws(() => applyPlan(plan), /hash/);
    assert.deepEqual(readdirSync(temp, { recursive: true }), before);
    assert.equal(read(plan.entries[0].path), plan.entries[0].before);
    writeFileSync(last.path, last.before);
    const routes = join(temp, 'market/lib/routes.js');
    const routesBefore = read(routes);
    writeFileSync(routes, routesBefore.replace('const plainTarget = installTargetFor(entry);', 'const plainTarget = changed(entry);'));
    await assert.rejects(planPatch(options), /anchor/);
    assert.deepEqual(readdirSync(temp, { recursive: true }), before);
    writeFileSync(routes, routesBefore);
    applyPlan(await planPatch(options));
    const once = await planPatch(options);
    assert.equal(once.entries.filter(entry => entry.before !== entry.after).length, 0);
    const files = readdirSync(temp, { recursive: true });
    applyPlan(once);
    assert.deepEqual(readdirSync(temp, { recursive: true }), files);
    for (const entry of plan.entries) {
      assert.equal(read(entry.path), entry.after);
      const backup = JSON.parse(read(entry.path + '.sanbao-theme-entrypoints.backup.json'));
      assert.equal(Buffer.from(backup.original, 'base64').toString(), entry.before);
    }
    writeFileSync(plan.entries[0].path, read(plan.entries[0].path) + '\n// tampered\n');
    await assert.rejects(planPatch(options), /hash/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
