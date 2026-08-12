import { useStore } from '@nanostores/react'
import { type ComponentProps, type MouseEvent, type ReactNode, useEffect, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'

import { toggleLayoutEditMode } from '@/components/pane-shell/edit-mode'
import { resetLayoutTree } from '@/components/pane-shell/tree/store'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tip, TipKeybindLabel } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { triggerHaptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { $fileBrowserOpen, $sidebarOpen, toggleFileBrowserOpen, toggleSidebarOpen } from '@/store/layout'
import { requestFreshSession } from '@/store/profile'
import { openUpdatesWindow } from '@/store/updates'
import { openNewWindow } from '@/store/windows'

import { appViewForPath, isOverlayView, SETTINGS_ROUTE } from '../routes'

import { titlebarButtonClass } from './titlebar'

export interface TitlebarTool {
  id: string
  label: string
  active?: boolean
  className?: string
  disabled?: boolean
  hidden?: boolean
  href?: string
  icon: ReactNode
  onSelect?: (event?: MouseEvent) => void
  /** Keybind action id — when set, the tooltip shows the label + keybind hint. */
  actionId?: string
  title?: string
  to?: string
}

export type TitlebarToolSide = 'left' | 'right'
export type SetTitlebarToolGroup = (id: string, tools: readonly TitlebarTool[], side?: TitlebarToolSide) => void

interface TitlebarControlsProps extends ComponentProps<'div'> {
  leftTools?: readonly TitlebarTool[]
  tools?: readonly TitlebarTool[]
  onOpenSettings: () => void
  /** Windows/Linux need renderer menus; macOS already owns the native menu bar. */
  showAppMenu?: boolean
}

/**
 * The layout button's glyph. Morphs into its composite reset form — the
 * layout icon wearing a small counter-clockwise arrow badge ("layout, back
 * to how it was") — ONLY while the pointer is on the button AND ⌘/Ctrl is
 * held: hover gates via CSS (`group/tool` on the button), the modifier via
 * the window listener. Pressing the modifier elsewhere changes nothing.
 */
function LayoutGlyph({ modHeld }: { modHeld: boolean }) {
  return (
    <>
      <span className={cn('inline-flex', modHeld && 'group-hover/tool:hidden')}>
        <Codicon name="layout" />
      </span>
      <span className={cn('relative hidden', modHeld && 'group-hover/tool:inline-flex')}>
        <Codicon name="layout" />
        <span className="absolute -bottom-1 -right-1.5 grid place-items-center rounded-full bg-(--ui-bg-chrome) p-px">
          <Codicon className="-scale-x-100" name="refresh" size="0.5625rem" />
        </span>
      </span>
    </>
  )
}

/** Live ⌘/Ctrl tracking — mod-click affordances telegraph themselves (the
 *  layout button morphs into its reset form while the modifier is down). */
function useModifierHeld(): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const sync = (event: KeyboardEvent) => setHeld(event.metaKey || event.ctrlKey)
    const clear = () => setHeld(false)

    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', clear)

    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', clear)
    }
  }, [])

  return held
}

