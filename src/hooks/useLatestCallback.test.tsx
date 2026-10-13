import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLatestCallback } from './useLatestCallback'

interface HarnessProps {
  mutation: Promise<void>
  onRefresh: (view: string) => void
}

function Harness({ mutation, onRefresh }: HarnessProps) {
  const [view, setView] = useState('page-1')
  const refreshCurrentView = useLatestCallback(() => onRefresh(view))

  return (
    <>
      <button
        data-testid="dispatch"
        onClick={() => {
          void mutation.then(() => refreshCurrentView())
        }}
      >
        dispatch
      </button>
      <button data-testid="navigate" onClick={() => setView('page-2')}>navigate</button>
    </>
  )
}

describe('useLatestCallback', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('refreshes the latest view after a deferred mutation completes', async () => {
    let resolveMutation!: () => void
    const mutation = new Promise<void>((resolve) => { resolveMutation = resolve })
    const onRefresh = vi.fn()

    await act(async () => root.render(<Harness mutation={mutation} onRefresh={onRefresh} />))
    await act(async () => (host.querySelector('[data-testid="dispatch"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('[data-testid="navigate"]') as HTMLButtonElement).click())
    await act(async () => resolveMutation())

    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledWith('page-2')
  })
})
