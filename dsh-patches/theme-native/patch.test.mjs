import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const home = dirname(fileURLToPath(import.meta.url));
const cli = join(home, 'patch.mjs');
const source = process.env.DSH_APP_ROOT || '/Applications/DSH Desktop.app';
assert(existsSync(source), `DSH Desktop app root does not exist: ${source}`);

const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

function fixture(t) {
  const root = mkdtempSync(join(home, '.test-native-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Copy minimal lib directory structure needed for patching
  const targetLib = join(root, 'Contents/Resources/app/lib');
  mkdirSync(targetLib, { recursive: true });
  const sourceLib = join(source, 'Contents/Resources/app/lib');
  const files = readdirSync(sourceLib);
  const main = 'main.js';
  const admission = files.find(f => f.startsWith('profile-channel-admission-') && f.endsWith('.js'));
  const electronRuntime = files.find(f => f.startsWith('electron-runtime-') && f.endsWith('.js'));
  assert(admission && electronRuntime, 'Required source chunks not found');
  for (const f of [main, admission, electronRuntime]) {
    cpSync(join(sourceLib, f), join(targetLib, f));
  }
  return root;
}

function tree(root) {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile()).map(e => {
      const file = join(e.parentPath ?? e.path, e.name);
      return [file.slice(root.length), readFileSync(file).toString('base64')];
    }));
}

test('CLI exists to plan native window theme injection', () => {
  assert(existsSync(cli), 'Missing executable replay patch');
});

test('default dry-run performs no writes; apply is safe and replay is hash-idempotent', t => {
  const root = fixture(t), before = tree(root);
  const plan = run('--app-root', root);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).status, 'dry-run');
  assert.deepEqual(tree(root), before);

  const applied = run('--app-root', root, '--apply');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).status, 'applied');
  const after = tree(root);
  assert.notDeepEqual(after, before);

  const replay = run('--app-root', root, '--apply');
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).status, 'already-applied');
  assert.deepEqual(tree(root), after);
});

test('tampered file fails transform and leaves directory completely untouched', t => {
  const root = fixture(t);
  const lib = join(root, 'Contents/Resources/app/lib');
  const files = readdirSync(lib);
  const main = join(lib, 'main.js');
  // Break anchor in main.js
  writeFileSync(main, readFileSync(main, 'utf8').replace('onSettingsDocumentResolved', 'brokenSettingsResolved'));
  const before = tree(root);
  const res = run('--app-root', root, '--apply');
  assert.notEqual(res.status, 0);
  assert.deepEqual(tree(root), before);
});

// The injected helper is generated text; run it, don't read it. `insertCSS` accumulates
// per call, so a theme switch that leaves the old sheet mounted is a real product bug
// (the window keeps the previous theme's rules) that only shows up when executed.
test('injected helper removes the previous sheet so repeated switches leave exactly one live', async () => {
  const { transformElectronRuntime, loadNativeCss } = await import('./transform.mjs');
  const cssMap = await loadNativeCss();
  const generated = transformElectronRuntime(
    'function createDesktopLocalWindow() {\n\treturn window;\n}\nclass R { setThemeSource(source) {} }',
    cssMap,
  );
  const start = generated.indexOf('const __SANBAO_THEME_CSS');
  const end = generated.indexOf('// --- END SANBAO');
  assert(start > 0 && end > start, 'helper region missing from generated header');
  const live = new Map(), removed = [];
  let seq = 0;
  const wc = {
    isDestroyed: () => false,
    getURL: () => 'file:///Applications/DSH%20Desktop.app/Contents/Resources/app/lib/native-ui/boot.html',
    insertCSS: css => { const key = `s${++seq}`; live.set(key, css.length); return Promise.resolve(key); },
    removeInsertedCSS: key => { removed.push(key); live.delete(key); return Promise.resolve(); },
  };
  const vm = await import('node:vm');
  const context = vm.createContext({ wc, WeakMap, Promise, JSON, String });
  // Top-level const never becomes a global property: read the trailing expression's value,
  // otherwise this test would assert against undefined and prove nothing.
  const apply = vm.runInContext(generated.slice(start, end) + '\n__applySanbaoThemeToWebContents', context);
  assert(typeof apply === 'function', 'helper not exposed by the generated region');
  await apply(wc, 'light'); await apply(wc, 'dark'); await apply(wc, 'warm-pink');
  assert.equal(live.size, 1, `expected one live sheet, saw ${[...live.keys()]}`);
  assert.deepEqual(removed, ['s1', 's2']);
  assert.ok([...live.values()].every(len => len > 0));
});
