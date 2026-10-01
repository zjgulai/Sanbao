# WT-02D.0.1 main-owned /.sage/* route skeleton 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec 把 `/.sage/*` 从 Host 迁到 Electron main 的 unavailable-first Application Service 骨架，以 import firewall gate 守边界，开关双态可回退。

**Architecture:** 纯函数内核（`src/appservice/`，零 Electron import）+ main 侧 binding 接线（`main/appservice-binding.ts`）+ `protocol.handle` 分流（`SAGE_APP_SERVICE=off` 回退 Host）。新 gate 项 `sage-appservice-import-firewall`（+selftest）由静态 import 扫描守内核纯净性。

**Tech Stack:** TypeScript（`tsc --noEmit` + `tsc`）、vitest（sage-shell 既有 runner：`node scripts/test.mjs run`，经 ELECTRON_RUN_AS_NODE）、gate 注册（`scripts/gate.mjs` SAGE_CHECK_NAMES allowlist）。

**Spec:** `docs/superpowers/specs/2026-10-01-wt02d01-main-sage-route-skeleton-design.md`（五项裁决 D1–D5 逐条落此计划；验收 = spec §7 五条）

## Global Constraints

- D1：`SAGE_APP_SERVICE=off` 为唯一回退机制（启动时读一次，运行中不变）；off 态 `/.sage/*` 原样转发 `host.fetch`；Host 旧 handler（`src/adapter/handler.ts`）本票不删。
- D2：`src/appservice/**` **零 Electron import**；main 接线文件（`src/main/appservice-binding.ts`）可 import Electron，但不得 import renderer/Cordis/MCP plugin/packages/vendor。
- D3：state 响应 = `{ service: {…unavailable…}, runtime: <P0-2 SageViewState 形状> }` 两字段并存；renderer 现有消费（`product/state.ts`、`view-state.ts`）不改不破。
- D4：binding 失败 = 403；成功 → 继续 unavailable 响应。`CallerBinding` 只含 opaque `correlation`，不含 frameId/processId 等 transport identity。
- D5：firewall gate 阻塞级 + selftest 负例；空射程（`src/appservice/` 无 .ts 文件）判红（总账 P-02：分母 0 不是绿）。
- 错误体只携带可枚举类别 + `stage/retryable/correlation`；**禁止** raw exception/stack/path/provider payload（负例断言无 `stack`/`message` 键）。
- 测试命令（全部在仓根跑，除非注明）：`cd apps/sage-shell && npm run test`（sage-shell 全量）；`node --test scripts/gates/sage-appservice-import-firewall.test.mjs`；`node scripts/gate.mjs`（23→25 项）。
- **提交纪律（仓规）**：非机械改动 → 提交附决策 Note（`docs/notes/implemented/architecture/2026-10-01-wt02d01-main-sage-route-skeleton.md`，四节齐全）+ ADR-0179 登记（route 迁移与回退门）；`node scripts/gate.mjs` 绿是提交前置（Task 1 的空射程红是唯一例外——新检查项的判活证据，Task 1+2 可合并提交保持全绿）。commit message 用 `feat(sage): …` 型。
- **本仓用户级红线（AGENTS.md）**：不碰 `vendor/`、`deepseek-harness`、`.gitignore`、根 `AGENTS.md`；`pnpm run gate` 只跑 Sage BASE allowlist。

---

### Task 1: import firewall gate（先行——后续所有任务由它守）

**Files:**
- Create: `scripts/gates/sage-appservice-import-firewall.mjs`
- Create: `scripts/gates/sage-appservice-import-firewall.test.mjs`
- Modify: `scripts/gate.mjs`（import 区 + 注册两项 + SAGE_CHECK_NAMES 加两名）

**Interfaces:**
- Produces: `checkSageAppServiceImportFirewall({ files: string[] }): { ok: boolean, violations: string[] }`（checker 纯函数，gate 与 selftest 共用）；`collectSageAppServiceFiles(repoRoot: string): string[]`（递归收集 `apps/sage-shell/src/appservice/**/*.ts`，目录不存在返回 `[]`）。

- [ ] **Step 1: 写失败 selftest**

