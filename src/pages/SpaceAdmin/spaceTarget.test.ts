import { describe, it, expect } from 'vitest'
import { resolveTargetSpaceId } from './spaceTarget'

const normal = [{ space_id: 'a' }, { space_id: 'b' }, { space_id: 'c' }]

describe('resolveTargetSpaceId', () => {
  it('来源方指定且用户可管理该空间时，落到指定空间', () => {
    expect(resolveTargetSpaceId(normal, 'b', 'a')).toBe('b')
  })

  it('未指定目标空间时，回退到默认（当前 / 第一个）', () => {
    expect(resolveTargetSpaceId(normal, '', 'a')).toBe('a')
  })

  it('指定的空间不在可管理列表时，回退到默认（如已退出 / 越权）', () => {
    expect(resolveTargetSpaceId(normal, 'zzz', 'a')).toBe('a')
  })

  it('可管理列表为空时，返回默认值', () => {
    expect(resolveTargetSpaceId([], 'b', 'a')).toBe('a')
  })

  it('指定的空间已冻结（status !== 1）时，回退到默认，避免深链到问题页', () => {
    const withFrozen = [{ space_id: 'a', status: 1 }, { space_id: 'b', status: 2 }]
    expect(resolveTargetSpaceId(withFrozen, 'b', 'a')).toBe('a')
  })

  it('status 明确为正常（1）时，采纳指定空间', () => {
    const withStatus = [{ space_id: 'a', status: 1 }, { space_id: 'b', status: 1 }]
    expect(resolveTargetSpaceId(withStatus, 'b', 'a')).toBe('b')
  })

  it('status 未定义时，视为正常，采纳指定空间（后端偶发缺字段不误伤）', () => {
    expect(resolveTargetSpaceId(normal, 'b', 'a')).toBe('b')
  })
})
