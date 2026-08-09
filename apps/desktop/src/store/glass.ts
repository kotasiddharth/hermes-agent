/**
 * Renderer-only glass treatment for the app's static chrome. This deliberately
 * does not change native window opacity (see `translucency.ts`), and avoids
 * applying a backdrop filter to the streaming chat timeline.
 */
import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

const KEY = 'hermes.desktop.glass.v1'

export const GLASS_PRESETS = ['solid', 'subtle', 'frosted'] as const

export type GlassPreset = (typeof GLASS_PRESETS)[number]

export const DEFAULT_GLASS_PRESET: GlassPreset = 'subtle'

export function normalizeGlassPreset(value: string | null | undefined): GlassPreset {
  return GLASS_PRESETS.includes(value as GlassPreset) ? (value as GlassPreset) : DEFAULT_GLASS_PRESET
}

const read = (): GlassPreset => normalizeGlassPreset(storedString(KEY))

export const $glassPreset = atom<GlassPreset>(typeof window === 'undefined' ? DEFAULT_GLASS_PRESET : read())

export function setGlassPreset(preset: GlassPreset): void {
  $glassPreset.set(normalizeGlassPreset(preset))
}

if (typeof window !== 'undefined') {
  $glassPreset.subscribe(preset => {
    persistString(KEY, preset)
    document.documentElement.dataset.hermesGlass = preset
  })
}
