'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import type { SongSlide } from '@/lib/supabase/server'
import type { ChartNote, ChartNoteLinkedWord, VocalChartSettings } from '@/components/song-charts-manager'
import { ChartNotesLayer } from '@/components/charts/chart-notes-layer'
import { parseLineIntoWords } from '@/components/charts/chart-notes-footnotes'

interface SlideGroupDefinition {
  key: string
  label: SongSlide['label']
  customLabel?: string
  slides: SongSlide[]
  firstIndex: number
}

interface VocalChartPreviewProps {
  songTitle: string
  orderedGroups: SlideGroupDefinition[]
  settings: VocalChartSettings
  notePlacementActive: boolean
  onPlaceNote: (position: { xPct: number; yPct: number; linkedWord?: ChartNoteLinkedWord }) => string
  openNoteId: string | null
  onOpenNoteIdChange: (noteId: string | null) => void
  onUpdateNote: (noteId: string, patch: Partial<ChartNote>) => void
  onDeleteNote: (noteId: string) => void
}

const GROUP_LABELS: Record<SongSlide['label'], string> = {
  title: 'Title',
  verse: 'Verse',
  chorus: 'Chorus',
  bridge: 'Bridge',
  'pre-chorus': 'Pre-Chorus',
  intro: 'Intro',
  outro: 'Outro',
  tag: 'Tag',
  interlude: 'Interlude',
  custom: 'Custom',
}

// Colors for different group types
const GROUP_COLORS: Record<SongSlide['label'], { label: string; border: string }> = {
  title: { label: 'text-primary', border: 'border-primary' },
  verse: { label: 'text-secondary-foreground', border: 'border-secondary' },
  chorus: { label: 'text-accent-foreground', border: 'border-accent' },
  bridge: { label: 'text-destructive', border: 'border-destructive' },
  'pre-chorus': { label: 'text-foreground', border: 'border-border' },
  intro: { label: 'text-muted-foreground', border: 'border-border' },
  outro: { label: 'text-muted-foreground', border: 'border-border' },
  tag: { label: 'text-primary', border: 'border-primary' },
  interlude: { label: 'text-muted-foreground', border: 'border-border' },
  custom: { label: 'text-muted-foreground', border: 'border-border' },
}

function getGroupDisplayLabel(group: SlideGroupDefinition): string {
  if (group.label === 'custom' && !group.customLabel) {
    return ''
  }
  const base = GROUP_LABELS[group.label] ?? 'Custom'
  if ((group.label === 'verse' || group.label === 'chorus') && group.customLabel) {
    return `${base} ${group.customLabel}`
  }
  if (group.label === 'custom' && group.customLabel) {
    return group.customLabel
  }
  return base
}

