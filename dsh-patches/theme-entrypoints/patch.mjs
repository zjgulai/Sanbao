import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, transformOfficial, transformMarketClient, transformThemes, transformRoutes, transformHot } from './transform.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const backupSuffix = '.sanbao-theme-entrypoints.backup.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (parent, child) => {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
};
const read = path => readFileSync(path, 'utf8');
function regular(path) {
  assert.ok(!lstatSync(path).isSymbolicLink() && lstatSync(path).isFile(), `Expected regular file: ${path}`);
  assert.equal(realpathSync(path), join(realpathSync(dirname(path)), path.split(sep).at(-1)), `Symlink target: ${path}`);
}
function fixtureOnly(path) {
  const fixtures = realpathSync(join(root, 'fixtures'));
  const resolved = realpathSync(path);
  assert.ok(within(fixtures, resolved) && !within(join(fixtures, 'pristine'), resolved), '--apply only accepts copied fixtures (not pristine/app/profile)');
  assert.equal(resolved, path, '--apply refuses symlinked fixture paths');
}

/** No writes: validate the whole batch and compute dynamic hashes, never pin official asset hashes. */
export async function planPatch({ appRoot, marketRoot }) {
  assert.ok(isAbsolute(appRoot ?? '') && isAbsolute(marketRoot ?? ''), 'Explicit absolute --app-root and --market-root are required');
  const palette = await loadPalette();
  const manifestPath = join(marketRoot, 'package.json');
  regular(manifestPath);
  const manifestText = read(manifestPath);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.name, 'dshmarket');
  assert.equal(manifest.version, '1.45.1', 'Market version has not been reviewed');
  assert.equal(manifest.exports?.['./client'], './client/client.js', 'Market client export anchor changed');
  const entries = [
    [join(appRoot, 'Contents/Resources/app/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js'), source => transformOfficial(source, palette)],
    [join(marketRoot, manifest.exports['./client']), source => transformMarketClient(source, palette)],
    [join(marketRoot, 'lib/themes.js'), transformThemes],
    [join(marketRoot, 'lib/routes.js'), transformRoutes],
    [join(marketRoot, 'lib/hot.js'), transformHot],
  ].map(([path, transform]) => {
    regular(path);
    const bytes = readFileSync(path);
    const before = bytes.toString('utf8');
    assert.ok(Buffer.from(before).equals(bytes), 'Artifact must be lossless UTF-8');
    const backupPath = path + backupSuffix;
    let original = before;
    let backupBefore;
    if (existsSync(backupPath)) {
      regular(backupPath);
      backupBefore = read(backupPath);
      const saved = JSON.parse(backupBefore);
      original = Buffer.from(saved.original, 'base64').toString('utf8');
      assert.equal(hash(original), saved.beforeHash, 'backup original hash mismatch');
      assert.equal(hash(before), saved.afterHash, 'patched artifact hash mismatch');
    }
    const after = transform(original);
    if (backupBefore !== undefined) assert.equal(hash(after), hash(before), 'replay hash differs; reviewed sources changed');
    return { path, before, after, beforeHash: hash(before), afterHash: hash(after), backupBefore, backupPath };
  });
  return { appRoot, marketRoot, entries, manifestPath, manifestHash: hash(manifestText) };
}

function validatePlan(plan) {
  fixtureOnly(plan.appRoot);
  fixtureOnly(plan.marketRoot);
  regular(plan.manifestPath);
  assert.equal(hash(readFileSync(plan.manifestPath)), plan.manifestHash, 'market manifest hash changed');
  for (const entry of plan.entries) {
    fixtureOnly(entry.path);
    regular(entry.path);
    assert.equal(hash(readFileSync(entry.path)), entry.beforeHash, `preflight hash changed: ${entry.path}`);
    assert.equal(hash(entry.after), entry.afterHash, 'planned output hash changed');
    if (entry.backupBefore === undefined) assert.ok(!existsSync(entry.backupPath), 'unexpected backup');
    else {
      regular(entry.backupPath);
      assert.equal(read(entry.backupPath), entry.backupBefore, 'backup hash changed');
    }
  }
}

/** Copies only: all validation precedes writes; each replacement uses sibling tmp + rename. */
export function applyPlan(plan) {
  validatePlan(plan);
  const pending = plan.entries.filter(entry => entry.before !== entry.after);
  const staged = [];
  const committed = [];
  try {
    for (const entry of pending) {
      const suffix = `.tmp-${randomUUID()}`;
      const temp = entry.path + suffix;
      const backupTemp = entry.backupPath + suffix;
      staged.push({ ...entry, temp, backupTemp });
      writeFileSync(temp, entry.after, { flag: 'wx', mode: lstatSync(entry.path).mode & 0o777 });
      writeFileSync(backupTemp, JSON.stringify({
        beforeHash: entry.beforeHash, afterHash: entry.afterHash, original: Buffer.from(entry.before).toString('base64'),
      }) + '\n', { flag: 'wx', mode: 0o600 });
      assert.equal(hash(readFileSync(temp)), entry.afterHash, 'staged output hash mismatch');
    }
    validatePlan(plan);
    for (const entry of staged) {
      renameSync(entry.backupTemp, entry.backupPath);
      committed.push(entry);
      renameSync(entry.temp, entry.path);
    }
  } catch (error) {
    // Restore only files this invocation replaced. Never touch an unrelated changed target.
    for (const entry of committed.reverse()) {
      if (hash(readFileSync(entry.path)) === entry.afterHash) {
        writeFileSync(entry.temp, entry.before, { flag: 'wx', mode: lstatSync(entry.path).mode & 0o777 });
        renameSync(entry.temp, entry.path);
      }
      rmSync(entry.backupPath);
    }
    throw error;
  } finally {
    for (const entry of staged) {
      rmSync(entry.temp, { force: true });
      rmSync(entry.backupTemp, { force: true });
    }
  }
  return pending.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = {};
    let apply = false;
    const args = process.argv.slice(2);
    while (args.length) {
      const arg = args.shift();
      if (arg === '--apply') apply = true;
      else if (arg === '--app-root') options.appRoot = args.shift();
      else if (arg === '--market-root') options.marketRoot = args.shift();
      else throw new Error(`Unknown argument: ${arg}`);
    }
    const plan = await planPatch(options);
    if (apply) applyPlan(plan);
    console.log(JSON.stringify({ mode: apply ? 'apply-fixture' : 'dry-run', files: plan.entries.map(({ path, beforeHash, afterHash }) => ({ path, beforeHash, afterHash, changed: beforeHash !== afterHash })) }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