`scripts/gates/sage-appservice-import-firewall.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSageAppServiceImportFirewall } from './sage-appservice-import-firewall.mjs'

test('禁止 import 的来源命中即红', () => {
  const t = mkdtempSync(join(tmpdir(), 'fw-'))
  try {
    const f = join(t, 'a.ts')
    writeFileSync(f, `import { app } from 'electron'\nexport const x = app\n`)
    const bad = checkSageAppServiceImportFirewall({ files: [f] })
    assert.equal(bad.ok, false)
    assert.ok(bad.violations.some(v => v.includes('electron')), JSON.stringify(bad.violations))
  } finally { rmSync(t, { recursive: true, force: true }) }
})

test('合法 import 判绿（node 内置与 product 类型合同允许）', () => {
  const t = mkdtempSync(join(tmpdir(), 'fw-'))
  try {
    const f = join(t, 'b.ts')
    writeFileSync(f, `import { join } from 'node:path'\nimport type { SageViewState } from '../product/contracts.js'\nexport const x = join\n`)
    assert.equal(checkSageAppServiceImportFirewall({ files: [f] }).ok, true)
  } finally { rmSync(t, { recursive: true, force: true }) }
})

test('空射程判红（分母 0 不是绿）', () => {
  assert.equal(checkSageAppServiceImportFirewall({ files: [] }).ok, false)
})

test('renderer 实现路径 / cordis / packages / vendor 均红', () => {
  for (const spec of [
    `import { x } from '../renderer/index.js'`,
    `import { ctx } from '@deepseek-ai/cordis'`,
    `import { y } from 'packages/capabilities/foo'`,
    `import { z } from '../../vendor/dsh-desktop'`,
  ]) {
    const t = mkdtempSync(join(tmpdir(), 'fw-'))
    try {
      const f = join(t, 'c.ts')
      writeFileSync(f, `${spec}\nexport const w = 1\n`)
      assert.equal(checkSageAppServiceImportFirewall({ files: [f] }).ok, false, spec)
    } finally { rmSync(t, { recursive: true, force: true }) }
  }
})
```

- [ ] **Step 2: 跑 selftest 确认失败**

Run: `node --test scripts/gates/sage-appservice-import-firewall.test.mjs`
Expected: FAIL（Cannot find module）。

- [ ] **Step 3: 实现 checker**

`scripts/gates/sage-appservice-import-firewall.mjs`：

```js
/** Static import firewall for the WT-02D.0.1 Application Service kernel. */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const FORBIDDEN = [
  /from\s+'electron'/u,
  /require\(\s*['"]electron['"]\s*\)/u,
  /from\s+'[^']*\.\.\/renderer(?:\/[^']*)?'/u,
  /from\s+'[^']*\.\.\/(?:component-renderer|renderer)[^']*'\.js'/u,
  /from\s+'@deepseek-ai\//u,
  /from\s+'packages\//u,
  /from\s+'[^']*vendor\//u,
  /from\s+'[^']*node_modules\//u,
]

export function collectSageAppServiceFiles(repoRoot) {
  const dir = join(repoRoot, 'apps/sage-shell/src/appservice')
  const out = []
  const walk = (d) => {
    let entries
    try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && /\.ts$/u.test(e.name)) out.push(p)
    }
  }
  walk(dir)
  return out.sort()
}

export function checkSageAppServiceImportFirewall({ files }) {
  const violations = []
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, violations: ['apps/sage-shell/src/appservice 无 .ts 文件（空射程判红，P-02）'] }
  }
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    for (const re of FORBIDDEN) {
      const m = text.match(re)
      if (m) violations.push(`${relative(process.cwd(), f)}: 命中禁入 import「${m[0]}」`)
    }
  }
  return { ok: violations.length === 0, violations }
}
```

（注意 `product/contracts.js` 的类型 import 不落任何 FORBIDDEN 模式——`@deepseek-ai\//u` 只匹配包名前缀，`../product/` 不在禁列：这是 D5 的「类型合同允许、实现路径禁止」边界。）

- [ ] **Step 4: selftest 到绿**

Run: `node --test scripts/gates/sage-appservice-import-firewall.test.mjs` → 4 pass。

- [ ] **Step 5: 注册进 gate.mjs**