export function VocalChartPreview({
  songTitle,
  orderedGroups,
  settings,
  notePlacementActive,
  onPlaceNote,
  openNoteId,
  onOpenNoteIdChange,
  onUpdateNote,
  onDeleteNote,
}: VocalChartPreviewProps) {
  const pageRef = useRef<HTMLDivElement | null>(null)
  const [pendingLinkedWord, setPendingLinkedWord] = useState<ChartNoteLinkedWord | null>(null)
  const chartBodyStyle = {
    '--chart-font-size': `${settings.fontSizePx}px`,
    '--chart-line-height': `${settings.lineHeightEm}`,
  } as CSSProperties
  const columnsClass = settings.columns === 1 ? 'columns-1' : 'columns-2'
  const heightClass = settings.columns > 1 ? 'h-[9.5in]' : 'h-auto'

  const handlePlaceNote = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const page = pageRef.current
    if (!page) return
    const rect = page.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const xPct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const yPct = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    onPlaceNote({ xPct, yPct, linkedWord: pendingLinkedWord ?? undefined })
    setPendingLinkedWord(null)
  }, [onPlaceNote, pendingLinkedWord])

  const wordMarkersByKey = useMemo(() => {
    const map = new Map<string, number[]>()
    settings.notes.forEach((note) => {
      const key = note.linkedWord?.wordKey
      if (!key || note.markerNumber === undefined) return
      const list = map.get(key) ?? []
      list.push(note.markerNumber)
      map.set(key, list)
    })
    map.forEach((list) => list.sort((a, b) => a - b))
    return map
  }, [settings.notes])

  const nextMarkerNumber = useMemo(() => {
    const max = settings.notes.reduce((current, note) => {
      return note.markerNumber && note.markerNumber > current ? note.markerNumber : current
    }, 0)
    return max + 1
  }, [settings.notes])

  useEffect(() => {
    if (!notePlacementActive) {
      setPendingLinkedWord(null)
    }
  }, [notePlacementActive])

  return (
    <div
      ref={pageRef}
      className={`chart-page vocal-chart bg-background text-foreground border border-border print:border-0 p-5 min-h-[11in] select-none relative print:m-0 print:w-full print:max-w-none print:min-h-[11in] print:box-border print:shadow-none ${notePlacementActive ? 'cursor-crosshair' : ''}`}
      onClickCapture={(event) => {
        if (!notePlacementActive) return
        const target = event.target as HTMLElement | null
        if (target?.closest?.('[data-note-word="true"]')) return
        if (target?.closest?.('[data-chart-note="true"]')) return
        handlePlaceNote(event)
      }}
    >
      {/* Header */}
      <div className="chart-header mb-5 pb-5 border-b border-border">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold print:text-[18pt]">{songTitle}</h1>
          {settings.showKey && settings.songKey && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>Key: {settings.songKey}</span>
            </div>
          )}
        </div>
      </div>

      <ChartNotesLayer
        notes={settings.notes}
        openNoteId={openNoteId}
        onOpenNoteIdChange={onOpenNoteIdChange}
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
      />

      {notePlacementActive && (
        <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden />
      )}

      {/* Body with columns - flows top to bottom, then wraps to next column */}
      <div
        className={`chart-body ${columnsClass} ${heightClass} gap-x-8 [column-fill:auto] text-(length:--chart-font-size) leading-(--chart-line-height)`}
        style={chartBodyStyle}
      >
        {orderedGroups.map((group, groupIndex) => {
          const label = getGroupDisplayLabel(group)
          const slidesInGroup = group.slides
          const colors = GROUP_COLORS[group.label] ?? GROUP_COLORS.custom
          const showLabel = settings.showGroupLabels && label

          const labelColorClass = settings.colorizeLabels ? colors.label : 'text-muted-foreground'
          const borderColorClass = settings.colorizeBorders ? colors.border : 'border-border'

          return (
            <div
              key={`${group.key}-${groupIndex}`}
              className={`chart-group mb-4 ${
                settings.groupStyle === 'outline'
                  ? `border ${borderColorClass} p-3`
                  : ''
              }`}
            >
              {showLabel && settings.groupStyle !== 'none' && (
                <h3 className={`font-semibold ${labelColorClass} mb-1 text-[0.85em] uppercase tracking-wide print:text-[10pt]`}>
                  {label}
                </h3>
              )}
              <div className="space-y-0.5">
                {slidesInGroup.map((slide) =>
                  slide.lines.map((line, lineIndex) => {
                    if (!line) {
                      return (
                        <p key={`${slide.id}-${lineIndex}`} className="whitespace-pre-wrap">
                          {'\u00A0'}
                        </p>
                      )
                    }

                    const words = parseLineIntoWords(line)
                    if (words.length === 0) {
                      return (
                        <p key={`${slide.id}-${lineIndex}`} className="whitespace-pre-wrap">
                          {line}
                        </p>
                      )
                    }

                    return (
                      <p key={`${slide.id}-${lineIndex}`} className="whitespace-pre-wrap">
                        {words[0].start > 0 && <span>{line.slice(0, words[0].start)}</span>}
                        {words.map((word, wordIndex) => {
                          const wordKey = `${slide.id}-${lineIndex}-${word.start}`
                          const existingMarkers = wordMarkersByKey.get(wordKey) ?? []
                          const pendingMarker = notePlacementActive && pendingLinkedWord?.wordKey === wordKey
                            ? nextMarkerNumber
                            : null
                          const markerNumbers = pendingMarker
                            ? Array.from(new Set([...existingMarkers, pendingMarker]))
                            : existingMarkers
                          const nextWord = words[wordIndex + 1]
                          const trailingText = nextWord
                            ? line.slice(word.end + 1, nextWord.start)
                            : line.slice(word.end + 1)

                          return (
                            <span key={word.start}>
                              <span
                                role={notePlacementActive ? 'button' : undefined}
                                tabIndex={notePlacementActive ? 0 : undefined}
                                onClick={() => {
                                  if (!notePlacementActive) return
                                  setPendingLinkedWord({
                                    wordKey,
                                    slideId: slide.id,
                                    lineIndex,
                                    wordStart: word.start,
                                    wordText: word.word,
                                  })
                                }}
                                data-note-word="true"
                                className={notePlacementActive ? 'cursor-pointer' : undefined}
                              >
                                {word.word}
                                {markerNumbers.length > 0 && (
                                  <sup className="ml-0.5 text-[0.65em] text-muted-foreground">
                                    {markerNumbers.join(',')}
                                  </sup>
                                )}
                              </span>
                              {trailingText && <span>{trailingText}</span>}
                            </span>
                          )
                        })}
                      </p>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
