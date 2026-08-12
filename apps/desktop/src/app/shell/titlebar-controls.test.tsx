import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

import { TitlebarControls } from './titlebar-controls'

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
})

afterEach(cleanup)

function renderControls(showAppMenu = true) {
  return render(
    <I18nProvider configClient={null} initialLocale="en">
      <MemoryRouter>
        <TitlebarControls onOpenSettings={vi.fn()} showAppMenu={showAppMenu} />
      </MemoryRouter>
    </I18nProvider>
  )
}

describe('TitlebarControls', () => {
  it('renders the sidebar, navigation, and desktop menu controls in one leading cluster', () => {
    renderControls()
    const controls = screen.getByLabelText('Window controls')

    expect(within(controls).getByRole('button', { name: /sidebar/i })).toBeTruthy()
    expect(within(controls).getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(within(controls).getByRole('button', { name: 'Forward' })).toBeTruthy()
    expect(within(controls).getByRole('button', { name: 'File' })).toBeTruthy()
    expect(within(controls).getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(within(controls).getByRole('button', { name: 'View' })).toBeTruthy()
    expect(within(controls).getByRole('button', { name: 'Help' })).toBeTruthy()
  })

  it('opens File with the primary desktop actions', async () => {
    renderControls()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'File' }), { button: 0 })

    expect(await screen.findByRole('menuitem', { name: /new session/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /new window/i })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /open folder as project/i })).toBeNull()
  })

  it('does not duplicate the native macOS menu bar', () => {
    renderControls(false)

    expect(screen.queryByRole('button', { name: 'File' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })
})
