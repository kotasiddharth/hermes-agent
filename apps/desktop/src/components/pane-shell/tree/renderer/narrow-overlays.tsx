/**
 * Narrow-viewport edge overlays — the tree's take on the app's hover-reveal
 * collapse. Collapsible panes leave the grid below the sidebar-collapse
 * breakpoint; an edge strip (hover) or PANE_TOGGLE_REVEAL_EVENT (⌘B / ⌘G /
 * titlebar toggles route here on narrow) slides the pane OVER the layout
 * instead of squeezing it. Event reveals pin; hover reveals follow the mouse.
 */

import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ContribBoundary } from '@/contrib/react/boundary'
import { useContributions } from '@/contrib/react/use-contributions'
import type { Contribution } from '@/contrib/types'
import { ESCAPE_PRIORITY, isTopEscapeLayer, pushEscapeLayer } from '@/lib/escape-layers'
import { cn } from '@/lib/utils'

import { PANE_TOGGLE_REVEAL_EVENT } from '../..'
import { allPaneIds } from '../model'
import { $hiddenTreePanes, $layoutTree, $narrowViewport } from '../store'

import { paneChrome } from './track-model'

const NARROW_OVERLAY_EXIT_MS = 180

type RevealedPane = {
  id: string
  motion: 'closing' | 'open'
  pinned: boolean
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

export function NarrowOverlays() {
  const narrow = useStore($narrowViewport)
  const tree = useStore($layoutTree)
  const panes = useContributions('panes')
  const hiddenPanes = useStore($hiddenTreePanes)
  const [reveal, setReveal] = useState<RevealedPane | null>(null)

  // Keep a closing rail mounted for its exit motion. Previously the narrow
  // overlay was removed immediately, so opening and closing both hard-cut.
  const closeReveal = useCallback((id?: string) => {
    setReveal(current => {
      if (!current || current.motion === 'closing' || (id && current.id !== id)) {
        return current
      }

      return prefersReducedMotion() ? null : { ...current, motion: 'closing' }
    })
  }, [])

  useEffect(() => {
    if (reveal?.motion !== 'closing') {
      return
    }

    const timer = window.setTimeout(() => {
      setReveal(current => (current?.motion === 'closing' ? null : current))
    }, NARROW_OVERLAY_EXIT_MS)

    return () => window.clearTimeout(timer)
  }, [reveal?.motion])

  // Own an Escape layer only while something is revealed, so Escape closes the
  // overlay only when it's the top layer (never under a dialog / edit mode).
  const revealActive = reveal !== null
  useEffect(() => (revealActive ? pushEscapeLayer(ESCAPE_PRIORITY.narrowOverlay) : undefined), [revealActive])

  const inTree = useMemo(() => new Set(tree ? allPaneIds(tree) : []), [tree])

  const collapsibles = useMemo(
    () => panes.filter(p => paneChrome(p).collapsible && inTree.has(p.id) && !hiddenPanes.has(p.id)),
    [panes, inTree, hiddenPanes]
  )

  const collapsiblesRef = useRef(collapsibles)
  collapsiblesRef.current = collapsibles

  // ⌘B / ⌘G's narrow branch dispatches the app's toggle-reveal event with the
  // REAL pane id — accept those via each contribution's revealAliases.
  useEffect(() => {
    if (!narrow) {
      setReveal(null)

      return
    }

    const onToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; mode?: 'close' | 'open' | 'toggle' }>).detail
      const id = detail?.id

      if (!id) {
        return
      }

      const match = collapsiblesRef.current.find(p => p.id === id || paneChrome(p).revealAliases?.includes(id))

      if (!match) {
        return
      }

      // `open`/`close` are explicit intents (programmatic reveal, titlebar show);
      // `toggle` (default) is the ⌘B/⌘G flip.
      const mode = detail?.mode ?? 'toggle'

      if (mode === 'close') {
        closeReveal(match.id)

        return
      }

      setReveal(current => {
        if (mode === 'open') {
          return { id: match.id, motion: 'open', pinned: true }
        }

        if (current?.id === match.id && current.pinned && current.motion === 'open') {
          return prefersReducedMotion() ? null : { ...current, motion: 'closing' }
        }

        return { id: match.id, motion: 'open', pinned: true }
      })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopEscapeLayer(ESCAPE_PRIORITY.narrowOverlay)) {
        return
      }

      event.preventDefault()
      closeReveal()
    }

    window.addEventListener(PANE_TOGGLE_REVEAL_EVENT, onToggle)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener(PANE_TOGGLE_REVEAL_EVENT, onToggle)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeReveal, narrow])

  if (!narrow || collapsibles.length === 0) {
    return null
  }

  const sideOf = (c: Contribution) => (paneChrome(c).placement === 'left' ? 'left' : 'right')
  const revealed = reveal ? collapsibles.find(p => p.id === reveal.id) : undefined
  const sides = [...new Set(collapsibles.map(sideOf))]

  return (
    <>
      {/* Hover-intent strips on each edge that has a collapsed pane. */}
      {sides.map(side => (
        <div
          className={cn('absolute inset-y-0 z-30 w-1.5', side === 'left' ? 'left-0' : 'right-0')}
          key={side}
          onMouseEnter={() => {
            const first = collapsibles.find(p => sideOf(p) === side)

            if (first) {
              setReveal(current => (current?.pinned ? current : { id: first.id, motion: 'open', pinned: false }))
            }
          }}
        />
      ))}

      {revealed && reveal && (
        <div
          className={cn(
            'absolute inset-y-0 z-40 flex flex-col overflow-hidden bg-(--ui-sidebar-surface-background) shadow-2xl will-change-[transform,opacity]',
            sideOf(revealed) === 'left'
              ? 'left-0 border-r border-(--ui-stroke-secondary)'
              : 'right-0 border-l border-(--ui-stroke-secondary)',
            reveal.motion === 'closing' && 'pointer-events-none'
          )}
          data-motion={reveal.motion}
          data-narrow-pane-overlay=""
          data-side={sideOf(revealed)}
          onMouseLeave={() => {
            if (!reveal.pinned) {
              closeReveal(revealed.id)
            }
          }}
          // Match the pane's docked width (sessions ~237px, files its rail
          // width) instead of a fat fixed 20rem — capped for tiny screens.
          style={{ width: `min(${(revealed.data as { width?: string } | undefined)?.width ?? '18rem'}, 85vw)` }}
        >
          <ContribBoundary id={revealed.id}>{revealed.render?.()}</ContribBoundary>
        </div>
      )}
    </>
  )
}
