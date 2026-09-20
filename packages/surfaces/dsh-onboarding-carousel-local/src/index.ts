/**
 * Host entry: declare the durable settings namespace this package owns.
 *
 * The carousel itself is browser UI; the host side exists so the client can
 * persist "this install has seen the intro" through the normal settings
 * transport (loopback browsers follow the durable document, remote ones stay
 * process-local through the scope's memory mode).
 */

import z from '@deepseek-ai/schemastery'
import { INTRO_SETTINGS_NAMESPACE, type IntroSection } from './onboarding-copy.js'

export const name = 'dsh-onboarding-carousel'
export const inject = ['settings']

const IntroSchema: z<IntroSection> = z.object({
  introVersion: z.string(),
})

export function apply(ctx: { settings: { register(namespace: string, schema: z<IntroSection>): unknown } }): void {
  ctx.settings.register(INTRO_SETTINGS_NAMESPACE, IntroSchema)
}
