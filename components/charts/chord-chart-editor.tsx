'use client'

import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { SongSlide } from '@/lib/supabase/server'
import type { ChartNote, ChartNoteLinkedWord, ChordChartSettings, ChordPlacement, VocalChartSettings } from '@/components/song-charts-manager'
import { ChartNotesLayer } from '@/components/charts/chart-notes-layer'
import { parseLineIntoWords, type WordRange } from '@/components/charts/chart-notes-footnotes'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'

interface SlideGroupDefinition {
  key: string
  label: SongSlide['label']
  customLabel?: string
  slides: SongSlide[]
  firstIndex: number
}

type ChordChartSettingsWithQualities = ChordChartSettings & {
  customQualities?: string[]
}

interface ChordChartEditorProps {
  songId: string
  groupSlug: string
  arrangementId: string
  songTitle: string
  orderedGroups: SlideGroupDefinition[]
  settings: ChordChartSettingsWithQualities
  onSettingsChange: (settings: ChordChartSettingsWithQualities) => void
  vocalSettings: VocalChartSettings
  hasChanges: boolean
  setHasChanges: (hasChanges: boolean) => void
  notePlacementActive: boolean
  onPlaceNote: (position: { xPct: number; yPct: number; pageIndex?: number; linkedWord?: ChartNoteLinkedWord }) => string
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

const BASE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

const CHORD_QUALITY_OPTIONS = [
  { value: 'maj', label: 'Maj', suffix: '' },
  { value: 'min', label: 'm', suffix: 'm' },
  { value: '7', label: '7', suffix: '7' },
  { value: 'm7', label: 'm7', suffix: 'm7' },
  { value: 'maj7', label: 'maj7', suffix: 'maj7' },
  { value: 'sus2', label: 'sus2', suffix: 'sus2' },
  { value: 'sus4', label: 'sus4', suffix: 'sus4' },
  { value: 'add9', label: 'add9', suffix: 'add9' },
  { value: 'dim', label: 'dim', suffix: 'dim' },
  { value: 'aug', label: 'aug', suffix: 'aug' },
]
const CUSTOM_QUALITY_PREFIX = 'custom:'

// Colors for chord root notes (A-G, including sharps/flats which map to their base)
const CHORD_ROOT_COLORS: Record<string, string> = {
  'A': 'text-red-600',
  'B': 'text-orange-600',
  'C': 'text-amber-600',
  'D': 'text-green-600',
  'E': 'text-teal-600',
  'F': 'text-blue-600',
  'G': 'text-purple-600',
}

function getChordRootColor(chord: string): string {
  // Extract the root note (first letter, possibly followed by # or b)
  const match = chord.match(/^([A-G])/)
  if (match) {
    return CHORD_ROOT_COLORS[match[1]] || 'text-primary'
  }
  return 'text-primary'
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

interface ChordDragState {
  placement: ChordPlacement
  word: WordRange
  lineLeft: number
  charWidth: number
  currentCharIndex: number
  pointerId: number
}

function parseChordSymbol(chord: string): { base: string; accidental: '' | '#' | 'b'; suffix: string } | null {
  const match = chord.match(/^([A-G])([#b]?)(.*)$/)
  if (!match) return null
  const [, base, accidental, suffix] = match
  return {
    base,
    accidental: (accidental as '' | '#' | 'b') || '',
    suffix,
  }
}

export function ChordChartEditor({
  songId,
  groupSlug,
  arrangementId,
  songTitle,
  orderedGroups,
  settings,
  onSettingsChange,
  vocalSettings,
  hasChanges,
  setHasChanges,
  notePlacementActive,
  onPlaceNote,
  openNoteId,
  onOpenNoteIdChange,
  onUpdateNote,
  onDeleteNote,
}: ChordChartEditorProps) {
  const [customQualityInput, setCustomQualityInput] = useState('')
  const [keyboardNavActive, setKeyboardNavActive] = useState(false)
  const [focusedWordKey, setFocusedWordKey] = useState<string | null>(null)
  const [pendingLinkedWord, setPendingLinkedWord] = useState<ChartNoteLinkedWord | null>(null)
  const wordFocusRefs = useRef(new Map<string, HTMLSpanElement | null>())
  const lineHeightEm = settings.lineHeight === 'compact' ? 1.15 : 1.3
  const isCompactLines = settings.lineHeight === 'compact'
  const lineSpacingClass = isCompactLines ? 'space-y-1' : 'space-y-2'
  const groupSpacingClass = 'mb-6'
  const slideById = useMemo(() => {
    const map = new Map<string, SongSlide>()
    orderedGroups.forEach((group) => {
      group.slides.forEach((slide) => {
        map.set(slide.id, slide)
      })
    })
    return map
  }, [orderedGroups])
  const [previewPageCount, setPreviewPageCount] = useState(1)
  const [previewPageWidth, setPreviewPageWidth] = useState(0)
  const [previewColumnGap, setPreviewColumnGap] = useState(0)
  const chartBodyRef = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement | null>())

  const chordQualityOptions = useMemo(() => {
    const customQualities = (settings.customQualities ?? [])
      .map((quality) => quality.trim())
      .filter(Boolean)
    const defaultSuffixes = new Set(CHORD_QUALITY_OPTIONS.map((option) => option.suffix))
    const uniqueCustom = Array.from(new Set(customQualities))
      .filter((quality) => !defaultSuffixes.has(quality))
      .map((quality) => ({
        value: `${CUSTOM_QUALITY_PREFIX}${quality}`,
        label: quality,
        suffix: quality,
      }))
    return [...CHORD_QUALITY_OPTIONS, ...uniqueCustom]
  }, [settings.customQualities])

  const addChordQuality = useCallback((rawQuality: string, options?: { keepInput?: boolean }) => {
    const trimmed = rawQuality.trim()
    if (!trimmed) return null
    const defaultOption = CHORD_QUALITY_OPTIONS.find((option) => option.suffix === trimmed)
    if (defaultOption) {
      if (!options?.keepInput) {
        setCustomQualityInput('')
      }
      return defaultOption.value
    }
    const existingCustom = new Set(settings.customQualities ?? [])
    if (existingCustom.has(trimmed)) {
      if (!options?.keepInput) {
        setCustomQualityInput('')
      }
      return `${CUSTOM_QUALITY_PREFIX}${trimmed}`
    }
    onSettingsChange({
      ...settings,
      customQualities: [...(settings.customQualities ?? []), trimmed],
    })
    setHasChanges(true)
    if (!options?.keepInput) {
      setCustomQualityInput('')
    }
    return `${CUSTOM_QUALITY_PREFIX}${trimmed}`
  }, [settings, onSettingsChange, setHasChanges])

  useEffect(() => {
    const chartPage = document.querySelector('.chart-page.chord-chart') as HTMLElement | null
    const chartBody = chartBodyRef.current ?? (chartPage?.querySelector('.chart-body') as HTMLElement | null)

    const updatePagination = () => {
      if (!chartBody || !chartPage) return
      const totalWidth = chartBody.scrollWidth
      const viewportWidth = chartBody.clientWidth
      const computed = window.getComputedStyle(chartBody)
      const gapValue = Number.parseFloat(computed.columnGap || '0')
      const columnGap = Number.isFinite(gapValue) ? gapValue : 0
      const pageCount = viewportWidth > 0
        ? Math.max(1, Math.ceil((totalWidth - viewportWidth * 0.05) / viewportWidth))
        : 1
      if (viewportWidth > 0) {
        setPreviewPageWidth(viewportWidth)
      }
      if (columnGap !== previewColumnGap) {
        setPreviewColumnGap(columnGap)
      }
      if (pageCount !== previewPageCount) {
        setPreviewPageCount(pageCount)
      }
    }

    updatePagination()

    const resizeObserver = new ResizeObserver(() => {
      updatePagination()
    })

    if (chartBody) {
      resizeObserver.observe(chartBody)
    }

    const handleBeforePrint = () => updatePagination()
    const handleAfterPrint = () => updatePagination()
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [settings.lyricFontSizePx, settings.chordFontSizePx, settings.lineHeight, orderedGroups.length, previewPageCount])

  const addChordPlacement = useCallback((placement: ChordPlacement) => {
    const slide = slideById.get(placement.slideId)
    const line = slide?.lines?.[placement.lineIndex] ?? ''
    const word = line ? parseLineIntoWords(line).find(
      (range) => placement.charIndex >= range.start && placement.charIndex <= range.end
    ) : null
    const filtered = settings.placements.filter((p) => {
      if (p.slideId !== placement.slideId || p.lineIndex !== placement.lineIndex) {
        return true
      }
      if (!word) {
        return p.charIndex !== placement.charIndex
      }
      return p.charIndex < word.start || p.charIndex > word.end
    })
    onSettingsChange({
      ...settings,
      placements: [...filtered, placement],
    })
    setHasChanges(true)
  }, [settings, onSettingsChange, setHasChanges, slideById])

  const removeChordPlacement = useCallback((slideId: string, lineIndex: number, charIndex: number) => {
    onSettingsChange({
      ...settings,
      placements: settings.placements.filter(
        (p) =>
          !(p.slideId === slideId && p.lineIndex === lineIndex && p.charIndex === charIndex)
      ),
    })
    setHasChanges(true)
  }, [settings, onSettingsChange, setHasChanges])

  const replaceChordPlacement = useCallback((placement: ChordPlacement, word: WordRange) => {
    const filtered = settings.placements.filter(
      (p) =>
        !(p.slideId === placement.slideId &&
          p.lineIndex === placement.lineIndex &&
          p.charIndex >= word.start &&
          p.charIndex <= word.end)
    )
    onSettingsChange({
      ...settings,
      placements: [...filtered, placement],
    })
    setHasChanges(true)
  }, [settings, onSettingsChange, setHasChanges])

  const hasFretShift = Boolean(settings.capoKey) && Number.isFinite(settings.fretShift)
  const hasInfo = settings.songKey || settings.capoKey || hasFretShift
  const formattedFretShift = settings.fretShift > 0 ? `+${settings.fretShift}` : `${settings.fretShift}`

  const chartBodyStyleBase = {
    '--chart-lyric-font-size': `${settings.lyricFontSizePx}px`,
    '--chart-chord-font-size': `${settings.chordFontSizePx}px`,
    '--chart-line-height': `${lineHeightEm}`,
  } as CSSProperties

  const registerWordFocusRef = useCallback((key: string) => {
    return (el: HTMLSpanElement | null) => {
      wordFocusRefs.current.set(key, el)
    }
  }, [])

  const registerPageRef = useCallback((pageIndex: number) => {
    return (el: HTMLDivElement | null) => {
      pageRefs.current.set(pageIndex, el)
    }
  }, [])

  const handlePlaceNote = useCallback((pageIndex: number, event: ReactMouseEvent<HTMLDivElement>) => {
    const page = pageRefs.current.get(pageIndex)
    if (!page) return
    const rect = page.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const xPct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const yPct = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    onPlaceNote({ xPct, yPct, pageIndex, linkedWord: pendingLinkedWord ?? undefined })
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

  const handleLinkWordForNote = useCallback((word: ChartNoteLinkedWord) => {
    setPendingLinkedWord(word)
  }, [])

  useEffect(() => {
    if (!notePlacementActive) {
      setPendingLinkedWord(null)
    }
  }, [notePlacementActive])

  const focusWordByKey = useCallback((key: string | null) => {
    if (!key) return
    const el = wordFocusRefs.current.get(key)
    el?.focus()
  }, [])

  const setAndFocusWordKey = useCallback((key: string | null) => {
    if (!key) return
    setFocusedWordKey(key)
    requestAnimationFrame(() => focusWordByKey(key))
  }, [focusWordByKey])

  const wordNavigationData = useMemo(() => {
    const orderedWordKeys: string[] = []
    const keyToPosition = new Map<string, { key: string; groupIndex: number; lineGlobalIndex: number; wordIndex: number }>()
    const lines: Array<{ groupIndex: number; lineIndex: number; wordKeys: string[] }> = []
    const groupFirstWordKey: Array<string | null> = []

    orderedGroups.forEach((group, groupIndex) => {
      let groupHasWord = false
      group.slides.forEach((slide) => {
        slide.lines.forEach((line, lineIndex) => {
          const words = parseLineIntoWords(line)
          if (words.length === 0) return
          const wordKeys: string[] = []
          const lineGlobalIndex = lines.length
          words.forEach((word, wordIndex) => {
            const key = `${slide.id}-${lineIndex}-${word.start}`
            wordKeys.push(key)
            orderedWordKeys.push(key)
            keyToPosition.set(key, { key, groupIndex, lineGlobalIndex, wordIndex })
          })
          lines.push({ groupIndex, lineIndex, wordKeys })
          if (!groupHasWord && wordKeys.length > 0) {
            groupFirstWordKey[groupIndex] = wordKeys[0]
            groupHasWord = true
          }
        })
      })
      if (!groupHasWord) {
        groupFirstWordKey[groupIndex] = null
      }
    })

    return { orderedWordKeys, keyToPosition, lines, groupFirstWordKey }
  }, [orderedGroups])

  const { orderedWordKeys, keyToPosition, lines, groupFirstWordKey } = wordNavigationData

  const getGroupJumpKey = useCallback((currentGroupIndex: number, direction: -1 | 1) => {
    let index = currentGroupIndex + direction
    while (index >= 0 && index < groupFirstWordKey.length) {
      const key = groupFirstWordKey[index]
      if (key) return key
      index += direction
    }
    return null
  }, [groupFirstWordKey])

  const handleChartKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const navigationKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' ', 'Tab']
    if (!navigationKeys.includes(event.key)) return
    if (event.target !== event.currentTarget) return
    setKeyboardNavActive(true)
    if (orderedWordKeys.length === 0) return

    const fallbackKey = orderedWordKeys[0]
    const currentKey = focusedWordKey ?? fallbackKey
    const currentPosition = keyToPosition.get(currentKey)
    if (!currentPosition) return

    if (event.key === 'Tab') {
      event.preventDefault()
      const direction = event.shiftKey ? -1 : 1
      const targetKey = getGroupJumpKey(currentPosition.groupIndex, direction as -1 | 1)
      if (targetKey) {
        setAndFocusWordKey(targetKey)
      }
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setAndFocusWordKey(currentKey)
      requestAnimationFrame(() => {
        const el = wordFocusRefs.current.get(currentKey)
        el?.click()
      })
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setAndFocusWordKey(orderedWordKeys[0])
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setAndFocusWordKey(orderedWordKeys[orderedWordKeys.length - 1])
      return
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const line = lines[currentPosition.lineGlobalIndex]
      if (!line) return
      const delta = event.key === 'ArrowRight' ? 1 : -1
      const nextWordIndex = Math.max(0, Math.min(line.wordKeys.length - 1, currentPosition.wordIndex + delta))
      setAndFocusWordKey(line.wordKeys[nextWordIndex])
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextLineIndex = currentPosition.lineGlobalIndex + delta
      const nextLine = lines[nextLineIndex]
      if (!nextLine) return
      const nextWordIndex = Math.min(currentPosition.wordIndex, nextLine.wordKeys.length - 1)
      setAndFocusWordKey(nextLine.wordKeys[nextWordIndex])
    }
  }, [focusedWordKey, orderedWordKeys, keyToPosition, lines, getGroupJumpKey, setAndFocusWordKey])

  const handleWordNavigation = useCallback((event: ReactKeyboardEvent<HTMLSpanElement>, key: string) => {
    const navigationKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' ', 'Tab']
    if (!navigationKeys.includes(event.key)) return
    setKeyboardNavActive(true)
    const currentPosition = keyToPosition.get(key)
    if (!currentPosition) return

    if (event.key === 'Tab') {
      event.preventDefault()
      const direction = event.shiftKey ? -1 : 1
      const targetKey = getGroupJumpKey(currentPosition.groupIndex, direction as -1 | 1)
      if (targetKey) {
        setAndFocusWordKey(targetKey)
      }
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setAndFocusWordKey(orderedWordKeys[0])
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setAndFocusWordKey(orderedWordKeys[orderedWordKeys.length - 1])
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const line = lines[currentPosition.lineGlobalIndex]
      if (!line) return
      const delta = event.key === 'ArrowRight' ? 1 : -1
      const nextWordIndex = Math.max(0, Math.min(line.wordKeys.length - 1, currentPosition.wordIndex + delta))
      setAndFocusWordKey(line.wordKeys[nextWordIndex])
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextLineIndex = currentPosition.lineGlobalIndex + delta
      const nextLine = lines[nextLineIndex]
      if (!nextLine) return
      const nextWordIndex = Math.min(currentPosition.wordIndex, nextLine.wordKeys.length - 1)
      setAndFocusWordKey(nextLine.wordKeys[nextWordIndex])
    }
  }, [orderedWordKeys, keyToPosition, lines, getGroupJumpKey, setAndFocusWordKey])

  useEffect(() => {
    if (orderedWordKeys.length === 0) return
    if (focusedWordKey) return
    const firstKey = orderedWordKeys[0]
    setFocusedWordKey(firstKey)
    requestAnimationFrame(() => focusWordByKey(firstKey))
  }, [orderedWordKeys, focusedWordKey, focusWordByKey])

  const bodyContent = (
    <>
      {orderedGroups.map((group, groupIndex) => {
        const label = getGroupDisplayLabel(group)
        const colors = GROUP_COLORS[group.label] ?? GROUP_COLORS.custom
        const showLabel = settings.showGroupLabels && label

        const labelColorClass = settings.colorizeLabels ? colors.label : 'text-muted-foreground'
        const borderColorClass = settings.colorizeBorders ? colors.border : 'border-border'

        return (
          <div
            key={`${group.key}-${groupIndex}`}
            className={`chart-group ${groupSpacingClass} ${
              settings.groupStyle === 'outline'
                ? `border ${borderColorClass} p-3`
                : ''
            }`}
          >
            {showLabel && settings.groupStyle !== 'none' && (
              <h3 className={`font-semibold ${labelColorClass} mb-2 text-[0.85em] uppercase tracking-wide leading-none print:text-[10pt]`}>
                {label}
              </h3>
            )}
            <div className={lineSpacingClass}>
              {group.slides.map((slide) =>
                slide.lines.map((line, lineIndex) => (
                  <ChordLine
                    key={`${slide.id}-${lineIndex}`}
                    slideId={slide.id}
                    lineIndex={lineIndex}
                    line={line}
                    placements={settings.placements.filter(
                      (p) => p.slideId === slide.id && p.lineIndex === lineIndex
                    )}
                    lineHeightEm={lineHeightEm}
                    dimLyrics={settings.dimLyrics ?? true}
                    colorizeChords={settings.colorizeChords ?? true}
                    onAddChord={addChordPlacement}
                    onRemoveChord={removeChordPlacement}
                    onReplaceChord={replaceChordPlacement}
                    chordQualityOptions={chordQualityOptions}
                    customQualityInput={customQualityInput}
                    setCustomQualityInput={setCustomQualityInput}
                    onAddChordQuality={addChordQuality}
                    keyboardNavActive={keyboardNavActive}
                    setKeyboardNavActive={setKeyboardNavActive}
                    focusedWordKey={focusedWordKey}
                    setFocusedWordKey={setFocusedWordKey}
                    registerWordFocusRef={registerWordFocusRef}
                    onWordNavigation={handleWordNavigation}
                    notePlacementActive={notePlacementActive}
                    onLinkWordForNote={handleLinkWordForNote}
                    wordMarkersByKey={wordMarkersByKey}
                    pendingLinkedWordKey={pendingLinkedWord?.wordKey ?? null}
                    nextMarkerNumber={nextMarkerNumber}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </>
  )

  const pages = Array.from({ length: previewPageCount }, (_, index) => index)

  return (
    <div className="space-y-6">
      {pages.map((pageIndex) => (
        <div
          key={`chord-chart-page-${pageIndex}`}
          ref={registerPageRef(pageIndex)}
          className={`chart-page chord-chart bg-background text-foreground border border-border print:border-0 p-5 min-h-[11in] select-none relative print:m-0 print:w-full print:max-w-none print:min-h-[11in] print:box-border print:shadow-none ${notePlacementActive ? 'cursor-crosshair' : ''}`}
          onClickCapture={(event) => {
            if (!notePlacementActive) return
            const target = event.target as HTMLElement | null
            if (target?.closest?.('[data-note-word="true"]')) return
            if (target?.closest?.('[data-chart-note="true"]')) return
            handlePlaceNote(pageIndex, event)
          }}
        >
          <div
            className={`chart-header mb-5 pb-5 border-b border-border ${pageIndex === 0 ? '' : 'invisible'}`}
            aria-hidden={pageIndex !== 0}
          >
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-bold print:text-[18pt]">{songTitle}</h1>
              {hasInfo && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {settings.songKey && <span>Key: {settings.songKey}</span>}
                  {settings.capoKey && <span>Capo: {settings.capoKey}</span>}
                  {hasFretShift && <span>Fret shift: {formattedFretShift}</span>}
                </div>
              )}
            </div>
          </div>

          <ChartNotesLayer
            notes={settings.notes.filter((note) => (note.pageIndex ?? 0) === pageIndex)}
            openNoteId={openNoteId}
            onOpenNoteIdChange={onOpenNoteIdChange}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
          />

          {notePlacementActive && (
            <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden />
          )}

          <div className="overflow-hidden h-[9.5in]">
            <div
              ref={pageIndex === 0 ? chartBodyRef : undefined}
              className="chart-body h-[9.5in] columns-2 gap-x-8 [column-fill:auto] text-(length:--chart-lyric-font-size) leading-(--chart-line-height) translate-x-(--chart-page-offset)"
              tabIndex={0}
              onKeyDown={handleChartKeyDown}
              onFocus={(event) => {
                if (event.target !== event.currentTarget) return
                if (orderedWordKeys.length === 0) return
                setKeyboardNavActive(true)
                const key = focusedWordKey ?? orderedWordKeys[0]
                setAndFocusWordKey(key)
              }}
              onMouseDown={(event) => {
                event.currentTarget.focus()
              }}
              style={{
                ...chartBodyStyleBase,
                '--chart-page-offset': pageIndex > 0 && previewPageWidth > 0
                  ? `-${pageIndex * (previewPageWidth + previewColumnGap)}px`
                  : '0px',
              } as CSSProperties}
            >
              {bodyContent}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface ChordLineProps {
  slideId: string
  lineIndex: number
  line: string
  placements: ChordPlacement[]
  lineHeightEm: number
  dimLyrics: boolean
  colorizeChords: boolean
  onAddChord: (placement: ChordPlacement) => void
  onRemoveChord: (slideId: string, lineIndex: number, charIndex: number) => void
  onReplaceChord: (placement: ChordPlacement, word: WordRange) => void
  chordQualityOptions: Array<{ value: string; label: string; suffix: string }>
  customQualityInput: string
  setCustomQualityInput: (quality: string) => void
  onAddChordQuality: (quality: string, options?: { keepInput?: boolean }) => string | null
  keyboardNavActive: boolean
  setKeyboardNavActive: (active: boolean) => void
  focusedWordKey: string | null
  setFocusedWordKey: (key: string | null) => void
  registerWordFocusRef: (key: string) => (el: HTMLSpanElement | null) => void
  onWordNavigation: (event: ReactKeyboardEvent<HTMLSpanElement>, key: string) => void
  notePlacementActive: boolean
  onLinkWordForNote: (word: ChartNoteLinkedWord) => void
  wordMarkersByKey: Map<string, number[]>
  pendingLinkedWordKey: string | null
  nextMarkerNumber: number
}

function ChordLine({
  slideId,
  lineIndex,
  line,
  placements,
  lineHeightEm,
  dimLyrics,
  colorizeChords,
  onAddChord,
  onRemoveChord,
  onReplaceChord,
  chordQualityOptions,
  customQualityInput,
  setCustomQualityInput,
  onAddChordQuality,
  keyboardNavActive,
  setKeyboardNavActive,
  focusedWordKey,
  setFocusedWordKey,
  registerWordFocusRef,
  onWordNavigation,
  notePlacementActive,
  onLinkWordForNote,
  wordMarkersByKey,
  pendingLinkedWordKey,
  nextMarkerNumber,
}: ChordLineProps) {
  const [openWordIndex, setOpenWordIndex] = useState<number | null>(null)
  const [selectedChordBase, setSelectedChordBase] = useState<string>('')
  const [selectedChordAccidental, setSelectedChordAccidental] = useState<'' | '#' | 'b'>('')
  const [selectedChordQuality, setSelectedChordQuality] = useState<string>('maj')
  const [dragState, setDragState] = useState<ChordDragState | null>(null)
  const [lyricCharWidth, setLyricCharWidth] = useState<number | null>(null)
  const chordLabelsRef = useRef<HTMLDivElement | null>(null)
  const lyricMeasureRef = useRef<HTMLSpanElement | null>(null)
  const chordBaseRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const baseFirstRef = useRef<HTMLButtonElement | null>(null)
  const accidentalFirstRef = useRef<HTMLButtonElement | null>(null)
  const qualityFirstRef = useRef<HTMLButtonElement | null>(null)

  const registerChordBaseRef = useCallback((note: string) => {
    return (el: HTMLButtonElement | null) => {
      chordBaseRefs.current.set(note, el)
    }
  }, [])

  const registerBaseFirstRef = useCallback((note: string) => {
    const register = registerChordBaseRef(note)
    return (el: HTMLButtonElement | null) => {
      register(el)
      if (note === BASE_NOTES[0]) {
        baseFirstRef.current = el
      }
    }
  }, [registerChordBaseRef])

  const accidentalToggleValue =
    selectedChordAccidental === '#'
      ? 'sharp'
      : selectedChordAccidental === 'b'
        ? 'flat'
        : 'natural'

  useLayoutEffect(() => {
    const measureRect = lyricMeasureRef.current?.getBoundingClientRect()
    if (measureRect?.width && measureRect.width !== lyricCharWidth) {
      setLyricCharWidth(measureRect.width)
    }
  }, [line, lineHeightEm, lyricCharWidth])

  const words = useMemo(() => parseLineIntoWords(line), [line])

  const replaceChordInWord = useCallback((word: WordRange, chord: string, charIndex: number) => {
    const placementsInWord = placements.filter(
      (placement) => placement.charIndex >= word.start && placement.charIndex <= word.end
    )
    onReplaceChord({
      slideId,
      lineIndex,
      charIndex,
      chord,
    }, word)
  }, [placements, onReplaceChord, slideId, lineIndex])

  const handleSelectChord = (chord: string, word: WordRange) => {
    replaceChordInWord(word, chord, word.start)
    setOpenWordIndex(null)
    setCustomQualityInput('')
  }

  const handleWordKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>, wordIndex: number) => {
    if (words.length === 0) return
    const navigationKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' ', 'Tab']
    if (navigationKeys.includes(event.key)) {
      setKeyboardNavActive(true)
    }
    const wordKey = `${slideId}-${lineIndex}-${words[wordIndex].start}`
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(event.key)) {
      event.stopPropagation()
      onWordNavigation(event, wordKey)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      setOpenWordIndex(wordIndex)
      return
    }
    if (event.key === 'Escape') {
      setOpenWordIndex(null)
    }
  }

  const handleSelectChordFromControls = (word: WordRange) => {
    if (!selectedChordBase) return
    const quality = chordQualityOptions.find((option) => option.value === selectedChordQuality)
    const suffix = quality ? quality.suffix : ''
    const chord = `${selectedChordBase}${selectedChordAccidental}${suffix}`
    handleSelectChord(chord, word)
  }

  const handleRemoveChordAtWord = (wordStart: number) => {
    // Find any chord within this word's range
    const word = words.find((w) => w.start === wordStart)
    if (!word) return
    
    placements.forEach((p) => {
      if (p.charIndex >= word.start && p.charIndex <= word.end) {
        onRemoveChord(slideId, lineIndex, p.charIndex)
      }
    })
    setOpenWordIndex(null)
  }

  const handleChordPointerDown = (event: ReactPointerEvent<HTMLSpanElement>, placement: ChordPlacement) => {
    if (event.button !== 0) return
    const word = words.find((w) => placement.charIndex >= w.start && placement.charIndex <= w.end)
    if (!word) return
    const labelRect = chordLabelsRef.current?.getBoundingClientRect()
    const measureRect = lyricMeasureRef.current?.getBoundingClientRect()
    if (!labelRect || !measureRect || measureRect.width === 0) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)

    const pixelLeft = labelRect.left + placement.charIndex * measureRect.width
    const wordKey = `${slideId}-${lineIndex}-${word.start}`
    const wordEl = document.querySelector(`[data-word-key="${wordKey}"]`) as HTMLSpanElement | null
    const wordRect = wordEl?.getBoundingClientRect()
    const wordStyle = wordEl ? window.getComputedStyle(wordEl) : null
    const wordPaddingLeft = wordStyle ? Number.parseFloat(wordStyle.paddingLeft || '0') : 0
    const wordPaddingRight = wordStyle ? Number.parseFloat(wordStyle.paddingRight || '0') : 0
    setDragState({
      placement,
      word,
      lineLeft: labelRect.left,
      charWidth: measureRect.width,
      currentCharIndex: placement.charIndex,
      pointerId: event.pointerId,
    })
  }

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return
      const relativeX = event.clientX - dragState.lineLeft
      const rawIndex = Math.round(relativeX / dragState.charWidth)
      const nextIndex = Math.min(dragState.word.end, Math.max(dragState.word.start, rawIndex))
      if (nextIndex !== dragState.currentCharIndex) {
        setDragState((prev) => (prev ? { ...prev, currentCharIndex: nextIndex } : prev))
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return
      const relativeX = event.clientX - dragState.lineLeft
      const rawIndex = Math.round(relativeX / dragState.charWidth)
      const pixelLeft = dragState.lineLeft + dragState.currentCharIndex * dragState.charWidth
      const wordKey = `${slideId}-${lineIndex}-${dragState.word.start}`
      const wordEl = document.querySelector(`[data-word-key="${wordKey}"]`) as HTMLSpanElement | null
      const wordRect = wordEl?.getBoundingClientRect()
      const wordStyle = wordEl ? window.getComputedStyle(wordEl) : null
      const wordPaddingLeft = wordStyle ? Number.parseFloat(wordStyle.paddingLeft || '0') : 0
      const wordPaddingRight = wordStyle ? Number.parseFloat(wordStyle.paddingRight || '0') : 0
      if (dragState.currentCharIndex !== dragState.placement.charIndex) {
        replaceChordInWord(dragState.word, dragState.placement.chord, dragState.currentCharIndex)
      }
      setDragState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [dragState, replaceChordInWord])

  const renderedPlacements = useMemo(() => {
    return placements.map((placement) => {
      if (
        dragState &&
        placement.slideId === dragState.placement.slideId &&
        placement.lineIndex === dragState.placement.lineIndex &&
        placement.charIndex === dragState.placement.charIndex
      ) {
        return { ...placement, displayCharIndex: dragState.currentCharIndex }
      }
      return { ...placement, displayCharIndex: placement.charIndex }
    })
  }, [placements, dragState])

  if (!line.trim()) {
    return null
  }

  const getToggleGroupTargets = () => {
    const candidates = [
      baseFirstRef.current,
      selectedChordBase ? accidentalFirstRef.current : null,
      qualityFirstRef.current,
    ]
    return candidates.filter((target): target is HTMLButtonElement => {
      if (!target) return false
      return !target.disabled
    })
  }

  const focusNextToggleGroup = (direction: -1 | 1, clamp = true) => {
    const targets = getToggleGroupTargets()
    if (targets.length === 0) return
    const active = document.activeElement as HTMLElement | null
    const currentIndex = active
      ? targets.findIndex((target) => target === active || target.contains(active))
      : -1
    const baseIndex = currentIndex === -1 ? (direction === 1 ? 0 : targets.length - 1) : currentIndex
    const rawIndex = baseIndex + direction
    const nextIndex = clamp
      ? Math.max(0, Math.min(targets.length - 1, rawIndex))
      : rawIndex
    if (nextIndex < 0 || nextIndex >= targets.length) return
    targets[nextIndex]?.focus()
  }

  return (
    <div className="chord-line relative">
      {/* Chord labels row */}
      <div
        ref={chordLabelsRef}
        className="chord-labels font-mono font-normal relative h-5 select-none text-(length:--chart-chord-font-size)"
      >
        <span className="absolute left-0 top-0 opacity-0 pointer-events-none">0</span>
        {renderedPlacements.map((placement) => (
          <span
            key={`${placement.slideId}-${placement.lineIndex}-${placement.charIndex}`}
            className={`absolute whitespace-nowrap touch-none font-bold ${
              colorizeChords ? getChordRootColor(placement.chord) : 'text-foreground'
            }`}
            style={{
              left: lyricCharWidth ? `${placement.displayCharIndex * lyricCharWidth}px` : `${placement.displayCharIndex}ch`,
            }}
            onPointerDown={(event) => handleChordPointerDown(event, placement)}
          >
            {placement.chord}
          </span>
        ))}
      </div>

      {/* Lyrics row with clickable words */}
      <div
        className={`lyrics-line relative font-mono whitespace-pre-wrap leading-(--chart-line-height) print:hidden ${dimLyrics ? 'text-muted-foreground' : ''}`}
      >
        <span ref={lyricMeasureRef} className="absolute left-0 top-0 opacity-0 pointer-events-none">0</span>
        {words.length === 0 ? (
          <span>{line}</span>
        ) : (
          <>
            {/* Leading whitespace */}
            {words[0].start > 0 && <span>{line.slice(0, words[0].start)}</span>}
            
            {words.map((word, wordIndex) => {
              const hasChord = placements.some(
                (p) => p.charIndex >= word.start && p.charIndex <= word.end
              )
              const wordKey = `${slideId}-${lineIndex}-${word.start}`
              const isSelectedWord = keyboardNavActive && focusedWordKey === wordKey
              const existingMarkers = wordMarkersByKey.get(wordKey) ?? []
              const pendingMarker = notePlacementActive && pendingLinkedWordKey === wordKey
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
                  <Popover
                    open={openWordIndex === wordIndex}
                    onOpenChange={(open, eventDetails) => {
                      if (notePlacementActive) {
                        eventDetails?.cancel?.()
                        return
                      }
                      const target = (eventDetails?.event?.target ?? null) as HTMLElement | null
                      const targetAction = target?.getAttribute?.('data-chord-popover-action') ?? null
                      const insideChartBody = Boolean(target?.closest?.('.chart-body'))
                      const insidePopover = Boolean(target?.closest?.('[data-slot="popover-content"]'))
                      const insideTrigger = Boolean(target?.closest?.('[data-slot="popover-trigger"]'))
                      if (!open && eventDetails) {
                        const isActionClose = targetAction === 'add' || targetAction === 'remove'
                        const isOutsideEditor = !insideChartBody && !insidePopover && !insideTrigger
                        if (!isActionClose && !isOutsideEditor) {
                          eventDetails.cancel()
                          return
                        }
                      }
                      if (open) {
                        const existingChord = placements.find(
                          (p) => p.charIndex >= word.start && p.charIndex <= word.end
                        )
                        if (existingChord) {
                          const parsed = parseChordSymbol(existingChord.chord)
                          if (parsed) {
                            setSelectedChordBase(parsed.base)
                            setSelectedChordAccidental(parsed.accidental)
                            const option = chordQualityOptions.find((quality) => quality.suffix === parsed.suffix)
                            if (option) {
                              setSelectedChordQuality(option.value)
                            } else if (parsed.suffix) {
                              const nextValue = onAddChordQuality(parsed.suffix, { keepInput: true })
                              setSelectedChordQuality(nextValue ?? 'maj')
                            } else {
                              setSelectedChordQuality('maj')
                            }
                          }
                        } else if (!selectedChordBase) {
                          setSelectedChordBase('C')
                          setSelectedChordAccidental('')
                          setSelectedChordQuality('maj')
                        }
                        setOpenWordIndex(wordIndex)
                        setFocusedWordKey(wordKey)
                      } else {
                        setOpenWordIndex(null)
                      }
                    }}
                  >
                    <PopoverTrigger
                      nativeButton={false}
                      render={
                        <span
                          ref={registerWordFocusRef(wordKey)}
                          tabIndex={focusedWordKey === wordKey ? 0 : -1}
                          role="button"
                          aria-haspopup="dialog"
                          aria-expanded={openWordIndex === wordIndex}
                          aria-label={`Edit chord for ${word.word}`}
                          onFocus={() => setFocusedWordKey(wordKey)}
                          onPointerDown={(event) => {
                            event.stopPropagation()
                            if (notePlacementActive) {
                              event.preventDefault()
                              onLinkWordForNote({
                                wordKey,
                                slideId,
                                lineIndex,
                                wordStart: word.start,
                                wordText: word.word,
                              })
                              setFocusedWordKey(wordKey)
                              event.currentTarget.focus()
                              return
                            }
                            setFocusedWordKey(wordKey)
                            event.currentTarget.focus()
                          }}
                          onClick={() => {
                            if (notePlacementActive) {
                              onLinkWordForNote({
                                wordKey,
                                slideId,
                                lineIndex,
                                wordStart: word.start,
                                wordText: word.word,
                              })
                              return
                            }
                            setOpenWordIndex(wordIndex)
                            setFocusedWordKey(wordKey)
                          }}
                          onKeyDown={(event) => handleWordKeyDown(event, wordIndex)}
                          data-word-key={wordKey}
                          data-chord-word="true"
                          data-note-word="true"
                          data-line-id={`${slideId}-${lineIndex}`}
                          data-word-start={word.start}
                          className={`cursor-pointer print:cursor-default hover:bg-foreground/10 rounded-none px-0.5 -mx-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                            hasChord ? 'bg-foreground/10' : ''
                          } ${isSelectedWord ? 'outline-2 outline-offset-2 outline-primary' : ''}`}
                        >
                          {word.word}
                          {markerNumbers.length > 0 && (
                            <sup className="ml-0.5 text-[0.65em] text-muted-foreground">
                              {markerNumbers.join(',')}
                            </sup>
                          )}
                        </span>
                      }
                    />
                    <PopoverContent
                      align="start"
                      className="w-64 p-2"
                      initialFocus={() => chordBaseRefs.current.get(selectedChordBase || 'C') ?? true}
                      finalFocus={() => document.querySelector(`[data-word-key="${wordKey}"]`) as HTMLElement | null}
                      onMouseDown={(event) => {
                        event.stopPropagation()
                      }}
                      onKeyDownCapture={(event) => {
                        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
                        const active = document.activeElement as HTMLElement | null
                        const isToggleItem = Boolean(active?.closest('[data-slot="toggle-group-item"]'))
                        const groupEl = active?.closest('[data-slot="toggle-group"]') as HTMLElement | null
                        const groupName = groupEl?.getAttribute('data-chord-group') ?? 'unknown'
                        const groupItems = groupEl
                          ? Array.from(groupEl.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]'))
                          : []
                        const activeIndex = active ? groupItems.indexOf(active) : -1
                        const columnCount = groupEl?.classList.contains('grid-cols-7')
                          ? 7
                          : groupEl?.classList.contains('grid-cols-3')
                            ? 3
                            : groupEl?.classList.contains('grid-cols-4')
                              ? 4
                              : 0
                        const rowCount = columnCount > 0 ? Math.ceil(groupItems.length / columnCount) : 0
                        const activeRow = columnCount > 0 && activeIndex >= 0 ? Math.floor(activeIndex / columnCount) : -1
                        const activeCol = columnCount > 0 && activeIndex >= 0 ? activeIndex % columnCount : -1
                        const groupList = Array.from(
                          event.currentTarget.querySelectorAll<HTMLElement>('[data-chord-group]')
                        )
                        const currentGroupIndex = groupEl ? groupList.indexOf(groupEl) : -1
                        const prevGroup = currentGroupIndex > 0 ? groupList[currentGroupIndex - 1] : null
                        const nextGroup = currentGroupIndex >= 0 && currentGroupIndex < groupList.length - 1
                          ? groupList[currentGroupIndex + 1]
                          : null
                        const prevItems = prevGroup
                          ? Array.from(prevGroup.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]'))
                          : []
                        const nextItems = nextGroup
                          ? Array.from(nextGroup.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]'))
                          : []
                        if (!isToggleItem) return
                        event.preventDefault()
                        event.stopPropagation()
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                          const targetIndex = event.key === 'ArrowLeft'
                            ? Math.max(0, activeIndex - 1)
                            : Math.min(groupItems.length - 1, activeIndex + 1)
                          const atEdge = event.key === 'ArrowLeft' ? activeIndex === 0 : activeIndex === groupItems.length - 1
                          if (!atEdge && targetIndex !== activeIndex) {
                            groupItems[targetIndex]?.focus()
                            return
                          }
                          if (event.key === 'ArrowLeft' && prevItems.length > 0) {
                            prevItems[prevItems.length - 1]?.focus()
                            return
                          }
                          if (event.key === 'ArrowRight' && nextItems.length > 0) {
                            nextItems[0]?.focus()
                          }
                          return
                        }
                        const movingDown = event.key === 'ArrowDown'
                        if (columnCount > 0 && activeIndex >= 0) {
                          const nextRow = activeRow + (movingDown ? 1 : -1)
                          if (nextRow >= 0 && nextRow < rowCount) {
                            const rowStart = nextRow * columnCount
                            const rowEnd = Math.min(rowStart + columnCount - 1, groupItems.length - 1)
                            const targetIndex = Math.min(rowStart + activeCol, rowEnd)
                            if (targetIndex !== activeIndex) {
                              groupItems[targetIndex]?.focus()
                              return
                            }
                          }
                        }
                        const targetItems = movingDown ? nextItems : prevItems
                        if (targetItems.length === 0) {
                          return
                        }
                        const targetIndex = Math.min(activeIndex, targetItems.length - 1)
                        targetItems[targetIndex]?.focus()
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Tab') return
                        const active = document.activeElement as HTMLElement | null
                        if (!active) return
                        const isToggleItem = Boolean(active.closest('[data-slot="toggle-group-item"]'))
                        if (!isToggleItem) return
                        event.preventDefault()
                        const groupList = Array.from(
                          event.currentTarget.querySelectorAll<HTMLElement>('[data-chord-group]')
                        )
                        const currentGroup = active.closest('[data-chord-group]') as HTMLElement | null
                        const currentIndex = currentGroup ? groupList.indexOf(currentGroup) : -1
                        if (groupList.length === 0 || currentIndex === -1) return
                        const direction = event.shiftKey ? -1 : 1
                        const nextIndex = (currentIndex + direction + groupList.length) % groupList.length
                        const nextGroup = groupList[nextIndex]
                        const items = nextGroup
                          ? Array.from(nextGroup.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]'))
                          : []
                        if (items.length > 0) {
                          items[0]?.focus()
                        }
                      }}
                    >
                      <div className="space-y-2">
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          size="sm"
                          value={selectedChordBase}
                          data-chord-group="base"
                          onValueChange={(value) => {
                            const nextValue = Array.isArray(value) ? value[0] : value
                            if (!nextValue) {
                              setSelectedChordBase('')
                              setSelectedChordAccidental('')
                              return
                            }
                            setSelectedChordBase(nextValue)
                          }}
                          className="grid w-full grid-cols-7"
                          loopFocus
                        >
                          {BASE_NOTES.map((note) => (
                            <ToggleGroupItem
                              key={note}
                              ref={registerBaseFirstRef(note)}
                              value={note}
                              className="h-7 w-full text-xs"
                            >
                              {note}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>

                        <ToggleGroup
                          type="single"
                          variant="outline"
                          size="sm"
                          value={accidentalToggleValue}
                          data-chord-group="accidental"
                          onValueChange={(value) => {
                            const nextValue = Array.isArray(value) ? value[0] : value
                            if (!nextValue || nextValue === 'natural') {
                              setSelectedChordAccidental('')
                            } else if (nextValue === 'sharp') {
                              setSelectedChordAccidental('#')
                            } else if (nextValue === 'flat') {
                              setSelectedChordAccidental('b')
                            }
                          }}
                          disabled={!selectedChordBase}
                          className="grid w-full grid-cols-3"
                          loopFocus
                        >
                          <ToggleGroupItem ref={accidentalFirstRef} value="natural" aria-label="Natural" className="h-7 w-full text-xs">
                            ♮
                          </ToggleGroupItem>
                          <ToggleGroupItem value="sharp" aria-label="Sharp" className="h-7 w-full text-xs">
                            ♯
                          </ToggleGroupItem>
                          <ToggleGroupItem value="flat" aria-label="Flat" className="h-7 w-full text-xs">
                            ♭
                          </ToggleGroupItem>
                        </ToggleGroup>

                        <ToggleGroup
                          type="single"
                          variant="outline"
                          size="sm"
                          value={selectedChordQuality}
                          data-chord-group="quality"
                          onValueChange={(value) => {
                            const nextValue = Array.isArray(value) ? value[0] : value
                            setSelectedChordQuality(nextValue || 'maj')
                          }}
                          className="grid w-full grid-cols-4"
                          loopFocus
                        >
                          {chordQualityOptions.map((option, index) => (
                            <ToggleGroupItem
                              key={option.value}
                              ref={index === 0 ? qualityFirstRef : undefined}
                              value={option.value}
                              className="h-7 w-full text-[11px]"
                            >
                              {option.label}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>

                        <InputGroup className="h-7">
                          <InputGroupInput
                            value={customQualityInput}
                            onChange={(event) => setCustomQualityInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return
                              event.preventDefault()
                              const nextValue = onAddChordQuality(customQualityInput)
                              if (nextValue) {
                                setSelectedChordQuality(nextValue)
                              }
                            }}
                            placeholder="Custom quality"
                            className="h-7 text-xs"
                          />
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              type="button"
                              size="icon-xs"
                              aria-label="Add chord quality"
                              disabled={!customQualityInput.trim()}
                              onClick={() => {
                                const nextValue = onAddChordQuality(customQualityInput)
                                if (nextValue) {
                                  setSelectedChordQuality(nextValue)
                                }
                              }}
                            >
                              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5" />
                            </InputGroupButton>
                          </InputGroupAddon>
                        </InputGroup>

                        {hasChord ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 w-full"
                            data-chord-popover-action="remove"
                            onClick={() => handleRemoveChordAtWord(word.start)}
                          >
                            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="mr-1.5 h-3.5 w-3.5" />
                            Remove chord
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 w-full"
                            disabled={!selectedChordBase}
                            data-chord-popover-action="add"
                            onClick={() => handleSelectChordFromControls(word)}
                          >
                            Add chord
                          </Button>
                        )}

                      </div>
                    </PopoverContent>
                  </Popover>
                  {trailingText}
                </span>
              )
            })}
          </>
        )}
      </div>

      {/* Print-only lyrics (no interactive elements) */}
      <div className={`lyrics-line-print font-mono whitespace-pre-wrap leading-(--chart-line-height) hidden print:block ${dimLyrics ? 'text-muted-foreground' : ''}`}>
        {words.length === 0 ? (
          <span>{line}</span>
        ) : (
          <>
            {words[0].start > 0 && <span>{line.slice(0, words[0].start)}</span>}
            {words.map((word, wordIndex) => {
              const wordKey = `${slideId}-${lineIndex}-${word.start}`
              const markerNumbers = wordMarkersByKey.get(wordKey) ?? []
              const nextWord = words[wordIndex + 1]
              const trailingText = nextWord
                ? line.slice(word.end + 1, nextWord.start)
                : line.slice(word.end + 1)

              return (
                <span key={word.start}>
                  <span>
                    {word.word}
                    {markerNumbers.length > 0 && (
                      <sup className="ml-0.5 text-[0.65em] text-muted-foreground">
                        {markerNumbers.join(',')}
                      </sup>
                    )}
                  </span>
                  {trailingText}
                </span>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
