# WT-02D.0.2 Command Pipeline 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/.sage/actions` dispatch 从笼统 503 升级为 command 顺序步骤 2–10 的纯函数管道内核：每步 typed port、production 全 port fail-closed、renderer 收步骤级脱敏错误类别。

**Architecture:** 三新文件（command-contracts / command-pipeline / errors 扩展）全部在 `src/appservice/` firewall 射程内零 Electron import；既有 kernel（identity-policy / domain / capability-registry）以类型引用接入编排；main 不改接线形态。production composition 九 port 全 undefined → 恒在步骤 2 得 `identity-unavailable`。

**Tech Stack:** TypeScript (apps/sage-shell, tsc 严格)、vitest（`node scripts/test.mjs run` 全量、`npx vitest run test/<file>` 单文件）、`node scripts/gate.mjs` 门禁。

**Spec:** `docs/superpowers/specs/2026-10-01-wt02d02-command-pipeline-design.md`

## Global Constraints

- `src/appservice/**/*.ts` 禁 import electron / `@deepseek-ai/*` / packages / vendor / node_modules / renderer 实现路径（firewall 门禁阻塞级；`../security/*`、`../domain/*` 合法）。
- production composition 九 port 全 fail-closed：任一 port 返回 `undefined` = 该步 unavailable，绝无默认放行。
- 错误体只携带 `code/stage/retryable/requiresNewRevision/requiresDecision/correlation`；无 stack、无 message 键、无 raw payload、无 matter 存在性泄漏（`not-found` 映射 policy-denied 家族，stage 标记真实步骤）。
- 全部 dispatch/state 响应 `cache-control: no-store`（`serviceJson` 既有行为）。
- transport `parseIntent` 仍只接受 `{"type":"retry"}`（D3 裁决）；业务 intent 400 invalid-intent。
- 不动 0.1 遗产：`SAGE_APP_SERVICE` 开关语义、state 双字段合同（`{service, runtime}`）、binding 403 二值、`MAX_SAGE_ACTION_BYTES = 4*1024`。
- 提交纪律：每个 Task 一个 commit（gate 绿前置）；本票收口附 Note + ADR-0181（非机械改动留痕，ADR-0015）。
- 测试命令在 `apps/sage-shell/` 目录跑：单文件 `npx vitest run test/<file>.spec.ts`；全量 `node scripts/test.mjs run`；类型 `npm run typecheck`。

---

### Task 1: command-contracts.ts — 完整 ActionIntent 与九步 port 合同

**Files:**
- Create: `apps/sage-shell/src/appservice/command-contracts.ts`
- Create: `apps/sage-shell/test/fixtures/command-fakes.ts`
- Test: `apps/sage-shell/test/command-contracts.spec.ts`

**Interfaces:**
- Consumes: `IdentityPolicyResolution`（`../security/identity-policy.js`，`{kind:'authorized',actor,authoritySnapshot} | {kind:'denied',code,reason}`）；`BusinessMatter`（`../domain/business-matter.js`，brand + events）；`CapabilityRegistryOperationMappingV1`（`../security/capability-registry.js`，8 键含 operationId/adapter/effectClass/dataBoundary/inputContractDigest/outputContractDigest/preflight/revokeBehavior）。
- Produces（后续任务依赖的精确签名）:
  - `parseSageActionIntentV2(input: unknown): SageActionIntentV2 | undefined`
  - `type CommandErrorCode`（13 值联合）
  - `type CommandResult = CommandDenied | CommandAccepted`
  - `interface CommandPipelinePorts`（九 port + `now`）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { parseSageActionIntentV2 } from '../src/appservice/command-contracts.js'

const validIntent = {
  matterId: 'matter-1', revisionId: 'rev-1', actionType: 'retry-capability',
  actionScope: 'revision', payload: { note: 'n' }, origin: 'renderer-retry',
}

