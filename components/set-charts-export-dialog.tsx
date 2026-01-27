"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Download01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FormatToggleCard } from '@/components/format-toggle-card'

interface SetChartsExportDialogProps {
  setId: string
  setTitle: string
  songs?: Array<{
    songId: string
    title: string
    arrangementId: string | null
    position: number
  }>
  autoFetch?: boolean
  prefetchError?: string | null
  triggerLabel?: string
  triggerClassName?: string
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
}

type ChartSelection = {
  vocal: boolean
  chord: boolean
}

type ChartFormat = 'pdf' | 'docx' | 'txt'

const DEFAULT_FORMATS: Record<ChartFormat, boolean> = {
  pdf: true,
  docx: false,
  txt: false,
}

const FORMAT_LABELS: Record<ChartFormat, string> = {
  pdf: 'PDF',
  docx: 'DOCX (Word)',
  txt: 'TXT',
}

const FORMAT_DETAILS: Record<ChartFormat, { description: string }> = {
  pdf: { description: 'Fixed layout that matches the chart print view.' },
  docx: { description: 'Editable document that mirrors the chart layout.' },
  txt: { description: 'Raw text in the same chart layout, without styling.' },
}

const EMPTY_SONGS: SetChartsExportDialogProps['songs'] = []

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

function buildDefaultSelections(songs: Array<{ songId: string }>) {
  return songs.reduce<Record<string, ChartSelection>>((acc, song) => {
    acc[song.songId] = { vocal: true, chord: true }
    return acc
  }, {})
}

