import { AppearanceHostService, type AppearanceHostServiceOptions } from "./theme-host.js";

export const name = "dsh-theme";

export { AppearanceHostService, type AppearanceHostServiceOptions };
export type * from "./theme-host.js";

export function apply(ctx?: any): void {
  // Host appearance service registration
  if (ctx) {
    const appearanceService = new AppearanceHostService({ ctx });
    if (typeof (ctx as any).provide === "function") {
      (ctx as any).provide("appearance");
    }
    (ctx as any).appearance = appearanceService;
  }
}