- import 区（`sage-product-boundary` import 附近）加：`import { checkSageAppServiceImportFirewall, collectSageAppServiceFiles } from './gates/sage-appservice-import-firewall.mjs'`
- 注册数组在 `sage-service-consumption-selftest` 块后仿 `sage-product-boundary` 形态加两个 check 对象：name `'sage-appservice-import-firewall'`（run 调 `checkSageAppServiceImportFirewall({ files: collectSageAppServiceFiles(repoRoot) })`，ok=false 转 gate 失败，remediation 写「移除禁入 import；空射程说明 appservice 目录被删，恢复或移除本 gate」）、`'sage-appservice-import-firewall-selftest'`（run 调 `runNodeTestFile('scripts/gates/sage-appservice-import-firewall.test.mjs', 'appservice import firewall 判据的反向自测失败')`）。
- `SAGE_CHECK_NAMES` 数组 `'sage-service-consumption-selftest',` 之后加 `'sage-appservice-import-firewall', 'sage-appservice-import-firewall-selftest',`。

- [ ] **Step 6: 跑 gate 确认新项红（此时 src/appservice 还不存在）**

Run: `node scripts/gate.mjs`
Expected: 24/26 通过，`sage-appservice-import-firewall` 红（空射程，预期红——gate 项判活证据），selftest 绿。

- [ ] **Step 7: Commit（或与 Task 2 合并）**

```bash
git add scripts/gates/sage-appservice-import-firewall.mjs scripts/gates/sage-appservice-import-firewall.test.mjs scripts/gate.mjs
git commit -m "feat(sage): import-firewall gate for appservice kernel (WT-02D.0.1 D5)"
```

（本提交单独存在时 gate 含一个预期红；执行者也可与 Task 2 合并成一个 commit 保持每次提交 gate 全绿——两可，合并时 commit message 并写两票。）

---

### Task 2: appservice 内核——contracts + errors + composition + route-skeleton

**Files:**
- Create: `apps/sage-shell/src/appservice/contracts.ts`
- Create: `apps/sage-shell/src/appservice/errors.ts`
- Create: `apps/sage-shell/src/appservice/composition.ts`
- Create: `apps/sage-shell/src/appservice/route-skeleton.ts`
- Test: `apps/sage-shell/test/appservice-route-skeleton.spec.ts`、`apps/sage-shell/test/appservice-composition.spec.ts`

**Interfaces:**
- Consumes: `SageViewState`（type import，`../product/contracts.js`——D5 允许类型合同）。
- Produces: `handleSageServiceRequest(request: Request, deps: ServiceDeps): Promise<Response>`；`createUnavailableFirstService(runtime: SageViewState | null): ServiceProviders`；`shouldUseAppService(pathname: string, appServiceEnabled: boolean): boolean`（Task 4 补导出）；`ServiceDeps = { callerBinding: CallerBinding | null, providers: ServiceProviders }`；`CallerBinding = { readonly correlation: string }`；`MAX_SAGE_ACTION_BYTES = 4 * 1024`。

- [ ] **Step 1: 写失败测试（route-skeleton 六类拒绝 + 直通）**

`apps/sage-shell/test/appservice-route-skeleton.spec.ts`（vitest，与同目录 spec 同风格）：

```ts
import { describe, expect, it } from 'vitest'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

const providers = {
  readState: async () => Response.json({ service: { status: 'unavailable' }, runtime: null }),
  dispatch: async () => new Response(null, { status: 503 }),
}
const deps = { callerBinding: { correlation: 'c-1' }, providers }

function req(url: string, init?: RequestInit): Request { return new Request(url, init) }

describe('route-skeleton', () => {
  it('缺 caller binding 一律 403', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/state'), { callerBinding: null, providers })
    expect(r.status).toBe(403)
  })
  it('state 非 GET 405 + allow GET', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/state', { method: 'POST' }), deps)
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('GET')
  })
  it('actions 非 POST 405 + allow POST', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/actions'), { ...deps, providers })
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('POST')
  })
  it('actions 非 JSON content-type 415', async () => {
    const r = await handleSageServiceRequest(
      req('dsh-app://app/.sage/actions', { method: 'POST', headers: { 'content-type': 'text/plain' } }),
      deps,
    )
    expect(r.status).toBe(415)
  })
  it('未知 /.sage/ 子路径 404', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/other'), deps)
    expect(r.status).toBe(404)
  })
  it('actions body 超预算 413（流式截断）', async () => {
    const big = 'x'.repeat(5 * 1024)
    const r = await handleSageServiceRequest(
      req('dsh-app://app/.sage/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"type":"retry","pad":"${big}"}` }),
      deps,
    )
    expect(r.status).toBe(413)
  })
  it('actions 未知 intent 400 invalid-intent', async () => {
    const r = await handleSageServiceRequest(
      req('dsh-app://app/.sage/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"nuke"}' }),
      deps,
    )
    expect(r.status).toBe(400)
    const body = await r.json() as Record<string, unknown>
    expect(body.error).toBe('invalid-intent')
  })
  it('GET state 直通 providers.readState', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/state'), deps)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ service: { status: 'unavailable' }, runtime: null })
  })
})
```

Run: `cd apps/sage-shell && npx vitest run test/appservice-route-skeleton.spec.ts`
Expected: FAIL（`../src/appservice/route-skeleton.js` 不存在）。

- [ ] **Step 2: 写 composition 失败测试**

`apps/sage-shell/test/appservice-composition.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { createUnavailableFirstService } from '../src/appservice/composition.js'

