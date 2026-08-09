import { afterEach, describe, expect, it } from 'vitest'

import { storedString } from '@/lib/storage'

import { $glassPreset, DEFAULT_GLASS_PRESET, normalizeGlassPreset, setGlassPreset } from './glass'

const KEY = 'hermes.desktop.glass.v1'

afterEach(() => {
  setGlassPreset(DEFAULT_GLASS_PRESET)
})

describe('glass preference', () => {
  it('uses a safe default for missing or stale values', () => {
    expect(normalizeGlassPreset(null)).toBe(DEFAULT_GLASS_PRESET)
    expect(normalizeGlassPreset('unexpected')).toBe(DEFAULT_GLASS_PRESET)
    expect(normalizeGlassPreset('frosted')).toBe('frosted')
  })

  it('persists the choice and applies it to the document before the UI renders', () => {
    setGlassPreset('solid')

    expect($glassPreset.get()).toBe('solid')
    expect(storedString(KEY)).toBe('solid')
    expect(document.documentElement.dataset.hermesGlass).toBe('solid')
  })
})
