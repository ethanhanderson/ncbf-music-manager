"use client"

import { useId } from "react"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface FormatToggleCardProps {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function FormatToggleCard({
  label,
  description,
  checked,
  onCheckedChange,
}: FormatToggleCardProps) {
  const id = useId()

  return (
    <div className="relative flex w-full items-start gap-2 rounded-none border border-input p-3 shadow-xs outline-none has-data-[state=checked]:border-primary/50">
      <Switch
        aria-describedby={description ? `${id}-description` : undefined}
        className="data-[state=checked]:[&_span]:rtl:-translate-x-2 order-1 h-4 w-6 after:absolute after:inset-0 [&_span]:size-3 data-[state=checked]:[&_span]:translate-x-2"
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <div className="grid grow gap-2">
        <Label htmlFor={id}>{label}</Label>
        {description && (
          <p className="text-muted-foreground text-xs" id={`${id}-description`}>
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