describe('parseSageActionIntentV2', () => {
  it('accepts an exact valid intent', () => {
    expect(parseSageActionIntentV2(validIntent)).toEqual(validIntent)
  })
  it('rejects missing or non-string keys', () => {
    expect(parseSageActionIntentV2({ ...validIntent, matterId: 1 })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, origin: undefined })).toBeUndefined()
  })
  it('rejects extra keys and non-object input', () => {
    expect(parseSageActionIntentV2({ ...validIntent, extra: 1 })).toBeUndefined()
    expect(parseSageActionIntentV2(null)).toBeUndefined()
    expect(parseSageActionIntentV2('x')).toBeUndefined()
  })
  it('rejects nested payload values and bad scope/origin', () => {
    expect(parseSageActionIntentV2({ ...validIntent, payload: { nested: { deep: 1 } } })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, payload: { a: [1] } })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, actionScope: 'bogus' })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, origin: 'bogus' })).toBeUndefined()
  })
  it('rejects authority-shaped fields as extra keys', () => {
    expect(parseSageActionIntentV2({ ...validIntent, matrixId: 'm1' })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, AuthoritySnapshot: {} })).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && npx vitest run test/command-contracts.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```ts
/** WT-02D.0.2 command contracts: full ActionIntent and typed pipeline ports (spec §3). */
import type { BusinessMatter } from '../domain/business-matter.js'
import type { IdentityPolicyResolution } from '../security/identity-policy.js'
import type { CapabilityRegistryOperationMappingV1 } from '../security/capability-registry.js'

export interface SageActionIntentV2 {
  readonly matterId: string
  readonly revisionId: string
  readonly actionType: string
  readonly actionScope: 'matter' | 'revision'
  readonly payload: Readonly<Record<string, string | number | boolean>>
  readonly origin: 'renderer-retry' | 'renderer-action'
}

export type CommandErrorCode =
  | 'invalid-intent' | 'identity-unavailable' | 'policy-denied' | 'stale-revision'
  | 'decision-required' | 'compatibility-unknown' | 'requires-new-revision'
  | 'registry-unavailable' | 'capability-unavailable' | 'persistence-unavailable'
  | 'cancelled-before-dispatch' | 'conflict' | 'outcome-unknown'

export interface CommandDenied {
  readonly code: CommandErrorCode
  readonly stage: string
  readonly retryable: boolean
  readonly requiresNewRevision?: boolean
  readonly requiresDecision?: boolean
  readonly correlation: string
}

export interface CommandAccepted {
  readonly correlation: string
  readonly receiptRef: string
}

export type CommandResult = CommandDenied | CommandAccepted

const INTENT_KEYS = ['matterId', 'revisionId', 'actionType', 'actionScope', 'payload', 'origin'] as const
const ACTION_SCOPES = ['matter', 'revision'] as const
const INTENT_ORIGINS = ['renderer-retry', 'renderer-action'] as const

function isPlainScalar(value: unknown): value is string | number | boolean {
  const t = typeof value
  return t === 'string' || t === 'number' || t === 'boolean'
}

/** Exact-keys parse; extra keys, nested payload values, and bad enums are invalid (fail closed). */
export function parseSageActionIntentV2(input: unknown): SageActionIntentV2 | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined
  const record = input as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== INTENT_KEYS.length || !INTENT_KEYS.every((k) => keys.includes(k))) return undefined
  if (!INTENT_KEYS.slice(0, 4).every((k) => typeof record[k] === 'string' && (record[k] as string).length > 0)) return undefined
  if (!ACTION_SCOPES.includes(record.actionScope as (typeof ACTION_SCOPES)[number])) return undefined
  if (!INTENT_ORIGINS.includes(record.origin as (typeof INTENT_ORIGINS)[number])) return undefined
  const payload = record.payload
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  for (const v of Object.values(payload)) if (!isPlainScalar(v)) return undefined
  return {
    matterId: record.matterId as string,
    revisionId: record.revisionId as string,
    actionType: record.actionType as string,
    actionScope: record.actionScope as SageActionIntentV2['actionScope'],
    payload: payload as Readonly<Record<string, string | number | boolean>>,
    origin: record.origin as SageActionIntentV2['origin'],
  }
}

/** Nine step ports plus a trusted clock. `undefined` means that step's provider is unavailable (fail closed). */
export interface CommandPipelinePorts {
  readonly resolveIdentityPolicy: (req: { readonly intent: SageActionIntentV2; readonly correlation: string }) => IdentityPolicyResolution | undefined
  readonly strictRehydrate: (req: { readonly matterId: string; readonly revisionId: string }) =>
    | { readonly matter: BusinessMatter; readonly current: boolean }
    | { readonly denied: 'not-found' | 'stale-revision' }
    | undefined
  readonly resolveTarget: (req: { readonly matter: BusinessMatter }) =>
    | { readonly targetRequirement: unknown }
    | { readonly denied: 'target-unavailable' }
    | undefined
  readonly resolveCompatibility: (req: { readonly targetRequirement: unknown }) =>
    | { readonly outcome: 'equivalent' }
    | { readonly denied: 'unknown' | 'requires-new-revision' }
    | undefined
  readonly resolveRegistry: (req: { readonly actionType: string }) =>
    | { readonly mapping: CapabilityRegistryOperationMappingV1 }
    | { readonly denied: 'registry-unavailable' | 'not-approved' }
    | undefined
  readonly preflightAvailability: (req: { readonly mapping: CapabilityRegistryOperationMappingV1 }) =>
    | { readonly ok: true }
    | { readonly denied: 'capability-unavailable' }
    | undefined
  readonly persistPreparation: (req: { readonly mapping: CapabilityRegistryOperationMappingV1; readonly correlation: string }) =>
    | { readonly persisted: true }
    | { readonly denied: 'persistence-unavailable' }
    | undefined
  readonly dispatchOperation: (req: { readonly mapping: CapabilityRegistryOperationMappingV1 }) =>
    | { readonly receipt: { readonly receiptRef: string } }
    | { readonly outcome: 'outcome-unknown' }
    | { readonly denied: 'cancelled-before-dispatch' }
    | undefined
  readonly now: () => string
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && npx vitest run test/command-contracts.spec.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/appservice/command-contracts.ts apps/sage-shell/test/command-contracts.spec.ts
git commit -m "feat(sage): full ActionIntent contract and nine-step command ports (WT-02D.0.2 D1)"
```

