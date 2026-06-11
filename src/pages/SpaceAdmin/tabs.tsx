import { useOutletContext, useParams } from 'react-router-dom'
import { useSpaceScope } from '../../hooks/useSpaceScope'
import type { SpaceUserDetail } from '../../api/space-user'
import SpaceMembersPanel from '../Spaces/SpaceMembersPanel'
import SpaceInvitesPanel from '../Spaces/SpaceInvitesPanel'
import SpaceJoinAppliesPanel from '../Spaces/SpaceJoinAppliesPanel'
import AppBotsPage from '../AppBots'

interface Ctx {
  detail: SpaceUserDetail
  refreshDetail: () => void
}

function useSpaceCtx() {
  const { spaceId } = useParams<{ spaceId: string }>()
  const { detail, refreshDetail } = useOutletContext<Ctx>()
  const scope = useSpaceScope(detail.role)
  return { spaceId: spaceId!, detail, scope, refreshDetail }
}

export function MembersTab() {
  const { spaceId, scope, refreshDetail } = useSpaceCtx()
  return (
    <SpaceMembersPanel
      spaceId={spaceId}
      scope={scope}
      onRoleChanged={refreshDetail}
    />
  )
}

export function InvitesTab() {
  const { spaceId, scope } = useSpaceCtx()
  return <SpaceInvitesPanel spaceId={spaceId} scope={scope} />
}

export function JoinAppliesTab() {
  const { spaceId, scope } = useSpaceCtx()
  return <SpaceJoinAppliesPanel spaceId={spaceId} scope={scope} />
}

export function AppBotsTab() {
  const { spaceId } = useSpaceCtx()
  return <AppBotsPage spaceId={spaceId} />
}
