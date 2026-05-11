// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuthScope = 'super' | 'space' | ''

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
  mySpaces: MySpace[]
  currentSpaceId: string
  loginSuper: (token: string, name: string, role: string) => void
  loginSpace: (token: string, uid: string, name: string, mySpaces: MySpace[]) => void
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
          mySpaces,
          currentSpaceId: mySpaces[0]?.space_id ?? '',
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
