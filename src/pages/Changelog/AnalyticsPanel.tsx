// Copyright 2026 MININGLAMP Technology and the OCTO contributors
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react'
import { CaretRightOutlined } from '@ant-design/icons'
import { colors, radius, font, space } from '../../styles/tokens'

interface AnalyticsPanelProps {
  children: React.ReactNode
  summary: string
}

export function AnalyticsPanel({ children, summary }: AnalyticsPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      background: colors.surface.card,
      borderRadius: radius.lg,
      borderLeft: `4px solid var(--border-strong)`,
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s',
    }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          width: '100%',
          padding: `${space[3]}px ${space[4]}px`,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          fontSize: font.size.base,
          fontWeight: font.weight.semibold,
          color: colors.text.primary,
          textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <CaretRightOutlined
          style={{
            fontSize: font.size.sm,
            color: colors.text.tertiary,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
        <span>Release Analytics</span>
        <span style={{
          fontSize: font.size.sm,
          color: colors.text.tertiary,
          fontWeight: font.weight.regular,
        }}>
          · {summary}
        </span>
      </button>

      {open && (
        <div style={{
          padding: `0 ${space[4]}px ${space[3]}px`,
          borderTop: `1px solid ${colors.surface.border}`,
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