---

### Task 2: command-pipeline.ts — 步骤 2–10 顺序编排内核

**Files:**
- Create: `apps/sage-shell/src/appservice/command-pipeline.ts`
- Create: `apps/sage-shell/test/fixtures/command-fakes.ts`（若 Task 1 未创建）
- Test: `apps/sage-shell/test/command-pipeline.spec.ts`

**Interfaces:**
- Consumes: `SageActionIntentV2`、`CommandPipelinePorts`、`CommandDenied`、`CommandAccepted`、`CommandResult`（Task 1）；`IdentityPolicyResolution` 的 `kind` 判别。
- Produces: `runCommand(input: { intent: SageActionIntentV2 | { type: 'retry' }; correlation: string; ports: CommandPipelinePorts }): CommandResult`——Task 3 消费。

**两个映射语义决定（测试即规格）：**
- `strictRehydrate` 返回 `not-found` → code `policy-denied`（存在性不泄漏；stage 仍标 `rehydrate`）。
- `resolveTarget` denied/undefined → code `compatibility-unknown`（target 缺失即无法证明等价，`unknown` 阻断语义）。

- [ ] **Step 1: 写失败测试（三族：步骤映射、顺序不可绕过、fail-closed 扫描）**

fixture `test/fixtures/command-fakes.ts`：

```ts
import type { IdentityPolicyResolution } from '../../src/security/identity-policy.js'

export function identityResolutionDenied(code: import('../../src/security/identity-policy.js').IdentityPolicyDenialCode): IdentityPolicyResolution {
  return { kind: 'denied', code, reason: 'redacted' }
}
```

