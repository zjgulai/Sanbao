import { readFileSync } from 'node:fs'
import { chmod } from 'node:fs/promises'
import { mkdir, mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  canonicalizeExternalCapabilityExecutionManifest,
  computeExternalCapabilityExecutionManifestDigest,
  createExternalCapabilityArtifactObserver,
  observeExternalCapabilityArtifact,
} from '../src/security/external-capability-artifact-observer.js'

const manifest = {
  schemaVersion: 'sage.external-capability-execution-manifest.v1' as const,
  canonicalizationVersion: 'sage.external-capability-artifact-observer-canonical-json.v1' as const,
  transportKind: 'local-stdio' as const,
  processMode: 'interpreter-entrypoint' as const,
  packagePath: 'package.json' as const,
  lockfilePath: 'pnpm-lock.yaml' as const,
  components: [
    {
      logicalRole: 'bridge' as const,
      identity: '@deepseek-ai/dsh-mcp-client',
      version: '0.1.5-rc.2',
      relativeRoot: 'components/bridge',
    },
    {
      logicalRole: 'sdk' as const,
      identity: '@modelcontextprotocol/sdk',
      version: '1.30.0',
      relativeRoot: 'components/sdk',
    },
    {
      logicalRole: 'launcher' as const,
      identity: 'launcher:node',
      version: '24.8.0',
      relativeRoot: 'components/launcher',
    },
    {
      logicalRole: 'interpreter' as const,
      identity: 'runtime:node',
      version: '24.8.0',
      relativeRoot: 'components/interpreter',
    },
    {
      logicalRole: 'server-entrypoint' as const,
      identity: 'server:sage-fixture',
      version: '2026-09-29',
      relativeRoot: 'components/server-entrypoint',
    },
  ],
  launch: {
    interpreterRoot: 'components/interpreter' as const,
    entrypointPath: 'components/server-entrypoint/index.mjs',
    workingDirectoryPolicy: 'artifact-root' as const,
    shellPolicy: 'disabled' as const,
    pathResolutionPolicy: 'pinned-relative' as const,
    environmentPolicy: 'empty' as const,
    argumentPolicy: 'static-literals' as const,
  },
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sage-c2c3-artifact-'))
  await writeFile(join(root, 'package.json'), '{"name":"sage-fixture","version":"1.0.0"}\n')
  await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
  for (const component of manifest.components) {
    await mkdir(join(root, component.relativeRoot), { recursive: true })
    await writeFile(
      join(root, component.relativeRoot, `${component.logicalRole}.mjs`),
      `export const role = ${JSON.stringify(component.logicalRole)}\n`,
    )
  }
  await mkdir(join(root, 'components/interpreter/bin'), { recursive: true })
  await writeFile(join(root, 'components/interpreter/bin/node'), '#!/usr/bin/env node\n')
  await chmod(join(root, 'components/interpreter/bin/node'), 0o755)
  await writeFile(join(root, 'components/server-entrypoint/index.mjs'), 'export default {}\n')
  await symlink('../bridge/bridge.mjs', join(root, 'components/server-entrypoint/bridge-link.mjs'))
  return root
}

async function removeFixture(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true })
}

