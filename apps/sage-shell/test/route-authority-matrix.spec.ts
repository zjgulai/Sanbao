import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Classification = 'read-only' | 'local-preference' | 'local-system' | 'protected-effect' | 'unsupported'

interface RouteAuthorityRow {
  readonly sourceConstant: string
  readonly path: string
  readonly method: 'GET' | 'POST'
  readonly classification: Classification
  readonly policyProfile: string
  readonly operations: readonly string[]
  readonly callerBinding: 'CB1'
  readonly activeContext: string
  readonly providers: readonly string[]
  readonly persistence: string
  readonly runtimeLevel: string
  readonly runCommand: { readonly required: boolean, readonly actual: boolean }
  readonly protectedAdmission?: { readonly required: boolean, readonly actual: boolean }
  readonly sourceReadAdmission?: { readonly required: boolean, readonly actual: boolean }
  readonly contextSelection?: { readonly required: boolean, readonly actual: boolean }
  readonly localSystemAdmission?: { readonly required: boolean, readonly actual: boolean }
  readonly unsupportedOperations: readonly string[]
  readonly currentAuthority: { readonly status: 'compliant' | 'partial' | 'violation' | 'unsupported', readonly mode: string }
}

interface RouteAuthorityMatrix {
  readonly schemaVersion: number
  readonly sourceCommit: string
  readonly denominator: { readonly expected: number, readonly sourcePath: string, readonly constantPattern: string }
  readonly callerBindings: {
    readonly CB1: { readonly status: string, readonly symbol: string, readonly checks: readonly string[], readonly missing: readonly string[] }
  }
  readonly routes: readonly RouteAuthorityRow[]
}

const matrix = JSON.parse(readFileSync(new URL('../src/appservice/route-authority-matrix.json', import.meta.url), 'utf8')) as RouteAuthorityMatrix

