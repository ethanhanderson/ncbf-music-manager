"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Download01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FormatToggleCard } from '@/components/format-toggle-card'

type LyricsFormat = 'txt' | 'docx' | 'pdf' | 'rtf'

const DEFAULT_FORMATS: Record<LyricsFormat, boolean> = {
  txt: true,
  docx: true,
  pdf: true,
  rtf: true,
}

const FORMAT_LABELS: Record<LyricsFormat, string> = {
  txt: 'TXT',
  docx: 'DOCX (Word)',
  pdf: 'PDF',
  rtf: 'RTF',
}

const FORMAT_DETAILS: Record<LyricsFormat, { description: string }> = {
  txt: {
    description: 'Simple text export that works everywhere.',
  },
  docx: {
    description: 'Editable document for leaders and musicians.',
  },
  pdf: {
    description: 'Fixed layout for sharing or printing.',
  },
  rtf: {
    description: 'Basic formatting for older tools.',
  },
}

interface SetLyricsExportDialogProps {
  setId: string
  setTitle: string
  songs: Array<{
    songId: string
    title: string
    arrangementId: string | null
    position: number
  }>
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9\s-]/g, '').trim()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function getFilenameFromDisposition(value: string | null) {
  if (!value) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^\";\n]+)"?/i.exec(value)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function buildDefaultSelections(songs: SetLyricsExportDialogProps['songs']) {
  return songs.reduce<Record<string, boolean>>((acc, song) => {
    acc[song.songId] = true
    return acc
  }, {})
}

export function SetLyricsExportDialog({ setId, setTitle, songs }: SetLyricsExportDialogProps) {
  const [formats, setFormats] = useState(DEFAULT_FORMATS)
  const [isOpen, setIsOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selections, setSelections] = useState<Record<string, boolean>>(() => buildDefaultSelections(songs))

  const selectedFormats = useMemo(() => {
    return (Object.keys(formats) as LyricsFormat[]).filter((key) => formats[key])
  }, [formats])

  const hasSongs = songs.length > 0
  const selectedSongIds = useMemo(() => {
    return songs.filter((song) => selections[song.songId]).map((song) => song.songId)
  }, [songs, selections])
  const selectedCount = selectedSongIds.length
  const isSingleSong = selectedSongIds.length === 1
  const isSingleFormat = selectedFormats.length === 1
  const downloadLabel = useMemo(() => {
    if (!isSingleSong || !isSingleFormat) {
      return 'Download .zip'
    }
    const format = selectedFormats[0]
    if (!format) return 'Download file'
    return `Download .${format}`
  }, [isSingleSong, isSingleFormat, selectedFormats])

  useEffect(() => {
    if (!isOpen) {
      setFormats(DEFAULT_FORMATS)
      setSelections(buildDefaultSelections(songs))
      setError(null)
      setIsDownloading(false)
    }
  }, [isOpen, songs])

  const handleToggle = useCallback((key: LyricsFormat, checked: boolean | 'indeterminate') => {
    setFormats((prev) => ({ ...prev, [key]: checked === true }))
  }, [])

  const updateSelection = useCallback((songId: string, checked: boolean | 'indeterminate') => {
    setSelections((prev) => ({ ...prev, [songId]: checked === true }))
  }, [])

  const setAll = useCallback((next: boolean) => {
    setSelections(
      songs.reduce<Record<string, boolean>>((acc, song) => {
        acc[song.songId] = next
        return acc
      }, {})
    )
  }, [songs])

  const handleDownload = useCallback(async () => {
    if (selectedFormats.length === 0 || !hasSongs || selectedSongIds.length === 0) return
    setIsDownloading(true)
    setError(null)
    try {
      const response = await fetch(`/api/sets/${setId}/lyrics.zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formats: selectedFormats, songIds: selectedSongIds }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message = payload?.error ?? 'Failed to generate lyrics export.'
        throw new Error(message)
      }
      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const headerFilename = getFilenameFromDisposition(contentDisposition)
      const safeTitle = sanitizeFilename(setTitle)
      const fallbackZipName = safeTitle ? `${safeTitle} - Lyrics.zip` : 'Lyrics Export.zip'
      const filename = headerFilename || fallbackZipName
      downloadBlob(blob, filename)
      setIsOpen(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unexpected error while exporting lyrics.'
      setError(message)
    } finally {
      setIsDownloading(false)
    }
  }, [selectedFormats, hasSongs, selectedSongIds, setId, setTitle])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        nativeButton={true}
        render={
          <button
            type="button"
            className="inline-flex items-center justify-start w-full h-8 px-2.5 text-xs font-medium border border-border bg-background hover:bg-muted rounded-none transition-all"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
            Export lyrics
          </button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Lyrics export</DialogTitle>
          <DialogDescription>
            Download a .zip with the selected file formats for each song in this set.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)}>
              Select all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAll(false)}>
              Clear all
            </Button>
            <span className="text-xs text-muted-foreground">
              {selectedCount} selected
            </span>
          </div>

          {hasSongs && (
            <div className="max-h-[45vh] overflow-y-auto border border-border rounded-none">
              <div className="grid grid-cols-1 divide-y divide-border">
                {songs.map((song) => (
                  <div key={song.songId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-base font-semibold text-foreground">
                        {song.position}
                      </span>
                      <p className="text-xs font-medium truncate">{song.title}</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={selections[song.songId] ?? false}
                        onCheckedChange={(checked) => updateSelection(song.songId, checked)}
                      />
                      <span>Include lyrics</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-medium">Formats</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(FORMAT_LABELS) as LyricsFormat[]).map((key) => {
                const details = FORMAT_DETAILS[key]
                return (
                  <FormatToggleCard
                    key={key}
                    label={FORMAT_LABELS[key]}
                    description={details.description}
                    checked={formats[key]}
                    onCheckedChange={(checked) => handleToggle(key, checked)}
                  />
                )
              })}
            </div>
          </div>

          {!hasSongs && (
            <p className="text-xs text-muted-foreground">
              This set has no songs yet. Add songs to enable exports.
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setIsOpen(false)} disabled={isDownloading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || selectedFormats.length === 0 || selectedSongIds.length === 0 || !hasSongs}
          >
            {isDownloading ? 'Preparing...' : downloadLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