const runtime = { status: 'ready' as const, message: 'dsh 2.0.10', retryable: true }

describe('unavailable-first composition', () => {
  it('state 返回 service.unavailable + identity-unavailable + 内嵌 runtime + no-store', async () => {
    const r = await createUnavailableFirstService(runtime).readState()
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = await r.json() as Record<string, unknown>
    const service = body.service as Record<string, unknown>
    expect(service.status).toBe('unavailable')
    expect(service.reason).toBe('identity-unavailable')
    expect(typeof service.correlation).toBe('string')
    expect(body.runtime).toEqual(runtime)
  })
  it('runtime 缺席时内嵌 null（不伪造 P0-2 字段）', async () => {
    const body = await (await createUnavailableFirstService(null).readState()).json() as Record<string, unknown>
    expect(body.runtime).toBeNull()
  })
  it('dispatch 503 + 脱敏错误体（无 stack/message 键）', async () => {
    const r = await createUnavailableFirstService(runtime).dispatch()
    expect(r.status).toBe(503)
    const body = await r.json() as Record<string, unknown>
    expect(body.error).toBe('identity-unavailable')
    expect(body.retryable).toBe(false)
    expect('stack' in body).toBe(false)
    expect('message' in body).toBe(false)
  })
  it('两次 readState 的 correlation 不同（新鲜求值，无原地抬升）', async () => {
    const s = createUnavailableFirstService(runtime)
    const a = await (await s.readState()).json() as { service: { correlation: string } }
    const b = await (await s.readState()).json() as { service: { correlation: string } }
    expect(a.service.correlation).not.toBe(b.service.correlation)
  })
})
```

Run: `cd apps/sage-shell && npx vitest run test/appservice-composition.spec.ts` → FAIL（模块不存在）。

- [ ] **Step 3: 实现四文件**

`apps/sage-shell/src/appservice/contracts.ts`：

```ts
/** WT-02D.0.1 contracts: the main-owned /.sage/* service surface. */
import type { SageViewState } from '../product/contracts.js'

export interface CallerBinding {
  readonly correlation: string
}

export type ServiceUnavailableReason = 'identity-unavailable'

export interface ServiceStatus {
  readonly status: 'unavailable'
  readonly reason: ServiceUnavailableReason
  readonly correlation: string
}

export interface SageServiceState {
  readonly service: ServiceStatus
  readonly runtime: SageViewState | null
}

export interface ServiceProviders {
  readonly readState: () => Promise<Response>
  readonly dispatch: () => Promise<Response>
}

export interface ServiceDeps {
  readonly callerBinding: CallerBinding | null
  readonly providers: ServiceProviders
}
```

`apps/sage-shell/src/appservice/errors.ts`：

```ts
/** Stable, enumerable, redacted service errors (spec §3.3). */

export const MAX_SAGE_ACTION_BYTES = 4 * 1024

export function serviceJson(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
}
```

`apps/sage-shell/src/appservice/composition.ts`：

```ts
/** Unavailable-first composition: no provider assembled, stable denials (spec §3.2). */
import { randomUUID } from 'node:crypto'
import type { SageViewState } from '../product/contracts.js'
import type { SageServiceState, ServiceProviders } from './contracts.js'
import { serviceJson } from './errors.js'

export function createUnavailableFirstService(runtime: SageViewState | null): ServiceProviders {
  return {
    async readState(): Promise<Response> {
      const state: SageServiceState = {
        service: { status: 'unavailable', reason: 'identity-unavailable', correlation: randomUUID() },
        runtime,
      }
      return serviceJson(state, 200)
    },
    async dispatch(): Promise<Response> {
      return serviceJson({ error: 'identity-unavailable', retryable: false }, 503)
    },
  }
}
```

`apps/sage-shell/src/appservice/route-skeleton.ts`：

```ts
/** Pure route skeleton for the main-owned /.sage/* surface (spec §3.1). */
import type { ServiceDeps } from './contracts.js'
import { MAX_SAGE_ACTION_BYTES, serviceJson } from './errors.js'

