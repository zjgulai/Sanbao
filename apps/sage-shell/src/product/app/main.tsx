/**
 * Sage renderer React app root (ADR-0261, strangler P1).
 *
 * P1 is infrastructure only: the app mounts one hidden marker into
 * `#sage-app-root` and takes over nothing. The legacy inline client script
 * remains the single owner of every region until its phase (P2–P4) moves it
 * here. The window probe asserts `window.__SAGE_APP_MOUNTED__` under the real
 * strict-CSP document; the jsdom smoke spec asserts the same seam.
 */
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { JSX } from 'react'

declare global {
  interface Window {
    /** Set once the P1 React root has committed; asserted by the window probe and smoke spec. */
    __SAGE_APP_MOUNTED__?: boolean
  }
}

/** Hidden marker proving the mount seam without owning any region (P1 only). */
export function SageAppRoot(): JSX.Element {
  useEffect(() => {
    window.__SAGE_APP_MOUNTED__ = true
  }, [])
  return <div data-sage-app="p1-infrastructure" hidden />
}

const mount = document.getElementById('sage-app-root')
if (mount !== null) {
  createRoot(mount).render(<SageAppRoot />)
}