export function TitlebarControls({
  leftTools = [],
  tools = [],
  onOpenSettings,
  showAppMenu = true
}: TitlebarControlsProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const modHeld = useModifierHeld()
  const fileBrowserOpen = useStore($fileBrowserOpen)
  const sidebarOpen = useStore($sidebarOpen)
  const history = useTitlebarHistory(location.key, navigate, navigationType)
  const leftEdge = { open: sidebarOpen, toggle: toggleSidebarOpen }
  // This control shows or hides the physical right edge of the main zone, so
  // it stays correct through layout flips and rearranges.
  const rightEdge = { open: fileBrowserOpen, toggle: toggleFileBrowserOpen }

  const sidebarTool: TitlebarTool = {
    actionId: 'view.toggleSidebar',
    icon: <Codicon name="layout-sidebar-left" />,
    id: 'sidebar',
    label: leftEdge.open ? t.titlebar.hideSidebar : t.titlebar.showSidebar,
    onSelect: () => {
      triggerHaptic('tap')
      leftEdge.toggle()
    }
  }

  const historyTools: TitlebarTool[] = [
    {
      disabled: !history.canGoBack,
      icon: <Codicon name="arrow-left" />,
      id: 'back',
      label: t.common.back,
      onSelect: history.goBack
    },
    {
      disabled: !history.canGoForward,
      icon: <Codicon name="arrow-right" />,
      id: 'forward',
      label: t.titlebar.forward,
      onSelect: history.goForward
    }
  ]

  const rightSidebarTool: TitlebarTool = {
    actionId: 'view.toggleRightSidebar',
    icon: <Codicon name="layout-sidebar-right" />,
    id: 'right-sidebar',
    label: rightEdge.open ? t.titlebar.hideRightSidebar : t.titlebar.showRightSidebar,
    onSelect: () => {
      triggerHaptic('tap')
      rightEdge.toggle()
    }
  }

  // Static system tools — always pinned to the screen's right edge.
  const systemTools: TitlebarTool[] = [
    {
      className: 'group/tool',
      // Hover + held ⌘/Ctrl morphs the glyph into its reset form (see
      // LayoutGlyph) — the mod-click telegraphs itself before it happens.
      icon: <LayoutGlyph modHeld={modHeld} />,
      id: 'layout',
      label: t.titlebar.layoutEditor,
      onSelect: event => {
        if (event?.metaKey || event?.ctrlKey) {
          triggerHaptic('warning')
          resetLayoutTree()

          return
        }

        triggerHaptic('open')
        toggleLayoutEditMode()
      },
      title: t.titlebar.layoutEditorTitle
    }
    // Settings stays available from the app menu and normal navigation; keep
    // the native titlebar focused on window and layout controls.
  ]

  // While a full-screen overlay (settings, command center, …) is open it should
  // visually own the window. These control clusters are `fixed` at a higher
  // z-index than the overlay card, so they'd otherwise bleed over it — hide them
  // and let the overlay's own chrome (close button, drag region) take over.
  if (isOverlayView(appViewForPath(location.pathname))) {
    return null
  }

  const visibleSystemTools = systemTools.filter(tool => !tool.hidden)
  const visiblePaneTools = tools.filter(tool => !tool.hidden)
  const visibleLeftTools = leftTools.filter(tool => !tool.hidden)

  return (
    <>
      <div
        aria-label={t.shell.windowControls}
        className="fixed left-(--titlebar-controls-left) top-(--titlebar-controls-top) z-70 flex translate-y-0.5 flex-row items-center gap-x-1 pointer-events-auto select-none [-webkit-app-region:no-drag]"
      >
        <TitlebarToolButton navigate={navigate} tool={sidebarTool} />
        {historyTools.map(tool => (
          <TitlebarToolButton key={tool.id} navigate={navigate} tool={tool} />
        ))}
        {showAppMenu && (
          <TitlebarAppMenu
            onOpenSettings={onOpenSettings}
            rightSidebarLabel={rightSidebarTool.label}
            sidebarLabel={sidebarTool.label}
            toggleRightSidebar={rightEdge.toggle}
            toggleSidebar={leftEdge.toggle}
          />
        )}
        {visibleLeftTools.map(tool => (
          <TitlebarToolButton key={tool.id} navigate={navigate} tool={tool} />
        ))}
      </div>

      {/*
        Pane-scoped tools (preview's monitor / devtools / refresh / X) render
        as their own fixed cluster. AppShell sets --shell-preview-toolbar-gap
        to either the static cluster's width (file-browser closed → cluster
        sits flush against system tools) or the file-browser pane's width
        (file-browser open → cluster sits flush against the file-browser pane,
        i.e. at the preview pane's right edge). No margin hacks needed.
      */}
      {visiblePaneTools.length > 0 && (
        <div
          aria-label={t.shell.paneControls}
          className="fixed top-[calc(var(--titlebar-controls-top)+var(--right-rail-top-inset,0px))] right-[calc(var(--titlebar-tools-right)+var(--shell-preview-toolbar-gap,0))] z-70 flex flex-row items-center gap-x-1 pointer-events-auto select-none [-webkit-app-region:no-drag]"
        >
          {visiblePaneTools.map(tool => (
            <TitlebarToolButton key={tool.id} navigate={navigate} tool={tool} />
          ))}
        </div>
      )}

      <div
        aria-label={t.shell.appControls}
        className="fixed right-(--titlebar-tools-right) top-(--titlebar-controls-top) z-70 flex flex-row items-center justify-end gap-x-1 pointer-events-auto select-none [-webkit-app-region:no-drag]"
      >
        {visibleSystemTools.map(tool => (
          <TitlebarToolButton key={tool.id} navigate={navigate} tool={tool} />
        ))}
        <TitlebarToolButton navigate={navigate} tool={rightSidebarTool} />
      </div>
    </>
  )
}

function readHistoryIndex(): number {
  const state = typeof window === 'undefined' ? null : window.history.state

  return typeof state?.idx === 'number' && state.idx >= 0 ? state.idx : 0
}

/** HashRouter writes an `idx` into history state. Track the highest observed
 * index so the forward affordance comes back after a back navigation, while a
 * fresh route push correctly clears the now-discarded forward history. */
