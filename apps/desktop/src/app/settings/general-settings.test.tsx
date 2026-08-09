import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $hapticsMuted } from '@/store/haptics'
import { $keepAwake } from '@/store/keep-awake'
import { $panesFlipped } from '@/store/layout'

import { GeneralSettings } from './general-settings'

const mocks = vi.hoisted(() => ({
  getAppBehavior: vi.fn(),
  notifyError: vi.fn(),
  setAppBehavior: vi.fn()
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      settings: {
        config: {
          keepAwakeDesc: 'Keep this computer awake during long tasks.',
          keepAwakeTitle: 'Keep computer awake'
        },
        general: {
          closeToTrayDesc: 'Keep Hermes running in the system tray when you close its window.',
          closeToTrayTitle: 'Close to tray',
          hapticsDesc: 'Use subtle tactile feedback for app actions when your device supports it.',
          hapticsTitle: 'Haptic feedback',
          swapSidebarSidesDesc: 'Put the sessions sidebar on the right and the workspace panes on the left.',
          desktopOnly: 'This setting is available in the Hermes desktop app.',
          intro: 'Everyday desktop behavior for this computer.',
          launchOnStartupDesc: 'Start Hermes automatically when you sign in to your computer.',
          launchOnStartupTitle: 'Launch Hermes at sign-in',
          launchOnStartupUnsupported: 'Launch at sign-in is available on Windows and macOS.',
          loadFailed: 'Could not load general settings',
          productivityIntro: 'Helpful desktop behavior without changing how the AI responds.',
          productivityTitle: 'Productivity',
          saveFailed: 'Could not save general settings',
          title: 'General'
        },
        quickEntry: {
          active: 'Active',
          enabledDesc: '',
          enabledTitle: '',
          invalidShortcut: '',
          shortcutDesc: '',
          shortcutTitle: '',
          takenBy: ''
        }
      },
      titlebar: {
        swapSidebarSides: 'Swap sidebar sides'
      }
    }
  })
}))

vi.mock('@/store/notifications', () => ({
  notifyError: (...args: unknown[]) => mocks.notifyError(...args)
}))

const originalDesktop = window.hermesDesktop

function installDesktopBridge() {
  Object.defineProperty(window, 'hermesDesktop', {
    configurable: true,
    value: {
      settings: {
        getAppBehavior: mocks.getAppBehavior,
        setAppBehavior: mocks.setAppBehavior
      }
    }
  })
}

describe('GeneralSettings', () => {
  beforeEach(() => {
    $hapticsMuted.set(false)
    $keepAwake.set(false)
    $panesFlipped.set(false)
    mocks.getAppBehavior.mockResolvedValue({
      closeToTray: false,
      launchOnStartup: true,
      launchOnStartupSupported: true
    })
    mocks.setAppBehavior.mockImplementation(async patch => ({
      closeToTray: patch.closeToTray ?? false,
      launchOnStartup: patch.launchOnStartup ?? true,
      launchOnStartupSupported: true
    }))
    installDesktopBridge()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    $hapticsMuted.set(false)
    $panesFlipped.set(false)
    Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: originalDesktop })
  })

  it('loads persistent desktop behavior and saves each toggle through the desktop bridge', async () => {
    await act(async () => {
      render(<GeneralSettings />)
    })

    const startup = await screen.findByRole('switch', { name: 'Launch Hermes at sign-in' })
    const tray = screen.getByRole('switch', { name: 'Close to tray' })

    expect(startup.getAttribute('data-state')).toBe('checked')
    expect(tray.getAttribute('data-state')).toBe('unchecked')

    await act(async () => {
      fireEvent.click(tray)
    })

    await waitFor(() => expect(mocks.setAppBehavior).toHaveBeenCalledWith({ closeToTray: true }))
    expect(tray.getAttribute('data-state')).toBe('checked')
  })

  it('does not expose launch-on-startup as editable where the OS does not support it', async () => {
    mocks.getAppBehavior.mockResolvedValue({
      closeToTray: false,
      launchOnStartup: false,
      launchOnStartupSupported: false
    })

    await act(async () => {
      render(<GeneralSettings />)
    })

    expect((await screen.findByRole('switch', { name: 'Launch Hermes at sign-in' })).hasAttribute('disabled')).toBe(
      true
    )
  })

  it('keeps haptic feedback with the everyday device preferences', async () => {
    await act(async () => {
      render(<GeneralSettings />)
    })

    const haptics = await screen.findByRole('switch', { name: 'Haptic feedback' })
    expect(haptics.getAttribute('data-state')).toBe('checked')

    await act(async () => {
      fireEvent.click(haptics)
    })

    expect($hapticsMuted.get()).toBe(true)
    expect(haptics.getAttribute('data-state')).toBe('unchecked')
  })

  it('moves the sidebar-side preference into General settings', async () => {
    await act(async () => {
      render(<GeneralSettings />)
    })

    const swapSides = await screen.findByRole('switch', { name: 'Swap sidebar sides' })
    expect(swapSides.getAttribute('data-state')).toBe('unchecked')

    await act(async () => {
      fireEvent.click(swapSides)
    })

    expect($panesFlipped.get()).toBe(true)
    expect(swapSides.getAttribute('data-state')).toBe('checked')
  })
})
