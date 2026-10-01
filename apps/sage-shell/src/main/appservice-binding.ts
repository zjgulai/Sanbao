/** Main-owned caller binding for /.sage/* (spec §3.4, D4 wiring point). */
import { randomUUID } from 'node:crypto'
import { isExactSageAppUrl, SAGE_APP_ORIGIN } from '../product/contracts.js'
import type { FramePolicyState } from './frame-policy.js'
import type { CallerBinding } from '../appservice/contracts.js'

type FramePolicyLike = { snapshot(): FramePolicyState }

export function verifySageServiceCaller(url: URL, request: Request, framePolicy: FramePolicyLike): CallerBinding | null {
  if (!isExactSageAppUrl(url)) return null
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== SAGE_APP_ORIGIN) return null
  if (framePolicy.snapshot().contaminated) return null
  return { correlation: randomUUID() }
}
