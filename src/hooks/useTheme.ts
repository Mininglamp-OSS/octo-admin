// Copyright 2026 MININGLAMP Technology and the OCTO contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react'

export type Theme = 'light' | 'dark' | 'auto'

function resolveEffective(theme: Theme): 'light' | 'dark' {
  if (theme !== 'auto') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setThemeRaw] = useState<Theme>(() => {
    return (localStorage.getItem('octo-theme') as Theme) || 'auto'
  })
  const [effective, setEffective] = useState<'light' | 'dark'>(() => resolveEffective(theme))

  const applyTheme = useCallback((t: Theme) => {
    const resolved = resolveEffective(t)
    setEffective(resolved)
    if (t === 'auto') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', t)
    }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeRaw(t)
    localStorage.setItem('octo-theme', t)
    applyTheme(t)
    window.dispatchEvent(new CustomEvent('octo-theme-change', { detail: t }))
  }, [applyTheme])

  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail
      setThemeRaw(next)
      setEffective(resolveEffective(next))
    }
    window.addEventListener('octo-theme-change', onChange)
    return () => window.removeEventListener('octo-theme-change', onChange)
  }, [])

  useEffect(() => {
    if (theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('auto')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme, applyTheme])

  return { theme, effective, setTheme }
}
