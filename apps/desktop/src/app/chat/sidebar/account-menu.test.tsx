import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setPetInfo } from '@/store/pet'
import { $petGallery } from '@/store/pet-gallery'

import { SidebarAccountMenu } from './account-menu'

const requestGateway = vi.fn()
const cloudStatus = vi.fn()
const cloudAccount = vi.fn()
const cloudLogin = vi.fn()
const cloudLogout = vi.fn()
const disconnectOAuthProvider = vi.fn()
const getNousPortalIdentity = vi.fn()
const listOAuthProviders = vi.fn()
const startManualProviderOAuth = vi.fn()

vi.mock('@/app/gateway/hooks/use-gateway-request', () => ({
  useGatewayRequest: () => ({ requestGateway })
}))

vi.mock('@/hermes', () => ({
  disconnectOAuthProvider: (providerId: string) => disconnectOAuthProvider(providerId),
  getNousPortalIdentity: () => getNousPortalIdentity(),
  listOAuthProviders: () => listOAuthProviders(),
  setApiRequestProfile: vi.fn()
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

vi.mock('@/store/onboarding', () => ({
  startManualProviderOAuth: (providerId: string, reason: null | string) => startManualProviderOAuth(providerId, reason)
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
    cloudAccount.mockResolvedValue({ displayName: null, email: null, signedIn: false })
    cloudLogin.mockResolvedValue({ ok: true, signedIn: true })
    cloudLogout.mockResolvedValue({ ok: true, signedIn: false })
    disconnectOAuthProvider.mockResolvedValue({ ok: true, provider: 'nous' })
    getNousPortalIdentity.mockResolvedValue({ display_name: null, email: null })
    listOAuthProviders.mockResolvedValue({ providers: [] })
    $petGallery.set(null)
    setPetInfo({ enabled: false })
    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: {
        cloud: {
          account: cloudAccount,
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

  it('opens the standard Nous sign-in flow for an unsigned account', async () => {
    renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign in with Nous Research' }))

    expect(startManualProviderOAuth).toHaveBeenCalledWith('nous', null)
    expect(cloudLogin).not.toHaveBeenCalled()
  })

  it('recognizes the current profile’s saved Nous credential', async () => {
    listOAuthProviders.mockResolvedValue({
      providers: [{ id: 'nous', status: { logged_in: true } }]
    })
    renderMenu()
    await openMenu()

    expect(await screen.findByText('Signed in')).toBeTruthy()
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeTruthy()
  })

  it('uses the active profile’s Nous account email when no Portal browser session exists', async () => {
    listOAuthProviders.mockResolvedValue({
      providers: [{ id: 'nous', status: { logged_in: true } }]
    })
    getNousPortalIdentity.mockResolvedValue({ display_name: null, email: 'ada@example.test' })
    renderMenu()
    await openMenu()

    expect((await screen.findAllByText('ada@example.test')).length).toBeGreaterThan(0)
  })

  it('shows the signed-in Portal account identity instead of the generic provider name', async () => {
    cloudStatus.mockResolvedValue({ signedIn: true })
    cloudAccount.mockResolvedValue({
      displayName: 'Ada Lovelace',
      email: 'ada@example.test',
      signedIn: true
    })
    renderMenu()
    await openMenu()

    expect((await screen.findAllByText('Ada Lovelace')).length).toBeGreaterThan(0)
    expect(await screen.findByText('ada@example.test')).toBeTruthy()
  })

  it('clears a saved Nous credential when signing out', async () => {
    listOAuthProviders.mockResolvedValue({
      providers: [{ id: 'nous', status: { logged_in: true } }]
    })
    renderMenu()
    await openMenu()

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    await waitFor(() => expect(disconnectOAuthProvider).toHaveBeenCalledWith('nous'))
    expect(cloudLogout).not.toHaveBeenCalled()
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
