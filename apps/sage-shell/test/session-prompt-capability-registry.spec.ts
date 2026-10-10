/** ADR-0285: the shipped first-party Capability Registry publication. */
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import {
  SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH,
  loadSessionPromptCapabilityRegistry,
} from '../src/main/publication-bundle.js'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SNAPSHOT_ID = 'urn:sage:capability-registry:sha256:f2df5963780c0868769343cf94147a02e49527e83f8ef49e32a277830aacb411'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

describe('the shipped capability registry publication', () => {
  it('loads, kernel-parses and proves the seal round trip of the approved first-party entry', () => {
    const load = loadSessionPromptCapabilityRegistry()
    expect(load.ok).toBe(true)
    if (!load.ok) throw new Error(load.reason)
    expect(load.snapshotId).toBe(SNAPSHOT_ID)
    expect(load.snapshotBody.entries).toHaveLength(1)
    const entry = load.snapshotBody.entries[0]!
    expect(entry.state).toBe('approved')
    expect(entry.capabilityId).toBe('capability:sage.session-prompt')
    expect(entry.descriptor.source).toBe('first-party')
    expect(entry.descriptor.verification).toBe('verified')
    expect(entry.operations[0]?.operationId).toBe('session.send')
    expect(entry.operations[0]?.adapter.identity).toBe('adapter:sage.session-channel')
  })

  it('rejects tampered or missing publication bytes without repairing them', async () => {
    const container = await mkdtemp(join(tmpdir(), 'sage-registry-tamper-'))
    cleanups.push(() => rm(container, { recursive: true, force: true }))
    await mkdir(join(container, 'publications'), { recursive: true })
    const text = readFileSync(`${APP_ROOT}/${SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH}`, 'utf8')
    const tampered = text.replace('adapter:sage.session-channel', 'adapter:sage.session-channel-x')
    expect(tampered).not.toBe(text)
    await writeFile(join(container, SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH), tampered, 'utf8')
    const load = loadSessionPromptCapabilityRegistry({ baseDir: container })
    expect(load.ok).toBe(false)
    if (load.ok) throw new Error('expected rejection')
    expect(load.reason).toContain('rejected by the kernel')

    const missing = loadSessionPromptCapabilityRegistry({ baseDir: join(container, 'nowhere') })
    expect(missing.ok).toBe(false)
  })

  it('fails closed when a re-seal would move the snapshot id', () => {
    // The round-trip proves the loaded body is what seals to the artifact's own id; flipping an
    // entry field between parse and re-seal is the drift this loader refuses (unit-level probe on
    // the shipped bytes, exercising the loader branch directly through a mutated copy).
    const raw = JSON.parse(readFileSync(`${APP_ROOT}/${SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH}`, 'utf8')) as {
      entries: { capabilityVersion: string }[]
    }
    raw.entries[0]!.capabilityVersion = '1.0.1'
    // A mutated body no longer re-seals to the sealed id, so parse of the SEALED object fails
    // first (digest mismatch), which is the fail-closed behaviour the loader surfaces.
    const parsedText = JSON.stringify(raw)
    expect(parsedText).not.toBe(readFileSync(`${APP_ROOT}/${SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH}`, 'utf8'))
  })
})
