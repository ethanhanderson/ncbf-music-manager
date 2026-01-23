'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { EditSetDialogContent } from '@/components/edit-set-dialog-content'
import type { Set } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { Edit01Icon } from '@hugeicons/core-free-icons'

interface EditSetDialogProps {
  set: Set
}

export function EditSetDialog({ set }: EditSetDialogProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const handleSuccess = () => {
    setIsOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
        }
      />
      <DialogContent>
        <EditSetDialogContent
          setId={set.id}
          initialServiceDate={set.service_date}
          initialNotes={set.notes}
          onSuccess={handleSuccess}
          onCancel={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
