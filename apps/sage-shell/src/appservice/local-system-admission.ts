/** T02 local-system admission: one device-local read (runtime status enum, auth status, requested
 *  theme/density). Unlike a projection read this binds no matter or session — the request-scoped
 *  caller plus a ready, uncontaminated frame with an unmoved generation are the whole authority.
 *  Every step fails closed, and the post-read freshness re-check discards a torn read instead of
 *  presenting it as authoritative. */

export interface LocalSystemReadPorts {
  readonly verifyCaller: () => Promise<
    | { readonly state: 'allowed', readonly value: { readonly bindingRef: string } }
    | { readonly state: 'unavailable' }
  >
  readonly verifyFrame: () => Promise<
    | { readonly state: 'allowed', readonly value: { readonly frameGeneration: number } }
    | { readonly state: 'unavailable' }
  >
  readonly read: (frameGeneration: number) => Promise<
    | { readonly state: 'allowed', readonly value: unknown }
    | { readonly state: 'unavailable' }
  >
  readonly checkPostReadFreshness: (frameGeneration: number) => Promise<
    | { readonly state: 'allowed' }
    | { readonly state: 'stale' }
    | { readonly state: 'unavailable' }
  >
}

export type LocalSystemUnavailableCode = 'bootstrap-unavailable' | 'device-preferences-unavailable'

export type LocalSystemReadResult<T> =
  | { readonly state: 'read', readonly correlation: string, readonly value: T }
  | {
      readonly state: 'unavailable'
      readonly code: LocalSystemUnavailableCode
      readonly stage: 'local-system'
      readonly retryable: true
      readonly correlation: string
    }

export async function admitLocalSystemRead<T>(input: {
  readonly correlation: string
  readonly ports: LocalSystemReadPorts
  readonly validatesReadValue: (value: unknown) => value is T
  readonly unavailableCode?: LocalSystemUnavailableCode
}): Promise<LocalSystemReadResult<T>> {
  const unavailable = (): LocalSystemReadResult<T> => ({
    state: 'unavailable',
    code: input.unavailableCode ?? 'bootstrap-unavailable',
    stage: 'local-system',
    retryable: true,
    correlation: input.correlation,
  })
  try {
    const caller = await input.ports.verifyCaller()
    if (caller.state !== 'allowed' || caller.value.bindingRef !== input.correlation) return unavailable()
    const frame = await input.ports.verifyFrame()
    if (frame.state !== 'allowed') return unavailable()
    const read = await input.ports.read(frame.value.frameGeneration)
    if (read.state !== 'allowed') return unavailable()
    const freshness = await input.ports.checkPostReadFreshness(frame.value.frameGeneration)
    if (freshness.state !== 'allowed') return unavailable()
    if (!input.validatesReadValue(read.value)) return unavailable()
    return { state: 'read', correlation: input.correlation, value: read.value }
  } catch {
    return unavailable()
  }
}
