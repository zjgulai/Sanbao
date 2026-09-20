import crypto from "node:crypto";
import { withBridge } from "./browser-auth.mjs";
import { decodeAppearance } from "../admin-ui/appearance.generated.js";

/** Public, read-only projection. No caller headers, settings schema or upstream errors escape. */
export async function readAppearance(config) {
  try {
    const method = "settings/describe";
    const url = new URL(config.upstream);
    const response = await fetch(`${config.upstream}/api/${method}`, {
      method: "POST",
      headers: withBridge({ "content-type": "application/json", host: url.host }, config),
      body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload: {} }),
      signal: AbortSignal.timeout(2500),
      redirect: "error"
    });
    if (!response.ok) return { status: "unavailable" };
    const body = /** @type {{ result?: { ok?: boolean, value?: { namespaces?: unknown[] } } } | null} */ (await response.json());
    const description = body?.result?.ok === true ? body.result.value : undefined;
    const rows = Array.isArray(description?.namespaces)
      ? description.namespaces.filter(row => row && typeof row === "object" && "ns" in row && row.ns === "sanbao-appearance") : [];
    if (rows.length !== 1) return { status: "unavailable" };
    const { value, user, revision } = /** @type {Record<string, unknown>} */ (rows[0]);
    const appearance = decodeAppearance(value);
    // Schema defaults alone are not a confirmed Host selection. Never migrate or write here.
    if (!appearance || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 || !user ||
        typeof user !== "object" || Array.isArray(user) || !Object.hasOwn(user, "themeId")) return { status: "unavailable" };
    const overrides = /** @type {Record<string, unknown>} */ (user);
    if (overrides.themeId !== appearance.themeId || Object.entries(appearance).some(([field, value]) =>
      Object.hasOwn(overrides, field) && overrides[field] !== value)) return { status: "unavailable" };
    return { status: "confirmed", ...appearance };
  } catch {
    // Includes bridge, transport, timeout and decoding failures; this endpoint is public.
    return { status: "unavailable" };
  }
}
