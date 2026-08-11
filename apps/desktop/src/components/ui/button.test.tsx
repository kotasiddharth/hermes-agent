import { describe, expect, it } from 'vitest'

import { buttonVariants } from './button'

describe('buttonVariants', () => {
  it('keeps hover feedback layout-stable for regular surface buttons', () => {
    const classes = buttonVariants({ variant: 'ghost' })

    expect(classes).not.toContain('hover:-translate-y-px')
    expect(classes).toContain('active:scale-[0.98]')
  })

  it('lets transform-positioned controls opt out of press motion', () => {
    const classes = buttonVariants({ motion: 'none', variant: 'ghost' })

    expect(classes).not.toContain('hover:-translate-y-px')
    expect(classes).not.toContain('active:scale-[0.98]')
  })
})