function useTitlebarHistory(
  locationKey: string,
  navigate: ReturnType<typeof useNavigate>,
  navigationType: ReturnType<typeof useNavigationType>
) {
  const [state, setState] = useState(() => {
    const index = readHistoryIndex()

    return { index, maxIndex: index }
  })

  useEffect(() => {
    const index = readHistoryIndex()

    setState(previous => ({
      index,
      maxIndex: navigationType === 'PUSH' ? index : Math.max(previous.maxIndex, index)
    }))
  }, [locationKey, navigationType])

  return {
    canGoBack: state.index > 0,
    canGoForward: state.index < state.maxIndex,
    goBack: () => {
      triggerHaptic('tap')
      navigate(-1)
    },
    goForward: () => {
      triggerHaptic('tap')
      navigate(1)
    }
  }
}

function TitlebarAppMenu({
  onOpenSettings,
  rightSidebarLabel,
  sidebarLabel,
  toggleRightSidebar,
  toggleSidebar
}: {
  onOpenSettings: () => void
  rightSidebarLabel: string
  sidebarLabel: string
  toggleRightSidebar: () => void
  toggleSidebar: () => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-px" data-titlebar-menu-bar="">
      <TitlebarMenu label={t.titlebar.file}>
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('tap')
            requestFreshSession()
          }}
        >
          <Codicon name="add" />
          {t.keybinds.actions['session.new']}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('tap')
            void openNewWindow()
          }}
        >
          <Codicon name="empty-window" />
          {t.keybinds.actions['session.newWindow']}
        </DropdownMenuItem>
      </TitlebarMenu>

      <TitlebarMenu label={t.titlebar.edit}>
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('open')
            navigate(`${SETTINGS_ROUTE}?tab=keybinds`)
          }}
        >
          <Codicon name="keyboard" />
          {t.titlebar.openKeybinds}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('open')
            onOpenSettings()
          }}
        >
          <Codicon name="settings-gear" />
          {t.titlebar.openSettings}
        </DropdownMenuItem>
      </TitlebarMenu>

      <TitlebarMenu label={t.titlebar.view}>
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('tap')
            toggleSidebar()
          }}
        >
          <Codicon name="layout-sidebar-left" />
          {sidebarLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('tap')
            toggleRightSidebar()
          }}
        >
          <Codicon name="layout-sidebar-right" />
          {rightSidebarLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            window.location.reload()
          }}
        >
          <Codicon name="refresh" />
          {t.titlebar.reload}
        </DropdownMenuItem>
      </TitlebarMenu>

      <TitlebarMenu label={t.titlebar.help}>
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('open')
            openExternalLink('https://github.com/NousResearch/hermes-agent#readme')
          }}
        >
          <Codicon name="book" />
          {t.common.docs}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('open')
            openUpdatesWindow()
          }}
        >
          <Codicon name="sync" />
          {t.settings.about.checkNow}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            triggerHaptic('open')
            navigate(`${SETTINGS_ROUTE}?tab=about`)
          }}
        >
          <Codicon name="info" />
          {t.settings.nav.about}
        </DropdownMenuItem>
      </TitlebarMenu>
    </div>
  )
}

function TitlebarMenu({ children, label }: { children: ReactNode; label: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className={cn(
            titlebarButtonClass,
            'h-(--titlebar-control-height) rounded-[var(--radius-sm)] px-2 text-[0.8125rem] leading-none data-[state=open]:bg-(--ui-control-hover-background) data-[state=open]:text-foreground'
          )}
          motion="none"
          onPointerDown={event => event.stopPropagation()}
          size="inline"
          type="button"
          variant="ghost"
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48 p-1" side="bottom" sideOffset={6}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TitlebarToolButton({ navigate, tool }: { navigate: ReturnType<typeof useNavigate>; tool: TitlebarTool }) {
  // Titlebar actions never show an active background — state reads from the
  // icon itself (e.g. the mute/unmute glyph). aria-pressed still carries it
  // for a11y.
  const className = cn(titlebarButtonClass, 'bg-transparent select-none', tool.className)

  const tooltipLabel = tool.actionId ? (
    <TipKeybindLabel actionId={tool.actionId} text={tool.title ?? tool.label} />
  ) : (
    (tool.title ?? tool.label)
  )

  if (tool.href) {
    return (
      <Tip label={tooltipLabel}>
        <Button asChild className={className} size="icon-titlebar" variant="ghost">
          <a
            aria-label={tool.label}
            href={tool.href}
            onPointerDown={event => event.stopPropagation()}
            rel="noreferrer"
            target="_blank"
          >
            {tool.icon}
          </a>
        </Button>
      </Tip>
    )
  }

  return (
    <Tip label={tooltipLabel}>
      <Button
        aria-label={tool.label}
        aria-pressed={tool.active ?? undefined}
        className={className}
        disabled={tool.disabled}
        onClick={event => {
          if (tool.to) {
            navigate(tool.to)
          }

          tool.onSelect?.(event)
        }}
        onPointerDown={event => event.stopPropagation()}
        size="icon-titlebar"
        type="button"
        variant="ghost"
      >
        {tool.icon}
      </Button>
    </Tip>
  )
}
