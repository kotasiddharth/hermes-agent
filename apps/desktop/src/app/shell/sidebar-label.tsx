import type * as React from 'react'

import { cn } from '@/lib/utils'

export function SidebarPanelLabel({ children, className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        // Keep headings aligned with the text column in sidebar rows without
        // adding a decorative leading glyph.
        'block min-w-0 truncate pl-6 text-[0.64rem] leading-none font-semibold uppercase tracking-[0.16em] text-(--theme-primary)',
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
