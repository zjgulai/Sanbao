/** Shared C2D→V2 capability derivations (ADR-0286).
 *
 *  Two consumers derive the same facts from one approved registry entry: the runtime inventory
 *  producer builds `RuntimeCapabilityDescriptorV2` fields, and the registry admission step
 *  re-derives registryDescriptorDigest / adapterMappingDigest from the shipped snapshot entry to
 *  cross-check the requirement's declared values. The forma lives here once — a drift moves both
 *  the observed pair and the admission check together instead of silently disagreeing.
 */
import { createHash } from 'node:crypto'

import type { CapabilityRegistryEntryBodyV1 } from '../security/capability-registry.js'

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function sha256ContentDigest(content: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

const SAGE_URN = /^urn:sage:[a-z0-9-]+:sha256:([0-9a-f]{64})$/u

/** Reshape one PMAP/registry digest URN into the V2 content-digest form without rehashing. */
export function contentDigestOf(urn: string): string {
  const match = SAGE_URN.exec(urn)
  if (match === null) throw new TypeError('Invalid Sage content digest URN.')
  return `sha256:${match[1] as string}`
}

export function capabilityOperationsProjection(
  entry: CapabilityRegistryEntryBodyV1,
): readonly Record<string, unknown>[] {
  return [...entry.operations]
    .sort((left, right) => compareStrings(left.operationId, right.operationId))
    .map((operation) => ({
      operationId: operation.operationId,
      adapter: {
        identity: operation.adapter.identity,
        version: operation.adapter.version,
        digest: operation.adapter.digest,
      },
      effectClass: operation.effectClass,
      dataBoundary: operation.dataBoundary,
      inputContractDigest: operation.inputContractDigest,
      outputContractDigest: operation.outputContractDigest,
      preflight: operation.preflight,
    }))
}

/** The adapter mapping digest: exactly the rule the inventory producer applies (single-sourced). */
export function capabilityAdapterMappingDigest(entry: CapabilityRegistryEntryBodyV1): string {
  return sha256ContentDigest(JSON.stringify(capabilityOperationsProjection(entry).map((operation) => ({
    operationId: operation.operationId,
    adapter: operation.adapter,
  }))))
}

/** The approved descriptor's digest in V2 content form (URN unwrapped, not rehashed). */
export function capabilityRegistryDescriptorDigest(entry: CapabilityRegistryEntryBodyV1): string {
  return contentDigestOf(entry.descriptor.descriptorDigest)
}
