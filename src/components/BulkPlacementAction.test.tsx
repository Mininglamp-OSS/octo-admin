import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const batchSetPluginPlacements = vi.hoisted(() => vi.fn())
const listPluginScenes = vi.hoisted(() => vi.fn())
const errorMessage = vi.hoisted(() => vi.fn())

vi.mock('../api/marketplace-scene', () => ({ batchSetPluginPlacements, listPluginScenes }))
vi.mock('@ant-design/icons', () => ({ BranchesOutlined: () => null }))
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, values?: Record<string, unknown>) => key === 'bulk.failedItem'
        ? `${String(values?.message)}:${String(values?.pluginId)}`
        : key,
    }),
  }
})
vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  type Values = Record<string, unknown>
  type FormInstance = {
    values: Values
    resetFields: () => void
    setFieldsValue: (values: Values) => void
    setFieldValue: (name: string, value: unknown) => void
    validateFields: () => Promise<Values>
  }
  const FormContext = React.createContext<FormInstance | null>(null)

  function useForm() {
    const [, forceUpdate] = React.useReducer((value) => value + 1, 0)
    const formRef = React.useRef<FormInstance | null>(null)
    if (!formRef.current) {
      formRef.current = {
        values: {},
        resetFields() {
          this.values = {}
          forceUpdate()
        },
        setFieldsValue(values) {
          this.values = { ...this.values, ...values }
          forceUpdate()
        },
        setFieldValue(name, value) {
          this.values = { ...this.values, [name]: value }
          forceUpdate()
        },
        validateFields() {
          return Promise.resolve({ ...this.values })
        },
      }
    }
    return [formRef.current]
  }

  function Form({ form, children }: { form: FormInstance; children?: React.ReactNode }) {
    return React.createElement(FormContext.Provider, { value: form }, children)
  }
  Form.useForm = useForm
  Form.Item = ({ name, children }: { name?: string; children?: React.ReactNode }) => {
    const form = React.useContext(FormContext)
    if (!name || !React.isValidElement(children) || !form) return React.createElement('div', null, children)
    const child = children as React.ReactElement<{ onChange?: (value: unknown) => void }>
    return React.createElement('div', null, React.cloneElement(child, {
      onChange: (value: unknown) => {
        form.setFieldValue(name, value)
        child.props.onChange?.(value)
      },
    }))
  }

  return {
    Button: ({ children, disabled, onClick }: { children?: React.ReactNode; disabled?: boolean; onClick?: React.MouseEventHandler }) => React.createElement('button', { disabled, 'data-testid': 'open', onClick }, children),
    Form,
    message: { success: vi.fn(), error: errorMessage },
    Modal: ({ open, children, onOk }: { open: boolean; children?: React.ReactNode; onOk?: () => void }) => open ? React.createElement('div', { role: 'dialog' }, children, React.createElement('button', { 'data-testid': 'submit', onClick: onOk }, 'submit')) : null,
    Select: ({ options = [], onChange }: { options?: Array<{ value: string }>; onChange?: (value: string) => void }) => React.createElement('div', null, options.map((option) => React.createElement('button', { key: option.value, 'data-testid': `select-${option.value}`, onClick: () => onChange?.(option.value) }, option.value))),
    Space: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    Typography: { Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children) },
  }
})

import { ApiError } from '../api'
import BulkPlacementAction from './BulkPlacementAction'

describe('BulkPlacementAction', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    batchSetPluginPlacements.mockReset().mockResolvedValue(undefined)
    errorMessage.mockReset()
    listPluginScenes.mockReset().mockResolvedValue([
      { scene_code: 'default', name: 'Default' },
      { scene_code: 'featured', name: 'Featured' },
    ])
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  async function open() {
    await act(async () => root.render(<BulkPlacementAction pluginIds={['p1', 'p2']} onSuccess={vi.fn()} />))
    await act(async () => (host.querySelector('[data-testid="open"]') as HTMLButtonElement).click())
    await act(async () => await Promise.resolve())
  }

  it('submits the exact bulk add payload', async () => {
    await open()
    await act(async () => (host.querySelector('[data-testid="select-featured"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('[data-testid="submit"]') as HTMLButtonElement).click())

    expect(batchSetPluginPlacements).toHaveBeenCalledWith({
      scene_code: 'featured',
      plugin_ids: ['p1', 'p2'],
      is_placed: true,
    })
  })

  it('names the plugin at failed_index when the batch is rejected', async () => {
    batchSetPluginPlacements.mockRejectedValue(new ApiError(
      'Plugin not found',
      404,
      'NOT_FOUND',
      { failed_index: 1 },
    ))
    await open()
    await act(async () => (host.querySelector('[data-testid="select-featured"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('[data-testid="submit"]') as HTMLButtonElement).click())

    expect(errorMessage).toHaveBeenCalledWith('Plugin not found:p2')
  })
})
