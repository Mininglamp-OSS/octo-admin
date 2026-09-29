import { Tooltip } from 'antd'

interface Props {
  name: string
}

/** A compact organization label that keeps the full resolved name available
 * on hover without presenting the neutral placeholder as tooltip content. */
export default function OrganizationNameCell({ name }: Props) {
  return (
    <Tooltip title={name === '--' ? undefined : name}>
      <span
        style={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </Tooltip>
  )
}
