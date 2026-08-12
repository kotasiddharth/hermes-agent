import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { $notifications, clearNotifications } from '@/store/notifications'

vi.mock('@/store/coding-status', () => ({
  registerRepoStatusCwd: () => undefined,
  repoStatusForCwd: (cwd?: string) =>
    atom(
      cwd === '/folder'
        ? null
        : {
            added: 12,
            ahead: 0,
            behind: 0,
            branch: 'bb/hitbox',
            defaultBranch: 'main',
            detached: false,
            removed: 3,
            untracked: 0
          }
    ),
  repoWorktreesForCwd: () => atom([])
}))

vi.mock('@/store/projects', () => ({
  $projects: atom([]),
  $projectTree: atom([
    { id: 'project-1', isAuto: false, isNoProject: false },
    { id: 'auto-project', isAuto: true, isNoProject: false }
  ]),
  projectIdForCwd: (cwd: string) =>
    cwd === '/outside-a-project' ? null : cwd === '/automatic-project' ? 'auto-project' : 'project-1'
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      common: { copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed', failed: 'Failed' },
      fileMenu: { copyPath: 'Copy Path' },
      rightSidebar: { changeCwdTitle: 'Change working directory' },
      sidebar: { projects: { convertBranch: 'Convert branch', startWork: 'Start work' } },
      statusStack: {
        coding: {
          ahead: (count: number) => `${count} ahead`,
          behind: (count: number) => `${count} behind`,
          branchOffFrom: (branch: string) => `New branch from ${branch}`,
          changed: (count: number) => `${count} changed`,
          detached: 'Detached',
          newBranch: 'New branch',
          noBranch: 'No branch',
          switchFailed: (branch: string) => `Could not switch to ${branch}`,
          switchTo: (branch: string) => `Switch to ${branch}`,
          worktrees: 'Worktrees'
        }
      }
    }
  })
}))

const { CodingStatusRow } = await import('./coding-row')

describe('CodingStatusRow', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens the review pane from the branch and the diff counts, never the bar itself', () => {
    const onOpen = vi.fn()

    const { container } = render(<CodingStatusRow onOpen={onOpen} repoPath="/repo" />)

    const bar = container.querySelector<HTMLElement>('.coding-status-bar')

    expect(bar).not.toBeNull()

    fireEvent.click(bar!)
    expect(onOpen).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('bb/hitbox'))
    expect(onOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('12'))
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('uses an attached project rail above the composer', () => {
    const { container } = render(<CodingStatusRow onOpen={() => undefined} repoPath="/repo" />)

    const bar = container.querySelector<HTMLElement>('.coding-status-bar')
    const card = container.querySelector<HTMLElement>('[data-slot="coding-status-card"]')

    expect(card?.classList.contains('mb-1.5')).toBe(false)
    expect(card?.classList.contains('mx-9')).toBe(true)
    expect(card?.classList.contains('rounded-b-none')).toBe(true)
    expect(bar?.classList.contains('border-b')).toBe(false)
  })

  it('renders the directory, connection, and branch as one workspace breadcrumb', () => {
    render(<CodingStatusRow onOpen={() => undefined} repoPath="/repo" />)

    expect(screen.getByText('repo')).toBeTruthy()
    expect(screen.getByText('Local')).toBeTruthy()
    expect(screen.getByText('bb/hitbox').closest('button')).toBeTruthy()
    expect(screen.getByText('12').closest('button')?.classList.contains('contents')).toBe(true)
  })

  it('keeps the directory breadcrumb visible for a non-Git project folder', () => {
    render(<CodingStatusRow onOpen={() => undefined} repoPath="/folder" />)

    expect(screen.getByText('folder')).toBeTruthy()
    expect(screen.getByText('Local')).toBeTruthy()
    expect(screen.queryByText('bb/hitbox')).toBeNull()
  })

  it('shows the directory strip only for project chats and yields to queued work', () => {
    const { container, rerender } = render(<CodingStatusRow repoPath="/outside-a-project" />)

    expect(container.querySelector('[data-slot="coding-status-card"]')).toBeNull()

    rerender(<CodingStatusRow repoPath="/automatic-project" />)

    expect(container.querySelector('[data-slot="coding-status-card"]')).toBeNull()

    rerender(<CodingStatusRow hasQueuedPrompts repoPath="/repo" />)

    expect(container.querySelector('[data-slot="coding-status-card"]')).toBeNull()
  })

  it('opens the directory picker action from the project folder label', () => {
    const onChangeDirectory = vi.fn()

    render(<CodingStatusRow onChangeDirectory={onChangeDirectory} onOpen={() => undefined} repoPath="/repo" />)

    fireEvent.click(screen.getByRole('button', { name: 'Change working directory' }))

    expect(onChangeDirectory).toHaveBeenCalledTimes(1)
  })

  it('keeps the copy affordance next to the folder name', () => {
    render(<CodingStatusRow onOpen={() => undefined} repoPath="/Users/someone/www/repo" />)

    const path = screen.getByText('repo')

    expect(path.parentElement?.classList.contains('group/workspace')).toBe(true)
    expect(path.nextElementSibling?.tagName).toBe('BUTTON')
  })

  it('copies the absolute cwd inline — checkmark feedback, no toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    clearNotifications()

    render(<CodingStatusRow onOpen={() => undefined} repoPath="/Users/someone/www/repo" />)

    // Painted as a folder name, copied as the raw absolute directory.
    expect(screen.getByText('repo')).toBeTruthy()

    const copy = screen.getByRole('button', { name: 'Copy Path' })

    fireEvent.click(copy)

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('/Users/someone/www/repo'))
    // Confirmation is the button turning into a checkmark, not a notification.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
    expect($notifications.get()).toHaveLength(0)
  })
})
