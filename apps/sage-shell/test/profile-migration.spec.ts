import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FIXTURE_IMPORT_MARKER,
  FIXTURE_IMPORT_MARKER_CONTENT,
  FIXTURE_IMPORT_RECEIPT,
  stageFixtureOnlyImport,
  verifyFixtureOnlyImport,
} from '../src/profile/migration.js'

const created: string[] = []

function temporary(label: string): string {
  const path = join(tmpdir(), `sage-fixture-import-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

function fixture(): { root: string; source: string } {
  const root = temporary('root')
  const source = join(root, 'source')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(root, FIXTURE_IMPORT_MARKER), FIXTURE_IMPORT_MARKER_CONTENT)
  writeFileSync(join(source, 'allowed.txt'), 'allowed\n')
  mkdirSync(join(source, 'nested'), { recursive: true })
  writeFileSync(join(source, 'nested', 'state.json'), '{"fixture":true}\n')
  return { root, source }
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
})

describe('fixture-only profile migration', () => {
  it('copies only an explicit allowlist into a new fixture destination and records hashes', async () => {
    const { root, source } = fixture()
    const destination = join(root, 'staged-import')

    const receipt = await stageFixtureOnlyImport({
      mode: 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: destination,
      allowlist: ['nested/state.json', 'allowed.txt'],
    })

    expect(receipt).toMatchObject({ mode: 'fixture-only' })
    expect(receipt.files.map(file => file.path)).toEqual(['allowed.txt', 'nested/state.json'])
    expect(readFileSync(join(destination, 'allowed.txt'), 'utf8')).toBe('allowed\n')
    expect(readFileSync(join(destination, 'nested', 'state.json'), 'utf8')).toContain('fixture')
    expect(existsSync(join(destination, FIXTURE_IMPORT_MARKER))).toBe(false)
    expect(existsSync(join(destination, FIXTURE_IMPORT_RECEIPT))).toBe(true)
    await expect(verifyFixtureOnlyImport({ fixtureRoot: root, destinationDir: destination })).resolves.toEqual(receipt)
  })

  it('requires an explicit fixture marker and never accepts an unmarked directory', async () => {
    const root = temporary('unmarked-root')
    const source = join(root, 'source')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'allowed.txt'), 'allowed\n')

    await expect(stageFixtureOnlyImport({
      mode: 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: join(root, 'destination'),
      allowlist: ['allowed.txt'],
    })).rejects.toThrow()
  })

  it('rejects an empty allowlist and preserves an existing destination', async () => {
    const { root, source } = fixture()
    await expect(stageFixtureOnlyImport({
      mode: 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: join(root, 'empty-allowlist'),
      allowlist: [],
    })).rejects.toThrow(/nonempty explicit allowlist/u)

    const existing = join(root, 'existing-destination')
    mkdirSync(existing)
    writeFileSync(join(existing, 'keep.txt'), 'keep\n')
    await expect(stageFixtureOnlyImport({
      mode: 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: existing,
      allowlist: ['allowed.txt'],
    })).rejects.toThrow(/already exists/u)
    expect(readFileSync(join(existing, 'keep.txt'), 'utf8')).toBe('keep\n')
  })

  it('rejects traversal, overlapping destinations, symlinks, and implicit import modes', async () => {
    const { root, source } = fixture()
    await expect(stageFixtureOnlyImport({
      mode: 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: join(root, 'destination'),
      allowlist: ['../outside'],
    })).rejects.toThrow(/unsafe/u)
    await expect(stageFixtureOnlyImport({
      mode: 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: join(source, 'inside-source'),
      allowlist: ['allowed.txt'],
    })).rejects.toThrow(/must not overlap/u)
    symlinkSync(join(source, 'allowed.txt'), join(source, 'link.txt'))
    await expect(stageFixtureOnlyImport({
      mode: 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: join(root, 'symlink-destination'),
      allowlist: ['link.txt'],
    })).rejects.toThrow(/regular file/u)
    await expect(stageFixtureOnlyImport({
      mode: 'not-fixture' as 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: join(root, 'wrong-mode'),
      allowlist: ['allowed.txt'],
    })).rejects.toThrow(/fixture-only mode/u)
  })

  it('rolls back a partially created fixture destination if an allowlisted file fails', async () => {
    const { root, source } = fixture()
    const destination = join(root, 'failed-destination')

    await expect(stageFixtureOnlyImport({
      mode: 'fixture-only',
      fixtureRoot: root,
      sourceDir: source,
      destinationDir: destination,
      allowlist: ['allowed.txt', 'missing.txt'],
    })).rejects.toThrow(/regular file/u)

    expect(existsSync(destination)).toBe(false)
    expect(readFileSync(join(source, 'allowed.txt'), 'utf8')).toBe('allowed\n')
  })

  it('rejects a receipt when a copied fixture file drifts after import', async () => {
    const { root, source } = fixture()
    const destination = join(root, 'tamper-destination')
    await stageFixtureOnlyImport({
      mode: 'fixture-only', fixtureRoot: root, sourceDir: source, destinationDir: destination, allowlist: ['allowed.txt'],
    })
    writeFileSync(join(destination, 'allowed.txt'), 'drifted\n')

    await expect(verifyFixtureOnlyImport({ fixtureRoot: root, destinationDir: destination })).rejects.toThrow(/checksum mismatch/u)
  })
})
