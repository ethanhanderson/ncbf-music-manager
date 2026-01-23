'use client'

import { useId } from 'react'
import type React from 'react'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { HugeiconsIcon } from '@hugeicons/react'

export interface RadioCardOption {
  value: string
  label: string
  icon?: React.ComponentProps<typeof HugeiconsIcon>['icon']
}

interface RadioCardGroupProps {
  value: string
  options: RadioCardOption[]
  onValueChange: (value: string) => void
  columns?: 1 | 2 | 3
}

export function RadioCardGroup({
  value,
  options,
  onValueChange,
  columns,
}: RadioCardGroupProps) {
  const id = useId()
  const columnCount = columns ?? (options.length <= 3 ? options.length : 3)

  return (
    <RadioGroup
      value={value}
      onValueChange={(nextValue) => onValueChange(String(nextValue))}
      className={`grid gap-2 ${columnCount === 3 ? 'grid-cols-3' : columnCount === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
    >
      {options.map((option) => {
        const optionId = `${id}-${option.value}`
        return (
          <div
            key={option.value}
            className="relative flex cursor-pointer flex-col items-center justify-center gap-2 border border-input px-2 py-3 text-center shadow-xs outline-none transition-[color,box-shadow] rounded-none has-data-[state=checked]:border-primary/50 has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
          >
            <RadioGroupItem className="sr-only" id={optionId} value={option.value} />
            {option.icon && (
              <HugeiconsIcon
                icon={option.icon}
                strokeWidth={2}
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <label
              className="cursor-pointer text-xs font-medium text-foreground leading-none after:absolute after:inset-0"
              htmlFor={optionId}
            >
              {option.label}
            </label>
          </div>
        )
      })}
    </RadioGroup>
  )
}
