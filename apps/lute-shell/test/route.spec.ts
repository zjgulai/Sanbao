import { describe, expect, it } from 'vitest'
import { routeSchemeRequest } from '../src/main/route.js'

describe('routeSchemeRequest', () => {
  it('serves the app hostname and rejects every other one', () => {
    expect(routeSchemeRequest(new URL('dsh-app://app/index.html'))).toEqual({ target: 'app' })
    expect(routeSchemeRequest(new URL('dsh-app://shell/plugin-manager.html'))).toEqual({ target: 'reject' })
    expect(routeSchemeRequest(new URL('dsh-app://evil/index.html'))).toEqual({ target: 'reject' })
  })
})
