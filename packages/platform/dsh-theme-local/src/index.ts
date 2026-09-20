import { AppearanceSchema, themeBootRows } from "./theme-host.js";
import { THEME_SETTINGS_NAMESPACE, THEME_IDS, type ThemeId } from "./theme-settings.js";

export const name = "dsh-theme";
interface HostSettings {
  register(namespace: string, schema: typeof AppearanceSchema): unknown;
  get(namespace: string): unknown;
  describe(options?: { redactSecrets?: boolean }): { ns: string; user?: unknown }[];
}
interface DesktopRuntime {
  setSanbaoTheme?(themeId: ThemeId): void;
}
interface HostContext {
  inject(keys: string[], callback: (scoped: { settings: HostSettings; desktopRuntime?: DesktopRuntime }) => void): unknown;
  /** Cordis service lookup; the two keys used here are typed at their call sites. */
  get(key: string): unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
  logger: { error(message: string, ...args: unknown[]): void };
  desktopRuntime?: DesktopRuntime;
}
export function apply(ctx: HostContext): void {
  ctx.inject(["settings"], scoped => { scoped.settings.register(THEME_SETTINGS_NAMESPACE, AppearanceSchema); });
  ctx.on("webserver/index-inject", (table: { kind: string; text: string; placement?: string }[]) => {
    const settings = ctx.get("settings") as HostSettings | undefined;
    const user = settings?.describe({ redactSecrets: true }).find(row => row.ns === THEME_SETTINGS_NAMESPACE)?.user;
    table.push(...themeBootRows(settings?.get(THEME_SETTINGS_NAMESPACE), user, settings?.get("ui-theme")));
  });
  ctx.on("settings/updated", (namespace: string, next: unknown) => {
    if (namespace !== THEME_SETTINGS_NAMESPACE) return;
    const themeId = (next as { themeId?: ThemeId })?.themeId;
    if (themeId && (THEME_IDS as readonly string[]).includes(themeId)) {
      const runtime = (ctx.get("desktopRuntime") ?? ctx.desktopRuntime) as DesktopRuntime | undefined;
      try {
        runtime?.setSanbaoTheme?.(themeId);
      } catch (cause) {
        // The in-app page already changed; a silent failure here means the standalone
        // windows keep the old theme while the settings row reads as saved.
        ctx.logger.error(`dsh-theme: native window theme sync failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
  });
}
