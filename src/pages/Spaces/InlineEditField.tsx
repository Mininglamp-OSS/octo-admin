import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Input, InputNumber, Radio, Button, Space, Tooltip, message } from 'antd'
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

export type InlineFieldKind = 'text' | 'textarea' | 'number' | 'select'

export interface InlineFieldOption {
  value: number | string
  label: ReactNode
}

interface BaseProps {
  /** 当前持久值；非编辑态下可由 display 覆盖渲染 */
  value: string | number | null | undefined
  /** 非编辑态展示的内容；不传则直接展示 value */
  display?: ReactNode
  /** 编辑态占位符 */
  placeholder?: string
  /** 字段层级的本地校验：返回非空字符串表示错误信息 */
  validate?: (next: string | number) => string | null
  /** 保存回调；抛错时弹窗内保留输入并显示错误 */
  onSave: (next: string | number) => Promise<void>
  /** 只读时不渲染编辑入口 */
  readOnly?: boolean
  /** value 为空时的占位文本 */
  emptyText?: string
}

interface TextProps extends BaseProps {
  kind: 'text'
  maxLength?: number
}

interface TextareaProps extends BaseProps {
  kind: 'textarea'
  maxLength?: number
  rows?: number
}

interface NumberProps extends BaseProps {
  kind: 'number'
  min?: number
  max?: number
}

interface SelectProps extends BaseProps {
  kind: 'select'
  options: InlineFieldOption[]
}

export type InlineEditFieldProps = TextProps | TextareaProps | NumberProps | SelectProps

// 与服务端 utf8.RuneCountInString 一致：按 code point 数。
function runeLen(s: string): number {
  return Array.from(s).length
}

