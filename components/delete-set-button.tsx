'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { DeleteSetDialogContent } from '@/components/delete-set-dialog-content'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'

interface DeleteSetButtonProps {
  setId: string
  groupSlug: string
}

export function DeleteSetButton({ setId, groupSlug }: DeleteSetButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const handleSuccess = () => {
    setIsOpen(false)
    router.push(`/groups/${groupSlug}`)
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
        <DeleteSetDialogContent
          setId={setId}
          onSuccess={handleSuccess}
          onCancel={() => setIsOpen(false)}
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}
