import { useState } from 'react'
import { message, Modal, Space, Tag, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api'
import { batchSetPluginPlacements } from '../api/marketplace-scene'

interface Props {
  pluginId: string
  sceneCodes: string[]
  canWrite: boolean
  onSuccess: () => void | Promise<void>
}

export default function PlacementChannelTags({
  pluginId,
  sceneCodes,
  canWrite,
  onSuccess,
}: Props) {
  const { t } = useTranslation('marketplaceScene')
  const [removingCodes, setRemovingCodes] = useState<Set<string>>(() => new Set())

  const setRemoving = (sceneCode: string, removing: boolean) => {
    setRemovingCodes((current) => {
      const next = new Set(current)
      if (removing) next.add(sceneCode)
      else next.delete(sceneCode)
      return next
    })
  }

  const confirmRemove = (sceneCode: string) => {
    Modal.confirm({
      title: t('single.title'),
      content: t('single.removeConfirm', { sceneCode }),
      okText: t('single.confirm'),
      cancelText: t('single.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setRemoving(sceneCode, true)
        try {
          await batchSetPluginPlacements({
            scene_code: sceneCode,
            plugin_ids: [pluginId],
            is_placed: false,
          })
          message.success(t('single.removeSuccess', { sceneCode }))
          await onSuccess()
        } catch (error) {
          message.error(
            error instanceof ApiError ? error.message : t('single.removeFailed')
          )
        } finally {
          setRemoving(sceneCode, false)
        }
      },
    })
  }

  if (!sceneCodes?.length) return <>—</>

  return (
    <Space size={[0, 4]} wrap>
      {sceneCodes.map((code) => {
        const tag = (
          <Tag
            key={code}
            color={code === 'default' ? undefined : 'blue'}
            closable={canWrite && code !== 'default' && !removingCodes.has(code)}
            onClose={(event) => {
              event.preventDefault()
              event.stopPropagation()
              confirmRemove(code)
            }}
          >
            {code}
          </Tag>
        )
        return code === 'default' && canWrite ? (
          <Tooltip key={code} title={t('single.defaultProtected')}>
            {tag}
          </Tooltip>
        ) : (
          tag
        )
      })}
    </Space>
  )
}
