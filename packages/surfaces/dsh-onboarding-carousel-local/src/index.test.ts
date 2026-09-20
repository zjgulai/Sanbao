import { describe, expect, it } from 'vitest'
import { apply, inject, name } from './index.js'

type Schema = ((value: unknown) => unknown) & { toString(): string }

function capture() {
  const registered: { namespace: string; schema: Schema }[] = []
  apply({ settings: { register: (namespace: string, schema: unknown) => { registered.push({ namespace, schema: schema as Schema }) } } })
  return registered
}

describe('host entry', () => {
  it('declares the plugin id and the settings service it needs', () => {
    expect(name).toBe('dsh-onboarding-carousel')
    expect(inject).toEqual(['settings'])
  })

  it('registers exactly one namespace for its own acknowledgement', () => {
    const registered = capture()
    expect(registered).toHaveLength(1)
    expect(registered[0]?.namespace).toBe('sanbao-onboarding')
  })

  it('accepts an empty section and rejects a non-string version', () => {
    const schema = capture()[0]?.schema
    expect(schema).toBeDefined()
    expect(() => schema?.({})).not.toThrow()
    expect(() => schema?.({ introVersion: '2026-09-20.1' })).not.toThrow()
    expect(() => schema?.({ introVersion: 3 })).toThrow()
  })
})