function expectFailure(
  result: { readonly ok: true } | { readonly ok: false; readonly code: string },
  code: string,
): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected ${code}.`)
  expect(result.code).toBe(code)
}

describe('WT-02C.2C.3 external capability artifact observer', () => {
  it('canonicalizes an exact static manifest and exposes a frozen observer', () => {
    const reordered = {
      ...manifest,
      components: [...manifest.components].reverse(),
    }
    expect(canonicalizeExternalCapabilityExecutionManifest(reordered))
      .toBe(canonicalizeExternalCapabilityExecutionManifest(manifest))
    expect(computeExternalCapabilityExecutionManifestDigest(reordered))
      .toBe(computeExternalCapabilityExecutionManifestDigest(manifest))
    const observer = createExternalCapabilityArtifactObserver()
    expect(Object.isFrozen(observer)).toBe(true)
  })

  it('observes only the explicit fixture root and returns stable, pathless evidence', async () => {
    const root = await createFixture()
    try {
      const result = await observeExternalCapabilityArtifact({ artifactRoot: root, manifest })
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`Unexpected ${result.code}.`)
      expect(Object.isFrozen(result.value)).toBe(true)
      expect(Object.isFrozen(result.value.artifactSubject)).toBe(true)
      expect(result.value.artifactEvidenceDigest)
        .toMatch(/^urn:sage:external-capability-artifact-evidence:sha256:[0-9a-f]{64}$/u)
      expect(result.value.artifactSubject.components).toHaveLength(5)
      expect(JSON.stringify(result.value)).not.toContain(root)
      expect(result.value.artifactSubject.components
        .some(component => component.logicalRole === 'bridge' && component.artifactDigest.startsWith('sha256:')))
        .toBe(true)
    } finally {
      await removeFixture(root)
    }
  })

  it('rejects dynamic launch policy, unknown manifest fields and root expansion', async () => {
    const unsafeLaunch = {
      ...manifest,
      launch: { ...manifest.launch, shellPolicy: 'bash' as never },
    }
    expectFailure(
      await observeExternalCapabilityArtifact({ artifactRoot: '/tmp/does-not-matter', manifest: unsafeLaunch }),
      'artifact-launch-unsafe',
    )
    expectFailure(
      await observeExternalCapabilityArtifact({ artifactRoot: 'relative-artifact-root', manifest }),
      'artifact-root-invalid',
    )
    expectFailure(
      await observeExternalCapabilityArtifact({
        artifactRoot: '/tmp/does-not-matter',
        manifest: { ...manifest, secret: 'token' } as never,
      }),
      'artifact-manifest-invalid',
    )

    const root = await createFixture()
    try {
      await writeFile(join(root, 'unexpected.txt'), 'not declared\n')
      expectFailure(
        await observeExternalCapabilityArtifact({ artifactRoot: root, manifest }),
        'artifact-root-invalid',
      )
    } finally {
      await removeFixture(root)
    }
  })

  it('rejects escaped symlinks and preserves content drift as a new observation', async () => {
    const root = await createFixture()
    try {
      const first = await observeExternalCapabilityArtifact({ artifactRoot: root, manifest })
      expect(first.ok).toBe(true)
      await rm(join(root, 'components/server-entrypoint/bridge-link.mjs'))
      await symlink('/tmp', join(root, 'components/server-entrypoint/escape'))
      expectFailure(
        await observeExternalCapabilityArtifact({ artifactRoot: root, manifest }),
        'artifact-symlink-unsafe',
      )
      await rm(join(root, 'components/server-entrypoint/escape'))
      await writeFile(join(root, 'components/bridge/bridge.mjs'), 'changed\n')
      const second = await observeExternalCapabilityArtifact({ artifactRoot: root, manifest })
      expect(second.ok).toBe(true)
      if (!first.ok || !second.ok) throw new Error('Expected two successful observations.')
      expect(second.value.artifactEvidenceDigest).not.toBe(first.value.artifactEvidenceDigest)
    } finally {
      await removeFixture(root)
    }
  })

  it('rejects hostile records and keeps production imports away from process, network and clock', () => {
    const source = readFileSync(
      `${import.meta.dirname}/../src/security/external-capability-artifact-observer.ts`,
      'utf8',
    )
    expect(source).not.toMatch(/\bprocess\.(?:env|cwd|pid)\b/u)
    expect(source).not.toMatch(/\b(?:globalThis|fetch\s*\(|new Date\s*\(|Date\.now\s*\()/u)
    expect(source).not.toMatch(/from ['"]node:(net|http|https|child_process|os)['"]/u)
    const proxy = new Proxy(manifest, {})
    expect(() => canonicalizeExternalCapabilityExecutionManifest(proxy)).toThrow()
    expect(() => canonicalizeExternalCapabilityExecutionManifest(Object.create(null))).toThrow()
  })

  it('does not expose symlink targets outside the declared artifact root', async () => {
    const root = await createFixture()
    try {
      const target = await readlink(join(root, 'components/server-entrypoint/bridge-link.mjs'))
      expect(target).toBe('../bridge/bridge.mjs')
      const result = await observeExternalCapabilityArtifact({ artifactRoot: root, manifest })
      expect(result.ok).toBe(true)
      if (result.ok) {
        const links = result.value.artifactSubject.components
        expect(links).toHaveLength(5)
      }
    } finally {
      await removeFixture(root)
    }
  })
})