describe('route authority truth matrix', () => {
  it('pins the full 60-route denominator and five policy classes', () => {
    expect(matrix.schemaVersion).toBe(1)
    expect(matrix.sourceCommit).toBe('eeff8967190815c7b5018f7d11b748818d487d37')
    expect(matrix.denominator).toEqual({
      expected: 60,
      sourcePath: 'apps/sage-shell/src/appservice/route-skeleton.ts',
      constantPattern: '^const SAGE_.*_PATH',
    })
    expect(matrix.routes).toHaveLength(60)
    expect(new Set(matrix.routes.map((route) => route.path)).size).toBe(60)
    expect(new Set(matrix.routes.map((route) => route.sourceConstant)).size).toBe(60)
    expect(Object.fromEntries(['read-only', 'local-preference', 'local-system', 'protected-effect', 'unsupported'].map((classification) => [
      classification,
      matrix.routes.filter((route) => route.classification === classification).length,
    ]))).toEqual({ 'read-only': 13, 'local-preference': 5, 'local-system': 2, 'protected-effect': 38, unsupported: 2 })
  })

  it('records every authority dimension instead of treating route presence as authority', () => {
    for (const route of matrix.routes) {
      expect(route.sourceConstant).toMatch(/^SAGE_[A-Z0-9_]+_PATH$/)
      expect(route.path).toMatch(/^\/\.sage\//)
      expect(['GET', 'POST']).toContain(route.method)
      expect(route.policyProfile).not.toBe('')
      expect(route.operations.length).toBeGreaterThan(0)
      expect(route.callerBinding).toBe('CB1')
      expect(route.activeContext).not.toBe('')
      expect(route.providers.length).toBeGreaterThan(0)
      expect(route.persistence).not.toBe('')
      expect(route.runtimeLevel).not.toBe('')
      expect(typeof route.runCommand.required).toBe('boolean')
      expect(typeof route.runCommand.actual).toBe('boolean')
      expect(route.currentAuthority.mode).not.toBe('')
    }
  })

  it('keeps CB1 partial and names the absent trust dimensions', () => {
    expect(matrix.callerBindings.CB1.status).toBe('partial')
    expect(matrix.callerBindings.CB1.symbol).toBe('verifySageServiceCaller')
    expect(matrix.callerBindings.CB1.checks).toEqual([
      'exact-sage-app-url',
      'origin-if-present',
      'frame-not-contaminated',
    ])
    expect(matrix.callerBindings.CB1.missing).toEqual([
      'origin-required',
      'frame-ready',
      'active-session',
      'read-policy',
    ])
  })

  it('records two runCommand routes, thirteen admitted protected routes, one source-read-admitted route, one context selection route, and 22 remaining bypasses', () => {
    const protectedRoutes = matrix.routes.filter((route) => route.classification === 'protected-effect')
    const throughRunCommand = protectedRoutes.filter((route) => route.runCommand.actual)
    const throughProtectedAdmission = protectedRoutes.filter((route) => route.protectedAdmission?.actual === true)
    const throughContextSelection = protectedRoutes.filter((route) => route.contextSelection?.actual === true)
    const bypasses = protectedRoutes.filter((route) => route.currentAuthority.status === 'violation')
    expect(throughRunCommand.map((route) => route.path).sort()).toEqual(['/.sage/actions', '/.sage/draft/convert'])
    expect(throughRunCommand.every((route) => route.currentAuthority.status === 'compliant')).toBe(true)
    expect(throughProtectedAdmission.map((route) => route.path).sort()).toEqual([
      '/.sage/attachments/cancel',
      '/.sage/attachments/upload',
      '/.sage/corrections',
      '/.sage/session/approval-answer',
      '/.sage/session/approval-withdraw',
      '/.sage/session/clarification-answer',
      '/.sage/session/edits',
      '/.sage/session/pending',
      '/.sage/session/plan-mode',
      '/.sage/session/queue',
      '/.sage/session/resume',
      '/.sage/session/send',
      '/.sage/session/stop',
    ])
    expect(throughProtectedAdmission.every((route) =>
      !route.runCommand.required
      && route.protectedAdmission?.required === true
      && route.currentAuthority.mode === 'protected-effect-admission-unavailable-first')).toBe(true)
    expect(throughContextSelection.map((route) => route.path)).toEqual(['/.sage/context/select'])
    expect(throughContextSelection.every((route) =>
      !route.runCommand.required
      && route.contextSelection?.required === true
      && route.currentAuthority.mode === 'active-context-selection-unavailable-first')).toBe(true)
    expect(bypasses).toHaveLength(22)
    expect(bypasses.every((route) => route.runCommand.required && route.currentAuthority.status === 'violation')).toBe(true)
    expect(bypasses.filter((route) => route.currentAuthority.mode === 'direct-provider-bypass')).toHaveLength(16)
    expect(matrix.routes.find((route) => route.path === '/.sage/edit-drafts/create')).toMatchObject({
      sourceReadAdmission: { required: true, actual: true },
      currentAuthority: { status: 'violation', mode: 'protected-effect-source-read-admitted' },
    })
  })

  it('records the local-system bootstrap route as admitted while keeping its facts device-local', () => {
    const bootstrap = matrix.routes.find((route) => route.path === '/.sage/bootstrap')
    expect(bootstrap).toMatchObject({
      classification: 'local-system',
      policyProfile: 'local-system',
      operations: ['read'],
      providers: ['bootstrapRead'],
      runCommand: { required: false, actual: false },
      localSystemAdmission: { required: true, actual: true },
      currentAuthority: {
        status: 'compliant',
        mode: 'local-system-admission-unavailable-first',
      },
    })
  })

  it('records attachment cancel as admitted while keeping pick on its distinct authority boundary', () => {
    const byPath = new Map(matrix.routes.map((route) => [route.path, route]))
    expect(byPath.get('/.sage/attachments/cancel')).toMatchObject({
      classification: 'protected-effect',
      policyProfile: 'business-command',
      operations: ['cancel'],
      providers: ['cancelAttachment'],
      persistence: 'none; production dispatch is withheld after admission',
      runCommand: { required: false, actual: false },
      protectedAdmission: { required: true, actual: true },
      currentAuthority: {
        status: 'compliant',
        mode: 'protected-effect-admission-unavailable-first',
      },
    })
    expect(byPath.get('/.sage/attachments/cancel')?.activeContext).toContain('itemId is an opaque clue')
    expect(byPath.get('/.sage/attachments/pick')).toMatchObject({
      operations: ['pick'],
      runCommand: { required: true, actual: false },
      currentAuthority: { status: 'violation', mode: 'direct-provider-bypass' },
    })
  })

  it('records attachment upload as admitted while keeping renderer scope fields non-authoritative', () => {
    const upload = matrix.routes.find((route) => route.path === '/.sage/attachments/upload')
    expect(upload).toMatchObject({
      classification: 'protected-effect',
      policyProfile: 'business-command',
      operations: ['upload'],
      activeContext: 'request matterRef is a candidate only; itemId is an opaque clue and renderer workspaceRoot is not authority',
      providers: ['uploadAttachment'],
      persistence: 'none; production dispatch is withheld after admission',
      runCommand: { required: false, actual: false },
      protectedAdmission: { required: true, actual: true },
      currentAuthority: {
        status: 'compliant',
        mode: 'protected-effect-admission-unavailable-first',
      },
    })
  })

  it('records correction submit as admitted while keeping renderer scope fields non-authoritative', () => {
    const correction = matrix.routes.find((route) => route.path === '/.sage/corrections')
    expect(correction).toMatchObject({
      classification: 'protected-effect',
      policyProfile: 'business-command',
      operations: ['submit'],
      activeContext: 'request matterRef is a candidate only; renderer workspaceRoot is not authority',
      providers: ['submitCorrection'],
      runCommand: { required: false, actual: false },
      protectedAdmission: { required: true, actual: true },
      currentAuthority: {
        status: 'compliant',
        mode: 'protected-effect-admission-unavailable-first',
      },
    })
  })

  it('does not flatten mixed or unsupported operations into a green route label', () => {
    const byPath = new Map(matrix.routes.map((route) => [route.path, route]))
    expect(byPath.get('/.sage/feedback')).toMatchObject({
      classification: 'unsupported',
      policyProfile: 'mixed-read-unsupported',
      unsupportedOperations: ['submit'],
    })
    expect(byPath.get('/.sage/edit-drafts/writeback')).toMatchObject({
      classification: 'unsupported',
      unsupportedOperations: ['writeback'],
    })
    expect(byPath.get('/.sage/matter-admin')).toMatchObject({
      classification: 'protected-effect',
      policyProfile: 'mixed-protected-unsupported',
      unsupportedOperations: ['rename'],
    })
    expect(byPath.get('/.sage/plans')).toMatchObject({
      classification: 'protected-effect',
      policyProfile: 'mixed-protected-prepare-unsupported',
      unsupportedOperations: ['execute-step'],
    })
  })
})
