import { DEFAULT_APPEARANCE, decodeAppearance } from "./appearance.generated.js";

const elements = [document.documentElement, document.body];
function apply(value) {
  for (const element of elements) {
    element.dataset.sanbaoTheme = value.themeId;
    for (const field of ["uiFont", "codeFont", "uiFontSize", "codeFontSize"]) {
      element.setAttribute(`data-${field.toLowerCase()}`, String(value[field]));
    }
  }
}
function status(value) {
  for (const element of elements) element.dataset.appearanceStatus = value;
}

// This page is a read-only Host projection, not another preference store.
apply(DEFAULT_APPEARANCE);
status("unavailable");
let active;
let timer;
let stopped = false;
async function sync() {
  if (stopped || active || document.visibilityState === "hidden") return;
  clearTimeout(timer);
  const controller = new AbortController();
  active = controller;
  const deadline = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch("/__teamhub/appearance", {
      method: "GET", credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal
    });
    if (!response.ok) throw new Error("unavailable");
    const body = await response.json();
    const value = body?.status === "confirmed" ? decodeAppearance(body) : undefined;
    if (!value) throw new Error("unavailable");
    if (!stopped) { apply(value); status("confirmed"); }
  } catch {
    // Keep the last confirmed presentation (or initial light), never claim a save.
    if (!stopped) status("unavailable");
  } finally {
    clearTimeout(deadline);
    active = undefined;
    if (!stopped) timer = setTimeout(sync, 15000);
  }
}
window.addEventListener("focus", sync);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void sync();
  else clearTimeout(timer);
});
window.addEventListener("pagehide", () => {
  stopped = true;
  clearTimeout(timer);
  active?.abort();
});
window.addEventListener("pageshow", () => { stopped = false; void sync(); });
void sync();
