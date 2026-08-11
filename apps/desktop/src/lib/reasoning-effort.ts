import { normalize } from '@/lib/text'

/** Hermes' reasoning levels, in ascending order — mirrors the backend's
 *  VALID_REASONING_EFFORTS (hermes_constants.py). `none` is not a level: it's
 *  thinking disabled, owned by the Thinking toggle rather than the scale. */
export const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

/** The scale plus the off state — the full set a config value may hold. */
export const REASONING_EFFORT_VALUES = ['none', ...REASONING_EFFORTS] as const

/** Hermes' built-in level when neither the surface nor the profile config
 *  specifies one (mirrors the backend's own fallback). */
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium'

/** Compact labels for chrome where space is tight (pill, picker rows). Menus
 *  and settings use the translated `shell.modelOptions` strings instead. */
const SHORT_LABELS: Record<string, string> = {
  none: 'Off',
  minimal: 'Min',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
  ultra: 'Ultra'
}

export function reasoningEffortLabel(effort: string): string {
  const key = normalize(effort)

  return key ? (SHORT_LABELS[key] ?? effort) : ''
}

export const isReasoningEffort = (value: string): value is ReasoningEffort =>
  REASONING_EFFORTS.includes(normalize(value) as ReasoningEffort)

/**
 * Normalize a model's advertised named effort levels into Hermes' stable
 * ordering. `undefined` deliberately means the backend did not report this
 * metadata (older gateways / custom endpoints), while `[]` means the model
 * supports thinking but exposes no named effort dial (for example, a native
 * on/off or budget-only control).
 */
export function supportedReasoningEfforts(efforts: readonly string[] | undefined): ReasoningEffort[] {
  if (efforts === undefined) {
    return [...REASONING_EFFORTS]
  }

  const advertised = new Set(efforts.map(normalize).filter(isReasoningEffort))

  return REASONING_EFFORTS.filter(effort => advertised.has(effort))
}

/**
 * Returns the strongest level a model explicitly advertises. Missing metadata
 * is intentionally not treated as the full ladder: the UI must not label a
 * guessed ceiling as the model's maximum.
 */
export function highestAdvertisedReasoningEffort(efforts: readonly string[] | undefined): ReasoningEffort | undefined {
  return efforts === undefined ? undefined : supportedReasoningEfforts(efforts).at(-1)
}

/**
 * Resolve an effort against one model's advertised levels. A request above a
 * model's ceiling is clamped to the strongest supported level at or below the
 * request, never silently promoted to a more expensive setting. The `none`
 * off state is preserved for callers that write it back to a session.
 */
export function resolveSupportedReasoningEffort(
  effort: string,
  fallback: string = DEFAULT_REASONING_EFFORT,
  supported: readonly string[] | undefined
): string {
  const value = normalize(effort || fallback)

  if (value === 'none') {
    return 'none'
  }

  const resolved = isReasoningEffort(value) ? value : DEFAULT_REASONING_EFFORT

  // An unreported capability must remain backwards-compatible with older
  // gateways, and a toggle-only model still needs a generic enabled value for
  // the backend to turn thinking back on.
  if (supported === undefined) {
    return resolved
  }

  const options = supportedReasoningEfforts(supported)

  if (options.length === 0 || options.includes(resolved)) {
    return resolved
  }

  const requestedIndex = REASONING_EFFORTS.indexOf(resolved)

  const strongestNotAboveRequest = [...options]
    .reverse()
    .find(option => REASONING_EFFORTS.indexOf(option) <= requestedIndex)

  return strongestNotAboveRequest ?? options[0]
}

/** Thinking is on unless a level explicitly says otherwise; an empty value
 *  means "inherit", so it resolves through `fallback` first. */
export const isThinkingEnabled = (effort: string, fallback: string = DEFAULT_REASONING_EFFORT): boolean =>
  normalize(effort || fallback) !== 'none'

/** The level a scale control should show. Empty inherits `fallback`; `none`
 *  (thinking off) selects nothing; anything unrecognized clamps to the default. */
export function resolveReasoningEffort(effort: string, fallback: string = DEFAULT_REASONING_EFFORT): string {
  const value = resolveSupportedReasoningEffort(effort, fallback, undefined)

  if (value === 'none') {
    return ''
  }

  return value
}
