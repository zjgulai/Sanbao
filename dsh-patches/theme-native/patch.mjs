#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNativeCss, transformAdmission, transformElectronRuntime, transformMain } from './transform.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const backupSuffix = '.sanbao-theme-native.backup.json';
const receiptName = '.sanbao-theme-native-receipt.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

const within = (parent, child) => {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
};

function regular(path) {
  assert.ok(existsSync(path), `File does not exist: ${path}`);
  assert.ok(!lstatSync(path).isSymbolicLink() && lstatSync(path).isFile(), `Expected regular file: ${path}`);
  assert.equal(realpathSync(path), path, `Symlink target or alias refused: ${path}`);
}

export function discoverTargetFiles(appRoot) {
  assert.ok(isAbsolute(appRoot ?? ''), 'Explicit absolute --app-root is required');
  const libDir = join(appRoot, 'Contents/Resources/app/lib');
  assert.ok(existsSync(libDir), `lib directory does not exist: ${libDir}`);
  const files = readdirSync(libDir);
  const main = 'main.js';
  const admission = files.find(f => f.startsWith('profile-channel-admission-') && f.endsWith('.js'));
  const electronRuntime = files.find(f => f.startsWith('electron-runtime-') && f.endsWith('.js'));
  assert.ok(files.includes(main), `Missing main.js in ${libDir}`);
  assert.ok(admission, `Missing profile-channel-admission chunk in ${libDir}`);
  assert.ok(electronRuntime, `Missing electron-runtime chunk in ${libDir}`);
  return {
    main: join(libDir, main),
    admission: join(libDir, admission),
    electronRuntime: join(libDir, electronRuntime),
  };
}

export async function planPatch({ appRoot, apply = false }) {
  const targets = discoverTargetFiles(appRoot);
  const cssMap = await loadNativeCss();

  const entries = [
    { key: 'admission', path: targets.admission, transform: src => transformAdmission(src) },
    { key: 'electronRuntime', path: targets.electronRuntime, transform: src => transformElectronRuntime(src, cssMap) },
    { key: 'main', path: targets.main, transform: src => transformMain(src) },
  ].map(({ key, path, transform }) => {
    regular(path);
    const bytes = readFileSync(path);
    const before = bytes.toString('utf8');
    assert.ok(Buffer.from(before).equals(bytes), 'Artifact must be lossless UTF-8');
    const backupPath = path + backupSuffix;
    let original = before;
    let backupBefore;
    if (existsSync(backupPath)) {
      regular(backupPath);
      backupBefore = readFileSync(backupPath, 'utf8');
      const saved = JSON.parse(backupBefore);
      original = Buffer.from(saved.original, 'base64').toString('utf8');
      assert.equal(hash(original), saved.beforeHash, 'backup original hash mismatch');
      assert.equal(hash(before), saved.afterHash, 'patched artifact hash mismatch');
    }
    const after = transform(original);
    return {
      key,
      path,
      backupPath,
      before,
      after,
      alreadyApplied: before === after,
      beforeHash: hash(before),
      afterHash: hash(after),
      originalHash: hash(original),
      backupPayload: JSON.stringify({
        path,
        beforeHash: hash(original),
        afterHash: hash(after),
        patchedAt: new Date().toISOString(),
        original: Buffer.from(original).toString('base64'),
      }, null, 2),
    };
  });

  return {
    appRoot,
    apply,
    entries,
    allAlreadyApplied: entries.every(e => e.alreadyApplied),
  };
}

export async function applyPatch({ appRoot }) {
  const plan = await planPatch({ appRoot, apply: true });
  if (plan.allAlreadyApplied) {
    return { status: 'already-applied', plan };
  }

  const writes = [];
  try {
    for (const entry of plan.entries) {
      if (entry.alreadyApplied) continue;
      const tmpBackup = `${entry.backupPath}.${randomUUID()}.tmp`;
      const tmpTarget = `${entry.path}.${randomUUID()}.tmp`;
      writeFileSync(tmpBackup, entry.backupPayload, 'utf8');
      renameSync(tmpBackup, entry.backupPath);
      writes.push({ action: 'backup', path: entry.backupPath });

      writeFileSync(tmpTarget, entry.after, 'utf8');
      renameSync(tmpTarget, entry.path);
      writes.push({ action: 'target', path: entry.path, before: entry.before });
    }
    return { status: 'applied', plan };
  } catch (error) {
    // Fail-closed recovery
    for (const write of writes.reverse()) {
      try {
        if (write.action === 'target') {
          writeFileSync(write.path, write.before, 'utf8');
        } else if (write.action === 'backup') {
          rmSync(write.path, { force: true });
        }
      } catch {}
    }
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const args = process.argv.slice(2);
  let appRoot = null;
  let apply = false;
  let check = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app-root') {
      appRoot = args[++i];
    } else if (args[i] === '--apply') {
      apply = true;
    } else if (args[i] === '--check') {
      check = true;
    }
  }

  if (!appRoot) {
    console.error('Usage: node patch.mjs --app-root <path> [--apply] [--check]');
    process.exit(1);
  }

  try {
    if (check) {
      const plan = await planPatch({ appRoot });
      console.log(JSON.stringify({ status: plan.allAlreadyApplied ? 'applied' : 'unapplied', entries: plan.entries.map(e => ({ key: e.key, hash: e.beforeHash })) }, null, 2));
    } else if (apply) {
      const res = await applyPatch({ appRoot });
      console.log(JSON.stringify({ status: res.status, entries: res.plan.entries.map(e => ({ key: e.key, hash: e.afterHash })) }, null, 2));
    } else {
      const plan = await planPatch({ appRoot, apply: false });
      console.log(JSON.stringify({ status: 'dry-run', entries: plan.entries.map(e => ({ key: e.key, beforeHash: e.beforeHash, afterHash: e.afterHash })) }, null, 2));
    }
  } catch (err) {
    console.error('Patch failed:', err);
    process.exit(1);
  }
}
