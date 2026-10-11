/** B batch stage 2 (ADR-0317 D4): the session-control publication runner.
 *
 *  Composes the three sealed artifacts (requirement snapshot v2 / registry snapshot v2 / matrix
 *  bundle v2) from the shipped base publications plus the recorded re-observation, runs the
 *  built-in self-checks (base round-trip, re-parse, registry/target admission dry-runs), and —
 *  only with --write — replaces `publications/*.json` and refreshes the recorded re-observation
 *  fixture. Default is a dry run into /tmp with all checks enforced.
 *
 *  Usage (from apps/sage-shell):
 *    ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/publish-session-controls.mjs [--write]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const shellRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (relative) => import(`file://${join(shellRoot, 'lib', relative)}`)

const {
  buildSessionControlsPublicationSet,
  capabilityFaceOf,
} = await lib('main/session-controls-publication.js')
const {
  loadSessionPromptRequirementBundle,
  loadSessionPromptCapabilityRegistry,
  loadSessionPromptCompatibilityPublication,
  SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH,
  SESSION_PROMPT_MATRIX_BUNDLE_REL_PATH,
  SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH,
} = await lib('main/publication-bundle.js')
const { computeTargetSemanticFromRequirement } = await lib('main/target-requirement-candidate.js')
const { createSessionPromptTargetPort } = await lib('main/session-prompt-target.js')
const { createSessionPromptRegistryPort } = await lib('main/session-prompt-registry.js')
const { contentDigestOf } = await lib('main/capability-entry-derivation.js')
const { parseCapabilityRegistrySnapshot } = await lib('security/capability-registry.js')
const { parseCompatibilityTargetRequirementSnapshot } = await lib('security/compatibility-target-requirement.js')
const { parseCompatibilityMatrixBundleV2 } = await lib('security/compatibility-matrix-provider.js')
const { computeRuntimeDescriptorDigestV2, computeInventoryEvidenceDigestV2 } = await lib('security/compatibility.js')

const write = process.argv.includes('--write')
const fail = (message) => { console.error(`[publish-session-controls] ABORT: ${message}`); process.exit(1) }
const note = (message) => { console.log(`[publish-session-controls] ${message}`) }

// ---------------------------------------------------------------------------------------------
// 1) Inputs: the shipped base publications + the recorded re-observation.
const requirementLoad = loadSessionPromptRequirementBundle()
if (!requirementLoad.ok) fail(`base requirement bundle unreadable: ${requirementLoad.reason}`)
const registryLoad = loadSessionPromptCapabilityRegistry()
if (!registryLoad.ok) fail(`base registry publication unreadable: ${registryLoad.reason}`)
const matrixLoad = loadSessionPromptCompatibilityPublication()
if (!matrixLoad.ok) fail(`base matrix publication unreadable: ${matrixLoad.reason}`)

const reobsPath = join(shellRoot, 'test', 'support', 'reobs-runtime-inventory.json')
const reobs = JSON.parse(readFileSync(reobsPath, 'utf8'))
const descriptor = reobs.descriptor

// The registry snapshot the base requirement's rules were sealed against must be the one this
// re-observation recorded — otherwise the base round-trip below cannot hold.
const baseRegistrySealed = parseCapabilityRegistrySnapshot({
  ...registryLoad.snapshotBody,
  snapshotId: registryLoad.snapshotId,
})
if (!baseRegistrySealed.ok) fail('base registry snapshot does not re-parse')
const baseRegistry = baseRegistrySealed.value

const base = {
  registrySnapshot: {
    ...baseRegistry,
    entries: baseRegistry.entries,
  },
  requirementSnapshot: requirementLoad.snapshot,
  matrixBundle: matrixLoad.bundle,
}

// Generation guard: this runner extends the SHIPPED v1 publications. If the base already
// carries the control operations, landing again would duplicate them — restore v1 first.
if (baseRegistry.entries.length !== 1 || baseRegistry.entries[0].operations.length !== 1) {
  fail('base publications are already the controls generation; restore the shipped v1 publications before re-landing')
}

// ---------------------------------------------------------------------------------------------
// 2) Base round-trip self-check: the recorded re-observation must rebuild the shipped
//    session-prompt semantic byte for byte; any drift aborts before anything is composed.
const baseEntry = requirementLoad.snapshot.entries.find((entry) => entry.requirementId === 'requirement:sage-session-prompt')
if (baseEntry === undefined) fail('base publication carries no session-prompt entry')
const rebuiltBase = computeTargetSemanticFromRequirement(baseEntry, descriptor)
const baseRule = JSON.parse(matrixLoad.bundle.artifacts[0].canonicalMatrix).rules.find((rule) => rule.ruleId === 'rule:sage-session-prompt-v1')
const baseRuleSemantic = rebuiltBase.targetSemanticDigest
if (baseRule === undefined || baseRule.targetSemanticDigest !== baseRuleSemantic) {
  fail(`base round-trip drifted: rebuilt ${baseRuleSemantic} vs shipped ${baseRule?.targetSemanticDigest}`)
}
if (baseRule.runtimeDescriptorDigest !== descriptor.runtimeDescriptorDigest) fail('re-observation descriptor digest moved from the shipped pairing')
note('base round-trip OK (re-observation rebuilds the shipped session-prompt pair)')

// ---------------------------------------------------------------------------------------------
// 3) Compose the v2 set.
const set = buildSessionControlsPublicationSet({ descriptor, base })
note(`registry v2: ${set.registry.snapshotId}`)
note(`requirement v2: ${set.requirement.snapshotId} (${set.requirement.entries.length} entries)`)
note(`matrix v2: ${set.matrixBundle.bundleId}`)
note(`capability face: adapterMapping=${set.capability.adapterMappingDigest.slice(0, 24)}… registryDescriptor=${set.capability.registryDescriptorDigest.slice(0, 24)}…`)

// ---------------------------------------------------------------------------------------------
// 4) Self-checks: re-parse every artifact + admission dry-runs over the real ports.
const registryCheck = parseCapabilityRegistrySnapshot({ ...set.registry })
if (!registryCheck.ok) fail(`registry v2 does not re-parse: ${registryCheck.code}`)
const requirementCheck = parseCompatibilityTargetRequirementSnapshot({ ...set.requirement })
if (!requirementCheck.ok) fail(`requirement v2 does not re-parse: ${requirementCheck.code}`)
const matrixCheck = parseCompatibilityMatrixBundleV2({ ...set.matrixBundle })
if (!matrixCheck.ok) fail(`matrix v2 does not re-parse: ${matrixCheck.code}`)
const rules = JSON.parse(set.matrixBundle.artifacts[0].canonicalMatrix).rules
if (rules.length !== 4) fail(`matrix v2 must carry four rules, carry ${rules.length}`)
// The rules pair the descriptor digest the NEXT boot will observe: the fixture body with the
// freshly derived capability face (the same value the --write refresh records below).
const { runtimeDescriptorDigest: _fixtureDigest, ...fixtureBody } = descriptor
const faceDescriptor = { ...fixtureBody, capabilities: [set.capability] }
const faceDigest = computeRuntimeDescriptorDigestV2(faceDescriptor)
for (const rule of rules) {
  if (rule.runtimeDescriptorDigest !== faceDigest) fail(`rule ${rule.ruleId} pairs a moved runtime descriptor`)
}
note('re-parse + rule pairing OK (4 rules, one runtime pair on the re-derived descriptor)')

// 4a) Every new requirement entry must declare exactly the derived capability face.
for (const entry of set.requirement.entries) {
  const declared = entry.capabilities.find((capability) => capability.identity === set.capability.identity)
  if (declared === undefined) fail(`${entry.requirementId} declares no capability face`)
  for (const key of ['version', 'artifactDigest', 'contractDigest', 'behaviorConfigurationDigest', 'registryDescriptorDigest', 'adapterMappingDigest']) {
    if (declared[key] !== set.capability[key]) fail(`${entry.requirementId} capability.${key} disagrees with the derived face`)
  }
}
const extendedEntry = set.registry.entries[0]
const derivedAgain = capabilityFaceOf(extendedEntry)
if (derivedAgain.adapterMappingDigest !== set.capability.adapterMappingDigest) fail('capability face is not stable across derivation')
note('capability face consistency OK (declared == derived, stable)')

// 4b) Target + registry admission dry-runs over the real ports for all seven operations.
const observation = {
  descriptor: { ...faceDescriptor, runtimeDescriptorDigest: faceDigest },
  evidence: {
    ...reobs.evidence,
    observedAt: '2026-10-11T12:30:00Z',
    registrySnapshotDigest: contentDigestOf(set.registry.snapshotId),
    runtimeDescriptorDigest: faceDigest,
  },
}
const targetPort = createSessionPromptTargetPort({ bundle: { ok: true, snapshotId: set.requirement.snapshotId, snapshot: set.requirement }, now: () => '2026-10-11T12:30:00Z' })
const registryPort = createSessionPromptRegistryPort({
  requirementBundle: { ok: true, snapshotId: set.requirement.snapshotId, snapshot: set.requirement },
  registryProvider: { read: () => JSON.parse(JSON.stringify(set.registry)) },
  runtimeObservation: () => observation,
})
const operations = [
  'session.send',
  'session.approval.answer', 'session.approval.withdraw',
  'session.pending.edit', 'session.pending.remove',
  'session.queue.edit', 'session.queue.remove',
]
for (const operation of operations) {
  const intent = { requestId: `probe:${operation}`, operation, candidate: { kind: 'active-session' }, payload: {} }
  const target = await targetPort({ intent })
  if (target.state !== 'allowed') fail(`target dry-run refused ${operation}: ${target.state}`)
  const registryResult = await registryPort({ intent })
  if (registryResult.state !== 'allowed') fail(`registry dry-run refused ${operation}: ${registryResult.state}`)
}
note('target + registry admission dry-runs OK (7 operations allowed)')

// ---------------------------------------------------------------------------------------------
// 5) Outputs (dry run into /tmp unless --write).
const rootDir = write ? shellRoot : join('/tmp', `pub-dry-${String(process.pid)}`)
mkdirSync(join(rootDir, 'publications'), { recursive: true })
writeFileSync(join(rootDir, SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH), JSON.stringify(set.requirement, null, 2) + '\n')
writeFileSync(join(rootDir, SESSION_PROMPT_MATRIX_BUNDLE_REL_PATH), JSON.stringify(set.matrixBundle, null, 2) + '\n')
writeFileSync(join(rootDir, SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH), JSON.stringify(set.registry, null, 2) + '\n')
if (!write) {
  // The loader reads the revocation source beside the other three; the dry tree copies the
  // shipped file verbatim (it is unchanged by this publication).
  writeFileSync(
    join(rootDir, 'publications', 'session-prompt.matrix-revocation-source.json'),
    readFileSync(join(shellRoot, 'publications', 'session-prompt.matrix-revocation-source.json')),
  )
}

// 6) Round-trip the written bytes through the real loaders.
const writtenRequirement = loadSessionPromptRequirementBundle({ baseDir: rootDir })
const writtenRegistry = loadSessionPromptCapabilityRegistry({ baseDir: rootDir })
const writtenMatrix = loadSessionPromptCompatibilityPublication({ baseDir: rootDir })
if (!writtenRequirement.ok || !writtenRegistry.ok || !writtenMatrix.ok) {
  fail(`written artifacts do not round-trip: ${writtenRequirement.reason ?? writtenRegistry.reason ?? writtenMatrix.reason}`)
}
note(`round-trip OK; outputs in ${join(rootDir, 'publications')}`)

if (write) {
  // Refresh the recorded re-observation so the fixture matches the new publication generation.
  reobs.descriptor = { ...faceDescriptor, runtimeDescriptorDigest: faceDigest }
  // The evidence carries its own self-digest over its canonical body: changing the two bound
  // digests REQUIRES recomputing it (the kernel rejects a stale inventory-evidence digest).
  const { inventoryEvidenceDigest: _evidenceDigest, ...evidenceBody } = reobs.evidence
  const nextEvidenceBody = {
    ...evidenceBody,
    registrySnapshotDigest: contentDigestOf(set.registry.snapshotId),
    runtimeDescriptorDigest: faceDigest,
  }
  reobs.evidence = { ...nextEvidenceBody, inventoryEvidenceDigest: computeInventoryEvidenceDigestV2(nextEvidenceBody) }
  writeFileSync(reobsPath, JSON.stringify(reobs, null, 2) + '\n')
  note('re-observation fixture refreshed')
}
note(write ? 'WRITE complete' : 'dry run complete (pass --write to land)')