export default function InlineEditField(props: InlineEditFieldProps) {
  const { t } = useTranslation('spaces')
  const { value, display, readOnly, emptyText = '—', validate, onSave } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string | number>(value ?? '')
  const [saving, setSaving] = useState(false)
  // antd 的 Input / InputNumber / TextArea ref 形状不一致，统一保留它们都暴露的 focus() 调用。
  const focusRef = useRef<{ focus: () => void } | null>(null)

  useEffect(() => {
    if (editing) setDraft(value ?? '')
  }, [editing, value])

  // 自动聚焦编辑控件（在 ref 设置之后的下一帧调用，确保 DOM 已挂载）
  useEffect(() => {
    if (editing && focusRef.current) {
      focusRef.current.focus()
    }
  }, [editing])

  const cancel = () => {
    if (saving) return
    setEditing(false)
  }

  const commit = async () => {
    // 防止双击/快速重复回车在 React 状态落地前重入。
    if (saving) return
    let next = draft
    if (props.kind === 'text' || props.kind === 'textarea') {
      next = typeof next === 'string' ? next.trim() : String(next ?? '')
    }
    // 与持久值相同则不发请求
    const current =
      props.kind === 'text' || props.kind === 'textarea'
        ? typeof value === 'string'
          ? value
          : value == null
            ? ''
            : String(value)
        : value
    if (next === current || (next === '' && (current == null || current === ''))) {
      setEditing(false)
      return
    }
    if (validate) {
      const err = validate(next)
      if (err) {
        message.error(err)
        return
      }
    }
    setSaving(true)
    try {
      await onSave(next)
      setEditing(false)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const hasValue = value !== undefined && value !== null && value !== ''
    return (
      <span className="inline-edit-display">
        <span>{display ?? (hasValue ? value : <span style={{ color: 'var(--a-text-quaternary)' }}>{emptyText}</span>)}</span>
        {!readOnly && (
          <Tooltip title={t('inline.edit')} mouseEnterDelay={0.3}>
            <button
              type="button"
              aria-label={t('inline.edit')}
              className="inline-edit-trigger"
              onClick={() => setEditing(true)}
            >
              <EditOutlined />
            </button>
          </Tooltip>
        )}
      </span>
    )
  }

  // 通用键盘交互：Esc 取消；非 textarea 时 Enter 提交（已由 onPressEnter 处理）；
  // textarea 用 Ctrl/Cmd+Enter 提交，避免与正常换行冲突。
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      return
    }
    if (props.kind === 'textarea' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void commit()
    }
  }

  const actions = (
    <Space.Compact className="inline-edit-actions">
      <Button
        size="small"
        type="primary"
        icon={<CheckOutlined />}
        loading={saving}
        onClick={commit}
      />
      <Button
        size="small"
        icon={<CloseOutlined />}
        disabled={saving}
        onClick={cancel}
      />
    </Space.Compact>
  )

  if (props.kind === 'textarea') {
    // textarea 走垂直布局：actions 落到右下角，更适合多行编辑。
    // 自渲染字符数 —— antd showCount 会占用右下角与 actions 重叠，禁用之。
    const text = (draft as string) ?? ''
    const count = runeLen(text)
    return (
      <div className="inline-edit-textarea-wrap">
        <Input.TextArea
          ref={(el) => {
            focusRef.current = el
          }}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={props.placeholder}
          // 故意不传 maxLength：浏览器按 UTF-16 code unit 计数，
          // 会在 emoji / 罕见 CJK 等代理对字符上提前截断 (e.g. 50 emoji ≈ 100 code units)，
          // 与服务端 utf8.RuneCountInString 的 rune 上限不一致。
          // 计数与超限拦截统一交给 validate（rune 计数）处理。
          rows={props.rows ?? 3}
          disabled={saving}
          style={{ width: '100%' }}
        />
        <div className="inline-edit-textarea-footer">
          {props.maxLength ? (
            <span
              className="inline-edit-textarea-count"
              style={{
                color:
                  count > props.maxLength
                    ? 'var(--a-danger)'
                    : 'var(--a-text-quaternary)',
              }}
            >
              {count} / {props.maxLength}
            </span>
          ) : (
            <span />
          )}
          <Tooltip title={t('inline.submitHint')}>{actions}</Tooltip>
        </div>
      </div>
    )
  }

  let control: ReactNode = null
  if (props.kind === 'text') {
    control = (
      <Input
        ref={(el) => {
          focusRef.current = el
        }}
        value={(draft as string) ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onPressEnter={commit}
        onKeyDown={onKeyDown}
        placeholder={props.placeholder}
        // 不传 maxLength：浏览器按 UTF-16 code unit 计数，会在 emoji 等代理对字符上提前截断；
        // 长度上限统一由 validate（rune 计数）兜底，与服务端 utf8.RuneCountInString 对齐。
        disabled={saving}
        size="small"
        style={{ minWidth: 200 }}
      />
    )
  } else if (props.kind === 'number') {
    // 非负整数（min >= 0）时连 '-' 一起拒；允许负值的场景才保留前导 '-'。
    // 在 keydown 层 preventDefault 非数字键 —— antd 的 parser 只在 blur/Enter 触发，
    // 不能阻止输入态下 "10aaaa" 这样的中间显示。
    const allowNegative = props.min === undefined || props.min < 0
    const maxCap = props.max
    const onNumberKeyDown = (e: KeyboardEvent<HTMLElement>) => {
      // 通用 Esc/Enter 优先
      onKeyDown(e)
      if (e.defaultPrevented) return
      // 修饰键组合（复制/粘贴/全选）放行
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // 控制键（退格、方向键、Tab 等）放行
      if (e.key.length > 1) return
      const isDigit = e.key >= '0' && e.key <= '9'
      const isNeg = allowNegative && e.key === '-'
      if (!isDigit && !isNeg) {
        e.preventDefault()
        return
      }
      // 数字键：模拟插入后看是否会超 max；超则拦下，避免输入态显示越界数字。
      if (isDigit && maxCap !== undefined) {
        const input = e.target as HTMLInputElement
        const start = input.selectionStart ?? input.value.length
        const end = input.selectionEnd ?? start
        const projected =
          input.value.slice(0, start) + e.key + input.value.slice(end)
        const num = Number(projected.replace(/[^\d]/g, '') || '0')
        if (num > maxCap) e.preventDefault()
      }
    }
    // 防御性：粘贴等非键盘路径补一道 parser，把残留非数字字符洗掉。
    const digitOnlyParser = (text: string | undefined): number => {
      const s = text ?? ''
      const stripped = allowNegative
        ? (s.trim().startsWith('-') ? '-' : '') + s.replace(/[^\d]/g, '')
        : s.replace(/[^\d]/g, '')
      if (stripped === '' || stripped === '-') return 0
      const n = Number(stripped)
      return Number.isFinite(n) ? n : 0
    }
    control = (
      <InputNumber
        ref={(el) => {
          focusRef.current = el
        }}
        value={typeof draft === 'number' ? draft : Number(draft) || 0}
        onChange={(v) => {
          // 粘贴 / 系统级输入路径不会触发 keydown 拦截；这里再 clamp 一次兜底。
          let n = typeof v === 'number' ? v : 0
          if (props.max !== undefined && n > props.max) n = props.max
          if (props.min !== undefined && n < props.min) n = props.min
          setDraft(n)
        }}
        onPressEnter={commit}
        onKeyDown={onNumberKeyDown}
        min={props.min}
        max={props.max}
        // 业务字段（如 max_users）语义上为整数；强制 0 位小数避免提交浮点导致服务端拒绝。
        precision={0}
        step={1}
        parser={digitOnlyParser}
        formatter={(v) => (v == null ? '' : String(v))}
        disabled={saving}
        size="small"
        style={{ width: 140 }}
      />
    )
  } else if (props.kind === 'select') {
    // Radio.Group 不暴露稳定的 focus API；编辑态依靠 Tab 进入，自动聚焦留空即可。
    control = (
      <span onKeyDown={onKeyDown} style={{ display: 'inline-flex' }}>
        <Radio.Group
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
        >
          {props.options.map((opt) => (
            <Radio key={String(opt.value)} value={opt.value}>
              {opt.label}
            </Radio>
          ))}
        </Radio.Group>
      </span>
    )
  }

  return (
    <Space align="center" size={8} wrap>
      {control}
      {actions}
    </Space>
  )
}
