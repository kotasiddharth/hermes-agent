import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetBackendSkinSync, ingestBackendSkin } from './backend-sync'
import { modePref, skinPref, ThemeProvider } from './context'

// The live-authoring loop: Hermes writes/edits one skin file and every surface
// repaints. An in-place edit keeps the NAME — only the palette moves.
const bloomberg = (foreground: string) => ({
  name: 'bloomberg',
  colors: { background: '#000000', ui_text: foreground, ui_accent: '#ff8000' }
})

const cssVar = (name: string) => window.document.documentElement.style.getPropertyValue(name)

describe('ThemeProvider ← backend skin sync', () => {
  let setTitleBarTheme: ReturnType<typeof vi.fn>

  beforeEach(() => {
    window.localStorage.clear()
    __resetBackendSkinSync()
    setTitleBarTheme = vi.fn()
    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: { setTitleBarTheme }
    })
  })

  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, 'hermesDesktop')
  })

  it('uses the renderer titlebar surface for the native overlay', () => {
    skinPref.assign('default', 'graphite')
    modePref.assign('default', 'dark')

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    expect(setTitleBarTheme).toHaveBeenLastCalledWith({
      background: '#151718',
      foreground: '#e6e9e8',
      titleBarBackground: '#242729'
    })
  })

  it('applies an activated backend skin', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))

    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')
    expect(cssVar('--theme-background-seed')).toBe('#000000')
  })

  it('repaints an in-place edit of the ACTIVE skin (same name, new palette)', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))
    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')

    // Recolor the same skin file. The same-name apply guard correctly no-ops
    // (protects manual desktop picks), so the repaint must come from the
    // registry update reaching the active theme derivation.
    act(() => ingestBackendSkin(bloomberg('#ff2d95'), { apply: true }))
    expect(cssVar('--theme-foreground')).toBe('#ff2d95')
  })

  it('does not repaint an edit to an INACTIVE skin', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))

    // A different skin registered without apply (e.g. seeded on reconnect)
    // must not touch the painted theme.
    act(() =>
      ingestBackendSkin({ name: 'forest', colors: { background: '#001100', ui_text: '#66ff66' } }, { apply: false })
    )
    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')
  })
})
