/**
 * Placeholder for the built React app bundle (ADR-0261).
 *
 * `tsc` compiles this file into lib/product/app-bundle.js (and its .d.ts) so
 * typecheck, the test suite and the gates stay green before — or without — an
 * esbuild run. `scripts/build-renderer.mjs` overwrites the emitted .js with the
 * real single-file bundle exporting the same constant; the .d.ts shape is
 * identical either way.
 */
export const SAGE_APP_BUNDLE: string = ''
