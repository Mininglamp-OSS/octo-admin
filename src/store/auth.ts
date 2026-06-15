import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ManagerCapabilities, ManagerMe } from '../auth/capabilities'

export type AuthScope = 'super' | 'space' | ''
export type ManagerProfileStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface MySpace {
  space_id: string
  name: string
  role: 0 | 1 | 2
  creator?: string
  logo?: string
  status?: number
  member_count?: number
  join_mode?: number
}

interface AuthState {
  scope: AuthScope
  token: string
  name: string
  role: string
  uid: string
  isLoggedIn: boolean
  managerCapabilities: ManagerCapabilities | null
  managerProfileStatus: ManagerProfileStatus
  mySpaces: MySpace[]
  currentSpaceId: string
  loginSuper: (token: string, name: string, role: string) => void
  loginSpace: (token: string, uid: string, name: string, mySpaces: MySpace[]) => void
  setManagerProfileLoading: () => void
  setManagerMe: (profile: ManagerMe) => void
  setManagerProfileError: () => void
  setMySpaces: (mySpaces: MySpace[]) => void
  setCurrentSpaceId: (spaceId: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      scope: '',
      token: '',
      name: '',
      role: '',
      uid: '',
      isLoggedIn: false,
      managerCapabilities: null,
      managerProfileStatus: 'idle',
      mySpaces: [],
      currentSpaceId: '',
      loginSuper: (token, name, role) =>
        set({
          scope: 'super',
          token,
          name,
          role,
          uid: '',
          isLoggedIn: true,
          managerCapabilities: null,
          managerProfileStatus: 'idle',
          mySpaces: [],
          currentSpaceId: '',
        }),
      loginSpace: (token, uid, name, mySpaces) =>
        set({
          scope: 'space',
          token,
          name,
          role: '',
          uid,
          isLoggedIn: true,
          managerCapabilities: null,
          managerProfileStatus: 'idle',
          mySpaces,
          currentSpaceId: mySpaces[0]?.space_id ?? '',
        }),
      setManagerProfileLoading: () => set({ managerProfileStatus: 'loading' }),
      setManagerMe: (profile) =>
        set({
          name: profile.name,
          role: profile.role,
          uid: profile.uid,
          managerCapabilities: profile.capabilities,
          managerProfileStatus: 'loaded',
        }),
      setManagerProfileError: () =>
        set({
          managerCapabilities: null,
          managerProfileStatus: 'error',
        }),
      setMySpaces: (mySpaces) =>
        set((s) => ({
          mySpaces,
          currentSpaceId:
            mySpaces.find((x) => x.space_id === s.currentSpaceId)?.space_id ??
            mySpaces[0]?.space_id ??
            '',
        })),
      setCurrentSpaceId: (spaceId) => set({ currentSpaceId: spaceId }),
      logout: () =>
        set({
          scope: '',
          token: '',
          name: '',
          role: '',
          uid: '',
          isLoggedIn: false,
          managerCapabilities: null,
          managerProfileStatus: 'idle',
          mySpaces: [],
          currentSpaceId: '',
        }),
    }),
    {
      name: 'dm-admin-auth',
      // mySpaces 不持久化:每次启动由 SpaceEntry / SpaceAdminLayout 重新拉取 /space/my
      partialize: (s) => ({
        scope: s.scope,
        token: s.token,
        name: s.name,
        role: s.role,
        uid: s.uid,
        isLoggedIn: s.isLoggedIn,
        currentSpaceId: s.currentSpaceId,
      }),
    },
  ),
)
