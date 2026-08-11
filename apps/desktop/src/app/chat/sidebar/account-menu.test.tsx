import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setPetInfo } from '@/store/pet'
import { $petGallery } from '@/store/pet-gallery'

import { SidebarAccountMenu } from './account-menu'

const requestGateway = vi.fn()
const cloudStatus = vi.fn()
const cloudLogin = vi.fn()
const cloudLogout = vi.fn()

vi.mock('@/app/gateway/hooks/use-gateway-request', () => ({
  useGatewayRequest: () => ({ requestGateway })
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      settings: {
        appearance: {
          pet: {
            noneAvailable: 'No pet is available.',
            turnOffFailed: 'Could not hide pet.',
            turnOnFailed: 'Could not show pet.'
          }
        },
        gateway: {
          cloudSignInFailed: 'Could not sign in',
          cloudSignedOutMessage: 'Signed out of Nous Research.',
          cloudSignedOutTitle: 'Signed out',
          signInWith: (provider: string) => `Sign in with ${provider}`,
          signOut: 'Sign out',
          signOutFailed: 'Could not sign out',
          signedIn: 'Signed in'
        }
      }
    }
  })
}))

vi.mock('@/store/notifications', () => ({
  notify: vi.fn(),
  notifyError: vi.fn()
}))

function LocationProbe() {
  const location = useLocation()

  return <output data-testid="location">{location.pathname}</output>
}

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <SidebarAccountMenu />
      <LocationProbe />
    </MemoryRouter>
  )
}

async function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Nous Research account' })

  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.click(trigger)

  return screen.findByRole('menu')
}

describe('SidebarAccountMenu', () => {
  const originalDesktop = window.hermesDesktop

  beforeEach(() => {
    requestGateway.mockReset()
    cloudStatus.mockResolvedValue({ signedIn: false })
    cloudLogin.mockResolvedValue({ ok: true, signedIn: true })
    cloudLogout.mockResolvedValue({ ok: true, signedIn: false })
    $petGallery.set(null)
    setPetInfo({ enabled: false })
    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: {
        cloud: {
          login: cloudLogin,
          logout: cloudLogout,
          status: cloudStatus
        }
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: originalDesktop })
  })

  it('opens a bottom account menu with pet, settings, and Nous sign-in actions', async () => {
    renderMenu()
    await openMenu()

    expect(screen.getByRole('menuitem', { name: 'Show pet' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Sign in with Nous Research' })).toBeTruthy()
  })

  it('opens Settings from the account menu', async () => {
    renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/settings'))
  })

  it('shows the selected pet through the existing pet control', async () => {
    $petGallery.set({
      active: 'boba',
      enabled: false,
      pets: [{ displayName: 'Boba', installed: true, slug: 'boba' }]
    })
    requestGateway.mockImplementation(async method => {
      if (method === 'pet.info') {
        return { enabled: true, slug: 'boba', spritesheetBase64: 'sprite' }
      }

      return { ok: true }
    })
    renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Show pet' }))

    await waitFor(() => expect(requestGateway.mock.calls[0]?.[0]).toBe('pet.select'))
    expect($petGallery.get()?.enabled).toBe(true)
  })

  it('uses the Nous Portal desktop login action', async () => {
    renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign in with Nous Research' }))

    await waitFor(() => expect(cloudLogin).toHaveBeenCalledOnce())
  })

  it('switches to the real Portal logout action for a signed-in account', async () => {
    cloudStatus.mockResolvedValue({ signedIn: true })
    renderMenu()
    await openMenu()

    const logout = await screen.findByRole('menuitem', { name: 'Sign out' })
    fireEvent.click(logout)

    await waitFor(() => expect(cloudLogout).toHaveBeenCalledOnce())
  })
})
