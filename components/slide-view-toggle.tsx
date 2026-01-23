'use client'

import { useId } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

export type SlideViewMode = 'list' | 'grid'

interface SlideViewToggleProps {
  value: SlideViewMode
  onValueChange: (value: SlideViewMode) => void
  className?: string
}

export function SlideViewToggle({ value, onValueChange, className }: SlideViewToggleProps) {
  const id = useId()

  return (
    <div className={cn('inline-flex h-9 rounded-none bg-input/50 p-0.5', className)}>
      <RadioGroup
        className="group relative inline-grid grid-cols-[1fr_1fr] items-center gap-0 font-medium text-sm after:absolute after:inset-y-0 after:w-1/2 after:rounded-none after:bg-background after:shadow-xs after:transition-[translate,box-shadow] after:duration-300 after:ease-[cubic-bezier(0.16,1,0.3,1)] has-focus-visible:after:border-ring has-focus-visible:after:ring-[3px] has-focus-visible:after:ring-ring/50 data-[state=list]:after:translate-x-0 data-[state=grid]:after:translate-x-full"
        data-state={value}
        onValueChange={(next) => onValueChange(next as SlideViewMode)}
        value={value}
      >
        <label
          className="relative z-10 inline-flex h-full min-w-8 cursor-pointer select-none items-center justify-center whitespace-nowrap px-3 transition-colors group-data-[state=grid]:text-muted-foreground/70"
          aria-label="List view"
          title="List view"
        >
          <List className="h-4 w-4" aria-hidden="true" />
          <RadioGroupItem className="sr-only" id={`${id}-list`} value="list" />
        </label>
        <label
          className="relative z-10 inline-flex h-full min-w-8 cursor-pointer select-none items-center justify-center whitespace-nowrap px-3 transition-colors group-data-[state=list]:text-muted-foreground/70"
          aria-label="Grid view"
          title="Grid view"
        >
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          <RadioGroupItem className="sr-only" id={`${id}-grid`} value="grid" />
        </label>
      </RadioGroup>
    </div>
  )
}

