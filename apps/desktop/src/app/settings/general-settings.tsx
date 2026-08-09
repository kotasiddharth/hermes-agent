import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { $hapticsMuted, setHapticsMuted } from '@/store/haptics'
import { $keepAwake, setKeepAwake } from '@/store/keep-awake'
import { notifyError } from '@/store/notifications'

import { SettingsContent, SettingsGroup, SettingsPageHeader, ToggleRow } from './primitives'
import { QuickEntrySettings } from './quick-entry-settings'

type AppBehaviorState = {
  closeToTray: boolean
  launchOnStartup: boolean
  launchOnStartupSupported: boolean
}

const DEFAULT_APP_BEHAVIOR: AppBehaviorState = {
  closeToTray: false,
  launchOnStartup: false,
  launchOnStartupSupported: false
}

/** Everyday device behavior, separate from backend and raw configuration knobs. */
export function GeneralSettings() {
  const { t } = useI18n()
  const copy = t.settings.general
  const keepAwake = useStore($keepAwake)
  const hapticsMuted = useStore($hapticsMuted)
  const [appBehavior, setAppBehavior] = useState(DEFAULT_APP_BEHAVIOR)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let mounted = true
    const api = window.hermesDesktop?.settings

    if (!api?.getAppBehavior || !api.setAppBehavior) {
      setLoading(false)

      return () => {
        mounted = false
      }
    }

    setAvailable(true)
    void api
      .getAppBehavior()
      .then(settings => {
        if (mounted) {
          setAppBehavior(settings)
        }
      })
      .catch(error => {
        if (mounted) {
          notifyError(error, copy.loadFailed)
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [copy.loadFailed])

  const updateAppBehavior = (patch: Partial<Pick<AppBehaviorState, 'closeToTray' | 'launchOnStartup'>>) => {
    const api = window.hermesDesktop?.settings

    if (!api?.setAppBehavior) {
      return
    }

    const previous = appBehavior
    setAppBehavior({ ...previous, ...patch })

    void api.setAppBehavior(patch).then(setAppBehavior).catch(error => {
      setAppBehavior(previous)
      notifyError(error, copy.saveFailed)
    })
  }

  const desktopUnavailable = !available || loading

  const setHapticsEnabled = (enabled: boolean) => {
    const wasMuted = hapticsMuted
    setHapticsMuted(!enabled)

    // A disabled actuator cannot acknowledge the click that enables it, so
    // fire the confirmation only after its preference is restored. Disabling
    // is already acknowledged by ToggleRow before this handler runs.
    if (enabled && wasMuted) {
      window.requestAnimationFrame(() => triggerHaptic('success'))
    }
  }

  return (
    <SettingsContent>
      <SettingsPageHeader description={copy.intro} title={copy.title} />

      <SettingsGroup>
        <ToggleRow
          checked={appBehavior.launchOnStartup}
          description={
            appBehavior.launchOnStartupSupported ? copy.launchOnStartupDesc : copy.launchOnStartupUnsupported
          }
          disabled={desktopUnavailable || !appBehavior.launchOnStartupSupported}
          label={copy.launchOnStartupTitle}
          onChange={launchOnStartup => updateAppBehavior({ launchOnStartup })}
        />
        <ToggleRow
          checked={appBehavior.closeToTray}
          description={available ? copy.closeToTrayDesc : copy.desktopOnly}
          disabled={desktopUnavailable}
          label={copy.closeToTrayTitle}
          onChange={closeToTray => updateAppBehavior({ closeToTray })}
        />
        <ToggleRow
          checked={!hapticsMuted}
          description={copy.hapticsDesc}
          label={copy.hapticsTitle}
          onChange={setHapticsEnabled}
        />
      </SettingsGroup>

      <div className="mt-7">
        <SettingsPageHeader description={copy.productivityIntro} title={copy.productivityTitle} />
        <SettingsGroup>
          <ToggleRow
            checked={keepAwake}
            description={t.settings.config.keepAwakeDesc}
            label={t.settings.config.keepAwakeTitle}
            onChange={setKeepAwake}
          />
          <QuickEntrySettings />
        </SettingsGroup>
      </div>
    </SettingsContent>
  )
}
