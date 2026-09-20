import { AppearanceHostService, type AppearanceHostServiceOptions } from "./theme-host.js";

export const name = "dsh-theme";

export { AppearanceHostService, type AppearanceHostServiceOptions };
export type * from "./theme-host.js";

export function apply(): void {
  // Client-only plugin. Host service can be instantiated directly if needed.
}
