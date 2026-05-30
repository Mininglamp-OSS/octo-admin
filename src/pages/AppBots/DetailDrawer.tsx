import { useState, useEffect, useRef } from 'react'
import { Drawer, Descriptions, Tag, Button, Typography, Space, Popconfirm, Avatar, Upload, message } from 'antd'
import { CopyOutlined, ReloadOutlined, CameraOutlined, LoadingOutlined, RobotOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

const STATUS_COLOR: Record<AppBotStatus, string> = {
  0: 'default',
  1: 'green',
  2: 'orange',
}

const statusLabel = (t: TFunction, status: AppBotStatus): string => {
  if (status === 1) return t('status.published')
  if (status === 2) return t('status.unpublished')
  return t('status.draft')
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
  const { t } = useTranslation('appBots')
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
      message.success(t('detail.token.copied'))
    } catch {
      message.error(t('detail.token.copyFailed'))
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
      message.success(t('detail.token.rotated'))
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
        buildConnectGuide(
          {
            displayName: bot.display_name,
            botId: bot.id,
            token,
          },
          t,
        ),
      )
      message.success(t('detail.guide.copied'))
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
      else message.error(t('detail.token.copyFailed'))
    } finally {
      setCopyingGuide(false)
    }
  }

  const connectGuide = bot
    ? buildConnectGuide(
      {
        displayName: bot.display_name,
        botId: bot.id,
        token: tokenMasked ? t('detail.guide.tokenPlaceholder') : (bot.token || '<token>'),
      },
      t,
    )
    : ''

  return (
    <Drawer
      title={t('detail.title')}
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
                  message.success(t('detail.avatar.toast.updated'))
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
                title={t('detail.avatar.title')}
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
            <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>{t('detail.avatar.hint')}</div>
          </div>

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('detail.field.id')}>{bot.id}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.uid')}>{bot.uid}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.displayName')}>{bot.display_name}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.description')}>{bot.description || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.scope')}>
              {bot.scope === 'platform' ? t('detail.scope.platform') : t('detail.scope.space', { spaceId: bot.space_id })}
            </Descriptions.Item>
            <Descriptions.Item label={t('detail.field.status')}>
              <Tag color={STATUS_COLOR[bot.status]}>{statusLabel(t, bot.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('detail.field.createdAt')}>{bot.created_at}</Descriptions.Item>
            <Descriptions.Item label={t('detail.field.updatedAt')}>{bot.updated_at}</Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 24 }}>
            <Typography.Title level={5}>{t('detail.token.title')}</Typography.Title>
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
                  {t('detail.token.reveal')}
                </Button>
              ) : (
                <Button
                  size="small"
                  onClick={() => setTokenVisible((v) => !v)}
                >
                  {tokenVisible ? t('detail.token.hide') : t('detail.token.show')}
                </Button>
              )}
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopyToken}
                disabled={tokenMasked}
              >
                {t('detail.token.copy')}
              </Button>
              <Popconfirm
                title={t('detail.rotate.confirm.title')}
                description={t('detail.rotate.confirm.desc')}
                onConfirm={handleRotateToken}
                okText={t('detail.rotate.confirm.ok')}
                cancelText={t('confirm.cancel')}
              >
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={rotating}
                  danger
                >
                  {t('detail.token.rotate')}
                </Button>
              </Popconfirm>
            </Space>
          </div>

          {/* 连接指南 — 参考 botfather /connect 命令输出 */}
          <div style={{ marginTop: 24 }}>
            <Typography.Title level={5}>{t('detail.guide.title')}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {t('detail.guide.intro')}
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
                {t('detail.guide.copy')}
              </Button>
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
              {t('detail.guide.footer')}
            </Typography.Paragraph>
          </div>
        </>
      )}
    </Drawer>
  )
}
