"use client"

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Download01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FormatToggleCard } from '@/components/format-toggle-card'

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

interface SongChartsExportDialogProps {
  songIds: string[]
  label?: string
  triggerLabel?: string
  triggerClassName?: string
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
}

export function SongChartsExportDialog({
  songIds,
  label = 'Songs export',
  triggerLabel = 'Export songs',
  triggerClassName,
  trigger,
  open,
  onOpenChange,
  hideTrigger = false,
}: SongChartsExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formats, setFormats] = useState(DEFAULT_FORMATS)
  const [includeVocal, setIncludeVocal] = useState(true)
  const [includeChord, setIncludeChord] = useState(true)

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    onOpenChange?.(nextOpen)
    setIsOpen(nextOpen)
  }, [onOpenChange, open, trigger])

  const selectedFormats = useMemo(() => {
    return (Object.keys(formats) as ChartFormat[]).filter((key) => formats[key])
  }, [formats])

  const selectedCount = songIds.length
  const isSingleSong = selectedCount === 1
  const isSingleFormat = selectedFormats.length === 1
  const isSingleType = includeVocal !== includeChord

  const downloadLabel = useMemo(() => {
    if (!isSingleSong || !isSingleFormat || !isSingleType) return 'Download .zip'
    const format = selectedFormats[0]
    if (!format) return 'Download .zip'
    return `Download .${format}`
  }, [isSingleFormat, isSingleSong, isSingleType, selectedFormats])

  const handleDownload = useCallback(async () => {
    if (songIds.length === 0 || selectedFormats.length === 0 || (!includeVocal && !includeChord)) return
    setIsDownloading(true)
    setError(null)
    try {
      const response = await fetch('/api/songs/charts.zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songIds,
          formats: selectedFormats,
          include: { vocal: includeVocal, chord: includeChord },
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message = payload?.error ?? 'Failed to generate chart export.'
        throw new Error(message)
      }
      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const headerFilename = getFilenameFromDisposition(contentDisposition)
      const safeTitle = sanitizeFilename(label)
      const fallbackName = safeTitle ? `${safeTitle}.zip` : 'Song Charts.zip'
      const filename = headerFilename || fallbackName
      downloadBlob(blob, filename)
      setIsOpen(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unexpected error while exporting charts.'
      setError(message)
    } finally {
      setIsDownloading(false)
    }
  }, [includeChord, includeVocal, label, selectedFormats, songIds])

  const hasSongs = songIds.length > 0

  const isDialogOpen = open ?? isOpen
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
      <DialogContent
        className="sm:max-w-xl"
        data-row-click-ignore="true"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
        }}
      >
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Download chart exports for the selected songs and formats.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{selectedCount} selected</span>
          </div>

          {!hasSongs && (
            <p className="text-xs text-muted-foreground">
              Select one or more songs to enable exports.
            </p>
          )}

          <div className="space-y-3">
            <p className="text-xs font-medium">Chart types</p>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-2">
                <Checkbox checked={includeVocal} onCheckedChange={(checked) => setIncludeVocal(checked === true)} />
                <span>Vocal chart</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <Checkbox checked={includeChord} onCheckedChange={(checked) => setIncludeChord(checked === true)} />
                <span>Chord chart</span>
              </label>
            </div>
          </div>

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
          <Button variant="outline" type="button" onClick={() => setIsOpen(false)} disabled={isDownloading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || selectedFormats.length === 0 || !hasSongs || (!includeVocal && !includeChord)}
          >
            {isDownloading ? 'Preparing...' : downloadLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
