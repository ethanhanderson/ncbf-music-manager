'use client'

import { CreateSongDialog } from '@/components/create-song-dialog'
import { BulkUploadDialog } from '@/components/bulk-upload-dialog'
import { type MusicGroup } from '@/lib/supabase/server'

interface SongCatalogActionsProps {
  groups: MusicGroup[]
}

export function SongCatalogActions({ groups }: SongCatalogActionsProps) {
  if (groups.length === 0) {
    return null
  }

  return (
    <div className="flex gap-2">
      <BulkUploadDialog groups={groups} />
      <CreateSongDialog groups={groups} />
    </div>
  )
}
