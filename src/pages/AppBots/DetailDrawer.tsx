import { useState, useEffect, useRef } from 'react'
import { Drawer, Descriptions, Tag, Button, Typography, Space, Popconfirm, Avatar, Upload, message } from 'antd'
import { CopyOutlined, ReloadOutlined, CameraOutlined, LoadingOutlined, RobotOutlined } from '@ant-design/icons'
import {
  getAppBot,
  getSpaceAppBot,
  rotateAppBotToken,
  rotateSpaceAppBotToken,
  revealAppBotToken,
  revealSpaceAppBotToken,
  uploadAppBotAvatar,
  botAvatarUrl,
  type AppBot,
  type AppBotStatus,
} from '../../api/app-bot'
import { buildConnectGuide } from './connectGuide'

interface Props {
  botId: string | null
  spaceId?: string
  open: boolean
  onClose: () => void
  onAvatarUploaded?: (uid: string) => void
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

const TOKEN_AUTO_HIDE_MS = 30_000

export default function DetailDrawer({ botId, spaceId, open, onClose, onAvatarUploaded }: Props) {
  const [bot, setBot] = useState<AppBot | null>(null)
  const [loading, setLoading] = useState(false)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [copyingGuide, setCopyingGuide] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarVersion, setAvatarVersion] = useState(Date.now)
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open || !botId) {
      setBot(null)
      setTokenVisible(false)
      return
    }

    // Reset avatar cache-bust when opening a different (or same) bot
    setAvatarVersion(Date.now())

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

  const revealToken = async (): Promise<string | null> => {
    if (!botId) return null
    const resp = spaceId
      ? await revealSpaceAppBotToken(spaceId, botId)
      : await revealAppBotToken(botId)
    setBot((prev) => (prev ? { ...prev, token: resp.token } : prev))
    setTokenVisible(true)
    return resp.token
  }

  const handleRevealToken = async () => {
    setRevealing(true)
    try {
      await revealToken()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setRevealing(false)
    }
  }

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

  const handleCopyGuide = async () => {
    if (!bot) return
    setCopyingGuide(true)
    try {
      const token = tokenMasked ? await revealToken() : bot.token
      if (!token) return
      await copyToClipboard(
        buildConnectGuide({
          displayName: bot.display_name,
          botId: bot.id,
          token,
        }),
      )
      message.success('连接指南已复制')
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
      else message.error('复制失败')
    } finally {
      setCopyingGuide(false)
    }
  }

  const status = bot ? STATUS_MAP[bot.status] : null
  const connectGuide = bot
    ? buildConnectGuide({
      displayName: bot.display_name,
      botId: bot.id,
      token: tokenMasked ? '<在上方复制 Token>' : (bot.token || '<token>'),
    })
    : ''

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
          {/* Avatar display + upload */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={async (file) => {
                setUploadingAvatar(true)
                try {
                  await uploadAppBotAvatar(bot.uid, file as File)
                  message.success('头像已更新')
                  setAvatarVersion(Date.now())
                  onAvatarUploaded?.(bot.uid)
                } catch (err) {
                  if (err instanceof Error) message.error(err.message)
                } finally {
                  setUploadingAvatar(false)
                }
                return false
              }}
              disabled={uploadingAvatar}
            >
              <div
                style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
                title="点击上传头像"
              >
                <Avatar
                  src={botAvatarUrl(bot.uid, avatarVersion)}
                  icon={<RobotOutlined />}
                  size={80}
                  style={{ background: '#6366f1' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    background: '#fff',
                    borderRadius: '50%',
                    padding: 4,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    lineHeight: 1,
                  }}
                >
                  {uploadingAvatar
                    ? <LoadingOutlined style={{ fontSize: 14 }} />
                    : <CameraOutlined style={{ fontSize: 14, color: '#6366f1' }} />}
                </div>
              </div>
            </Upload>
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>点击更换头像</div>
          </div>

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
                <Button
                  size="small"
                  loading={revealing}
                  onClick={handleRevealToken}
                >
                  显示
                </Button>
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
              {connectGuide}
            </div>
            <Space style={{ marginTop: 12 }}>
              <Button
                size="small"
                icon={<CopyOutlined />}
                loading={copyingGuide}
                onClick={handleCopyGuide}
              >
                复制指南
              </Button>
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
              如需绑定到其他 Agent，修改 --agent 参数即可。断开连接请在 BotFather 中发送 /disconnect。
            </Typography.Paragraph>
          </div>
        </>
      )}
    </Drawer>
  )
}
