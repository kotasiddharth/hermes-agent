import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useSessionView } from '@/app/chat/session-view'
import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import { ModelMenuCloseContext } from '@/app/shell/model-menu-panel'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { releaseTypingFocus } from '@/components/ui/keyboard-first'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { compactNumber } from '@/lib/format'
import { ChevronDown } from '@/lib/icons'
import { formatModelStatusLabel } from '@/lib/model-status-label'
import { cn } from '@/lib/utils'
import { $activeGatewayProfile } from '@/store/profile'
import { $currentModelSource, $defaultReasoningEffort, setModelPickerOpen } from '@/store/session'
import type { ContextBreakdown, UsageStats } from '@/types/hermes'

import { onComposerModelMenuRequest } from './focus'
import { useComposerScope } from './scope'
import type { ChatBarState } from './types'

const PILL = cn(
  'h-(--composer-control-size) max-w-40 shrink-0 gap-1 rounded-md px-2 text-xs font-normal',
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)

const CONTEXT_RING_RADIUS = 5.5
const CONTEXT_RING_CIRCUMFERENCE = 2 * Math.PI * CONTEXT_RING_RADIUS

export interface ContextWindowUsage {
  max: number
  percent: number
  used: number
}

type ContextWindowUsageSource = Pick<UsageStats, 'context_max' | 'context_percent' | 'context_used'> | UsageStats

/** Normalizes context usage reported directly or calculated by the gateway. */
export function contextWindowUsage(usage: ContextWindowUsageSource | null | undefined): ContextWindowUsage | null {
  const max = usage?.context_max

  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) {
    return null
  }

  const reportedPercent = usage?.context_percent
  const hasReportedPercent = typeof reportedPercent === 'number' && Number.isFinite(reportedPercent)
  const used = usage?.context_used
  const hasUsed = typeof used === 'number' && Number.isFinite(used)

  if (!hasReportedPercent && !hasUsed) {
    return null
  }

  const normalizedUsed = Math.max(0, Math.min(max, Math.round(hasUsed ? used : max * ((reportedPercent ?? 0) / 100))))

  const normalizedPercent = Math.max(
    0,
    Math.min(100, hasReportedPercent ? reportedPercent : (normalizedUsed / max) * 100)
  )

  return { max, percent: normalizedPercent, used: normalizedUsed }
}

/** Returns the remaining model context only when the gateway reports a real window. */
export function contextTokensRemaining(usage: ContextWindowUsageSource | null | undefined): null | number {
  const context = contextWindowUsage(usage)

  if (!context) {
    return null
  }

  return Math.max(0, Math.round(context.max - context.used))
}

/**
 * Composer model selector — the relocated status-bar pill. Reuses the live
 * `model.options` dropdown (`modelMenuContent`) verbatim; falls back to the
 * full picker when the gateway is closed and no live menu exists.
 *
 * Display follows THIS surface's SessionView (primary or tile) — never the
 * primary-only globals — so side-by-side panes each show their own model.
 */
