'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { EditSongDialogContent } from '@/components/edit-song-dialog-content'
import type { Song } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { Edit01Icon } from '@hugeicons/core-free-icons'

interface EditSongDialogProps {
  song: Song
  groupSlug: string
}

export function EditSongDialog({ song, groupSlug }: EditSongDialogProps) {
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
        <EditSongDialogContent
          songId={song.id}
          groupId={song.group_id}
          groupSlug={groupSlug}
          initialTitle={song.title}
          initialDefaultKey={song.default_key}
          initialCcliId={song.ccli_id}
          initialArtist={song.artist}
          initialLinkUrl={song.link_url}
          onSuccess={handleSuccess}
          onCancel={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