`test/command-pipeline.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { runCommand } from '../src/appservice/command-pipeline.js'
import { identityResolutionDenied } from './fixtures/command-fakes.js'
import type { CommandPipelinePorts, SageActionIntentV2 } from '../src/appservice/command-contracts.js'

const intent: SageActionIntentV2 = {
  matterId: 'm1', revisionId: 'r1', actionType: 'retry-capability',
  actionScope: 'revision', payload: {}, origin: 'renderer-action',
}

function recordingPorts(overrides: Partial<CommandPipelinePorts> = {}): CommandPipelinePorts & { calls: string[] } {
  const calls: string[] = []
  const pass = (name: string, value: object) => { calls.push(name); return value }
  return {
    calls,
    resolveIdentityPolicy: overrides.resolveIdentityPolicy ?? (() => pass('identity', { kind: 'authorized', actor: {}, authoritySnapshot: {} } as never)),
    strictRehydrate: overrides.strictRehydrate ?? (() => pass('rehydrate', { matter: {} as never, current: true })),
    resolveTarget: overrides.resolveTarget ?? (() => pass('target', { targetRequirement: {} })),
    resolveCompatibility: overrides.resolveCompatibility ?? (() => pass('compat', { outcome: 'equivalent' as const })),
    resolveRegistry: overrides.resolveRegistry ?? (() => pass('registry', { mapping: {} as never })),
    preflightAvailability: overrides.preflightAvailability ?? (() => pass('preflight', { ok: true as const })),
    persistPreparation: overrides.persistPreparation ?? (() => pass('persist', { persisted: true as const })),
    dispatchOperation: overrides.dispatchOperation ?? (() => pass('dispatch', { receipt: { receiptRef: 'receipt-1' } })),
    now: () => '2026-10-01T00:00:00.000Z',
  }
}

describe('runCommand step mapping', () => {
  it('denies at step 2 with policy-denied when identity policy denies', () => {
    const ports = recordingPorts({ resolveIdentityPolicy: () => identityResolutionDenied('policy-not-active') })
    const result = runCommand({ intent, correlation: 'c1', ports })
    expect(result).toMatchObject({ code: 'policy-denied', stage: 'identity-policy', correlation: 'c1' })
    expect(ports.calls).toEqual(['identity'])
  })
  it('denies at step 3 with stale-revision', () => {
    const ports = recordingPorts({ strictRehydrate: () => ({ denied: 'stale-revision' as const }) })
    expect(runCommand({ intent, correlation: 'c2', ports })).toMatchObject({ code: 'stale-revision', stage: 'rehydrate', requiresNewRevision: true })
    expect(ports.calls).toEqual(['identity', 'rehydrate'])
  })
  it('denies at step 3 not-found without leaking existence', () => {
    const ports = recordingPorts({ strictRehydrate: () => ({ denied: 'not-found' as const }) })
    expect(runCommand({ intent, correlation: 'c3', ports })).toMatchObject({ code: 'policy-denied', stage: 'rehydrate' })
  })
  it('denies at step 4 target-unavailable as compatibility-unknown', () => {
    const ports = recordingPorts({ resolveTarget: () => ({ denied: 'target-unavailable' as const }) })
    expect(runCommand({ intent, correlation: 'c4', ports })).toMatchObject({ code: 'compatibility-unknown', stage: 'target' })
  })
  it('denies at step 6 compatibility unknown', () => {
    const ports = recordingPorts({ resolveCompatibility: () => ({ denied: 'unknown' as const }) })
    expect(runCommand({ intent, correlation: 'c6', ports })).toMatchObject({ code: 'compatibility-unknown', stage: 'compatibility' })
  })
  it('denies at step 6 requires-new-revision', () => {
    const ports = recordingPorts({ resolveCompatibility: () => ({ denied: 'requires-new-revision' as const }) })
    expect(runCommand({ intent, correlation: 'c7', ports })).toMatchObject({ code: 'requires-new-revision', stage: 'compatibility', requiresNewRevision: true })
  })
  it('denies at step 7 registry not-approved', () => {
    const ports = recordingPorts({ resolveRegistry: () => ({ denied: 'not-approved' as const }) })
    expect(runCommand({ intent, correlation: 'c8', ports })).toMatchObject({ code: 'registry-unavailable', stage: 'registry' })
  })
  it('denies at step 8 capability-unavailable', () => {
    const ports = recordingPorts({ preflightAvailability: () => ({ denied: 'capability-unavailable' as const }) })
    expect(runCommand({ intent, correlation: 'c9', ports })).toMatchObject({ code: 'capability-unavailable', stage: 'preflight' })
  })
  it('denies at step 9 persistence-unavailable', () => {
    const ports = recordingPorts({ persistPreparation: () => ({ denied: 'persistence-unavailable' as const }) })
    expect(runCommand({ intent, correlation: 'c10', ports })).toMatchObject({ code: 'persistence-unavailable', stage: 'persist' })
  })
  it('outcome-unknown at step 10', () => {
    const ports = recordingPorts({ dispatchOperation: () => ({ outcome: 'outcome-unknown' as const }) })
    expect(runCommand({ intent, correlation: 'c11', ports })).toMatchObject({ code: 'outcome-unknown', stage: 'dispatch', retryable: false })
  })
  it('cancelled-before-dispatch at step 10', () => {
    const ports = recordingPorts({ dispatchOperation: () => ({ denied: 'cancelled-before-dispatch' as const }) })
    expect(runCommand({ intent, correlation: 'c11b', ports })).toMatchObject({ code: 'cancelled-before-dispatch', stage: 'dispatch' })
  })
  it('accepted returns receiptRef when all ports pass', () => {
    const ports = recordingPorts()
    expect(runCommand({ intent, correlation: 'c12', ports })).toEqual({ correlation: 'c12', receiptRef: 'receipt-1' })
    expect(ports.calls).toEqual(['identity', 'rehydrate', 'target', 'compat', 'registry', 'preflight', 'persist', 'dispatch'])
  })
})

describe('runCommand ordering is not bypassable', () => {
  it('stops at the first denied step; later ports see zero calls', () => {
    const ports = recordingPorts({ resolveCompatibility: () => ({ denied: 'unknown' as const }) })
    runCommand({ intent, correlation: 'c13', ports })
    expect(ports.calls).toEqual(['identity', 'rehydrate', 'target', 'compat'])
  })
  it('retry intent without matterId is invalid-intent before any port call', () => {
    const ports = recordingPorts()
    const result = runCommand({ intent: { type: 'retry' }, correlation: 'c14', ports })
    expect(result).toMatchObject({ code: 'invalid-intent', stage: 'intent' })
    expect(ports.calls).toEqual([])
  })
})

describe('runCommand fail-closed scan', () => {
  const steps: readonly [string, keyof CommandPipelinePorts, string, string][] = [
    ['identity', 'resolveIdentityPolicy', 'identity-unavailable', 'identity-policy'],
    ['rehydrate', 'strictRehydrate', 'identity-unavailable', 'rehydrate'],
    ['target', 'resolveTarget', 'compatibility-unknown', 'target'],
    ['compat', 'resolveCompatibility', 'compatibility-unknown', 'compatibility'],
    ['registry', 'resolveRegistry', 'registry-unavailable', 'registry'],
    ['preflight', 'preflightAvailability', 'capability-unavailable', 'preflight'],
    ['persist', 'persistPreparation', 'persistence-unavailable', 'persist'],
    ['dispatch', 'dispatchOperation', 'registry-unavailable', 'dispatch'],
  ]
  for (const [label, port, code, stage] of steps) {
    it(`undefined at ${label} denies with ${code}`, () => {
      const ports = recordingPorts({ [port]: undefined as never })
      expect(runCommand({ intent, correlation: 'c-' + label, ports })).toMatchObject({ code, stage })
    })
  }
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && npx vitest run test/command-pipeline.spec.ts`
Expected: FAIL（runCommand 不存在）

