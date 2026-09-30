import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectExternalCapabilityObservation,
  type ExternalCapabilityObservationConnectionV1,
  type ExternalCapabilityObservationInvalidationReason,
  type ExternalCapabilityObservationPageV1,
} from '../src/security/external-capability-observation-contract.js'

function rawTool(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: 'object', properties: {} },
    ...extra,
  }
}

class FakeObservationConnection implements ExternalCapabilityObservationConnectionV1 {
  readonly connectionGeneration = 'connection:sage.fake-observation'
  readonly negotiatedProtocolRevision = '2025-11-25' as const
  readonly serverInfo = { name: 'fake-server', version: '0.0.1' }
  readonly calls: Array<string | undefined> = []
  readonly invalidations: ExternalCapabilityObservationInvalidationReason[] = []
  readonly toolsCallCount = 0
  private readonly listeners = new Set<(
    reason: ExternalCapabilityObservationInvalidationReason,
  ) => void>()
  private readonly pages: Array<ExternalCapabilityObservationPageV1 | Error> = []
  private readonly invalidateAfterPage: number | undefined
  private readonly changeGenerationAfterPage: number | undefined

  constructor(
    pages: readonly (ExternalCapabilityObservationPageV1 | Error)[],
    invalidateAfterPage?: number,
    changeGenerationAfterPage?: number,
  ) {
    this.pages.push(...pages)
    this.invalidateAfterPage = invalidateAfterPage
    this.changeGenerationAfterPage = changeGenerationAfterPage
  }

  async listToolsPage(cursor?: string): Promise<ExternalCapabilityObservationPageV1> {
    this.calls.push(cursor)
    const page = this.pages.shift()
    if (page === undefined) throw new Error('fake server exhausted')
    if (page instanceof Error) throw page
    if (this.invalidateAfterPage === this.calls.length) this.invalidate('list-changed')
    if (this.changeGenerationAfterPage === this.calls.length) {
      Reflect.set(this, 'connectionGeneration', 'connection:sage.changed-generation')
    }
    return page
  }

