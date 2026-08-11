import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SidebarPanelLabel } from './sidebar-label'

describe('SidebarPanelLabel', () => {
  it('keeps the text-column inset without a decorative dither marker', () => {
    const { container } = render(<SidebarPanelLabel>Projects</SidebarPanelLabel>)

    expect(screen.getByText('Projects').classList.contains('pl-6')).toBe(true)
    expect(container.querySelector('.dither')).toBeNull()
  })
})
