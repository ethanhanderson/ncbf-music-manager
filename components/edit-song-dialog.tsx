'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateSong } from '@/lib/actions/songs'
import type { Song } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { Edit01Icon } from '@hugeicons/core-free-icons'

interface EditSongDialogProps {
  song: Song
  groupSlug: string
}

export function EditSongDialog({ song, groupSlug }: EditSongDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await updateSong(song.id, song.group_id, groupSlug, formData)

    if (result.success) {
      setIsOpen(false)
    } else {
      setError(result.error || 'Failed to update song')
    }
    setIsLoading(false)
  }

  if (!isOpen) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
        Edit
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">Edit Song</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Song Title</Label>
            <Input
              id="title"
              name="title"
              defaultValue={song.title}
              required
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