const SAGE_STATE_PATH = '/.sage/state'
const SAGE_ACTIONS_PATH = '/.sage/actions'

export async function handleSageServiceRequest(request: Request, deps: ServiceDeps): Promise<Response> {
  if (deps.callerBinding === null) return new Response(null, { status: 403 })

  const url = new URL(request.url)
  if (url.pathname === SAGE_STATE_PATH) {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } })
    return deps.providers.readState()
  }

  if (url.pathname === SAGE_ACTIONS_PATH) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return new Response(null, { status: 415 })
    const declaredLength = request.headers.get('content-length')
    if (declaredLength !== null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_SAGE_ACTION_BYTES)) {
      return new Response(null, { status: 413 })
    }
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return new Response(null, { status: 413 })
    if (parseIntent(body) === undefined) return serviceJson({ error: 'invalid-intent', retryable: false }, 400)
    return deps.providers.dispatch()
  }

  return new Response(null, { status: 404 })
}

async function readActionBodyWithinLimit(request: Request): Promise<string | undefined> {
  if (request.body === null) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > MAX_SAGE_ACTION_BYTES) return undefined
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString('utf8')
}

function parseIntent(body: string): { type: 'retry' } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || record.type !== 'retry') return undefined
  return { type: 'retry' }
}
```

- [ ] **Step 4: 两套测试到绿 + typecheck**

Run: `cd apps/sage-shell && npx vitest run test/appservice-route-skeleton.spec.ts test/appservice-composition.spec.ts && npm run typecheck`
Expected: 全 pass；typecheck 0 error。

- [ ] **Step 5: firewall 转绿**

Run: `node scripts/gate.mjs`（仓根）→ 26/26 全绿（Task 1 空射程红由真实 .ts 解除）。

- [ ] **Step 6: Commit**

```bash
git add apps/sage-shell/src/appservice/ apps/sage-shell/test/appservice-route-skeleton.spec.ts apps/sage-shell/test/appservice-composition.spec.ts
git commit -m "feat(sage): appservice kernel with unavailable-first composition (WT-02D.0.1 D2/D3)"
```

---

### Task 3: main 侧 caller binding 接线

**Files:**
- Create: `apps/sage-shell/src/main/appservice-binding.ts`
- Test: `apps/sage-shell/test/appservice-binding.spec.ts`

**Interfaces:**
- Consumes: `isExactSageAppUrl`、`SAGE_APP_ORIGIN`（`../product/contracts.js`）；`FramePolicy.snapshot(): FramePolicyState`（`{ generation, contaminated }`）；Task 2 的 `CallerBinding` 类型。
- Produces: `verifySageServiceCaller(url: URL, request: Request, framePolicy: FramePolicy): CallerBinding | null`。

- [ ] **Step 1: 写失败测试**

`apps/sage-shell/test/appservice-binding.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { FramePolicy } from '../src/main/frame-policy.js'
import { verifySageServiceCaller } from '../src/main/appservice-binding.js'

const good = new URL('dsh-app://app/.sage/state')
const clean = new FramePolicy({ onContamination: () => {} })

function req(url: URL, origin?: string): Request {
  return new Request(url.toString(), { headers: origin === undefined ? {} : { origin } })
}

