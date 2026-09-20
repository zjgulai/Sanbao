import { THEME_IDS, type ThemeId } from "../theme-settings.js";
import type { createThemeController } from "./theme-controller.js";

/** Document-only selection input; notifications report controller state, not persistence guesses. */
export function bindAppearanceEvents(doc: Document, controller: ReturnType<typeof createThemeController>): () => void {
  const select = (event: Event) => {
    const CustomEventClass = doc.defaultView?.CustomEvent;
    if (!CustomEventClass || !(event instanceof CustomEventClass)) return;
    const detail: unknown = event.detail;
    if (detail === null || typeof detail !== "object" || Array.isArray(detail)) return;
    if (Reflect.ownKeys(detail).length !== 1) return;
    // Do not execute accessor payloads at this untyped document boundary.
    const property = Object.getOwnPropertyDescriptor(detail, "themeId");
    if (!property || !("value" in property) || !THEME_IDS.includes(property.value as ThemeId)) return;
    controller.set("themeId", property.value as ThemeId);
  };
  const publish = () => {
    const { settings, saveStatus } = controller.getSnapshot();
    const event = doc.createEvent("CustomEvent");
    event.initCustomEvent("sanbao:appearance-change", false, false, Object.freeze({ themeId: settings.themeId, saveStatus }));
    doc.dispatchEvent(event);
  };
  doc.addEventListener("sanbao:select-theme", select);
  const unsubscribe = controller.subscribe(publish);
  publish();
  return () => {
    doc.removeEventListener("sanbao:select-theme", select);
    unsubscribe();
  };
}
