/** Stable, enumerable, redacted service errors (spec §3.3). */

export const MAX_SAGE_ACTION_BYTES = 4 * 1024

export function serviceJson(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
}