describe('verifySageServiceCaller', () => {
  it('非精确 sage URL → null', () => {
    expect(verifySageServiceCaller(new URL('dsh-app://evil/.sage/state'), req(good), clean)).toBeNull()
  })
  it('origin 不符 → null；缺省或相符 → non-null', () => {
    expect(verifySageServiceCaller(good, req(good, 'dsh-app://evil'), clean)).toBeNull()
    expect(verifySageServiceCaller(good, req(good), clean)?.correlation).toEqual(expect.any(String))
    expect(verifySageServiceCaller(good, req(good, 'dsh-app://app'), clean)).not.toBeNull()
  })
  it('contaminated generation → null（单帧事实 fail closed，ADR-0177 语义）', () => {
    const contaminated = new FramePolicy({ onContamination: () => {} })
    contaminated.notifyFrameCreated('probe')
    expect(verifySageServiceCaller(good, req(good), contaminated)).toBeNull()
  })
})
```

执行注：`notifyFrameCreated` 是占位名——执行时读 `apps/sage-shell/src/main/frame-policy.ts` 找「制造 `contaminated=true` 的最小公有入口」（如 frame-created 类观察方法）；若全私有，用 `FramePolicyState` 直造 stub 对象并让 `verifySageServiceCaller` 接受 `{ snapshot(): FramePolicyState }` 结构类型（比改 FramePolicy 可见性更小侵入——binding 签名相应放宽为该结构类型，测试直造 contaminated stub）。**禁止为测试扩大 FramePolicy 公有 API。**

Run: `cd apps/sage-shell && npx vitest run test/appservice-binding.spec.ts` → FAIL（模块不存在）。

- [ ] **Step 2: 实现 binding**

`apps/sage-shell/src/main/appservice-binding.ts`：

```ts
/** Main-owned caller binding for /.sage/* (spec §3.4, D4 wiring point). */
import { randomUUID } from 'node:crypto'
import { isExactSageAppUrl, SAGE_APP_ORIGIN } from '../product/contracts.js'
import type { FramePolicyState } from './frame-policy.js'
import type { CallerBinding } from '../appservice/contracts.js'

type FramePolicyLike = { snapshot(): FramePolicyState }

export function verifySageServiceCaller(url: URL, request: Request, framePolicy: FramePolicyLike): CallerBinding | null {
  if (!isExactSageAppUrl(url)) return null
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== SAGE_APP_ORIGIN) return null
  if (framePolicy.snapshot().contaminated) return null
  return { correlation: randomUUID() }
}
```

（`FramePolicyLike` 结构类型——真实 FramePolicy 天然满足；测试可直造 stub。）

- [ ] **Step 3: 测试到绿 + typecheck**

Run: `cd apps/sage-shell && npx vitest run test/appservice-binding.spec.ts && npm run typecheck` → 全 pass。

- [ ] **Step 4: Commit**

```bash
git add apps/sage-shell/src/main/appservice-binding.ts apps/sage-shell/test/appservice-binding.spec.ts
git commit -m "feat(sage): main-side caller binding wiring for appservice (WT-02D.0.1 D4)"
```

---

### Task 4: main/index.ts 接线 + fallback 双态

**Files:**
- Modify: `apps/sage-shell/src/main/index.ts:50-62`（protocol.handle 分流 + framePolicy 上移）
- Modify: `apps/sage-shell/src/appservice/route-skeleton.ts`（导出 `shouldUseAppService`）
- Test: `apps/sage-shell/test/appservice-fallback.spec.ts`

**Interfaces:**
- Consumes: Task 2 `handleSageServiceRequest`/`createUnavailableFirstService`/`shouldUseAppService`；Task 3 `verifySageServiceCaller`；`ShellHostProcess.currentSnapshot()`。
- Produces: main 分流接线（`SAGE_APP_SERVICE=off` 回退 Host）；`toSageViewState`（main 内 runtime 投影小函数）。

- [ ] **Step 1: 写失败测试（分流纯函数双态）**

`apps/sage-shell/test/appservice-fallback.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { shouldUseAppService } from '../src/appservice/route-skeleton.js'

describe('main 分流（D1）', () => {
  it('on 态：/.sage/* 走 appservice', () => {
    expect(shouldUseAppService('/.sage/state', true)).toBe(true)
    expect(shouldUseAppService('/.sage/actions', true)).toBe(true)
    expect(shouldUseAppService('/.sage/other', true)).toBe(true)
  })
  it('on 态：其余 pathname 不走 appservice', () => {
    expect(shouldUseAppService('/index.html', true)).toBe(false)
    expect(shouldUseAppService('/api', true)).toBe(false)
    expect(shouldUseAppService('/.dsh/x', true)).toBe(false)
    expect(shouldUseAppService('/.sagex', true)).toBe(false)
  })
  it('off 态：任何 pathname 都不走 appservice（回退 Host）', () => {
    expect(shouldUseAppService('/.sage/state', false)).toBe(false)
    expect(shouldUseAppService('/.sage/other', false)).toBe(false)
  })
})
```

Run: `cd apps/sage-shell && npx vitest run test/appservice-fallback.spec.ts` → FAIL（`shouldUseAppService` 未导出）。

- [ ] **Step 2: route-skeleton 导出分流函数**

`route-skeleton.ts` 追加：

```ts
/** D1 routing predicate: whether main handles this pathname via the app service. */
export function shouldUseAppService(pathname: string, appServiceEnabled: boolean): boolean {
  return appServiceEnabled && pathname.startsWith('/.sage/')
}
```

- [ ] **Step 3: main/index.ts 接线**

对 `main/index.ts` 做三处改动（保持其余逻辑与顺序语义不变）：

1. import 区加：`import { handleSageServiceRequest, createUnavailableFirstService, shouldUseAppService } from '../appservice/route-skeleton.js'`（composition 经 route-skeleton re-export 或直接 from `../appservice/composition.js`）与 `import { verifySageServiceCaller } from './appservice-binding.js'`。
2. `const framePolicy = new FramePolicy({...})` **上移**到 `protocol.handle` 注册之前（原在 handle 之后；只移声明不改构造参数与 onContamination 逻辑）。
3. `protocol.handle` 块改为：

```ts
const appServiceEnabled = process.env.SAGE_APP_SERVICE !== 'off'

