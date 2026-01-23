'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { DeleteSongDialogContent } from '@/components/delete-song-dialog-content'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'

interface DeleteSongButtonProps {
  songId: string
  groupId: string
  groupSlug: string
  songTitle: string
}

export function DeleteSongButton({ songId, groupId, groupSlug, songTitle }: DeleteSongButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const handleSuccess = () => {
    setIsOpen(false)
    router.push(`/groups/${groupSlug}/songs`)
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="destructive" size="sm">
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        }
      />
      <AlertDialogContent size="sm">
        <DeleteSongDialogContent
          songId={songId}
          groupId={groupId}
          groupSlug={groupSlug}
          songTitle={songTitle}
          onSuccess={handleSuccess}
          onCancel={() => setIsOpen(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}
