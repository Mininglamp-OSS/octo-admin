import { describe, it, expect } from 'vitest'
import { resolveTargetSpaceId } from './spaceTarget'

const spaces = [{ space_id: 'a' }, { space_id: 'b' }, { space_id: 'c' }]

describe('resolveTargetSpaceId', () => {
  it('来源方指定且用户可管理该空间时，落到指定空间', () => {
    expect(resolveTargetSpaceId(spaces, 'b', 'a')).toBe('b')
  })

  it('未指定目标空间时，回退到默认（当前 / 第一个）', () => {
    expect(resolveTargetSpaceId(spaces, '', 'a')).toBe('a')
  })

  it('指定的空间不在可管理列表时，回退到默认（如已退出 / 越权）', () => {
    expect(resolveTargetSpaceId(spaces, 'zzz', 'a')).toBe('a')
  })

  it('可管理列表为空时，返回默认值', () => {
    expect(resolveTargetSpaceId([], 'b', 'a')).toBe('a')
  })
})
