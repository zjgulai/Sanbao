import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, writeFileSync, renameSync, linkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover, viewerStructure, nodes, ts } from './transform.mjs';
import { spawnSync } from 'node:child_process';

const home = dirname(fileURLToPath(import.meta.url));
const cli = join(home, 'patch.mjs');
const source = process.env.OFFICE_PACKAGE_ROOT;
assert(source, 'Set OFFICE_PACKAGE_ROOT explicitly to an unmodified Office package');
const run = (...args) => spawnSync(process.execPath, [cli, '--package-root', ...args], { encoding: 'utf8' });
function fixture(t) {
  const root = mkdtempSync(join(home, '.test-copy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Deliberately copy, never hard-link the installed package.
  for (const file of ['package.json', 'lib/client.js', 'artifacts/viewer']) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(source, file), join(root, file), { recursive: true });
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

test('CLI exists to plan Office changes without touching the installed package', () => {
  assert(existsSync(cli), 'Missing executable replay patch');
});
test('default dry-run performs no writes; apply is copy-only and replay is hash-idempotent', t => {
  const root = fixture(t), before = tree(root);
  const plan = run(root);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).status, 'dry-run');
  assert.deepEqual(tree(root), before);
  const applied = run(root, '--apply');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).status, 'applied');
  const after = tree(root);
  assert.notDeepEqual(after, before);
  const replay = run(root, '--apply');
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).status, 'already-applied');
  assert.deepEqual(tree(root), after);
  const denied = run(source, '--apply');
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /copy-only/);
});
test('bad viewer anchor rejects the whole batch before host, backup or manifest writes', t => {
  const root = fixture(t);
  const assets = join(root, 'artifacts/viewer/assets');
  const file = readdirSync(assets).find(f => f.endsWith('.js') && readFileSync(join(assets, f), 'utf8').includes('chooseAppearance('));
  writeFileSync(join(assets, file), readFileSync(join(assets, file), 'utf8').replaceAll('chooseAppearance', 'brokenAppearance'));
  const before = tree(root), result = run(root, '--apply');
  assert.notEqual(result.status, 0);
  assert.deepEqual(tree(root), before);
});
test('tampered replay refuses rather than patching mixed versions', t => {
  const root = fixture(t);
  assert.equal(run(root, '--apply').status, 0);
  writeFileSync(join(root, 'lib/client.js'), readFileSync(join(root, 'lib/client.js'), 'utf8') + '\n// unexpected drift\n');
  const before = tree(root), result = run(root, '--apply');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /hash|drift/);
  assert.deepEqual(tree(root), before);
});
test('asset hashes and minifier identifiers may change without changing replay semantics', t => {
  const root = fixture(t), files = discover(root);
  const sourceText = readFileSync(join(root, files.viewer), 'utf8');
  const structure = viewerStructure(sourceText);
  const names = [structure.controllerName, structure.getter, structure.setter, structure.paint, structure.read.name.text];
  let renamed = sourceText;
  for (const node of nodes(structure.ast, n => ts.isIdentifier(n) && names.includes(n.text)).sort((a, b) => b.pos - a.pos)) {
    renamed = renamed.slice(0, node.getStart(structure.ast)) + `renamedOffice${names.indexOf(node.text)}` + renamed.slice(node.end);
  }
  writeFileSync(join(root, files.viewer), renamed);
  for (const kind of ['viewer', 'css']) {
    const next = `artifacts/viewer/assets/semantic-${kind}.${kind === 'viewer' ? 'js' : 'css'}`;
    renameSync(join(root, files[kind]), join(root, next));
    const html = join(root, files.html);
    writeFileSync(html, readFileSync(html, 'utf8').replace(files[kind].slice('artifacts/viewer'.length), next.slice('artifacts/viewer'.length)));
  }
  const result = run(root, '--apply');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run(root, '--apply').status, 0);
});
test('hard-linked inputs refuse before backups or modified package files', t => {
  const root = fixture(t);
  linkSync(join(root, 'lib/client.js'), join(root, 'linked-client.js'));
  const before = tree(root), result = run(root, '--apply');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /hard-linked/);
  assert.deepEqual(tree(root), before);
});
