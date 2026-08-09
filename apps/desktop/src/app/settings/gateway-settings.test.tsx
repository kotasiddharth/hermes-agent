import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getConnectionConfig = vi.fn()
const saveConnectionConfig = vi.fn()

const localConnection = {
  cloudOrg: '',
  envOverride: false,
  mode: 'local',
  remoteAuthMode: 'token',
  remoteOauthConnected: false,
  remoteTokenPreview: null,
  remoteTokenSet: false,
  remoteUrl: ''
}

beforeEach(() => {
  getConnectionConfig.mockResolvedValue(localConnection)
  saveConnectionConfig.mockResolvedValue(localConnection)
  Object.defineProperty(window, 'hermesDesktop', {
    configurable: true,
    value: { getConnectionConfig, saveConnectionConfig }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GatewaySettings', () => {
  it('loads one global connection without profile selectors', async () => {
    const { GatewaySettings } = await import('./gateway-settings')

    render(<GatewaySettings />)
    expect(await screen.findByText('Local gateway')).toBeTruthy()
    expect(
      screen.getByText('Start a private Hermes backend on localhost. This is the default and works offline.')
    ).toBeTruthy()

    expect(getConnectionConfig).toHaveBeenCalledWith()
    expect(screen.queryByText('Applies to')).toBeNull()
  })

  it('does not save a profile or SSH remote-profile mapping', async () => {
    getConnectionConfig.mockResolvedValue({
      ...localConnection,
      mode: 'ssh',
      sshHost: 'remote-box',
      sshKeyPath: '',
      sshPort: 22,
      sshRemoteHermesPath: '/opt/hermes/bin/hermes',
      sshUser: 'alice'
    })
    const { GatewaySettings } = await import('./gateway-settings')

    render(<GatewaySettings />)
    await screen.findByDisplayValue('remote-box')
    expect(screen.queryByText('Remote profile (optional)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save for next restart' }))

    await waitFor(() => expect(saveConnectionConfig).toHaveBeenCalled())
    expect(saveConnectionConfig.mock.calls[0]?.[0]).not.toHaveProperty('profile')
    expect(saveConnectionConfig.mock.calls[0]?.[0]).not.toHaveProperty('sshRemoteProfile')
  })
})
