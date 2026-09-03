import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMySpaces, getUser } from '../../api/space-user'
import { useAuthStore, type MySpace } from '../../store/auth'
import SpaceEntry from './SpaceEntry'

// 只保留导航目标这一个观察点:入口组件的职责就是"把用户送到哪个空间"。
const navigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// antd 的 Spin/Result/Button 在这里只是状态占位,渲染真组件对断言无增益。
vi.mock('antd', () => ({
  Spin: () => null,
  Result: () => null,
  Button: () => null,
}))

vi.mock('../../api/space-user', () => ({
  getMySpaces: vi.fn(),
  getUser: vi.fn(),
}))

const mockedGetMySpaces = vi.mocked(getMySpaces)
const mockedGetUser = vi.mocked(getUser)

function space(space_id: string, role: 0 | 1 | 2 = 2, status = 1): MySpace {
  return { space_id, name: space_id, role, status }
}

/** 把 ?spaceId= 放进 jsdom 的地址栏,SpaceEntry 读的是 window.location.search。 */
function setSearch(search: string) {
  window.history.replaceState({}, '', `/space${search}`)
}

describe('SpaceEntry 目标空间解析', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = async () => {
    await act(async () => {
      root.render(<SpaceEntry />)
    })
  }

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    navigate.mockReset()
    mockedGetMySpaces.mockReset()
    mockedGetUser.mockReset()
    mockedGetUser.mockResolvedValue({ uid: 'u1', name: 'Tester' } as Awaited<
      ReturnType<typeof getUser>
    >)
    sessionStorage.clear()
    setSearch('')
    useAuthStore.getState().logout()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  describe('已登录路径(store 里已有 mySpaces)', () => {
    beforeEach(() => {
      useAuthStore.setState({
        scope: 'space',
        isLoggedIn: true,
        token: 't',
        name: 'Tester',
        mySpaces: [space('a'), space('b')],
        currentSpaceId: 'a',
      })
    })

    it('?spaceId= 指向可管理空间时,落到该空间', async () => {
      setSearch('?spaceId=b')
      await mount()
      expect(navigate).toHaveBeenCalledWith('/space/b/members', { replace: true })
    })

    it('navigate 之前就把 currentSpaceId 同步为目标,避免 SpaceSwitcher 首帧选错', async () => {
      setSearch('?spaceId=b')
      // 记录 navigate 被调用那一刻 store 的值,而不是事后再读。
      let spaceIdAtNavigate = ''
      navigate.mockImplementation(() => {
        spaceIdAtNavigate = useAuthStore.getState().currentSpaceId
      })
      await mount()
      expect(spaceIdAtNavigate).toBe('b')
    })

    it('没带参数时,沿用持久化的 currentSpaceId', async () => {
      await mount()
      expect(navigate).toHaveBeenCalledWith('/space/a/members', { replace: true })
    })

    it('?spaceId= 不在可管理列表时回退,不越权跳转', async () => {
      setSearch('?spaceId=someone-elses-space')
      await mount()
      expect(navigate).toHaveBeenCalledWith('/space/a/members', { replace: true })
    })

    it('不发起 /space/my 请求(已登录路径直接用 store)', async () => {
      setSearch('?spaceId=b')
      await mount()
      expect(mockedGetMySpaces).not.toHaveBeenCalled()
    })
  })

  describe('新登录路径(仅 sessionStorage 里有 token)', () => {
    beforeEach(() => {
      sessionStorage.setItem('token', 'session-token')
    })

    it('?spaceId= 指向可管理空间时落到该空间,而不是列表第一个', async () => {
      mockedGetMySpaces.mockResolvedValue([space('a'), space('b')])
      setSearch('?spaceId=b')
      await mount()
      expect(navigate).toHaveBeenCalledWith('/space/b/members', { replace: true })
      expect(useAuthStore.getState().currentSpaceId).toBe('b')
    })

    it('navigate 之前就覆盖掉 loginSpace() 写入的 managed[0]', async () => {
      mockedGetMySpaces.mockResolvedValue([space('a'), space('b')])
      setSearch('?spaceId=b')
      let spaceIdAtNavigate = ''
      navigate.mockImplementation(() => {
        spaceIdAtNavigate = useAuthStore.getState().currentSpaceId
      })
      await mount()
      expect(spaceIdAtNavigate).toBe('b')
    })

    it('没带参数时,落到可管理列表第一个', async () => {
      mockedGetMySpaces.mockResolvedValue([space('a'), space('b')])
      await mount()
      expect(navigate).toHaveBeenCalledWith('/space/a/members', { replace: true })
    })

    it('过滤掉 role 0 的空间:指向仅为成员的空间时不予采纳', async () => {
      mockedGetMySpaces.mockResolvedValue([space('a'), space('member-only', 0)])
      setSearch('?spaceId=member-only')
      await mount()
      expect(navigate).toHaveBeenCalledWith('/space/a/members', { replace: true })
    })

    it('没有任何可管理空间时不导航,而是登出并提示', async () => {
      mockedGetMySpaces.mockResolvedValue([space('member-only', 0)])
      setSearch('?spaceId=member-only')
      await mount()
      expect(navigate).not.toHaveBeenCalled()
      expect(useAuthStore.getState().isLoggedIn).toBe(false)
    })
  })

  describe('URL 解析的健壮性', () => {
    beforeEach(() => {
      useAuthStore.setState({
        scope: 'space',
        isLoggedIn: true,
        token: 't',
        name: 'Tester',
        mySpaces: [space('a'), space('b')],
        currentSpaceId: 'a',
      })
    })

    it.each([
      ['空值', '?spaceId='],
      ['只有其他参数', '?foo=bar'],
      ['重复参数取第一个(第一个非法)', '?spaceId=nope&spaceId=b'],
    ])('%s 时安全回退到默认空间', async (_label, search) => {
      setSearch(search)
      await mount()
      expect(navigate).toHaveBeenCalledWith('/space/a/members', { replace: true })
    })

    it('id 在 URL 中经过编码时,解码后仍能正确匹配', async () => {
      useAuthStore.setState({ mySpaces: [space('a'), space('a b')], currentSpaceId: 'a' })
      setSearch(`?spaceId=${encodeURIComponent('a b')}`)
      await mount()
      expect(navigate).toHaveBeenCalledWith('/space/a b/members', { replace: true })
    })
  })

  it('super 管理员忽略 spaceId,直接进 dashboard', async () => {
    useAuthStore.setState({ scope: 'super', isLoggedIn: true, token: 't' })
    setSearch('?spaceId=b')
    await mount()
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })
})
