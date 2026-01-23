'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { updateSong } from '@/lib/actions/songs'

interface EditSongDialogContentProps {
  songId: string
  groupId: string
  groupSlug: string
  initialTitle: string
  initialDefaultKey?: string | null
  initialCcliId?: string | null
  initialArtist?: string | null
  initialLinkUrl?: string | null
  onSuccess?: () => void
  onCancel?: () => void
}

export function EditSongDialogContent({
  songId,
  groupId,
  groupSlug,
  initialTitle,
  initialDefaultKey,
  initialCcliId,
  initialArtist,
  initialLinkUrl,
  onSuccess,
  onCancel,
}: EditSongDialogContentProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState(initialTitle)
  const [defaultKey, setDefaultKey] = useState(initialDefaultKey ?? '')
  const [ccliId, setCcliId] = useState(initialCcliId ?? '')
  const [artist, setArtist] = useState(initialArtist ?? '')
  const [linkUrl, setLinkUrl] = useState(initialLinkUrl ?? '')

  useEffect(() => {
    setTitle(initialTitle)
    setDefaultKey(initialDefaultKey ?? '')
    setCcliId(initialCcliId ?? '')
    setArtist(initialArtist ?? '')
    setLinkUrl(initialLinkUrl ?? '')
    setError(null)
  }, [initialTitle, initialDefaultKey, initialCcliId, initialArtist, initialLinkUrl])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('title', title)
    formData.append('default_key', defaultKey)
    formData.append('ccli_id', ccliId)
    formData.append('artist', artist)
    formData.append('link_url', linkUrl)

    const result = await updateSong(songId, groupId, groupSlug, formData)

    if (result.success) {
      onSuccess?.()
    } else {
      setError(result.error || 'Failed to update song')
    }
    setIsLoading(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.stopPropagation()
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Song Info</DialogTitle>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Song Title</Label>
          <Input
            id="title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            required
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="default_key">Key</Label>
            <Input
              id="default_key"
              name="default_key"
              value={defaultKey}
              onChange={(e) => setDefaultKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ccli_id">CCLI ID</Label>
            <Input
              id="ccli_id"
              name="ccli_id"
              value={ccliId}
              onChange={(e) => setCcliId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="artist">Artist / Author</Label>
            <Input
              id="artist"
              name="artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link_url">Video / Link</Label>
            <Input
              id="link_url"
              name="link_url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
