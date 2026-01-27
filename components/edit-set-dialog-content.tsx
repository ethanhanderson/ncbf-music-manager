'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { updateSet } from '@/lib/actions/sets'
import { cn } from '@/lib/utils'

interface EditSetDialogContentProps {
  setId: string
  initialServiceDate: string
  initialNotes: string | null
  onSuccess?: () => void
  onCancel?: () => void
}

function getUpcomingSunday(today = new Date()): Date {
  const date = new Date(today)
  // "Upcoming Sunday" => next Sunday; if today is Sunday, choose next week
  const daysUntilSunday = (7 - date.getDay()) % 7 || 7
  date.setDate(date.getDate() + daysUntilSunday)
  date.setHours(0, 0, 0, 0)
  return date
}

function parseServiceDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date
}

export function EditSetDialogContent({
  setId,
  initialServiceDate,
  initialNotes,
  onSuccess,
  onCancel,
}: EditSetDialogContentProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serviceDate, setServiceDate] = useState<Date | undefined>(() =>
    initialServiceDate ? parseServiceDate(initialServiceDate) : undefined
  )
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  useEffect(() => {
    setServiceDate(initialServiceDate ? parseServiceDate(initialServiceDate) : undefined)
    setNotes(initialNotes ?? '')
    setError(null)
  }, [initialServiceDate, initialNotes])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('service_date', serviceDate ? format(serviceDate, 'yyyy-MM-dd') : '')
    formData.append('notes', notes)

    const result = await updateSet(setId, formData)

    if (result.success) {
      onSuccess?.()
    } else {
      setError(result.error || 'Failed to update set')
    }
    setIsLoading(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Set</DialogTitle>
        <DialogDescription>Update the date or notes for this set.</DialogDescription>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="service_date">Set date</Label>
          <div className="flex items-center gap-2">
            <input
              id="service_date"
              name="service_date"
              type="hidden"
              value={serviceDate ? format(serviceDate, 'yyyy-MM-dd') : ''}
            />
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-empty={!serviceDate}
                    className={cn(
                      'data-[empty=true]:text-muted-foreground flex-1 justify-start text-left font-normal',
                    )}
                  >
                    {serviceDate ? format(serviceDate, 'PPP') : <span>Pick a date</span>}
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={serviceDate}
                  onSelect={(date) => {
                    setServiceDate(date)
                    setIsDatePickerOpen(false)
                  }}
                  captionLayout="dropdown"
                  initialFocus
                  disabled={{ before: new Date() }}
                />
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setServiceDate(getUpcomingSunday())}
              aria-label="Auto-set date"
              className="shrink-0"
              disabled={
                serviceDate?.toDateString() === getUpcomingSunday().toDateString()
              }
            >
              Auto set
            </Button>
          </div>
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
