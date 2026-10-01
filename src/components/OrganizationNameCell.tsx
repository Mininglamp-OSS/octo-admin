import { Tooltip } from 'antd'
import type { SpaceNameValue } from '../hooks/useSpaceNameMap'

interface Props {
  value: SpaceNameValue
  maxWidth: number
}

/** A compact organization label that keeps the full resolved name available
 * on hover without presenting the neutral placeholder as tooltip content. */
export default function OrganizationNameCell({ value, maxWidth }: Props) {
  return (
    <Tooltip title={value.resolved ? value.label : undefined}>
      <span
        style={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth,
        }}
      >
        {value.label}
      </span>
    </Tooltip>
  )
}
