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
import { deleteSong } from '@/lib/actions/songs'

interface DeleteSongDialogContentProps {
  songId: string
  groupId: string
  groupSlug: string
  songTitle: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function DeleteSongDialogContent({
  songId,
  groupId,
  groupSlug,
  songTitle,
  onSuccess,
  onCancel,
}: DeleteSongDialogContentProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setIsDeleting(true)
    setError(null)
    const result = await deleteSong(songId, groupId, groupSlug)
    if (result.success) {
      onSuccess?.()
    } else {
      setError(result.error || 'Failed to delete song')
      setIsDeleting(false)
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this song?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. The song "{songTitle}" and its assets will be permanently deleted.
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
          {isDeleting ? 'Deleting...' : 'Delete song'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
