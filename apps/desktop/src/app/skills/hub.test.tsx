// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryClient } from '@/lib/query-client'
import type { McpCatalogEntry, SkillHubSourcesResponse } from '@/types/hermes'

const activeProfile = atom('default')
const activeSessionId = atom<string | null>('session-1')
const addSkillHubTap = vi.fn()
const gateway = atom<null | { request: ReturnType<typeof vi.fn> }>(null)
const getGoogleWorkspaceStatus = vi.fn()
const getMcpCatalog = vi.fn()
const getSkillHubSources = vi.fn()
const getSkillHubTaps = vi.fn()
const removeSkillHubTap = vi.fn()
const searchSkillsHub = vi.fn()

vi.mock('@/hermes', () => ({
  addSkillHubTap: (repo: string) => addSkillHubTap(repo),
  authMcpServer: vi.fn(),
  getActionStatus: vi.fn(),
  getGoogleWorkspaceStatus: () => getGoogleWorkspaceStatus(),
  getMcpCatalog: () => getMcpCatalog(),
  getMcpOAuthFlow: vi.fn(),
  getSkillHubSources: () => getSkillHubSources(),
  getSkillHubTaps: () => getSkillHubTaps(),
  installMcpCatalogEntry: vi.fn(),
  installSkillFromHub: vi.fn(),
  previewSkillHub: vi.fn(),
  removeSkillHubTap: (repo: string) => removeSkillHubTap(repo),
  scanSkillHub: vi.fn(),
  searchSkillsHub: (term: string, source: string) => searchSkillsHub(term, source),
  setMcpServerEnabled: vi.fn(),
  uninstallSkillFromHub: vi.fn(),
  updateSkillsFromHub: vi.fn()
}))

vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))
vi.mock('@/lib/mcp-dashboard-oauth', () => ({ completeMcpDesktopOAuth: vi.fn() }))
vi.mock('@/store/gateway', () => ({ $gateway: gateway }))
vi.mock('@/store/notifications', () => ({ notify: vi.fn(), notifyError: vi.fn() }))
vi.mock('@/store/profile', () => ({
  $activeGatewayProfile: activeProfile,
  normalizeProfileKey: (profile: null | string | undefined) => profile?.trim() || 'default'
}))
vi.mock('@/store/session', () => ({ $activeSessionId: activeSessionId }))

function integration(patch: Partial<McpCatalogEntry> = {}): McpCatalogEntry {
  return {
    args: [],
    authenticated: null,
    auth_type: 'none',
    bootstrap: [],
    command: null,
    default_enabled: null,
    description: 'Work with Linear issues and projects.',
    enabled: false,
    install_ref: null,
    install_url: null,
    installed: false,
    name: 'linear',
    needs_install: false,
    post_install: '',
    required_env: [],
    source: 'https://linear.app',
    transport: 'http',
    url: 'https://mcp.linear.app',
    ...patch
  }
}

function sources(): SkillHubSourcesResponse {
  return {
    featured: [
      {
        description: 'Write clear, effective prompts for a task.',
        identifier: 'official/prompt-writer',
        name: 'Prompt writer',
        repo: null,
        source: 'official',
        tags: ['writing'],
        trust_level: 'builtin'
      }
    ],
    index_available: true,
    installed: {
      'official/local-helper': {
        name: 'Local helper',
        scan_verdict: null,
        trust_level: 'builtin'
      }
    },
    sources: [{ id: 'official', label: 'Official', searchable: true }]
  }
}

async function renderHub() {
  const { SkillsHub } = await import('./hub')
  let result: ReturnType<typeof render>

  await act(async () => {
    result = render(
      <QueryClientProvider client={queryClient}>
        <SkillsHub query="" />
      </QueryClientProvider>
    )
  })

  return result!
}

beforeEach(() => {
  activeProfile.set('default')
  activeSessionId.set('session-1')
  gateway.set(null)
  getGoogleWorkspaceStatus.mockResolvedValue({ configured: false, connected: false, scopes: [] })
  getMcpCatalog.mockResolvedValue({
    diagnostics: [],
    entries: [integration(), integration({ enabled: true, installed: true, name: 'notion' })]
  })
  getSkillHubSources.mockResolvedValue(sources())
  getSkillHubTaps.mockResolvedValue({ taps: [] })
  addSkillHubTap.mockResolvedValue({ added: true, ok: true, repo: 'octo/skills' })
  removeSkillHubTap.mockResolvedValue({ ok: true, removed: true, repo: 'octo/skills' })
  searchSkillsHub.mockResolvedValue({ installed: {}, results: [], source_counts: {}, timed_out: [] })
})

afterEach(async () => {
  const { $hubActions, $hubActiveLog, $hubInstalledOverride } = await import('@/store/hub-actions')

  $hubActions.set({})
  $hubActiveLog.set(null)
  $hubInstalledOverride.set({})
  cleanup()
  queryClient.clear()
  vi.clearAllMocks()
})

describe('SkillsHub', () => {
  it('shortens long summaries while preserving a compact card description', async () => {
    const { shortHubDescription } = await import('./hub')

    expect(shortHubDescription('A'.repeat(150))).toBe(`${'A'.repeat(120)}…`)
    expect(shortHubDescription('A concise description.')).toBe('A concise description.')
  })

  it('keeps installed integrations in the browse results instead of duplicating the Installed tab', async () => {
    await renderHub()

    await screen.findByText('Featured skills')
    expect(screen.getByText('Prompt writer')).toBeTruthy()
    expect(screen.queryByText('Local helper')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Ready Notion' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Install Linear' })).toBeTruthy()
  })

  it('refreshes installed state when the active profile changes', async () => {
    getSkillHubSources.mockImplementation(() =>
      Promise.resolve({
        ...sources(),
        installed:
          activeProfile.get() === 'work'
            ? {}
            : {
                'official/prompt-writer': {
                  name: 'Prompt writer',
                  scan_verdict: null,
                  trust_level: 'builtin'
                }
              }
      })
    )

    await renderHub()

    expect(await screen.findByRole('button', { name: 'Uninstall' })).toBeTruthy()

    await act(async () => activeProfile.set('work'))

    await waitFor(() => expect(getSkillHubSources).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Install' })).toBeTruthy()
  })

  it('filters the same Hub between skills and integrations', async () => {
    await renderHub()

    await screen.findByText('Prompt writer')
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))

    await waitFor(() => expect(screen.queryByText('Prompt writer')).toBeNull())
    expect(await screen.findByRole('button', { name: 'Install Linear' })).toBeTruthy()
  })

  it('adds a GitHub marketplace from Browse Hub', async () => {
    await renderHub()

    fireEvent.click(await screen.findByRole('button', { name: 'Add marketplace' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'GitHub repository' }), {
      target: { value: 'https://github.com/octo/skills' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add marketplace' }))

    await waitFor(() => expect(addSkillHubTap).toHaveBeenCalledWith('https://github.com/octo/skills'))
  })
})
