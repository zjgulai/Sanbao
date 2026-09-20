import z from "@deepseek-ai/schemastery";
//#region src/onboarding-copy.ts
/**
* First-run carousel facts shared by the host entry and the client step:
* the durable acknowledgement, the upstream notice this product replaces,
* and the page copy.
*/
/** Durable settings namespace owning Sanbao first-run facts. */
const INTRO_SETTINGS_NAMESPACE = "sanbao-onboarding";
//#endregion
//#region src/index.ts
/**
* Host entry: declare the durable settings namespace this package owns.
*
* The carousel itself is browser UI; the host side exists so the client can
* persist "this install has seen the intro" through the normal settings
* transport (loopback browsers follow the durable document, remote ones stay
* process-local through the scope's memory mode).
*/
const name = "dsh-onboarding-carousel";
const inject = ["settings"];
const IntroSchema = z.object({ introVersion: z.string() });
function apply(ctx) {
	ctx.settings.register(INTRO_SETTINGS_NAMESPACE, IntroSchema);
}
//#endregion
export { apply, inject, name };
