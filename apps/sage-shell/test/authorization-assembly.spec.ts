import { describe, expect, it } from 'vitest'
import type { SageActionIntentV2 } from '../src/appservice/command-contracts.js'
import { ACTION_AUTHORITY_TABLE } from '../src/main/action-authority-table.js'
import { assembleAuthorizationRequest } from '../src/main/authorization-assembly.js'

const INTENT: SageActionIntentV2 = {
  matterId: 'matter:demo',
  revisionId: 'revision:demo.1',
  actionType: 'start-attempt',
  actionScope: 'revision',
  payload: { note: 'go' },
  origin: 'renderer-action',
}

describe('action authority table (WT-02D.2A)', () => {
  it('freezes the registered table and keeps every entry’s mapping pinned', () => {
    // The table grew from the fixture-anchored v1 entry to a second, custody-side entry
    // (ADR-0201). The pin stays exact on purpose: a new action type must be a deliberate edit here.
    expect(Object.keys(ACTION_AUTHORITY_TABLE)).toEqual(['start-attempt', 'create-matter'])
    expect(ACTION_AUTHORITY_TABLE['start-attempt']).toEqual({
      requiredRoleRef: 'role:owner',
      operation: 'start-attempt',
      actionScope: 'shopify.orders.read',
      effectClass: 'external-read',
      requiresDecision: true,
    })
    expect(ACTION_AUTHORITY_TABLE['create-matter']).toEqual({
      requiredRoleRef: 'role:owner',
      operation: 'create-matter',
      actionScope: 'matter.create',
      effectClass: 'external-write',
      requiresDecision: false,
    })
    expect(Object.isFrozen(ACTION_AUTHORITY_TABLE)).toBe(true)
    expect(Object.isFrozen(ACTION_AUTHORITY_TABLE['start-attempt'])).toBe(true)
    expect(Object.isFrozen(ACTION_AUTHORITY_TABLE['create-matter'])).toBe(true)
  })
})

describe('authorization assembly (WT-02D.2A)', () => {
  it('assembles the kernel request from intent, session ref and organization clue', () => {
    expect(assembleAuthorizationRequest({
      intent: INTENT,
      sessionRef: 'session-ref-1',
      organizationRef: 'organization:sage',
    })).toEqual({
      kind: 'request',
      request: {
        sessionId: 'session-ref-1',
        requiredRoleRef: 'role:owner',
        operation: 'start-attempt',
        actionPolicy: { actionScope: 'shopify.orders.read', effectClass: 'external-read', requiresDecision: true },
        requestedOrganizationRef: 'organization:sage',
      },
    })
  })

  it('marks an unregistered action type invalid (unknown actions must not reach evaluation)', () => {
    expect(assembleAuthorizationRequest({
      intent: { ...INTENT, actionType: 'answer-clarification' },
      sessionRef: 'session-ref-1',
      organizationRef: 'organization:sage',
    })).toEqual({ kind: 'invalid' })
  })

  it('marks a missing session ref or organization clue unavailable', () => {
    expect(assembleAuthorizationRequest({
      intent: INTENT,
      sessionRef: null,
      organizationRef: 'organization:sage',
    })).toEqual({ kind: 'unavailable' })
    expect(assembleAuthorizationRequest({
      intent: INTENT,
      sessionRef: 'session-ref-1',
      organizationRef: null,
    })).toEqual({ kind: 'unavailable' })
  })

  it('uses the injected table when provided and never mutates its inputs', () => {
    const table = {
      'demo-action': {
        requiredRoleRef: 'role:demo',
        operation: 'demo-op',
        actionScope: 'demo.scope',
        effectClass: 'local-read' as const,
        requiresDecision: false,
      },
    }
    const intent = { ...INTENT, actionType: 'demo-action' }
    const before = structuredClone({ table, intent })

    const assembled = assembleAuthorizationRequest({ intent, sessionRef: 's-ref', organizationRef: 'organization:x', table })

    expect(assembled.kind).toBe('request')
    if (assembled.kind !== 'request') throw new Error('Expected an assembled request.')
    expect(assembled.request.requiredRoleRef).toBe('role:demo')
    expect(assembled.request.actionPolicy).toEqual({ actionScope: 'demo.scope', effectClass: 'local-read', requiresDecision: false })
    expect({ table, intent }).toEqual(before)
  })
})