- [ ] **Step 3: 写实现**

```ts
/** WT-02D.0.2 command pipeline: strict sequential orchestration of steps 2-10 (spec §4). */
import type { CommandDenied, CommandPipelinePorts, CommandResult, SageActionIntentV2 } from './command-contracts.js'

function denied(correlation: string, stage: string, code: CommandDenied['code'], extra: Partial<CommandDenied> = {}): CommandDenied {
  return { code, stage, retryable: false, correlation, ...extra }
}

/**
 * Run the command order. Any non-success at a step returns immediately; later ports are never
 * called. Each step re-evaluates against fresh inputs — nothing here is standing authority.
 */
export function runCommand(input: {
  readonly intent: SageActionIntentV2 | { readonly type: 'retry' }
  readonly correlation: string
  readonly ports: CommandPipelinePorts
}): CommandResult {
  const { correlation, ports } = input
  const intent = input.intent

  // A retry carries no matterId to rehydrate; production ports are fail-closed, so retry
  // terminates at step 2 identically (spec §4 retry note). It is rejected up-front here so
  // the pipeline contract stays single-shaped.
  if (!('matterId' in intent)) return denied(correlation, 'intent', 'invalid-intent')

  // Step 2: action-scoped Identity / Policy.
  const identity = ports.resolveIdentityPolicy({ intent, correlation })
  if (identity === undefined) return denied(correlation, 'identity-policy', 'identity-unavailable', { retryable: true })
  if (identity.kind === 'denied') return denied(correlation, 'identity-policy', 'policy-denied')

  // Step 3: strict rehydrate of the current BusinessMatter.
  const rehydrated = ports.strictRehydrate({ matterId: intent.matterId, revisionId: intent.revisionId })
  if (rehydrated === undefined) return denied(correlation, 'rehydrate', 'identity-unavailable', { retryable: true })
  if ('denied' in rehydrated) {
    if (rehydrated.denied === 'stale-revision') {
      return denied(correlation, 'rehydrate', 'stale-revision', { requiresNewRevision: true })
    }
    // not-found maps onto the policy-denied code family: no existence leak to the renderer.
    return denied(correlation, 'rehydrate', 'policy-denied')
  }
  if (!rehydrated.current) return denied(correlation, 'rehydrate', 'stale-revision', { requiresNewRevision: true })

  // Step 4: trusted target requirement for the current revision.
  const target = ports.resolveTarget({ matter: rehydrated.matter })
  if (target === undefined || 'denied' in target) {
    return denied(correlation, 'target', 'compatibility-unknown', { retryable: true })
  }

  // Step 5: domain re-validation rides the target/compat ports in 0.2 (no domain port yet).
  // Step 6: Compatibility Resolver — only an exact unique equivalent may proceed.
  const compat = ports.resolveCompatibility({ targetRequirement: target.targetRequirement })
  if (compat === undefined) return denied(correlation, 'compatibility', 'compatibility-unknown', { retryable: true })
  if ('denied' in compat) {
    return compat.denied === 'requires-new-revision'
      ? denied(correlation, 'compatibility', 'requires-new-revision', { requiresNewRevision: true })
      : denied(correlation, 'compatibility', 'compatibility-unknown', { retryable: true })
  }

  // Step 7: Registry mapping for this action type.
  const registry = ports.resolveRegistry({ actionType: intent.actionType })
  if (registry === undefined || 'denied' in registry) {
    return denied(correlation, 'registry', 'registry-unavailable', { retryable: true })
  }

  // Step 8: no-side-effect availability preflight.
  const preflight = ports.preflightAvailability({ mapping: registry.mapping })
  if (preflight === undefined || 'denied' in preflight) {
    return denied(correlation, 'preflight', 'capability-unavailable', { retryable: true })
  }

  // Step 9: persist preparation facts (service-issued operation identity) before dispatch.
  const persisted = ports.persistPreparation({ mapping: registry.mapping, correlation })
  if (persisted === undefined || 'denied' in persisted) {
    return denied(correlation, 'persist', 'persistence-unavailable', { retryable: true })
  }

  // Step 10: real Adapter dispatch; results normalize to receipt or outcome-unknown.
  const dispatched = ports.dispatchOperation({ mapping: registry.mapping })
  if (dispatched === undefined) return denied(correlation, 'dispatch', 'registry-unavailable', { retryable: true })
  if ('outcome' in dispatched) return denied(correlation, 'dispatch', 'outcome-unknown')
  if ('denied' in dispatched) return denied(correlation, 'dispatch', 'cancelled-before-dispatch')
  return { correlation, receiptRef: dispatched.receipt.receiptRef }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && npx vitest run test/command-pipeline.spec.ts`
