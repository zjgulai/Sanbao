#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, realpathSync, lstatSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCss, discover, home, patchHost, patchViewer } from './transform.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const receiptName = '.lute-office-theme.json';
const backupSuffix = '.lute-office-theme.backup';
function checkedPath(root, file) {
  assert(!isAbsolute(file) && !file.split(/[\\/]/).includes('..'), 'Unsafe package path');
  const target = join(root, file);
  assert.equal(realpathSync(target), target, `Symlink refused: ${file}`);
  assert(lstatSync(target).isFile(), `Not a regular file: ${file}`);
  return target;
}
export async function patchPackage(packageRoot, apply = false) {
  assert(isAbsolute(packageRoot), '--package-root must be absolute');
  const root = realpathSync(packageRoot);
  if (apply) {
    const within = relative(realpathSync(home), root);
    assert(within && !within.startsWith(`..${sep}`) && within !== '..' && !isAbsolute(within),
      'copy-only: --apply is restricted to disposable package copies under theme-office');
    assert.equal(root, resolve(packageRoot), 'copy-only: symlink package root refused');
  }
  const pkgPath = checkedPath(root, 'package.json'), packageBytes = readFileSync(pkgPath);
  const pkg = JSON.parse(packageBytes), packageHash = hash(packageBytes);
  assert.equal(pkg.name, 'dsh-univer-office', 'Wrong package');
  const receiptPath = join(root, receiptName);
  const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(checkedPath(root, receiptName), 'utf8')) : null;
  let files, originals;
  if (receipt) {
    assert.equal(receipt.version, 1, 'Unknown patch receipt');
    assert.equal(packageHash, receipt.packageHash, 'Package metadata hash drift');
    files = receipt.files;
    assert.deepEqual(Object.keys(files).sort(), ['css', 'host', 'html', 'viewer']);
    originals = {};
    for (const [kind, file] of Object.entries(files)) {
      const entry = receipt.entries[kind];
      assert.equal(hash(readFileSync(checkedPath(root, file))), entry.after, `${file}: patched hash drift`);
      const original = readFileSync(checkedPath(root, kind === 'html' ? file : file + backupSuffix), 'utf8');
      assert.equal(hash(original), entry.before, `${file}: backup hash drift`);
      originals[kind] = original;
    }
  } else {
    files = discover(root);
    originals = Object.fromEntries(Object.entries(files).map(([kind, file]) => [kind, readFileSync(checkedPath(root, file), 'utf8')]));
    for (const kind of ['host', 'viewer', 'css']) {
      assert(!originals[kind].includes('lute-office-theme-v1'), 'Partial patch without receipt');
      assert(!existsSync(join(root, files[kind] + backupSuffix)), 'Unreconciled existing backup');
    }
  }
  // Discover and validate every anchor and source palette before creating any file.
  const output = { host: patchHost(originals.host), viewer: patchViewer(originals.viewer),
    css: originals.css + await buildCss(originals.css), html: originals.html };
  const entries = Object.fromEntries(Object.keys(files).map(kind => [kind, { before: hash(originals[kind]), after: hash(output[kind]) }]));
  if (receipt) {
    assert.deepEqual(entries, receipt.entries, 'Generator/palette hash drift: start from a fresh copy');
    return { status: 'already-applied', packageRoot: root, packageVersion: pkg.version, entries };
  }
  const result = { status: apply ? 'applied' : 'dry-run', packageRoot: root, packageVersion: pkg.version, entries,
    scope: 'iframe live channel only; standalone gateway theme transport blocked' };
  if (!apply) return result;
  const watches = Object.entries(files).map(([kind, file]) => [checkedPath(root, file), entries[kind].before]);
  watches.push([pkgPath, packageHash]);
  for (const [file] of watches) assert.equal(lstatSync(file).nlink, 1, `copy-only: hard-linked file ${file}`);
  const stage = mkdtempSync(join(root, '.lute-office-stage-'));
  const replaced = [], backups = [];
  try {
    for (const kind of ['host', 'viewer', 'css']) {
      const mode = lstatSync(join(root, files[kind])).mode & 0o777;
      writeFileSync(join(stage, `${kind}.before`), originals[kind], { flag: 'wx', mode });
      writeFileSync(join(stage, kind), output[kind], { flag: 'wx', mode });
      assert.equal(lstatSync(join(stage, kind)).mode & 0o777, mode, 'Cannot preserve file mode');
    }
    writeFileSync(join(stage, 'receipt'), JSON.stringify({ version: 1, files, entries,
      packageHash }, null, 2) + '\n', { flag: 'wx' });
    // Hashes are a pre-write concurrency check, never a pinned upstream rewrite anchor.
    for (const [file, before] of watches) assert.equal(hash(readFileSync(file)), before, `Pre-write hash drift: ${file}`);
    for (const kind of ['host', 'viewer', 'css']) {
      const file = join(root, files[kind]), backup = file + backupSuffix;
      assert(!existsSync(backup), 'Concurrent backup creation');
      renameSync(join(stage, `${kind}.before`), backup); backups.push(backup);
      renameSync(join(stage, kind), file); replaced.push([file, backup]);
    }
    assert(!existsSync(receiptPath), 'Concurrent receipt creation');
    renameSync(join(stage, 'receipt'), receiptPath);
  } catch (error) {
    for (const [file, backup] of replaced.reverse()) {
      const rollback = join(stage, 'rollback');
      writeFileSync(rollback, readFileSync(backup), { mode: lstatSync(backup).mode & 0o777 });
      renameSync(rollback, file);
    }
    for (const file of backups) rmSync(file);
    throw error;
  } finally { rmSync(stage, { recursive: true, force: true }); }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    assert(args[0] === '--package-root' && args[1] &&
      (args.length === 2 || args.length === 3 && ['--apply', '--dry-run'].includes(args[2])),
    'Usage: node patch.mjs --package-root /absolute/package/copy [--apply|--dry-run] (default dry-run; apply copy-only)');
    console.log(JSON.stringify(await patchPackage(args[1], args[2] === '--apply'), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