  onInvalidation(
    listener: (reason: ExternalCapabilityObservationInvalidationReason) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  invalidate(reason: ExternalCapabilityObservationInvalidationReason): void {
    this.invalidations.push(reason)
    for (const listener of this.listeners) listener(reason)
  }
}

function input(
  connection: ExternalCapabilityObservationConnectionV1,
  overrides: Partial<{
    maxPages: number
    maxTools: number
    maxCanonicalBytes: number
    now: () => number
    deadlineAt: number
  }> = {},
) {
  return {
    connection,
    limits: {
      maxPages: overrides.maxPages ?? 4,
      maxTools: overrides.maxTools ?? 8,
      maxCanonicalBytes: overrides.maxCanonicalBytes ?? 16_384,
    },
    now: overrides.now ?? (() => 0),
    deadlineAt: overrides.deadlineAt ?? 100,
  }
}

function expectFailure(
  result: { readonly ok: true } | { readonly ok: false; readonly code: string },
  code: string,
): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected ${code}.`)
  expect(result.code).toBe(code)
}

describe('WT-02C.2C.2 seam contract preflight', () => {
  it('collects a complete same-generation snapshot with opaque cursor passthrough', async () => {
    const connection = new FakeObservationConnection([
      { tools: [rawTool('orders.read')], nextCursor: 'opaque:page-2' },
      { tools: [rawTool('orders.write')] },
    ])

    const result = await collectExternalCapabilityObservation(input(connection))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`Expected success, received ${result.code}.`)
    expect(connection.calls).toEqual([undefined, 'opaque:page-2'])
    expect(connection.toolsCallCount).toBe(0)
    expect(result.value.schemaVersion).toBe('sage.external-capability-observation.v1')
    expect(result.value.connectionGeneration).toBe('connection:sage.fake-observation')
    expect(result.value.pageCount).toBe(2)
    expect(result.value.tools.map((tool) => tool.name)).toEqual(['orders.read', 'orders.write'])
    expect(result.value.observationDigest)
      .toMatch(/^urn:sage:external-capability-tools-observation:sha256:[0-9a-f]{64}$/u)
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.tools)).toBe(true)
    expect(Object.isFrozen(result.value.tools[0])).toBe(true)
  })

  it('fails closed on repeated cursors, duplicate names and every bounded limit', async () => {
    const repeated = new FakeObservationConnection([
      { tools: [rawTool('one')], nextCursor: 'same' },
      { tools: [rawTool('two')], nextCursor: 'same' },
    ])
    expectFailure(
      await collectExternalCapabilityObservation(input(repeated)),
      'observation-cursor-repeated',
    )

    const duplicate = new FakeObservationConnection([
      { tools: [rawTool('same')], nextCursor: 'second' },
      { tools: [rawTool('same')] },
    ])
    expectFailure(
      await collectExternalCapabilityObservation(input(duplicate)),
      'observation-duplicate-tool-name',
    )

    const pageLimited = new FakeObservationConnection([
      { tools: [], nextCursor: 'next' },
    ])
    expectFailure(
      await collectExternalCapabilityObservation(input(pageLimited, { maxPages: 1 })),
      'observation-page-limit-exceeded',
    )

    const toolLimited = new FakeObservationConnection([
      { tools: [rawTool('one'), rawTool('two')] },
    ])
    expectFailure(
      await collectExternalCapabilityObservation(input(toolLimited, { maxTools: 1 })),
      'observation-tool-limit-exceeded',
    )

    const byteLimited = new FakeObservationConnection([
      { tools: [rawTool('large-name')] },
    ])
    expectFailure(
      await collectExternalCapabilityObservation(input(byteLimited, { maxCanonicalBytes: 32 })),
      'observation-byte-limit-exceeded',
    )
  })

  it('rejects empty cursors, deadlines, malformed pages and source errors without leaking details', async () => {
    const emptyCursor = new FakeObservationConnection([
      { tools: [], nextCursor: '' },
    ])
    expectFailure(
      await collectExternalCapabilityObservation(input(emptyCursor)),
      'observation-cursor-invalid',
    )

    const deadline = new FakeObservationConnection([{ tools: [] }])
    expectFailure(
      await collectExternalCapabilityObservation(input(deadline, {
        now: () => 100,
        deadlineAt: 100,
      })),
      'observation-deadline-exceeded',
    )

    const malformed = new FakeObservationConnection([
      { tools: [{ name: 'bad', inputSchema: undefined }] as never },
    ])
    expectFailure(
      await collectExternalCapabilityObservation(input(malformed)),
      'observation-page-invalid',
    )

    const sourceError = new FakeObservationConnection([
      new Error('secret token /private/path should not escape'),
    ])
    const sourceResult = await collectExternalCapabilityObservation(input(sourceError))
    expectFailure(sourceResult, 'observation-source-failed')
    if (sourceResult.ok) throw new Error('Expected source failure.')
    expect(sourceResult.reason).not.toContain('secret')
    expect(sourceResult.reason).not.toContain('/private/path')
  })

  it('invalidates a partial snapshot on list change and keeps the port list-only', async () => {
    const connection = new FakeObservationConnection(
      [{ tools: [rawTool('one')], nextCursor: 'next' }, { tools: [rawTool('two')] }],
      1,
    )
    const result = await collectExternalCapabilityObservation(input(connection))
    expectFailure(result, 'observation-invalidated')
    expect(connection.invalidations).toEqual(['list-changed'])
    expect(connection.toolsCallCount).toBe(0)
  })

  it('rejects a connection-generation drift even when no lifecycle signal was emitted', async () => {
    const connection = new FakeObservationConnection(
      [{ tools: [rawTool('one')] }],
      undefined,
      1,
    )
    expectFailure(
      await collectExternalCapabilityObservation(input(connection)),
      'observation-invalidated',
    )
  })

  it('keeps the production module free of transport, filesystem and clock access', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/security/external-capability-observation-contract.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/from ['"]node:(fs|net|child_process|http|https)['"]/u)
    expect(source).not.toMatch(/\b(?:fetch|process|globalThis|new Date\s*\(|Date\.now\s*\()/u)
  })
})