export function SetChartsExportDialog({
  setId,
  setTitle,
  songs = EMPTY_SONGS,
  autoFetch = true,
  prefetchError = null,
  triggerLabel = 'Export set',
  triggerClassName,
  trigger,
  open,
  onOpenChange,
  hideTrigger = false,
}: SetChartsExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(prefetchError)
  const [formats, setFormats] = useState(DEFAULT_FORMATS)
  const [selections, setSelections] = useState<Record<string, ChartSelection>>(() => buildDefaultSelections(songs))
  const [loadedSongs, setLoadedSongs] = useState(songs)
  const [isLoadingSongs, setIsLoadingSongs] = useState(false)
  const latestSongsRef = useRef(songs)

  useEffect(() => {
    latestSongsRef.current = songs
  }, [songs])

  const isDialogOpen = open ?? isOpen
  const activeSongs = loadedSongs.length > 0 ? loadedSongs : songs

  useEffect(() => {
    if (!isDialogOpen) {
      const nextSongs = latestSongsRef.current ?? []
      setFormats(DEFAULT_FORMATS)
      setSelections(buildDefaultSelections(nextSongs))
      setError(null)
      setIsDownloading(false)
      setIsLoadingSongs(false)
      setLoadedSongs(nextSongs)
      setError(null)
    }
  }, [isDialogOpen])

  useEffect(() => {
    if (!isDialogOpen) return
    setError(prefetchError)
  }, [isDialogOpen, prefetchError])

  useEffect(() => {
    if (!isDialogOpen) return
    if (!autoFetch) return
    if (songs.length > 0 || loadedSongs.length > 0) return
    let isActive = true
    setIsLoadingSongs(true)
    setError(null)
    fetch(`/api/sets/${setId}/export-data`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load set songs.')
        }
        return response.json()
      })
      .then((payload) => {
        if (!isActive) return
        const nextSongs = Array.isArray(payload?.songs) ? payload.songs : []
        setLoadedSongs(nextSongs)
        setSelections(buildDefaultSelections(nextSongs))
      })
      .catch((caught) => {
        if (!isActive) return
        const message = caught instanceof Error ? caught.message : 'Failed to load set songs.'
        setError(message)
      })
      .finally(() => {
        if (!isActive) return
        setIsLoadingSongs(false)
      })
    return () => {
      isActive = false
    }
  }, [autoFetch, isDialogOpen, loadedSongs.length, setId, songs.length])

  const hasSongs = activeSongs.length > 0

  const selectedItems = useMemo(() => {
    return activeSongs
      .map((song) => ({
        songId: song.songId,
        arrangementId: song.arrangementId,
        include: selections[song.songId] ?? { vocal: false, chord: false },
      }))
      .filter((entry) => entry.include.vocal || entry.include.chord)
  }, [activeSongs, selections])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    onOpenChange?.(nextOpen)
    setIsOpen(nextOpen)
  }, [onOpenChange])

  const selectedCount = selectedItems.length
  const selectedFormats = useMemo(() => {
    return (Object.keys(formats) as ChartFormat[]).filter((key) => formats[key])
  }, [formats])
  const isSingleItem = selectedItems.length === 1
  const isSingleFormat = selectedFormats.length === 1
  const downloadLabel = useMemo(() => {
    if (!isSingleItem || !isSingleFormat) return 'Download .zip'
    const only = selectedItems[0]
    if (!only) return 'Download .zip'
    const singleType = (only.include.vocal ? 1 : 0) + (only.include.chord ? 1 : 0) === 1
    const format = selectedFormats[0]
    if (!singleType || !format) return 'Download .zip'
    return `Download .${format}`
  }, [isSingleFormat, isSingleItem, selectedFormats, selectedItems])

  const updateSelection = useCallback((songId: string, field: keyof ChartSelection, checked: boolean | 'indeterminate') => {
    setSelections((prev) => ({
      ...prev,
      [songId]: {
        ...(prev[songId] ?? { vocal: false, chord: false }),
        [field]: checked === true,
      },
    }))
  }, [])

  const setAll = useCallback((next: ChartSelection) => {
    setSelections(
      activeSongs.reduce<Record<string, ChartSelection>>((acc, song) => {
        acc[song.songId] = { ...next }
        return acc
      }, {})
    )
  }, [activeSongs])

  const handleDownload = useCallback(async () => {
    if (selectedItems.length === 0 || !hasSongs || selectedFormats.length === 0) return
    setIsDownloading(true)
    setError(null)
    try {
      const response = await fetch(`/api/sets/${setId}/charts.zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedItems, formats: selectedFormats }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message = payload?.error ?? 'Failed to generate chart export.'
        throw new Error(message)
      }
      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const headerFilename = getFilenameFromDisposition(contentDisposition)
      const safeTitle = sanitizeFilename(setTitle)
      const fallbackName = safeTitle ? `${safeTitle} - Charts.zip` : 'Charts Export.zip'
      const filename = headerFilename || fallbackName
      downloadBlob(blob, filename)
      handleOpenChange(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unexpected error while exporting charts.'
      setError(message)
    } finally {
      setIsDownloading(false)
    }
  }, [handleOpenChange, hasSongs, selectedFormats, selectedItems, setId, setTitle])
  const triggerNode = trigger ? (
    <div className="contents">{trigger}</div>
  ) : (
    <button
      type="button"
      data-row-click-ignore="true"
      className={[
        "inline-flex items-center justify-start w-full h-8 px-2.5 text-xs font-medium border border-border bg-background hover:bg-muted rounded-none transition-all",
        triggerClassName ?? "",
      ].join(" ")}
    >
      <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
      {triggerLabel}
    </button>
  )

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <DialogTrigger nativeButton={!trigger} render={triggerNode} />
      )}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Set export</DialogTitle>
          <DialogDescription>
            Download chart exports for the selected songs and formats.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAll({ vocal: true, chord: true })}>
              Select all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAll({ vocal: false, chord: false })}>
              Clear all
            </Button>
            <span className="text-xs text-muted-foreground">
              {selectedCount} selected
            </span>
          </div>

          {!hasSongs && (
            <p className="text-xs text-muted-foreground">
              This set has no songs yet. Add songs to enable chart exports.
            </p>
          )}

          {isLoadingSongs && (
            <p className="text-xs text-muted-foreground">Loading set songs...</p>
          )}

          {hasSongs && (
            <div className="max-h-[50vh] overflow-y-auto border border-border rounded-none">
              <div className="grid grid-cols-1 divide-y divide-border">
                {activeSongs.map((song) => {
                  const selection = selections[song.songId] ?? { vocal: false, chord: false }
                  return (
                    <div key={song.songId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-base font-semibold text-foreground">
                          {song.position}
                        </span>
                        <p className="text-xs font-medium truncate">{song.title}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="inline-flex items-center gap-2">
                          <Checkbox
                            checked={selection.vocal}
                            onCheckedChange={(checked) => updateSelection(song.songId, 'vocal', checked)}
                          />
                          <span>Vocal chart</span>
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <Checkbox
                            checked={selection.chord}
                            onCheckedChange={(checked) => updateSelection(song.songId, 'chord', checked)}
                          />
                          <span>Chord chart</span>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-medium">Formats</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(FORMAT_LABELS) as ChartFormat[]).map((key) => {
                const details = FORMAT_DETAILS[key]
                return (
                  <FormatToggleCard
                    key={key}
                    label={FORMAT_LABELS[key]}
                    description={details.description}
                    checked={formats[key]}
                    onCheckedChange={(checked) => setFormats((prev) => ({ ...prev, [key]: checked }))}
                  />
                )
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" type="button" disabled={isDownloading} />}
            disabled={isDownloading}
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || selectedItems.length === 0 || selectedFormats.length === 0 || !hasSongs}
          >
            {isDownloading ? 'Preparing...' : downloadLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
