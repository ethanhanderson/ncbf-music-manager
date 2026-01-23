'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { updateSet } from '@/lib/actions/sets'

interface EditSetDialogContentProps {
  setId: string
  initialServiceDate: string
  initialNotes: string | null
  onSuccess?: () => void
  onCancel?: () => void
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
  const [serviceDate, setServiceDate] = useState(initialServiceDate)
  const [notes, setNotes] = useState(initialNotes ?? '')

  useEffect(() => {
    setServiceDate(initialServiceDate)
    setNotes(initialNotes ?? '')
    setError(null)
  }, [initialServiceDate, initialNotes])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('service_date', serviceDate)
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
          <Input
            id="service_date"
            name="service_date"
            type="date"
            value={serviceDate}
            onChange={(event) => setServiceDate(event.target.value)}
            required
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