Expected: PASS（约 25 tests）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/appservice/command-pipeline.ts apps/sage-shell/test/command-pipeline.spec.ts apps/sage-shell/test/fixtures/command-fakes.ts
git commit -m "feat(sage): sequential command pipeline kernel for steps 2-10 (WT-02D.0.2 D1)"
```

---

### Task 3: composition.ts 扩展 — production 全 fail-closed 管道服务

**Files:**
- Modify: `apps/sage-shell/src/appservice/composition.ts`（dispatch 换成管道；readState 不动）
- Test: 扩展 `apps/sage-shell/test/appservice-composition.spec.ts`

**Interfaces:**
- Consumes: `runCommand`（Task 2）；`CommandPipelinePorts`（Task 1）；`serviceJson`（`./errors.js`）。
- Produces: `createUnavailableFirstService(runtime: SageViewState | null): ServiceProviders` 签名不变（main 接线形态不动，D2 裁决的接线自动生效）；dispatch 内部走管道。

- [ ] **Step 1: 写失败测试（追加到既有 spec）**

```ts
describe('dispatch via command pipeline', () => {
  it('always denies identity-unavailable with stage and fresh correlation', async () => {
    const service = createUnavailableFirstService(null)
    const response = await service.dispatch()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })
    expect(typeof body.correlation).toBe('string')
    const secondBody = await (await createUnavailableFirstService(null).dispatch()).json() as Record<string, unknown>
    expect(secondBody.correlation).not.toBe(body.correlation)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && npx vitest run test/appservice-composition.spec.ts`
Expected: 新增 it FAIL（现状 dispatch 是 503 `{error:'identity-unavailable', retryable:false}`）

- [ ] **Step 3: 写实现**

composition.ts 顶部新增 import 与常量，dispatch 方法替换（readState 与文件其余部分不动）：

```ts
import { runCommand } from './command-pipeline.js'
import type { CommandPipelinePorts } from './command-contracts.js'

/** Production has no provider for any step: every port fails closed (spec §5). */
const PRODUCTION_FAIL_CLOSED_PORTS: CommandPipelinePorts = {
  resolveIdentityPolicy: () => undefined,
  strictRehydrate: () => undefined,
  resolveTarget: () => undefined,
  resolveCompatibility: () => undefined,
  resolveRegistry: () => undefined,
  preflightAvailability: () => undefined,
  persistPreparation: () => undefined,
  dispatchOperation: () => undefined,
  now: () => '1970-01-01T00:00:00.000Z',
}
```

```ts
    async dispatch(): Promise<Response> {
      const result = runCommand({
        intent: { type: 'retry' },
        correlation: randomUUID(),
        ports: PRODUCTION_FAIL_CLOSED_PORTS,
      })
      return serviceJson(result, result.code === 'invalid-intent' ? 400 : 200)
    },
```

（`now` 是纯注入位；production 无 trusted clock 实现时返回常量仅满足类型，不参与任何判定。）

- [ ] **Step 4: 跑测试确认通过（含既有测试不破）**

Run: `cd apps/sage-shell && npx vitest run test/appservice-composition.spec.ts`
Expected: 全 PASS。若既有用例断言旧 503 形状，按新合同更新断言（spec §5 授权的变更，同步读数属本票射程）。

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/appservice/composition.ts apps/sage-shell/test/appservice-composition.spec.ts
git commit -m "feat(sage): dispatch routes through fail-closed command pipeline (WT-02D.0.2 D2)"
```

---

### Task 4: route-skeleton typed 响应 + renderer retry 两形守卫

**Files:**
- Modify: `apps/sage-shell/src/appservice/route-skeleton.ts:37`（invalid-intent 响应体对齐 CommandDenied 形状；parseIntent 不动）
- Modify: `apps/sage-shell/src/product/renderer.ts`（retry POST 响应两形守卫——消解 0.1 遗留「retry 路径 render(response.json()) 未两形解包」）
- Test: 扩展 `apps/sage-shell/test/appservice-route-skeleton.spec.ts`、扩展 `apps/sage-shell/test/renderer-state-parse.spec.ts`

**Interfaces:**
- Consumes: `CommandDenied` 形状 `{code, stage, retryable, correlation}`（Task 1）。
- Produces: transport invalid-intent 400 + CommandDenied 形 body；renderer retry 路径对 CommandDenied 形与旧扁平形 `{status,...}` 均可渲染。

- [ ] **Step 1: 写失败测试**

route-skeleton 扩展：

```ts
describe('dispatch response shape', () => {
  it('invalid-intent transport body matches CommandDenied shape', async () => {
    const providers = { readState: async () => new Response('{}'), dispatch: async () => new Response('{}') }
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/actions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'bogus' }),
    }), { callerBinding: { correlation: 'c' }, providers })
    expect(response.status).toBe(400)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'invalid-intent', stage: 'intent', retryable: false })
    expect(body.correlation).toBe('c')
  })
})
```

renderer-state-parse 扩展（沿用该 spec 既有的「提取出货 `<script>` 源码 + DOM stub」模式）——断言 retry 响应处理逻辑对两形输入的归一结果：

- CommandDenied 形 `{code:'identity-unavailable', retryable:true, correlation:'x'}` → 归一为可渲染 state（status `recovering`、retryable true）；
- 旧扁平形 `{status:'recovering', message:'...', retryable:false}` → 行为与 0.1 一致（直通 render）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && npx vitest run test/appservice-route-skeleton.spec.ts test/renderer-state-parse.spec.ts`
Expected: 新增断言 FAIL

- [ ] **Step 3: 写实现**

route-skeleton.ts 第 37 行替换为：

```ts
    if (parseIntent(body) === undefined) return serviceJson(
      { code: 'invalid-intent', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
```

renderer.ts retry 处理器（`render(await response.json())` 处）改为：

```js
        const payload = await response.json();
        // 0.2 command-denied shape carries {code, retryable}; legacy P0-2 shape is flat {status,...}.
        const state = payload !== null && typeof payload === 'object' && payload.code !== undefined
          ? { status: 'recovering', message: 'Sage 正在重新检查能力运行时服务。', retryable: payload.retryable !== false }
          : payload;
        render(state);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && npx vitest run test/appservice-route-skeleton.spec.ts test/renderer-state-parse.spec.ts`
Expected: PASS

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/appservice/route-skeleton.ts apps/sage-shell/src/product/renderer.ts apps/sage-shell/test/appservice-route-skeleton.spec.ts apps/sage-shell/test/renderer-state-parse.spec.ts
git commit -m "feat(sage): typed transport denials and renderer retry two-shape guard (WT-02D.0.2 D2)"
```

---

### Task 5: 全量回归 + Note + ADR-0181 收口

**Files:**
- Create: `docs/notes/implemented/architecture/2026-10-01-wt02d02-command-pipeline.md`（Note 四节：Problem / Decision / Alternatives considered / Consequences）
- Create: `docs/adr/ADR-0181.md`（含 `## 机器可读决策` 块，D1–D3）
- Modify: `docs/adr/README.md`（索引表追加一行）、`docs/adr/decisions.json`（用 `node scripts/gates/adr-agent-records.mjs --write` 派生再生）
- Test: 无新增（本任务验收靠全量回归）

**Interfaces:**
- Consumes: Task 1–4 全部交付物；ADR-0179/0180 的 Note/ADR 双向链形态（门禁 adr-note-links 校验）。
- Produces: 票据收口；Note→ADR 链接用**三层上溯** `../../../adr/ADR-0181.md`（ADR-0180 票踩过的坑：两层会 docs-link-integrity 判红）。

- [ ] **Step 1: 全量回归三件套**

```bash
cd apps/sage-shell && node scripts/test.mjs run && npm run typecheck && cd ../.. && node scripts/gate.mjs
```
Expected: 全量测试全绿（46+ files，421+ tests）、typecheck 0 error、gate 25/25（注意：gate 输出落文件再读，不接 tail/grep 管道——已登记纪律）。

- [ ] **Step 2: 写 Note**

`docs/notes/implemented/architecture/2026-10-01-wt02d02-command-pipeline.md`，四节结构：
- **Problem**：0.1 dispatch 恒 503 笼统体，command 顺序步骤 2–10 无代码看守（ADR-0174 顺序只有文档）。
- **Decision**：三裁决落地（D1 完整管道骨架 / D2 接进 main dispatch / D3 内核全 intent 合同+transport 仍只 retry）；两个映射语义决定（not-found → policy-denied 家族防存在性泄漏；target 缺失 → compatibility-unknown 阻断语义）；retry 穿同一管道。
- **Alternatives considered**：逐段渐进（B）、kernel-only（B）、transport 同步开放完整 intent（B）三案否决理由。
- **Consequences**：production dispatch 从 503 变 200 + typed body（identity-unavailable + stage/correlation）；renderer retry 两形守卫消解 0.1 遗留；步骤 5 domain 重验暂由 target/compat port 承载（显式登记，非隐藏）；port-only 合同（persist/dispatch）等 provider。
- 头部：`日期：2026-10-01 · 分类：architecture · 关联 ADR：[ADR-0181](../../../adr/ADR-0181.md)`

- [ ] **Step 3: 写 ADR-0181 + 索引 + decisions.json**

ADR-0181 仿 ADR-0180 形态（状态 accepted、决策记录链 Note、相关 ADR-0174/0179/0180；机器可读决策块 D1/D2/D3 各带 constraints）。

README.md 索引追加：

```markdown
| ADR-0181 | WT-02D.0.2 command pipeline 内核：步骤 2–10 typed port 管道、production 全 port fail-closed、dispatch 步骤级脱敏错误类别、renderer retry 两形守卫；不接真实 provider。 | accepted（2026-10-01） | [Note](../notes/implemented/architecture/2026-10-01-wt02d02-command-pipeline.md) |
```

```bash
node scripts/gates/adr-agent-records.mjs --write
```

- [ ] **Step 4: gate 全绿（docs 链接校验含新 Note/ADR）**

```bash
node scripts/gate.mjs > /tmp/sage-gate-02d02.txt 2>&1; echo "exit=$?"; tail -1 /tmp/sage-gate-02d02.txt
```
Expected: exit=0，25/25

- [ ] **Step 5: commit**

```bash
git add docs/notes/implemented/architecture/2026-10-01-wt02d02-command-pipeline.md docs/adr/ADR-0181.md docs/adr/README.md docs/adr/decisions.json
git commit -m "docs(adr): ADR-0181 WT-02D.0.2 command pipeline kernel with note"
```

- [ ] **Step 6: 验收读数汇总（写入 Note Consequences 或控制器台账）**

- 全量测试 N files / M tests 全绿（真实数字）
- typecheck 0 error
- gate 25/25
- production dispatch 读数：`200 + {code:'identity-unavailable', stage:'identity-policy', retryable:true, correlation:<uuid>}`，两次调用 correlation 不同（新鲜性）
- 顺序不可绕过：identity denied 后 `ports.calls === ['identity']`（调用序列断言绿）

---

## Self-Review 结果（写计划时已跑）

1. **Spec 覆盖**：§3 contracts→Task 1；§4 pipeline→Task 2；§5 composition→Task 3；§6 transport/renderer→Task 4；§8 验收 1–4→各 Task Steps + Task 5 回归；§8.6 Note/ADR→Task 5。§9 不做项均无任务（正确）。
2. **占位扫描**：无 TBD/TODO；Task 4 renderer 测试以行为描述 + 既有 spec 模式引用（该 spec 的既有模式即提取嵌入 script 源码断言，非占位）。
3. **类型一致性**：`parseSageActionIntentV2`/`runCommand`/`CommandPipelinePorts`/`CommandDenied`/`CommandAccepted` 在 Task 1–4 间签名一致；`SageActionIntentV2['actionScope']` 字面量联合一致；fixture `identityResolutionDenied` 的 `IdentityPolicyDenialCode` import 路径与 Task 2 spec 内联 import 一致。
