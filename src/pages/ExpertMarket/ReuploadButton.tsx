/**
 * "Re-upload container" button used in both detail drawers. Picks a container
 * zip, validates its kind client-side (preview/validation only), and hands the
 * ORIGINAL File plus the parsed container to the parent — which POSTs the raw
 * zip to /admin/plugins/container_reupload/{id} to rebuild the plugin in place.
 */

import { useRef, useState } from 'react'
import { Button, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import type { ExpertKind } from '../../api/expert'
import { ContainerError, parseExpertContainer, type ParsedContainer } from './parseContainer'

interface Props {
  expectKind: ExpertKind
  onReady: (file: File, parsed: ParsedContainer) => Promise<void>
}

export default function ReuploadButton({ expectKind, onReady }: Props) {
  const { t } = useTranslation(['expertMarket'])
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const parsed = await parseExpertContainer(file)
      if (parsed.manifest.kind !== expectKind) {
        message.error(t('container.kindMismatch', { defaultValue: 'Container kind does not match.' }))
        return
      }
      // Client parse is only a pre-submit guard — the SUBMIT sends the raw zip.
      await onReady(file, parsed)
      message.success(t('reupload.success'))
    } catch (err) {
      if (err instanceof ContainerError) {
        message.error(t(`container.${err.code}`, { defaultValue: err.message }))
      } else {
        message.error(err instanceof ApiError ? err.message : (err as Error).message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.skill"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void handleFile(f)
        }}
      />
      <Button icon={<UploadOutlined />} loading={busy} onClick={() => inputRef.current?.click()}>
        {t('reupload.button')}
      </Button>
    </>
  )
}
