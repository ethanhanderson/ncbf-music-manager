'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { updateSet } from '@/lib/actions/sets'
import type { Set } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { Edit01Icon } from '@hugeicons/core-free-icons'

interface EditSetDialogProps {
  set: Set
}

export function EditSetDialog({ set }: EditSetDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serviceDate, setServiceDate] = useState(set.service_date)
  const [notes, setNotes] = useState(set.notes ?? '')

  useEffect(() => {
    if (!isOpen) return
    setServiceDate(set.service_date)
    setNotes(set.notes ?? '')
    setError(null)
  }, [isOpen, set])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await updateSet(set.id, formData)

    if (result.success) {
      setIsOpen(false)
    } else {
      setError(result.error || 'Failed to update set')
    }
    setIsLoading(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[320px] space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Edit set</h3>
          <p className="text-xs text-muted-foreground">Update the date or notes for this set.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service_date">Set date</Label>
            <Input
              id="service_date"
              name="service_date"
              type="date"
              value={serviceDate}
              onChange={(event) => setServiceDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Any notes for the service..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
