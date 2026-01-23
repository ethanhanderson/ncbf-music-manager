'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { deleteSet } from '@/lib/actions/sets'

interface DeleteSetDialogContentProps {
  setId: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function DeleteSetDialogContent({
  setId,
  onSuccess,
  onCancel,
}: DeleteSetDialogContentProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setIsDeleting(true)
    setError(null)
    const result = await deleteSet(setId)
    if (result.success) {
      onSuccess?.()
    } else {
      setError(result.error || 'Failed to delete set')
      setIsDeleting(false)
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this set?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. The set will be removed from this group.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p className="text-xs text-destructive px-4">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel size="sm" onClick={onCancel} disabled={isDeleting}>
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete set'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
