import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './index'

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const Box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
  const Button = ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { onClick }, children)
  const Card = ({ title, extra, children }: { title?: React.ReactNode; extra?: React.ReactNode; children?: React.ReactNode }) =>
    React.createElement('section', null, React.createElement('header', null, title, extra), children)
  const Input = ({ onChange, onPressEnter, value }: { onChange?: React.ChangeEventHandler<HTMLInputElement>; onPressEnter?: () => void; value?: string }) =>
    React.createElement('input', {
      onChange,
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') onPressEnter?.()
      },
      value,
    })
  const Select = ({ value, onChange, children }: { value?: unknown; onChange?: (value: unknown) => void; children?: React.ReactNode }) =>
    React.createElement('select', { value: Array.isArray(value) ? value.join(',') : String(value ?? ''), onChange: (event) => onChange?.(event.target.value) }, children)
  const Segmented = ({
    options,
    onChange,
    value,
  }: {
    options: { label: React.ReactNode; value: string }[]
    onChange?: (value: string) => void
    value?: string
  }) =>
    React.createElement(
      'div',
      null,
      options.map((option) =>
        React.createElement(
          'button',
          {
            className: 'ant-segmented-item',
            'aria-pressed': value === option.value,
            key: option.value,
            onClick: () => onChange?.(option.value),
          },
          option.label,
        ),
      ),
    )

  return {
    Button,
    Card,
    Col: Box,
    DatePicker: { RangePicker: Box },
    Drawer: Box,
    Input,
    Popconfirm: Box,
    Row: Box,
    Segmented,
    Select,
    Skeleton: Box,
    Space: Box,
    Statistic: ({ title, value }: { title?: React.ReactNode; value?: React.ReactNode }) => React.createElement('div', null, title, value),
    Table: Box,
    Tooltip: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    Typography: {
      Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
    },
    message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
  }
})

vi.mock('@ant-design/icons', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const Icon = () => React.createElement('span', null)
  return {
    AppstoreOutlined: Icon,
    CommentOutlined: Icon,
    MessageOutlined: Icon,
    ReloadOutlined: Icon,
    RobotOutlined: Icon,
    SearchOutlined: Icon,
    SyncOutlined: Icon,
    TeamOutlined: Icon,
    UserOutlined: Icon,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { defaultValue?: string; count?: number }) => values?.defaultValue ?? key.replace(/^common:/, ''),
  }),
}))

vi.mock('../../api', () => ({
  ApiError: class ApiError extends Error {
    status?: number

    constructor(message: string, status?: number) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('../../api/dashboard', () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    space_total: 0,
    group_total: 0,
    human_member_total: 0,
    agent_total: 0,
    active_groups: 0,
    active_human_members: 0,
    active_agent_members: 0,
    human_msg_count: 0,
    agent_msg_count: 0,
    private_active_count: 0,
    message_composition: [],
  }),
  getDashboardTrend: vi.fn().mockResolvedValue({ granularity: 'day', list: [] }),
  listDashboardSpaces: vi.fn().mockResolvedValue({ count: 0, list: [] }),
  listDashboardChannels: vi.fn().mockResolvedValue({ count: 0, list: [] }),
  listDashboardDirectChats: vi.fn().mockResolvedValue({ count: 0, list: [] }),
  runDashboardEtl: vi.fn().mockResolvedValue({ status: 0, state: 'ok' }),
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('Dashboard trend chart', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverMock })
    Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: IntersectionObserverMock })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    vi.restoreAllMocks()
  })

  it('keeps the empty trend state renderable when switching to share mode', () => {
    flushSync(() => {
      root.render(<Dashboard />)
    })

    const shareToggle = Array.from(container.querySelectorAll('.ant-segmented-item')).find((item) =>
      item.textContent?.includes('charts.trend.share'),
    )

    expect(shareToggle).toBeTruthy()

    flushSync(() => {
      shareToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('charts.empty.title')
  })
})