export function ModelPill({
  compact = false,
  disabled,
  model
}: {
  compact?: boolean
  disabled: boolean
  model: ChatBarState['model']
}) {
  const { t } = useI18n()
  const copy = t.shell.statusbar
  const view = useSessionView()
  // Prefer the chat-bar snapshot (already view-scoped by ChatView); fall back
  // to the live SessionView atoms so a mid-flight session.info still paints.
  const viewModel = useStore(view.$model)
  const viewProvider = useStore(view.$provider)
  const currentModel = model.model || viewModel
  const currentProvider = model.provider || viewProvider
  const fastMode = useStore(view.$fast)
  const reasoningEffort = useStore(view.$reasoningEffort)
  const modelSource = useStore($currentModelSource)
  const defaultEffort = useStore($defaultReasoningEffort)
  const runtimeId = useStore(view.$runtimeId)
  const usage = useStore(view.$usage)
  const activeGatewayProfile = useStore($activeGatewayProfile)
  const { requestGateway } = useGatewayRequest()
  const [open, setOpen] = useState(false)
  const scope = useComposerScope()
  const hasLiveMenu = Boolean(model.modelMenuContent)
  const reportedContext = contextWindowUsage(usage)
  const hasReportedContext = Boolean(reportedContext)

  // Gateway usage intentionally omits context fields until it has an exact
  // prompt-token reading. The context breakdown endpoint can calculate the
  // current prompt footprint in that gap, so use it as a shared fallback.
  // React Query deduplicates this per profile/session across tiled panes and
  // refreshes it after usage changes instead of making each model pill poll.
  const contextBreakdown = useQuery({
    enabled: !compact && Boolean(runtimeId) && !hasReportedContext,
    queryFn: () => requestGateway<ContextBreakdown>('session.context_breakdown', { session_id: runtimeId! }),
    queryKey: ['session-context-breakdown', activeGatewayProfile, runtimeId, usage?.total ?? 0],
    retry: false
  })

  // The `composer.modelPicker` hotkey, routed to exactly one surface (the pane
  // under the pointer, else the active composer — see requestModelMenuToggle).
  // Toggles the live dropdown; with no live menu (gateway closed) it opens the
  // full picker dialog, same as clicking the pill.
  useEffect(
    () =>
      onComposerModelMenuRequest(target => {
        if (target !== scope.target || disabled) {
          return
        }

        if (hasLiveMenu) {
          setOpen(prev => !prev)
        } else {
          setModelPickerOpen(true)
        }
      }),
    [scope.target, disabled, hasLiveMenu]
  )

  // The composer pick is sticky: a manual selection is pinned and every NEW
  // chat uses it instead of the Settings → Model default — silently, which has
  // cost users real money on a forgotten paid-model pick (#62055). Surface the
  // pin whenever a draft (no live session) is running on a manual override. A
  // live session's footer reflects that session's model, so no badge there.
  // Tiles always have a runtime — pin badge is primary-draft only.
  const pinnedOverride =
    view.kind === 'primary' && !runtimeId && modelSource === 'manual' && Boolean(currentModel.trim())

  // The model resolves a beat after the gateway/session comes up. Rather than
  // flash a literal "No model", show a quiet loader (inherits the pill text
  // color at half opacity) until a model lands.
  const label = compact ? (
    <ChevronDown className="size-3.5 shrink-0 opacity-70" />
  ) : (
    <>
      {currentModel.trim() ? (
        <span className="truncate">
          {formatModelStatusLabel(currentModel, { defaultEffort, fastMode, reasoningEffort })}
        </span>
      ) : (
        <GlyphSpinner className="opacity-50" spinner="braille" />
      )}
      {pinnedOverride && (
        <span
          aria-label={copy.modelPinned}
          className="size-1 shrink-0 rounded-full bg-(--ui-accent)"
          data-testid="model-pinned-dot"
          role="img"
        />
      )}
      <ChevronDown className="size-2.5 shrink-0 opacity-50" />
    </>
  )

  // Compact (floating composer): a snug square holding just the chevron — no pill
  // padding, sized to match the other composer icon buttons.
  const pillClass = compact
    ? cn(
        'size-(--composer-control-size) shrink-0 justify-center gap-0 rounded-md p-0',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      )
    : PILL

  const baseTitle = currentProvider
    ? copy.modelTitle(currentProvider, currentModel || copy.modelNone)
    : copy.switchModel

  const title = pinnedOverride ? `${baseTitle} — ${copy.modelPinned}` : baseTitle
  const calculatedContext = contextWindowUsage(contextBreakdown.data)
  const context = compact ? null : (reportedContext ?? calculatedContext)
  const contextPercent = Math.round(context?.percent ?? 0)
  const contextPercentRemaining = Math.max(0, 100 - contextPercent)

  const contextDetail = context
    ? {
        percentUsed: t.composer.contextWindowUsageSummary(contextPercent, contextPercentRemaining),
        tokensUsed: t.composer.contextWindowUsage(compactNumber(context.used), compactNumber(context.max))
      }
    : null

  const contextAriaLabel = contextDetail
    ? `${t.composer.contextWindow}. ${contextDetail.percentUsed}. ${contextDetail.tokensUsed}.`
    : t.composer.contextWindowUnavailable

  const contextTooltip = contextDetail ? (
    <span className="flex flex-col items-center whitespace-nowrap text-center font-normal">
      <span className="text-(--ui-text-tertiary)">{t.composer.contextWindow}:</span>
      <span className="text-foreground">{contextDetail.percentUsed}</span>
      <span className="text-foreground">{contextDetail.tokensUsed}</span>
    </span>
  ) : (
    contextAriaLabel
  )

  const contextRingOffset = CONTEXT_RING_CIRCUMFERENCE * (1 - contextPercent / 100)

  const contextCounter =
    !compact && currentModel.trim() ? (
      <Tip
        className="[&>span]:rounded-lg [&>span]:border [&>span]:border-(--ui-stroke-secondary) [&>span]:bg-(--ui-bg-elevated) [&>span]:px-3 [&>span]:py-2 [&>span]:text-xs [&>span]:font-normal [&>span]:text-(--ui-text-secondary)"
        label={contextTooltip}
        side="top"
      >
        <span
          aria-label={contextAriaLabel}
          className={cn(
            'inline-flex h-(--composer-control-size) shrink-0 cursor-default items-center justify-center rounded-full text-(--ui-text-tertiary)',
            context && 'text-(--ui-text-secondary)'
          )}
          data-testid="context-window"
        >
          <svg aria-hidden="true" className="size-3.5 -rotate-90" fill="none" viewBox="0 0 16 16">
            <circle
              className="opacity-25"
              cx="8"
              cy="8"
              r={CONTEXT_RING_RADIUS}
              stroke="currentColor"
              strokeWidth="2"
            />
            {context && (
              <circle
                cx="8"
                cy="8"
                r={CONTEXT_RING_RADIUS}
                stroke="currentColor"
                strokeDasharray={CONTEXT_RING_CIRCUMFERENCE}
                strokeDashoffset={contextRingOffset}
                strokeLinecap="round"
                strokeWidth="2"
                style={{ transition: 'stroke-dashoffset 300ms ease-out' }}
              />
            )}
          </svg>
        </span>
      </Tip>
    ) : null

  if (!model.modelMenuContent) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        {contextCounter}
        <Tip label={pinnedOverride ? `${copy.openModelPicker} — ${copy.modelPinned}` : copy.openModelPicker} side="top">
          <Button
            aria-label={copy.openModelPicker}
            className={pillClass}
            disabled={disabled}
            onClick={() => setModelPickerOpen(true)}
            type="button"
            variant="ghost"
          >
            {label}
          </Button>
        </Tip>
      </div>
    )
  }

  // Closing the menu ends its claim on the keyboard: Radix restores focus to
  // this pill (a toolbar button), so without the release the Enter that
  // committed a model also swallows whatever you type next.
  const setMenuOpen = (next: boolean) => {
    setOpen(next)

    if (!next) {
      releaseTypingFocus()
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {contextCounter}
      <DropdownMenu onOpenChange={setMenuOpen} open={open}>
        <Tip label={title} side="top">
          <DropdownMenuTrigger asChild>
            <Button aria-label={title} className={pillClass} disabled={disabled} type="button" variant="ghost">
              {label}
            </Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-64 p-0" side="top" sideOffset={8}>
          <ModelMenuCloseContext.Provider value={() => setMenuOpen(false)}>
            {model.modelMenuContent}
          </ModelMenuCloseContext.Provider>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
