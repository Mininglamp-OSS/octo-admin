/**
 * Unit coverage for the two probe-related pure helpers used by the system-MCP
 * wizard's "试连 / 获取工具列表" button (see FormModal.tsx#handleProbe).
 *
 * The wizard itself is an antd Modal + form and drags in JSDOM + antd —
 * neither adds signal here. The branches that actually regress live in
 * probeHelpers: payload assembly for stdio vs remote, header block parsing,
 * and error-code → i18n resolution with wire-message fallback. Testing those
 * pure functions is enough to catch every observed shape of failure the
 * button has shipped with so far.
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
      authType: 'none',
      headersRaw: '',
    })
    expect(req).toBeNull()
  })

  it('returns null when URL is empty or whitespace', () => {
    expect(
      buildProbeRequest({
        transport: 'streamable-http',
        url: '',
        authType: 'none',
        headersRaw: '',
      }),
    ).toBeNull()
    expect(
      buildProbeRequest({
        transport: 'sse',
        url: '   ',
        authType: 'bearer',
        headersRaw: '',
      }),
    ).toBeNull()
  })

  it('assembles a streamable-http payload with trimmed URL and no headers', () => {
    const req = buildProbeRequest({
      transport: 'streamable-http',
      url: '  https://mcp.example.com/x  ',
      authType: 'none',
      headersRaw: '',
    })
    expect(req).toEqual({
      transport: 'streamable-http',
      url: 'https://mcp.example.com/x',
      headers: undefined,
    })
  })

  it('never puts authType on the wire (backend rejects unknown fields)', () => {
    // Regression: service.ProbeRequest doesn't declare authType and the
    // handler decodes with DisallowUnknownFields — so including it makes
    // the request come back 400 "request body is not valid JSON". A Bearer
    // token, when set, rides on headers.Authorization instead.
    const req = buildProbeRequest({
      transport: 'sse',
      url: 'https://example.test/mcp',
      authType: 'bearer',
      headersRaw: 'Authorization: Bearer secret',
    })
    expect(req).not.toBeNull()
    expect(req).not.toHaveProperty('authType')
    expect(req?.headers).toEqual({ Authorization: 'Bearer secret' })
  })

  it('parses the headers textarea (Header-Name: value per line)', () => {
    const req = buildProbeRequest({
      transport: 'sse',
      url: 'https://mcp.example.com/x',
      authType: 'bearer',
      headersRaw:
        'Authorization: Bearer abc\n  X-Custom : hello world  \n\ninvalid-no-colon-line\n:missing-key',
    })
    // Blank lines, lines without a colon, and lines with an empty key are
    // dropped. The colon separator is the FIRST occurrence, so values may
    // themselves contain colons (URLs, etc.).
    expect(req?.headers).toEqual({
      Authorization: 'Bearer abc',
      'X-Custom': 'hello world',
    })
  })

  it('sets headers=undefined when the parsed map is empty', () => {
    const req = buildProbeRequest({
      transport: 'sse',
      url: 'https://example.test/mcp',
      authType: 'none',
      headersRaw: '\n\n  \n', // whitespace only
    })
    expect(req).not.toBeNull()
    expect(req?.headers).toBeUndefined()
  })

  it('injects ephemeral probeBearer as Authorization when authType=bearer', () => {
    // The "试连密钥（不保存）" input feeds an ephemeral token used only for
    // this probe call. It overrides whatever Authorization is in headersRaw
    // — typically the SECRET_PLACEHOLDER sentinel — because the operator's
    // just-typed token is the more explicit signal. Never persisted.
    const req = buildProbeRequest({
      transport: 'streamable-http',
      url: 'https://mcp.example.com/x',
      authType: 'bearer',
      headersRaw: 'Authorization: __OCTO_SECRET_PLACEHOLDER__\nX-Custom: v',
      probeBearer: 'real-token',
    })
    expect(req?.headers).toEqual({
      Authorization: 'Bearer real-token',
      'X-Custom': 'v',
    })
  })

  it('ignores probeBearer when authType is not bearer', () => {
    const req = buildProbeRequest({
      transport: 'streamable-http',
      url: 'https://mcp.example.com/x',
      authType: 'none',
      headersRaw: '',
      probeBearer: 'real-token',
    })
    expect(req?.headers).toBeUndefined()
  })

  it('ignores whitespace-only probeBearer', () => {
    const req = buildProbeRequest({
      transport: 'sse',
      url: 'https://mcp.example.com/x',
      authType: 'bearer',
      headersRaw: '',
      probeBearer: '   ',
    })
    expect(req?.headers).toBeUndefined()
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
    ok: false,
    tools: [],
    error,
  })

  it('uses the i18n string for a known error code', () => {
    expect(
      resolveProbeErrorMessage(respWith({ code: 'init_failed' }), t),
    ).toBe('连接配置不完整，无法探测工具列表。')
  })

  it('prefers the wire message for an unknown error code (defaultValue path)', () => {
    // `form.probeError.foo` is not in the table, so t() falls through to the
    // caller's defaultValue — which is the wire message when present.
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
    // Guards against surfacing a raw i18n key like "form.probeError.foo" in
    // the UI when neither translation nor wire message is available.
    expect(
      resolveProbeErrorMessage(respWith({ code: 'foo' }), t),
    ).toBe('探测失败')
  })
})
