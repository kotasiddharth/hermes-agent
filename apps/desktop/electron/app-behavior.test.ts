import { describe, expect, it } from 'vitest'

import {
  DEFAULT_APP_BEHAVIOR_SETTINGS,
  patchAppBehaviorSettings,
  sanitizeAppBehaviorSettings
} from './app-behavior'

describe('app behavior settings', () => {
  it('uses safe defaults for missing or malformed persisted settings', () => {
    expect(sanitizeAppBehaviorSettings(undefined)).toEqual(DEFAULT_APP_BEHAVIOR_SETTINGS)
    expect(sanitizeAppBehaviorSettings({ closeToTray: 'yes', launchOnStartup: 1 })).toEqual(
      DEFAULT_APP_BEHAVIOR_SETTINGS
    )
  })

  it('keeps only explicit boolean persisted settings', () => {
    expect(sanitizeAppBehaviorSettings({ closeToTray: true, launchOnStartup: false })).toEqual({
      closeToTray: true,
      launchOnStartup: false
    })
  })

  it('patches only known boolean values', () => {
    expect(
      patchAppBehaviorSettings(
        { closeToTray: false, launchOnStartup: true },
        { closeToTray: true, launchOnStartup: 'keep this', unknown: false }
      )
    ).toEqual({ closeToTray: true, launchOnStartup: true })
  })
})
