/**
 * Build gate for this package's client bundle: the artifact must register the
 * plugin under the id the composition expects, keep the onboarding seat, and
 * declare exactly the external modules it requires.
 */

import { readFile, stat } from "node:fs/promises";

const clientPath = new URL("../lib/client.js", import.meta.url);
const hostPath = new URL("../lib/index.js", import.meta.url);
const budget = 120_000;

const [{ size }, client, host] = await Promise.all([
  stat(clientPath),
  readFile(clientPath, "utf8"),
  readFile(hostPath, "utf8"),
]);

if (size > budget) {
  throw new Error(`Client bundle is ${size} bytes, over ${budget} bytes`);
}

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const declaredExternal = pkg?.dsh?.client?.external ?? [];
const declaredInject = pkg?.dsh?.client?.inject ?? [];

const required = new Set();
for (const re of [/\brequire\(\s*["']([^"']+)["']\s*\)/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g]) {
  for (const m of client.matchAll(re)) required.add(m[1]);
}
const bareSpecifiers = [...required].filter(
  (s) => !s.startsWith(".") && !s.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(s),
);

const undeclared = bareSpecifiers.filter((s) => !declaredExternal.includes(s));
if (undeclared.length > 0) {
  throw new Error(
    `Client bundle requires undeclared external module(s): ${undeclared.join(", ")} — ` +
      "declare them in package.json's dsh.client.external so the module graph orders their rows",
  );
}
const stale = [...declaredExternal, ...declaredInject].filter((s) => !required.has(s));
if (stale.length > 0) {
  throw new Error(
    `package.json declares client module(s) the bundle never requires: ${stale.join(", ")} — ` +
      "an unresolvable inject entry is skipped silently; drop the declaration",
  );
}

const HASH_LIKE = /\.[A-Za-z0-9_-]{6,}_[A-Za-z][A-Za-z0-9]*/;
if (HASH_LIKE.test(client)) {
  throw new Error(
    "Client bundle contains a CSS-module hash-like selector; style this package's own classes instead",
  );
}

for (const marker of [
  'id: "dsh-onboarding-carousel"',
  '"settings.onboarding"',
  '"sanbao-intro"',
]) {
  if (!client.includes(marker)) {
    throw new Error(`Client bundle lost the onboarding registration marker: ${marker}`);
  }
}

if (!client.includes("action.start")) {
  throw new Error("Client bundle lost the carousel copy dictionary");
}

if (!host.includes("function apply")) {
  throw new Error("Host entry does not export apply");
}

if (!host.includes("sanbao-onboarding")) {
  throw new Error("Host entry does not register the intro settings namespace");
}

console.log(`Validated dsh-onboarding-carousel bundles: client ${size} bytes`);
