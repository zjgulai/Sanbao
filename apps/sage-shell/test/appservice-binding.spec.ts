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
    contaminated.onFrameCreated(false)
    expect(verifySageServiceCaller(good, req(good), contaminated)).toBeNull()
  })
})
