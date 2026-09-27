/** The sole P0-2 source location allowed to read a Harness-provided Cordis service. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { SageCapabilityAdapter } from './contracts.js'
import { MemoryProductStore } from '../product/state.js'
import type { SageRuntimeStatus, SageViewState } from '../product/contracts.js'

type ConnectionContext = Pick<Context, 'get'>

/**
 * Project the presence of the public connection service into the narrow P0-2 state vocabulary.
 *
 * This is deliberately not a network, model, stream, tool, or artifact health check. It says only
 * whether Cordis can currently resolve the connection service for this booted host context.
 */
function inspectConnection(ctx: ConnectionContext): SageRuntimeStatus {
  try {
    return ctx.get('connection') === undefined ? 'unavailable' : 'ready'
  } catch {
    return 'unavailable'
  }
}

/** Build the only adapter that may read the current host's Harness service surface in P0-2. */
export function createSageCapabilityAdapter(ctx: ConnectionContext): SageCapabilityAdapter {
  const store = new MemoryProductStore(inspectConnection(ctx))
  let retryQueued = false

  const refresh = (): SageViewState => store.set(inspectConnection(ctx))

  return {
    readState(): SageViewState {
      return refresh()
    },
    retry(): SageViewState {
      if (!retryQueued) {
        retryQueued = true
        store.set('recovering')
        queueMicrotask(() => {
          retryQueued = false
          refresh()
        })
      }
      return store.read()
    },
  }
}
