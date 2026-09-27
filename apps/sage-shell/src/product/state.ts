/** In-memory Sage product state. P0-2 intentionally persists no profile or business data. */

import type { SageRuntimeStatus, SageViewState } from './contracts.js'

const COPY: Readonly<Record<SageRuntimeStatus, Omit<SageViewState, 'status'>>> = {
  ready: {
    message: 'Sage 已检测到能力运行时服务。',
    retryable: false,
  },
  unavailable: {
    message: 'Sage 暂时未检测到能力运行时服务，可重新检查。',
    retryable: true,
  },
  recovering: {
    message: 'Sage 正在重新检查能力运行时服务。',
    retryable: false,
  },
}

/** Build a state object from the small, product-owned status vocabulary. */
export function createSageViewState(status: SageRuntimeStatus): SageViewState {
  return { status, ...COPY[status] }
}

/**
 * Holds only the current renderer projection in process memory.
 *
 * It is deliberately not backed by localStorage, DSH_HOME, a profile, or a business record.
 */
export class MemoryProductStore {
  #state: SageViewState

  constructor(initial: SageRuntimeStatus = 'unavailable') {
    this.#state = createSageViewState(initial)
  }

  read(): SageViewState {
    return this.#state
  }

  set(status: SageRuntimeStatus): SageViewState {
    this.#state = createSageViewState(status)
    return this.#state
  }
}
