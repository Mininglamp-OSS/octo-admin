// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Octo Contributors

export const colors = {
  text: {
    primary: 'var(--text-primary)',
    secondary: 'var(--text-body)',
    tertiary: 'var(--text-tertiary)',
    muted: 'var(--text-muted)',
  },
  surface: {
    background: 'var(--bg-page)',
    card: 'var(--bg-surface)',
    subtle: 'var(--bg-subtle)',
    border: 'var(--border-default)',
  },
  platform: {
    android: { base: 'var(--platform-android-base)', bg: 'var(--platform-android-bg)', text: 'var(--platform-android-text)' },
    ios: { base: 'var(--platform-ios-base)', bg: 'var(--platform-ios-bg)', text: 'var(--platform-ios-text)' },
    web: { base: 'var(--platform-web-base)', bg: 'var(--platform-web-bg)', text: 'var(--platform-web-text)' },
    'openclaw-plugin': { base: 'var(--platform-plugin-base)', bg: 'var(--platform-plugin-bg)', text: 'var(--platform-plugin-text)' },
    chrome: { base: 'var(--platform-chrome-base)', bg: 'var(--platform-chrome-bg)', text: 'var(--platform-chrome-text)' },
  },
  state: {
    force: { base: 'var(--state-force-base)', bg: 'var(--state-force-bg)', text: 'var(--state-force-text)' },
  },
  category: {
    added: { icon: 'var(--cat-added-icon)', bg: 'var(--cat-added-bg)', text: 'var(--cat-added-text)' },
    fixed: { icon: 'var(--cat-fixed-icon)', bg: 'var(--cat-fixed-bg)', text: 'var(--cat-fixed-text)' },
    changed: { icon: 'var(--cat-changed-icon)', bg: 'var(--cat-changed-bg)', text: 'var(--cat-changed-text)' },
    removed: { icon: 'var(--cat-removed-icon)', bg: 'var(--cat-removed-bg)', text: 'var(--cat-removed-text)' },
    security: { icon: 'var(--cat-security-icon)', bg: 'var(--cat-security-bg)', text: 'var(--cat-security-text)' },
    other: { icon: 'var(--cat-other-icon)', bg: 'var(--cat-other-bg)', text: 'var(--cat-other-text)' },
  },
} as const

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const

export const font = {
  size: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 15,
    lg: 18,
    xl: 24,
    '2xl': 28,
    '3xl': 36,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 800,
  },
} as const

export type PlatformKey = keyof typeof colors.platform
