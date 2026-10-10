/** Normalize one producer tree against macOS desktop metadata before validation.
 *
 *  The Sage repository can live inside an iCloud Drive managed scope (Desktop & Documents
 *  sync). While the producer writes fresh directories, iCloud's `bird` daemon (and Finder)
 *  create `.DS_Store` files inside them at arbitrary moments. The profile-template validator
 *  demands an exact top-level entry set, so one stray `.DS_Store` fails a build that is
 *  otherwise correct — observed on this machine on 2026-10-11.
 *
 *  This module removes exactly the known macOS artifact by name (nothing else), returns the
 *  count, and throws on unreadable directories so the normalization itself cannot hide a real
 *  problem. The callers log the count in the same style as the pnpm-link-farm cleanup.
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MACOS_METADATA_NAMES = new Set(['.DS_Store'])

export function removeMacosMetadata(root) {
  let removed = 0
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)
      const status = statSync(path) // throws on unreadable entries: normalization must not guess
      if (status.isDirectory()) {
        visit(path)
      } else if (MACOS_METADATA_NAMES.has(entry)) {
        rmSync(path)
        removed += 1
      }
    }
  }
  visit(root)
  return removed
}
