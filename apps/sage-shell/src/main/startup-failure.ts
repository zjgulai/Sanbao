/** L2-A (ADR-0322): the packaged startup-failure surface — one home for the last-resort path.
 *
 *  A boot that fails closed (non-pristine root, rejected paths, profile install drift) must not
 *  leave a blank frame or a dialog the user cannot see: the pre-ready `dialog.showErrorBox` of
 *  the original path could sit behind an empty window while the process waited forever — the
 *  2026-10-13 white-screen report traced to exactly that presentation gap (the refusal itself
 *  was correct). This module therefore: writes the full stack to the launcher's stderr first
 *  (dev/acceptance evidence), waits for `ready` so the one named error box is frontmost, and
 *  exits non-zero when it is dismissed. Every step is best-effort — the failure path itself
 *  never throws.
 */

export const STARTUP_FAILURE_TITLE = 'Sage 启动失败'

export interface StartupFailureDeps {
  /** The raw stderr sink the launcher supplied (packaged double-click: usually the void). */
  readonly writeLog: (line: string) => void
  /** Resolves once Electron is ready — after this the alert is frontmost. */
  readonly whenReady: () => Promise<unknown>
  readonly showErrorBox: (title: string, content: string) => void
  readonly exit: (code: number) => void
}

export async function surfaceStartupFailure(error: unknown, deps: StartupFailureDeps): Promise<void> {
  const stack = error instanceof Error ? error.stack ?? error.message : String(error)
  const summary = error instanceof Error ? error.message : String(error)
  try {
    deps.writeLog(`sage shell: ${stack}\n`)
  } catch {
    // The log sink is a convenience; the dialog below is the contract.
  }
  try {
    await deps.whenReady()
  } catch {
    // Even a failed ready must not swallow the error box.
  }
  try {
    deps.showErrorBox(STARTUP_FAILURE_TITLE, summary)
  } catch {
    // A platform without a display still exits below.
  }
  deps.exit(1)
}
