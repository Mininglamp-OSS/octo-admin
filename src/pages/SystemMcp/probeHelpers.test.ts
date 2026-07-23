/**
 * Unit coverage for the two probe-related pure helpers used by the system-MCP
 * wizard's "试连 / 获取工具列表" button (see FormModal.tsx#handleProbe).
 *
 * The wizard itself is an antd Modal + form and drags in JSDOM + antd —
 * neither adds signal here. The branches that actually regress live in
 * probeHelpers: payload assembly for stdio vs remote, and error-code → i18n
 * resolution with wire-message fallback. Testing those pure functions is
 * enough to catch every observed shape of failure the button has shipped
 * with so far.
 */

import { describe, expect, it } from 'vitest'
import type { McpProbeResponse } from '../../api/mcp'
import {
  buildProbeRequest,
  resolveProbeErrorMessage,
  type TFn,
} from './probeHelpers'

/** Fake i18n resolver: returns the value from a lookup table, or the option's
 *  defaultValue if the key is unknown, or the raw key as a last resort — same
 *  behaviour as react-i18next's `t()` in dev. Keeps tests independent from
 *  the actual JSON locales. */
function makeT(table: Record<string, string>): TFn {
  return (key, opts) => {
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key]
    if (opts?.defaultValue != null) return opts.defaultValue
    return key
  }
}

describe('buildProbeRequest', () => {
  it('returns null for stdio (server cannot probe local commands)', () => {
    const req = buildProbeRequest({
      transport: 'stdio',
      url: '',
      headers: {},
    })
    expect(req).toBeNull()
  })

  it('returns null when URL is empty or whitespace', () => {
    expect(
      buildProbeRequest({
        transport: 'streamable-http',
        url: '',
        headers: {},
      }),
    ).toBeNull()
    expect(
      buildProbeRequest({
        transport: 'sse',
        url: '   ',
        headers: {},
      }),
    ).toBeNull()
  })

  it('assembles a streamable-http payload with trimmed URL and no headers', () => {
    const req = buildProbeRequest({
      transport: 'streamable-http',
      url: '  https://mcp.example.com/x  ',
      headers: {},
    })
    expect(req).toEqual({
      transport: 'streamable-http',
      url: 'https://mcp.example.com/x',
      headers: undefined,
    })
  })

  it('passes the caller-supplied headers map through verbatim', () => {
    // The wizard resolves KvEditor rows into a plain map before calling
    // probe — probe is off-record, so real credentials go on the wire even
    // for user-supplied slots (otherwise the handshake fails auth). No
    // parsing / no user_supplied classification lives here.
    const req = buildProbeRequest({
      transport: 'sse',
      url: 'https://example.test/mcp',
      headers: { Authorization: 'Bearer real', 'X-Custom': 'hello' },
    })
    expect(req).not.toBeNull()
    expect(req?.headers).toEqual({
      Authorization: 'Bearer real',
      'X-Custom': 'hello',
    })
  })

  it('sets headers=undefined when the map is empty', () => {
    const req = buildProbeRequest({
      transport: 'sse',
      url: 'https://example.test/mcp',
      headers: {},
    })
    expect(req).not.toBeNull()
    expect(req?.headers).toBeUndefined()
  })

  it('never surfaces unknown fields on the wire (DisallowUnknownFields guard)', () => {
    // Regression: service.ProbeRequest declares only transport/url/command/
    // args/env/headers, and the handler decodes with DisallowUnknownFields.
    // Anything else — including the retired auth_type / probeBearer — would
    // 400 "request body is not valid JSON".
    const req = buildProbeRequest({
      transport: 'sse',
      url: 'https://example.test/mcp',
      headers: { Authorization: 'Bearer x' },
    })
    expect(req).not.toBeNull()
    expect(Object.keys(req ?? {}).sort()).toEqual(['headers', 'transport', 'url'])
  })
})

describe('resolveProbeErrorMessage', () => {
  const t = makeT({
    'form.probeFailed': '探测失败',
    'form.probeError.init_failed': '连接配置不完整，无法探测工具列表。',
    'form.probeError.timeout': '探测超时，请稍后重试。',
  })

  const respWith = (
    error: Partial<NonNullable<McpProbeResponse['error']>> | undefined,
  ): McpProbeResponse => ({
    is_ok: false,
    tools: [],
    error,
  })

  it('uses the i18n string for a known error code', () => {
    expect(
      resolveProbeErrorMessage(respWith({ code: 'init_failed' }), t),
    ).toBe('连接配置不完整，无法探测工具列表。')
  })

  it('prefers the wire message for an unknown error code (defaultValue path)', () => {
    expect(
      resolveProbeErrorMessage(
        respWith({ code: 'foo', message: 'raw wire text' }),
        t,
      ),
    ).toBe('raw wire text')
  })

  it('falls back to generic probeFailed when both code and message are absent', () => {
    expect(resolveProbeErrorMessage(respWith(undefined), t)).toBe('探测失败')
    expect(resolveProbeErrorMessage(respWith({}), t)).toBe('探测失败')
  })

  it('uses wire message when no code is set (legacy envelope)', () => {
    expect(
      resolveProbeErrorMessage(respWith({ message: 'server said no' }), t),
    ).toBe('server said no')
  })

  it('unknown code + no wire message → generic fallback', () => {
    expect(
      resolveProbeErrorMessage(respWith({ code: 'foo' }), t),
    ).toBe('探测失败')
  })
})
