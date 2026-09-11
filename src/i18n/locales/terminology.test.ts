import { describe, expect, it } from 'vitest'

// 产品术语「空间 / Space」已统一改称「组织 / Organization」。这里守的是术语而不是某几个
// 字符串:新增文案时只要又写回「空间」,断言会连 key 一起报出来,不用靠人工 review 兜底。
const bundles = import.meta.glob<Record<string, unknown>>('./*/*.json', {
  eager: true,
  import: 'default',
})

// 刻意保留英文原词的位置:要么是与后端字段一一对应的标识(排查问题时要能对上 space_id),
// 要么 space 取的是「空白符」义项,跟产品术语无关。
const ALLOWED = new Set([
  'zh-CN/spaces.json#column.spaceId',
  'en-US/spaces.json#column.spaceId',
  'zh-CN/appBots.json#detail.scope.space',
  'en-US/appBots.json#detail.scope.space',
  'en-US/spaces.json#members.addModal.field.extra',
  'en-US/groups.json#remove.field.extra',
  'en-US/systemMcp.json#form.argsHint',
])

function* entries(node: unknown, prefix = ''): Generator<[string, string]> {
  if (typeof node === 'string') {
    yield [prefix, node]
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) {
      yield* entries(child, prefix ? `${prefix}.${key}` : key)
    }
  }
}

function offenders(lang: string, isLegacy: (value: string) => boolean): string[] {
  const hits: string[] = []
  for (const [path, bundle] of Object.entries(bundles)) {
    const file = path.replace(/^\.\//, '')
    if (!file.startsWith(`${lang}/`)) continue
    for (const [key, value] of entries(bundle)) {
      const id = `${file}#${key}`
      if (!ALLOWED.has(id) && isLegacy(value)) hits.push(`${id} = ${value}`)
    }
  }
  return hits
}

describe('组织 / Organization 术语统一', () => {
  // 下面两条断言是「扫全部文案」,扫不到东西时同样会是空数组。所以先钉死 glob 真的把两种
  // 语言的包都加载进来了,否则 glob 写错路径会让整组测试静默变成空转。
  it('glob 确实加载到了两种语言的全部文案包', () => {
    const loaded = Object.keys(bundles)
    expect(loaded.filter((p) => p.startsWith('./zh-CN/')).length).toBeGreaterThan(10)
    expect(loaded.filter((p) => p.startsWith('./en-US/')).length).toBeGreaterThan(10)
  })

  it('豁免名单里没有失效条目', () => {
    const existing = new Set<string>()
    for (const [path, bundle] of Object.entries(bundles)) {
      const file = path.replace(/^\.\//, '')
      for (const [key] of entries(bundle)) existing.add(`${file}#${key}`)
    }
    expect([...ALLOWED].filter((id) => !existing.has(id))).toEqual([])
  })

  it('中文文案不再出现「空间」或 Space', () => {
    expect(offenders('zh-CN', (v) => v.includes('空间') || /space/i.test(v))).toEqual([])
  })

  it('英文文案不再出现 Space / Spaces', () => {
    expect(offenders('en-US', (v) => /\bspaces?\b/i.test(v))).toEqual([])
  })

  it('术语确实落到了组织 / Organization', () => {
    const zhNav = bundles['./zh-CN/nav.json'] as Record<string, string>
    const enNav = bundles['./en-US/nav.json'] as Record<string, string>
    expect(zhNav.spaces).toBe('组织管理')
    expect(enNav.spaces).toBe('Organizations')
  })
})
