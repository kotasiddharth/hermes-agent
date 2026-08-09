import { cn } from '@/lib/utils'

/**
 * The composer surface and the status/queue stack paint ONE shared
 * `--composer-fill` var. The state ladder (rest / scrolled) lives in styles.css
 * on `[data-slot='composer-root']`, so the layers can never disagree.
 */
// Keep the main composer translucent without a backdrop filter: it sits over a
// transcript that repaints while streaming, and blurring that moving content is
// needlessly expensive. Menus and small floating pills can safely use blur.
export const composerFill = 'glass-composer-surface'

/** Backdrop treatment for short-lived composer menus. */
export const composerPanelGlass = cn('glass-composer-panel', 'transition-[background-color] duration-150 ease-out')

// The composer stays visible above a transcript that repaints for every
// streamed token. Backdrop blur forces Chromium to resample that moving
// surface, so retain the color transition but skip the per-frame blur work.
export const composerSurfaceGlass = 'transition-[background-color] duration-150 ease-out'

const composerDockEdge = (edge: 'bottom' | 'top') =>
  cn(
    'border border-border/65',
    edge === 'top'
      ? 'rounded-t-[var(--composer-surface-radius)] border-b-0'
      : 'rounded-b-[var(--composer-surface-radius)] border-t-0'
  )

/** Glassy docked card — the status stack / queue. Paints the SAME
 *  `--composer-fill` as the surface, so rest / scrolled / focused / drawer-open
 *  all match the composer by construction. */
export const composerDockCard = (edge: 'bottom' | 'top' = 'top') =>
  cn(composerDockEdge(edge), composerFill, composerSurfaceGlass)

/** Floating composer panel skin — the `/`·`@`·`?` completion drawer and the
 *  attach (`+`) menu. Glassy translucent card, hairline border, full radius,
 *  smallest type, soft nous shadow. Uses an explicit fill (not `--composer-fill`)
 *  so it renders identically whether mounted inside the composer or portaled out
 *  of it. Visual skin only — consumers add their own size/position/padding. */
export const composerPanelCard = cn(
  'rounded-[var(--composer-surface-radius)] border border-border/65 shadow-nous text-[length:var(--conversation-tool-font-size)]',
  composerPanelGlass
)

/**
 * A quiet control floating over composer content — the micro-action pills above
 * the surface, the Open affordance on a hovered link inside it. Full radius,
 * hairline border, the composer's own fill behind a blur so the text underneath
 * never shows through. Sized against the composer's control height so a pill
 * lines up with the chrome it floats above.
 *
 * Skin and size only; the call site owns position, width caps, and disabled
 * state.
 */
export const composerFloatingPill = cn(
  'inline-flex h-(--composer-control-size) shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5',
  'glass-composer-pill border border-border/65',
  'text-xs font-normal text-(--ui-text-secondary) transition-colors',
  'hover:bg-(--chrome-action-hover) hover:text-foreground'
)

/**
 * Shared grid for the chrome-free floating strips that bracket the composer —
 * the micro-action pills above the surface and the `composer.underside` slot
 * below it.
 *
 * Both are in-flow children of the composer DOCK, siblings of the composer
 * itself rather than children of it. That's deliberate: the pop-out drag
 * region is `absolute inset-0` inside the composer, so anything rendered in
 * there is inside the grab area by construction. Living outside makes that
 * impossible instead of something the gesture has to exclude.
 *
 * One parent and one constant means the two strips share a left edge without
 * anyone matching numbers across files. Vertical spacing stays at the call
 * site; the horizontal inset matches the composer's 5px grab margin so the
 * strips line up with the surface rather than the margin's outer edge.
 */
export const composerFloatingStrip = 'flex flex-wrap items-center gap-1.5'
