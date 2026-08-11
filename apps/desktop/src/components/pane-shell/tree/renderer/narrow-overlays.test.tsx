import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registry } from '@/contrib/registry'

import { PANE_TOGGLE_REVEAL_EVENT } from '../..'
import { group, split } from '../model'
import { $hiddenTreePanes, $layoutTree, $narrowViewport } from '../store'

import { NarrowOverlays } from './narrow-overlays'

const disposers: (() => void)[] = []

function toggle(id: string, mode: 'close' | 'open' | 'toggle') {
  act(() => {
    window.dispatchEvent(new CustomEvent(PANE_TOGGLE_REVEAL_EVENT, { detail: { id, mode } }))
  })
}

describe('NarrowOverlays motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    $hiddenTreePanes.set(new Set())
    $narrowViewport.set(true)
    $layoutTree.set(
      split(
        'row',
        [
          group(['sessions-motion'], { active: 'sessions-motion', id: 'sessions-track' }),
          group(['workspace-motion'], { active: 'workspace-motion', id: 'workspace-track' })
        ],
        [1, 1],
        'narrow-motion-root'
      )
    )
    disposers.push(
      registry.register({
        area: 'panes',
        data: { collapsible: true, placement: 'left', width: '15rem' },
        id: 'sessions-motion',
        render: () => <p>Sessions</p>,
        title: 'Sessions'
      })
    )
  })

  afterEach(() => {
    cleanup()
    disposers.splice(0).forEach(dispose => dispose())
    $hiddenTreePanes.set(new Set())
    $layoutTree.set(null)
    $narrowViewport.set(false)
    vi.useRealTimers()
  })

  it('keeps a narrow sidebar mounted through its close animation', () => {
    const { container } = render(<NarrowOverlays />)

    toggle('sessions-motion', 'open')

    const rail = container.querySelector<HTMLElement>('[data-narrow-pane-overlay]')

    expect(rail?.dataset.motion).toBe('open')
    expect(rail?.dataset.side).toBe('left')

    toggle('sessions-motion', 'close')

    expect(rail?.dataset.motion).toBe('closing')
    expect(container.querySelector('[data-narrow-pane-overlay]')).not.toBeNull()

    act(() => vi.advanceTimersByTime(180))

    expect(container.querySelector('[data-narrow-pane-overlay]')).toBeNull()
  })
})
