import { describe, expect, it } from 'vitest'
import {
  FRAME_HEADER_BYTES,
  FRAME_MAGIC,
  HostRequestDecoder,
  HostResponseDecoder,
  MAX_CONTROL_PAYLOAD_BYTES,
  SHELL_PIPE_CHUNK_BYTES,
  encodeRequestCancel,
  encodeRequestData,
  encodeRequestEnd,
  encodeRequestStart,
  encodeResponseData,
  encodeResponseEnd,
  encodeResponseError,
  encodeResponseStart,
  isHostCommand,
  isHostEvent,
} from '../src/protocol.js'

const start = {
  url: 'dsh-app://app/index.html',
  method: 'GET',
  headers: [['accept', 'text/html']] as readonly [string, string][],
  hasBody: false,
}

describe('frame header', () => {
  it('writes the 13-byte DSH3 header', () => {
    const frame = encodeRequestEnd(7)
    expect(frame.byteLength).toBe(FRAME_HEADER_BYTES)
    expect(frame.readUInt32BE(0)).toBe(FRAME_MAGIC)
    expect(frame.readUInt8(4)).toBe(3)
    expect(frame.readUInt32BE(5)).toBe(7)
    expect(frame.readUInt32BE(9)).toBe(0)
  })

  it('rejects a stream id outside 1..0xffffffff', () => {
    expect(() => encodeRequestEnd(0)).toThrow(/invalid pipe stream id/u)
    expect(() => encodeRequestEnd(0x1_0000_0000)).toThrow(/invalid pipe stream id/u)
    expect(() => encodeRequestEnd(1.5)).toThrow(/invalid pipe stream id/u)
  })

  it('rejects an oversized control payload but allows a full data chunk', () => {
    expect(() => encodeResponseError(1, 'x'.repeat(MAX_CONTROL_PAYLOAD_BYTES)))
      .toThrow(/exceeds the \d+-byte limit/u)
    expect(encodeRequestData(1, new Uint8Array(SHELL_PIPE_CHUNK_BYTES)).byteLength)
      .toBe(FRAME_HEADER_BYTES + SHELL_PIPE_CHUNK_BYTES)
    expect(() => encodeRequestData(1, new Uint8Array(SHELL_PIPE_CHUNK_BYTES + 1)))
      .toThrow(/exceeds the \d+-byte limit/u)
  })
})

describe('request round trip', () => {
  it('decodes start, data, end and cancel in pipe order', () => {
    const decoder = new HostRequestDecoder()
    const bytes = Buffer.concat([
      encodeRequestStart(1, start),
      encodeRequestData(1, Buffer.from('ab')),
      encodeRequestEnd(1),
      encodeRequestCancel(2),
    ])
    expect(decoder.push(bytes)).toEqual([
      { type: 'start', streamId: 1, ...start },
      { type: 'data', streamId: 1, data: Buffer.from('ab') },
      { type: 'end', streamId: 1 },
      { type: 'cancel', streamId: 2 },
    ])
    expect(() => decoder.finish()).not.toThrow()
  })

  it('holds a frame split across chunks', () => {
    const decoder = new HostRequestDecoder()
    const bytes = encodeRequestStart(3, start)
    expect(decoder.push(bytes.subarray(0, 6))).toEqual([])
    expect(decoder.push(bytes.subarray(6, FRAME_HEADER_BYTES + 2))).toEqual([])
    expect(decoder.push(bytes.subarray(FRAME_HEADER_BYTES + 2))).toHaveLength(1)
  })

  it('rejects a bad magic', () => {
    const badMagic = encodeRequestEnd(1)
    badMagic.writeUInt32BE(0xdead_beef, 0)
    expect(() => new HostRequestDecoder().push(badMagic)).toThrow(/frame marker/u)
  })

  it('rejects an unknown frame type', () => {
    const badType = encodeRequestEnd(1)
    badType.writeUInt8(9, 4)
    expect(() => new HostRequestDecoder().push(badType)).toThrow(/request frame type 9/u)
  })

  it('rejects a payload on an end frame', () => {
    const padded = encodeRequestEnd(1)
    padded.writeUInt32BE(1, 9)
    expect(() => new HostRequestDecoder().push(Buffer.concat([padded, Buffer.from('x')])))
      .toThrow(/end frame carried a payload/u)
  })

  it('rejects an EOF that splits a frame', () => {
    const split = new HostRequestDecoder()
    split.push(encodeRequestStart(1, start).subarray(0, 4))
    expect(() => split.finish()).toThrow(/ended inside a frame/u)
  })

  it('rejects a start payload that is not a well-formed request', () => {
    const payload = Buffer.from(JSON.stringify({ url: 1, method: 'GET', headers: [], hasBody: false }))
    const header = encodeRequestStart(1, start).subarray(0, FRAME_HEADER_BYTES)
    header.writeUInt32BE(payload.byteLength, 9)
    expect(() => new HostRequestDecoder().push(Buffer.concat([header, payload])))
      .toThrow(/request start payload/u)
  })
})

describe('response round trip', () => {
  it('decodes a complete body-bearing response', () => {
    const frames = new HostResponseDecoder().push(Buffer.concat([
      encodeResponseStart(4, { status: 200, headers: [['content-type', 'text/html']], hasBody: true }),
      encodeResponseData(4, Buffer.from('<!doctype html>')),
      encodeResponseEnd(4),
    ]))
    expect(frames).toEqual([
      { type: 'start', streamId: 4, status: 200, headers: [['content-type', 'text/html']], hasBody: true },
      { type: 'data', streamId: 4, data: Buffer.from('<!doctype html>') },
      { type: 'end', streamId: 4 },
    ])
  })

  it('decodes an error frame', () => {
    expect(new HostResponseDecoder().push(encodeResponseError(5, 'boom')))
      .toEqual([{ type: 'error', streamId: 5, message: 'boom' }])
  })

  it('rejects an out-of-range status', () => {
    const payload = Buffer.from(JSON.stringify({ status: 42, headers: [], hasBody: false }))
    const header = encodeResponseStart(5, { status: 200, headers: [], hasBody: false }).subarray(0, FRAME_HEADER_BYTES)
    header.writeUInt32BE(payload.byteLength, 9)
    expect(() => new HostResponseDecoder().push(Buffer.concat([header, payload])))
      .toThrow(/response start payload/u)
  })
})

describe('ipc guards', () => {
  it('accepts only the shutdown command', () => {
    expect(isHostCommand({ type: 'shutdown' })).toBe(true)
    expect(isHostCommand({ type: 'restart' })).toBe(false)
    expect(isHostCommand(null)).toBe(false)
  })

  it('accepts ready and fatal events only at the current protocol version', () => {
    expect(isHostEvent({ type: 'ready', protocolVersion: 3, dshVersion: '0.1.5-rc.2' })).toBe(true)
    expect(isHostEvent({ type: 'ready', protocolVersion: 2, dshVersion: '0.1.5-rc.2' })).toBe(false)
    expect(isHostEvent({ type: 'fatal', message: 'x' })).toBe(true)
    expect(isHostEvent({ type: 'fatal' })).toBe(false)
  })
})
