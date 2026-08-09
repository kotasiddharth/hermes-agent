/**
 * Settings for how the desktop shell behaves outside an individual chat.
 *
 * The main process owns these because both choices affect the operating system
 * before the renderer is available (login startup) or after it is hidden
 * (close to tray).
 */
export interface AppBehaviorSettings {
  closeToTray: boolean
  launchOnStartup: boolean
}

export const DEFAULT_APP_BEHAVIOR_SETTINGS: AppBehaviorSettings = {
  closeToTray: false,
  launchOnStartup: false
}

export function sanitizeAppBehaviorSettings(raw: unknown): AppBehaviorSettings {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  return {
    closeToTray: record.closeToTray === true,
    launchOnStartup: record.launchOnStartup === true
  }
}

export function patchAppBehaviorSettings(current: AppBehaviorSettings, patch: unknown): AppBehaviorSettings {
  const record = patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : {}

  return {
    closeToTray: typeof record.closeToTray === 'boolean' ? record.closeToTray : current.closeToTray,
    launchOnStartup: typeof record.launchOnStartup === 'boolean' ? record.launchOnStartup : current.launchOnStartup
  }
}