protocol.handle(SCHEME, (request) => {
  const url = new URL(request.url)
  const route = routeSchemeRequest(url)
  if (route.target === 'reject') return Promise.resolve(new Response(null, { status: 404 }))
  if (shouldUseAppService(url.pathname, appServiceEnabled)) {
    const callerBinding = verifySageServiceCaller(url, request, framePolicy)
    const runtime = toSageViewState(host.currentSnapshot())
    return handleSageServiceRequest(request, {
      callerBinding,
      providers: createUnavailableFirstService(runtime),
    })
  }
  return host.fetch(request)
})
```

4. 同文件加 `toSageViewState`（模块级函数，不进 appservice——消费 main-owned snapshot 类型）：

```ts
import type { ShellHostRuntimeSnapshot } from './host-process.js'

function toSageViewState(snapshot: ShellHostRuntimeSnapshot): import('../product/contracts.js').SageViewState {
  if (snapshot.kind === 'active') {
    return { status: 'ready', message: `dsh ${snapshot.harnessVersion}`, retryable: true }
  }
  return { status: 'unavailable', message: snapshot.reason, retryable: snapshot.reason !== 'stopped' }
}
```

（import 类型按仓内风格置顶而非 inline `import()`——执行者按 tsc 最低摩擦形态写，语义不变：active→ready、unavailable→不可用+reason、stopped 不可 retry。）

- [ ] **Step 4: 测试到绿 + typecheck + sage-shell 全量**

Run: `cd apps/sage-shell && npx vitest run test/appservice-fallback.spec.ts && npm run typecheck && npm run test`
Expected: fallback 7 pass；typecheck 0 error；**全量 spec 全绿**（product-state/view-state/route/host-entry 等既有断言不破——D3「renderer 消费不破」在此兑现）。

- [ ] **Step 5: gate 复跑（接线后 appservice 仍纯净 + 26 项全绿）**

Run: `node scripts/gate.mjs`（仓根）→ 26/26。

- [ ] **Step 6: Commit**

```bash
git add apps/sage-shell/src/main/index.ts apps/sage-shell/src/appservice/route-skeleton.ts apps/sage-shell/test/appservice-fallback.spec.ts
git commit -m "feat(sage): main intercepts /.sage/* with SAGE_APP_SERVICE off-fallback (WT-02D.0.1 D1)"
```

---

### Task 5: 验收收口 + Note/ADR + 终验

**Files:**
- Create: `docs/notes/implemented/architecture/2026-10-01-wt02d01-main-sage-route-skeleton.md`
- Create: `docs/adr/ADR-0179.md`
- Modify: `docs/adr/README.md`（索引）、`docs/adr/decisions.json`（`node scripts/gates/adr-agent-records.mjs --write` 再生）

**Interfaces:**
- Consumes: Task 1–4 全部产物与读数。
- Produces: 仓规要求的决策留痕（Note 四节 + ADR-0179 + 索引/账本再生）与 spec §7 五条验收读数记录。

- [ ] **Step 1: spec §7 五条验收逐项实跑记读数**

1. contract 回归（on 态）：`cd apps/sage-shell && npm run test` 全绿（读数抄末行计数）。
2. contract 回归（off 态）：fallback.spec 的 off 断言 + 一次 off 态冒烟——`SAGE_APP_SERVICE=off` 下 `cd apps/sage-shell && npm run dev`（或仓内现有 smoke 手段）启动后观察 `/.sage/state` 经 Host 旧 handler 响应（devtools network 或日志行），如实记录用哪种手段、读到什么；若只能验证分流函数层，如实写「off 态实弹未跑，fallback.spec 断言为证」。
3. fail closed：composition spec 三断言读数（Task 2 已落，抄结果行）。
4. Host 只剩窄 port：fallback.spec on 态断言 + `grep -rn "host.fetch" apps/sage-shell/src/main/index.ts` 读数（确认只在非 `/.sage` 分支）。
5. 无 fixture fallback：`grep -rn "fixture" apps/sage-shell/src/appservice/` 零命中（读数为空输出）。

- [ ] **Step 2: 写 Note（四节齐全，仓规 ADR-0015）**

`docs/notes/implemented/architecture/2026-10-01-wt02d01-main-sage-route-skeleton.md`：

- `## Problem`：Host-owned `/.sage/*` 是 projection 泄漏与 action 越权的正门；revision 37 已定边界但源码未动。
- `## Decision`：五裁决 D1–D5（开关回退 / 纯函数内核 / state 双字段 / binding 接线位 / firewall gate）+ main 分流接线形态；验收读数引 Step 1。
- `## Alternatives considered`：B 直接切换 git-revert 回滚 / C 双写（违反唯一 owner）；内核 B 写死 main（无法静态守边界）/ C 独立子进程（0.1 无 provider 可隔离、0.2 增接缝）；binding B 完整 rev40 复刻（无对手方可验）；firewall B 仅测试不进门禁（知道≠拦住，P-03）。
- `## Consequences`：Host 旧 handler 暂留至 0.1 后收口；caller binding 完整度留 0.2（骨架期 403/继续二值）；gate 23→26 项（+firewall+selftest）。

