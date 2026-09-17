import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("./studio.css", import.meta.url), "utf8");

describe("Theme Studio visual contract", () => {
  it("keeps shared semantic layers and control motion", () => {
    expect(stylesheet).toContain("--dsw-alias-bg-layer-1");
    expect(stylesheet).toContain("--dsw-shadow-lv1");
    expect(stylesheet).toContain("border-color 180ms ease");
    expect(stylesheet).toContain("prefers-reduced-motion: reduce");
  });
});
