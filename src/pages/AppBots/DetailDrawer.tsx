import { useState, useEffect, useRef } from 'react'
import { Drawer, Descriptions, Tag, Button, Typography, Space, Popconfirm, Tooltip, message } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  getAppBot,
  getSpaceAppBot,
  rotateAppBotToken,
  rotateSpaceAppBotToken,
  type AppBot,
  type AppBotStatus,
} from '../../api/app-bot'

interface Props {
  botId: string | null
  spaceId?: string
  open: boolean
  onClose: () => void
}

const STATUS_MAP: Record<AppBotStatus, { label: string; color: string }> = {
  0: { label: '草稿', color: 'default' },
  1: { label: '已上架', color: 'green' },
  2: { label: '已下架', color: 'orange' },
}

/** Check if token is a masked placeholder (e.g. "****abcd") */
function isTokenMasked(token: string | undefined): boolean {
  if (!token) return true
  return token.startsWith('****') || token.startsWith('••••')
}

/** Copy text to clipboard with fallback for non-secure contexts */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Fallback: textarea + execCommand (deprecated but works in http dev)
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

/** Get API server URL for bot connect guide */
function getApiUrl(): string {
  // Prefer explicit env var; fallback to current origin (admin is co-located with IM server)
  return import.meta.env.VITE_BOT_API_URL || window.location.origin
}

const TOKEN_AUTO_HIDE_MS = 30_000

export default function DetailDrawer({ botId, spaceId, open, onClose }: Props) {
  const [bot, setBot] = useState<AppBot | null>(null)
  const [loading, setLoading] = useState(false)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [rotating, setRotating] = useState(false)
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open || !botId) {
      setBot(null)
      setTokenVisible(false)
      return
    }

    let stale = false
    setLoading(true)

    const fetchBot = spaceId ? getSpaceAppBot(spaceId, botId) : getAppBot(botId)
    fetchBot
      .then((data) => {
        if (!stale) setBot(data)
      })
      .catch((err: Error) => {
        if (!stale) message.error(err.message)
      })
      .finally(() => {
        if (!stale) setLoading(false)
      })

    return () => { stale = true }
  }, [open, botId, spaceId])

  const tokenMasked = isTokenMasked(bot?.token)

  // Auto-hide token after 30s to reduce DOM exposure (B3)
  useEffect(() => {
    if (tokenVisible) {
      autoHideRef.current = setTimeout(() => setTokenVisible(false), TOKEN_AUTO_HIDE_MS)
    }
    return () => {
      if (autoHideRef.current) clearTimeout(autoHideRef.current)
    }
  }, [tokenVisible])

  const handleCopyToken = async () => {
    if (!bot?.token || tokenMasked) return
    try {
      await copyToClipboard(bot.token)
      message.success('Token copied')
    } catch {
      message.error('复制失败')
    }
  }

  const handleRotateToken = async () => {
    if (!botId) return
    setRotating(true)
    try {
      const resp = spaceId
        ? await rotateSpaceAppBotToken(spaceId, botId)
        : await rotateAppBotToken(botId)
      setBot((prev) => (prev ? { ...prev, token: resp.token } : prev))
      setTokenVisible(true)
      message.success('Token 已轮换，旧 Token 立即失效')
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setRotating(false)
    }
  }

  const status = bot ? STATUS_MAP[bot.status] : null

  return (
    <Drawer
      title="App Bot 详情"
      open={open}
      onClose={onClose}
      width={520}
      loading={loading}
    >
      {bot && (
        <>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="ID">{bot.id}</Descriptions.Item>
            <Descriptions.Item label="UID">{bot.uid}</Descriptions.Item>
            <Descriptions.Item label="显示名称">{bot.display_name}</Descriptions.Item>
            <Descriptions.Item label="描述">{bot.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="Scope">
              {bot.scope === 'platform' ? '平台' : `Space: ${bot.space_id}`}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {status && <Tag color={status.color}>{status.label}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{bot.created_at}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{bot.updated_at}</Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 24 }}>
            <Typography.Title level={5}>API Token</Typography.Title>
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--a-bg-tertiary, #f5f5f5)',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 13,
                wordBreak: 'break-all',
              }}
            >
              {tokenVisible && bot.token ? bot.token : '••••••••••••••••••••'}
            </div>
            <Space style={{ marginTop: 12 }}>
              {tokenMasked ? (
                <Tooltip title="完整 Token 仅平台管理员可见">
                  <Button size="small" disabled>显示</Button>
                </Tooltip>
              ) : (
                <Button
                  size="small"
                  onClick={() => setTokenVisible((v) => !v)}
                >
                  {tokenVisible ? '隐藏' : '显示'}
                </Button>
              )}
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopyToken}
                disabled={tokenMasked}
              >
                复制
              </Button>
              <Popconfirm
                title="确认轮换 Token？"
                description="旧 Token 将立即失效，已连接的 OpenClaw 实例会断开。"
                onConfirm={handleRotateToken}
                okText="确认轮换"
                cancelText="取消"
              >
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={rotating}
                  danger
                >
                  轮换
                </Button>
              </Popconfirm>
            </Space>
          </div>

          {/* 连接指南 — 参考 botfather /connect 命令输出 */}
          <div style={{ marginTop: 24 }}>
            <Typography.Title level={5}>🔌 连接指南</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              将以下内容发给 OpenClaw 执行，即可将此 Bot 绑定到 Agent：
            </Typography.Paragraph>
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--a-bg-tertiary, #f5f5f5)',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.6,
                wordBreak: 'break-all',
                whiteSpace: 'pre-wrap',
              }}
            >
              {`将 DMWork bot ${bot.display_name} 绑定到 Agent。
默认绑定到当前 Session 的 Agent，agent 标识通过 /status 查看。
如果用户指定了其他 Agent，使用用户指定的标识替换。

npx -y openclaw-channel-dmwork bind --bot-token ${tokenMasked ? '<在上方复制 Token>' : (bot.token || '<token>')} --api-url ${getApiUrl()} --account-id ${bot.id} --agent <agent标识>`}
            </div>
            <Space style={{ marginTop: 12 }}>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  const cmd = `将 DMWork bot ${bot.display_name} 绑定到 Agent。\n默认绑定到当前 Session 的 Agent，agent 标识通过 /status 查看。\n如果用户指定了其他 Agent，使用用户指定的标识替换。\n\nnpx -y openclaw-channel-dmwork bind --bot-token ${bot.token || '<token>'} --api-url ${getApiUrl()} --account-id ${bot.id} --agent <agent标识>`
                  copyToClipboard(cmd).then(() => message.success('连接指南已复制')).catch(() => message.error('复制失败'))
                }}
                disabled={tokenMasked}
              >
                复制指南
              </Button>
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
              💡 如需绑定到其他 Agent，修改 --agent 参数即可。断开连接请在 BotFather 中发送 /disconnect。
            </Typography.Paragraph>
          </div>
        </>
      )}
    </Drawer>
  )
}