- [ ] **Step 3: 写 ADR-0179 + 索引 + 账本再生**

- `docs/adr/ADR-0179.md`：仿仓内最近 ADR（如 ADR-0174）的格式——背景 / 决策（D1–D5 机器可读块 `## 机器可读决策` 含 decisions 数组）/ 备选 / 后果；状态 `accepted（2026-10-01）`；决策记录链到 Step 2 的 Note。
- `docs/adr/README.md` 索引加 ADR-0179 行。
- Run: `node scripts/gates/adr-agent-records.mjs --write`（decisions.json 再生）。
- Run: `node scripts/gate.mjs` → 26/26（adr-index/adr-note-links/adr-agent-records 三项须绿——Note↔ADR 双向链是硬校验）。

- [ ] **Step 4: 终验（全门禁 + L4 红线）**

Run: `node scripts/gate.mjs` → 26/26；`git status --porcelain=v1` 只含本票新增/修改文件；`git log --oneline -5` 显示本票 commit 序列。

- [ ] **Step 5: Commit（Note+ADR 单独成票）**

```bash
git add docs/notes/implemented/architecture/2026-10-01-wt02d01-main-sage-route-skeleton.md docs/adr/ADR-0179.md docs/adr/README.md docs/adr/decisions.json
git commit -m "docs(adr): ADR-0179 WT-02D.0.1 main-owned /.sage/* route skeleton with note"
```

---

## Self-Review 记录

1. **Spec 覆盖**：D1→Task 4（开关+分流+双态测试）；D2→Task 2（四文件+零 Electron）；D3→Task 2 composition + Task 4 Step 4 全量回归；D4→Task 3（binding+结构类型 stub 方案）；D5→Task 1（gate 两项+空射程红）；spec §7 五条验收→Task 5 Step 1 逐条。§6 明确不做→Global Constraints 与各票 Files 均未越界（Host handler 不删、command 顺序 2–10 不碰、fixture E2E 不做）。
2. **占位符**：Task 3 Step 1 的 `notifyFrameCreated` 已注明为占位名并给出结构类型替代方案（非留白）；其余代码块完整可执行。
3. **类型一致性**：`handleSageServiceRequest(request, deps)`、`createUnavailableFirstService(runtime)`、`verifySageServiceCaller(url, request, framePolicyLike)`、`shouldUseAppService(pathname, enabled)`、`CallerBinding={correlation}` 在 Task 2/3/4 引用处签名一致；`MAX_SAGE_ACTION_BYTES` 仅在 appservice/errors.ts 定义一处（adapter 同名常量不 import——内核不依赖 adapter）。