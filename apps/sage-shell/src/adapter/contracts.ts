/** Boundary owned by the Capability Adapter, not by the Sage product renderer. */

import type { SageViewState } from '../product/contracts.js'

/** The renderer-facing capability projection available in P0-2. */
export interface SageCapabilityAdapter {
  readState(): SageViewState
  retry(): SageViewState
}
