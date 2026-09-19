import { describe, expect, it } from 'vitest'
import { routeRequest } from '../src/host/index.js'

describe('routeRequest', () => {
  it('sends the stream endpoint, the API prefix and everything else to their handlers', () => {
    expect(routeRequest('/.dsh/remote-stream')).toBe('stream')
    expect(routeRequest('/api/session/list')).toBe('api')
    expect(routeRequest('/api')).toBe('assets')
    expect(routeRequest('/index.html')).toBe('assets')
    expect(routeRequest('/plugins/dsh-client-ui-chat.js')).toBe('assets')
    expect(routeRequest('/')).toBe('assets')
  })
})
