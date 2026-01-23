'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  buildWordOrder,
  renumberLinkedNotes,
} from '@/components/charts/chart-notes-footnotes'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field'
import { VocalChartPreview } from '@/components/charts/vocal-chart-preview'
import { ChordChartEditor } from '@/components/charts/chord-chart-editor'
import { updateSongArrangementChordsText } from '@/lib/actions/song-arrangements'
import type { SongArrangement, SongSlide, SongSlideGroupArrangementItem } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PrinterIcon,
  TextAlignLeftIcon,
  MusicNote03Icon,
  SlidersHorizontalIcon,
  Exchange01Icon,
  CheckmarkCircle02Icon,
  Loading01Icon,
  MinusSignIcon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'

// Chart data types
export interface VocalChartSettings {
  songKey: string
  fontSizePx: number
  lineHeightEm: number
  columns: 1 | 2
  showKey: boolean
  // Group display settings
  groupStyle: 'heading' | 'outline' | 'none'
  showGroupLabels: boolean
  colorizeLabels: boolean
  colorizeBorders: boolean
  notes: ChartNote[]
}

export interface ChordPlacement {
  slideId: string
  lineIndex: number
  charIndex: number
  chord: string
}

export interface ChartNoteLinkedWord {
  wordKey: string
  slideId: string
  lineIndex: number
  wordStart: number
  wordText: string
}

export interface ChartNote {
  id: string
  text: string
  xPct: number
  yPct: number
  pageIndex?: number
  linkedWord?: ChartNoteLinkedWord
  createdAtMs: number
  markerNumber?: number
}

export interface ChordChartSettings {
  songKey: string
  capoKey: string
  fretShift: number
  lyricFontSizePx: number
  chordFontSizePx: number
  lineHeight: 'normal' | 'compact'
  // Group display settings
  groupStyle: 'heading' | 'outline' | 'none'
  showGroupLabels: boolean
  colorizeLabels: boolean
  colorizeBorders: boolean
  // Chord display settings
  dimLyrics: boolean
  colorizeChords: boolean
  placements: ChordPlacement[]
  customQualities: string[]
  notes: ChartNote[]
}

export interface ChartData {
  version: 1
  vocal: VocalChartSettings
  chord: ChordChartSettings
}

interface SlideGroupDefinition {
  key: string
  label: SongSlide['label']
  customLabel?: string
  slides: SongSlide[]
  firstIndex: number
}

interface SongChartsManagerProps {
  songId: string
  groupId: string
  groupSlug: string
  songTitle: string
  songDefaultKey: string | null
  arrangements: SongArrangement[]
  selectedArrangementId: string | null
  slides: SongSlide[]
  groupDefinitions: SlideGroupDefinition[]
  arrangementOrders: Record<string, SongSlideGroupArrangementItem[]>
}

const DEFAULT_VOCAL_SETTINGS: VocalChartSettings = {
  songKey: '',
  fontSizePx: 14,
  lineHeightEm: 1.6,
  columns: 2,
  showKey: true,
  groupStyle: 'heading',
  showGroupLabels: true,
  colorizeLabels: true,
  colorizeBorders: false,
  notes: [],
}

const DEFAULT_CHORD_SETTINGS: ChordChartSettings = {
  songKey: '',
  capoKey: '',
  fretShift: 0,
  lyricFontSizePx: 12,
  chordFontSizePx: 11,
  lineHeight: 'normal',
  groupStyle: 'heading',
  showGroupLabels: true,
  colorizeLabels: true,
  colorizeBorders: false,
  dimLyrics: true,
  colorizeChords: true,
  placements: [],
  customQualities: [],
  notes: [],
}

const KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']
const BASE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'])
const MIN_FRET_SHIFT = -12
const MAX_FRET_SHIFT = 12

// Helper to parse a key into base note and accidental
function parseKey(key: string): { base: string; accidental: '' | '#' | 'b' } {
  if (!key) return { base: '', accidental: '' }
  const base = key[0]
  const accidental = key.slice(1) as '' | '#' | 'b'
  return { base, accidental }
}

// Helper to combine base note and accidental
function combineKey(base: string, accidental: '' | '#' | 'b'): string {
  if (!base) return ''
  return base + accidental
}

function getNoteIndex(note: string): number | null {
  return NOTE_INDEX[note] ?? null
}

function shouldPreferFlats(key: string): boolean {
  if (!key) return false
  if (key.includes('b')) return true
  return FLAT_KEYS.has(key)
}

function transposeNote(note: string, semitones: number, preferFlats: boolean): string {
  const index = getNoteIndex(note)
  if (index === null) return note
  const nextIndex = (index + semitones + 12) % 12
  return preferFlats ? FLAT_NOTES[nextIndex] : SHARP_NOTES[nextIndex]
}

function transposeChordSymbol(chord: string, semitones: number, preferFlats: boolean): string {
  const trimmed = chord.trim()
  if (!trimmed) return chord
  if (trimmed.toUpperCase() === 'N.C.' || trimmed.toUpperCase() === 'NC') return chord

  const [main, bass] = trimmed.split('/')
  const mainMatch = main.match(/^([A-G])([#b]?)(.*)$/)
  if (!mainMatch) return chord

  const [, mainBase, mainAccidental, mainSuffix] = mainMatch
  const mainNote = `${mainBase}${mainAccidental}`
  const nextMain = transposeNote(mainNote, semitones, preferFlats)

  if (!bass) {
    return `${nextMain}${mainSuffix}`
  }

  const bassMatch = bass.match(/^([A-G])([#b]?)(.*)$/)
  if (!bassMatch) {
    return `${nextMain}${mainSuffix}/${bass}`
  }

  const [, bassBase, bassAccidental, bassSuffix] = bassMatch
  const bassNote = `${bassBase}${bassAccidental}`
  const nextBass = transposeNote(bassNote, semitones, preferFlats)
  return `${nextMain}${mainSuffix}/${nextBass}${bassSuffix}`
}

function clampFretShift(value: number): number {
  return Math.min(MAX_FRET_SHIFT, Math.max(MIN_FRET_SHIFT, value))
}

function coerceFretShift(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampFretShift(Math.trunc(value))
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      return clampFretShift(parsed)
    }
  }
  return 0
}

function normalizeFretShift(value: unknown): number {
  return coerceFretShift(value)
}

function parseChartData(chordsText: string | null): ChartData | null {
  if (!chordsText) return null
  try {
    const parsed = JSON.parse(chordsText)
    if (parsed.version === 1) {
      return parsed as ChartData
    }
    return null
  } catch {
    return null
  }
}

export function SongChartsManager({
  songId,
  groupId,
  groupSlug,
  songTitle,
  songDefaultKey,
  arrangements,
  selectedArrangementId,
  slides,
  groupDefinitions,
  arrangementOrders,
}: SongChartsManagerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeChartType = searchParams.get('chart') === 'chord' ? 'chord' : 'vocal'
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [isTransposeOpen, setIsTransposeOpen] = useState(false)
  const [transposeTarget, setTransposeTarget] = useState('')
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [notePlacementActive, setNotePlacementActive] = useState(false)
  const [openVocalNoteId, setOpenVocalNoteId] = useState<string | null>(null)
  const [openChordNoteId, setOpenChordNoteId] = useState<string | null>(null)

  const selectedArrangement = arrangements.find((a) => a.id === selectedArrangementId)

  // Parse existing chart data from the arrangement
  const existingChartData = useMemo(() => {
    return parseChartData(selectedArrangement?.chords_text ?? null)
  }, [selectedArrangement?.chords_text])

  // Initialize settings from existing data or defaults
  // Merge with defaults to ensure new properties always have values
  const [vocalSettings, setVocalSettings] = useState<VocalChartSettings>(() => {
    const base = { ...DEFAULT_VOCAL_SETTINGS, ...existingChartData?.vocal }
    // Use song's default key if no key is set
    if (!base.songKey && songDefaultKey) {
      return { ...base, songKey: songDefaultKey }
    }
    return base
  })
  const [chordSettings, setChordSettings] = useState<ChordChartSettings>(() => {
    const base = { ...DEFAULT_CHORD_SETTINGS, ...existingChartData?.chord } as ChordChartSettings
    const resolvedLineHeight: ChordChartSettings['lineHeight'] =
      base.lineHeight === 'compact' ? 'compact' : 'normal'
    const legacyTimeSignature = (existingChartData?.chord as { timeSignature?: unknown } | undefined)?.timeSignature
    const resolvedFretShift = normalizeFretShift(base.fretShift ?? legacyTimeSignature)
    const nextBase: ChordChartSettings = { ...base, lineHeight: resolvedLineHeight, fretShift: resolvedFretShift }
    // Use song's default key if no key is set
    if (!nextBase.songKey && songDefaultKey) {
      return { ...nextBase, songKey: songDefaultKey }
    }
    return nextBase
  })

  // Get ordered slides based on arrangement order
  const orderedGroups = useMemo(() => {
    if (!selectedArrangementId) {
      return groupDefinitions
    }

    const arrangementItems = arrangementOrders[selectedArrangementId] ?? []
    if (arrangementItems.length === 0) {
      return groupDefinitions
    }

    const groupByKey = new Map(groupDefinitions.map((g) => [g.key, g]))
    return arrangementItems
      .map((item) => groupByKey.get(item.key))
      .filter((g): g is SlideGroupDefinition => g !== undefined)
  }, [selectedArrangementId, arrangementOrders, groupDefinitions])

  const handlePrint = () => {
    window.print()
  }

  const handleSave = async () => {
    if (!selectedArrangement) return
    setIsSaving(true)
    const chartData = {
      version: 1,
      vocal: vocalSettings,
      chord: chordSettings,
    }
    const result = await updateSongArrangementChordsText(
      selectedArrangement.id,
      JSON.stringify(chartData),
      groupSlug,
      songId
    )
    if (result.success) {
      setHasChanges(false)
      router.refresh()
    }
    setIsSaving(false)
  }

  const updateVocalSetting = <K extends keyof VocalChartSettings>(key: K, value: VocalChartSettings[K]) => {
    setVocalSettings((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const updateChordSetting = <K extends keyof ChordChartSettings>(key: K, value: ChordChartSettings[K]) => {
    const normalizedValue = key === 'lineHeight'
      ? ((Array.isArray(value) ? value[0] : value) ?? 'normal')
      : key === 'fretShift'
        ? coerceFretShift(value)
        : value
    setChordSettings((prev) => {
      const next = { ...prev, [key]: normalizedValue }
      return next
    })
    setHasChanges(true)
  }

  const createNoteId = useCallback(() => {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
      return window.crypto.randomUUID()
    }
    return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }, [])

  const noteWordOrder = useMemo(() => buildWordOrder(orderedGroups), [orderedGroups])

  const ensureNoteTimestamps = useCallback((notes: ChartNote[]) => {
    let changed = false
    const now = Date.now()
    const nextNotes = notes.map((note, index) => {
      if (Number.isFinite(note.createdAtMs)) return note
      changed = true
      return { ...note, createdAtMs: now + index }
    })
    return { notes: nextNotes, changed }
  }, [])

  const applyNoteRenumbering = useCallback((notes: ChartNote[]) => {
    const withTimestamps = ensureNoteTimestamps(notes)
    const renumbered = renumberLinkedNotes(withTimestamps.notes, noteWordOrder.wordIndexByKey)
    return {
      notes: renumbered.notes,
      changed: withTimestamps.changed || renumbered.changed,
    }
  }, [ensureNoteTimestamps, noteWordOrder.wordIndexByKey])

  const addVocalNote = useCallback((position: { xPct: number; yPct: number; linkedWord?: ChartNoteLinkedWord }) => {
    const id = createNoteId()
    const createdAtMs = Date.now()
    setVocalSettings((prev) => ({
      ...prev,
      notes: applyNoteRenumbering([
        ...prev.notes,
        {
          id,
          text: 'Note',
          xPct: position.xPct,
          yPct: position.yPct,
          linkedWord: position.linkedWord,
          createdAtMs,
        },
      ]).notes,
    }))
    setHasChanges(true)
    setOpenVocalNoteId(id)
    setNotePlacementActive(false)
    return id
  }, [createNoteId, setHasChanges, applyNoteRenumbering])

  const addChordNote = useCallback((position: { xPct: number; yPct: number; pageIndex?: number; linkedWord?: ChartNoteLinkedWord }) => {
    const id = createNoteId()
    const createdAtMs = Date.now()
    setChordSettings((prev) => ({
      ...prev,
      notes: applyNoteRenumbering([
        ...prev.notes,
        {
          id,
          text: 'Note',
          xPct: position.xPct,
          yPct: position.yPct,
          pageIndex: position.pageIndex,
          linkedWord: position.linkedWord,
          createdAtMs,
        },
      ]).notes,
    }))
    setHasChanges(true)
    setOpenChordNoteId(id)
    setNotePlacementActive(false)
    return id
  }, [createNoteId, setHasChanges, applyNoteRenumbering])

  const updateVocalNote = useCallback((noteId: string, patch: Partial<ChartNote>) => {
    setVocalSettings((prev) => {
      const nextNotes = prev.notes.map((note) => note.id === noteId ? { ...note, ...patch } : note)
      const renumbered = applyNoteRenumbering(nextNotes)
      return renumbered.changed ? { ...prev, notes: renumbered.notes } : { ...prev, notes: renumbered.notes }
    })
    setHasChanges(true)
  }, [setHasChanges, applyNoteRenumbering])

  const updateChordNote = useCallback((noteId: string, patch: Partial<ChartNote>) => {
    setChordSettings((prev) => {
      const nextNotes = prev.notes.map((note) => note.id === noteId ? { ...note, ...patch } : note)
      const renumbered = applyNoteRenumbering(nextNotes)
      return renumbered.changed ? { ...prev, notes: renumbered.notes } : { ...prev, notes: renumbered.notes }
    })
    setHasChanges(true)
  }, [setHasChanges, applyNoteRenumbering])

  const deleteVocalNote = useCallback((noteId: string) => {
    setVocalSettings((prev) => {
      const nextNotes = prev.notes.filter((note) => note.id !== noteId)
      const renumbered = applyNoteRenumbering(nextNotes)
      return renumbered.changed ? { ...prev, notes: renumbered.notes } : { ...prev, notes: renumbered.notes }
    })
    setHasChanges(true)
    setOpenVocalNoteId((current) => (current === noteId ? null : current))
  }, [setHasChanges, applyNoteRenumbering])

  const deleteChordNote = useCallback((noteId: string) => {
    setChordSettings((prev) => {
      const nextNotes = prev.notes.filter((note) => note.id !== noteId)
      const renumbered = applyNoteRenumbering(nextNotes)
      return renumbered.changed ? { ...prev, notes: renumbered.notes } : { ...prev, notes: renumbered.notes }
    })
    setHasChanges(true)
    setOpenChordNoteId((current) => (current === noteId ? null : current))
  }, [setHasChanges, applyNoteRenumbering])

  useEffect(() => {
    setVocalSettings((prev) => {
      const renumbered = applyNoteRenumbering(prev.notes)
      return renumbered.changed ? { ...prev, notes: renumbered.notes } : prev
    })
    setChordSettings((prev) => {
      const renumbered = applyNoteRenumbering(prev.notes)
      return renumbered.changed ? { ...prev, notes: renumbered.notes } : prev
    })
  }, [applyNoteRenumbering])

  useEffect(() => {
    if (!notePlacementActive) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotePlacementActive(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [notePlacementActive])

  const applyTranspose = (nextKey: string) => {
    if (!nextKey) return
    const fromIndex = getNoteIndex(chordSettings.songKey)
    const toIndex = getNoteIndex(nextKey)

    if (fromIndex === null || toIndex === null) {
      setChordSettings((prev) => ({ ...prev, songKey: nextKey }))
      setHasChanges(true)
      return
    }

    if (fromIndex === toIndex) {
      setChordSettings((prev) => ({ ...prev, songKey: nextKey }))
      setHasChanges(true)
      return
    }

    const semitones = (toIndex - fromIndex + 12) % 12
    const preferFlats = shouldPreferFlats(nextKey)

    setChordSettings((prev) => ({
      ...prev,
      songKey: nextKey,
      placements: prev.placements.map((placement) => ({
        ...placement,
        chord: transposeChordSymbol(placement.chord, semitones, preferFlats),
      })),
    }))
    setHasChanges(true)
  }

  if (!selectedArrangement) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Select an arrangement to view and edit charts.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (slides.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Add slides to the song to generate charts.
          </p>
        </CardContent>
      </Card>
    )
  }

  const hasKey = Boolean(activeChartType === 'vocal' ? vocalSettings.songKey : chordSettings.songKey)

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Tabs
          value={activeChartType}
          onValueChange={(value) => {
            const nextValue = value === 'chord' ? 'chord' : 'vocal'
            if (nextValue === activeChartType) return
            setNotePlacementActive(false)
            setIsNotesOpen(false)
            setOpenVocalNoteId(null)
            setOpenChordNoteId(null)
            const params = new URLSearchParams(searchParams)
            params.set('chart', nextValue)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
          }}
        >
          <TabsList>
            <TabsTrigger value="vocal" className="gap-2 px-4 py-2 text-sm">
              <HugeiconsIcon icon={TextAlignLeftIcon} strokeWidth={2} className="h-4 w-4" />
              Vocal Chart
            </TabsTrigger>
            <TabsTrigger value="chord" className="gap-2 px-4 py-2 text-sm">
              <HugeiconsIcon icon={MusicNote03Icon} strokeWidth={2} className="h-4 w-4" />
              Chord Chart
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Save button */}
          {hasChanges && (
            <Button onClick={handleSave} disabled={isSaving} size="sm" variant="default">
              {isSaving ? (
                <>
                  <HugeiconsIcon icon={Loading01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="border border-border bg-muted/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] print:border-0 print:bg-transparent print:shadow-none">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-background/80 px-3 py-2 print:hidden">
          <div className="flex items-center gap-2">
            {/* Chart options popover */}
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="outline" size="sm">
                    <HugeiconsIcon icon={SlidersHorizontalIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                    Options
                  </Button>
                }
              />
              <PopoverContent className="w-72 p-0" align="start">
                {activeChartType === 'vocal' ? (
                  <FieldGroup className="p-4 gap-4">
                    {/* Header */}
                    <FieldLegend className="text-sm font-semibold mb-0">Vocal Chart Options</FieldLegend>
                    
                    {/* Song Info */}
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wider">Song Info</FieldLegend>
                      <FieldGroup className="gap-3">
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Key</FieldLabel>
                          <div className="inline-flex w-auto!">
                            <Select
                              value={parseKey(vocalSettings.songKey).base || '_none'}
                              onValueChange={(v) => {
                                const currentAccidental = parseKey(vocalSettings.songKey).accidental
                                if (!v || v === '_none') {
                                  updateVocalSetting('songKey', '')
                                  return
                                }
                                updateVocalSetting('songKey', combineKey(v, currentAccidental))
                              }}
                            >
                              <SelectTrigger className="h-8 w-16 text-xs rounded-none border-r-0">
                                <SelectValue>{parseKey(vocalSettings.songKey).base || '—'}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">—</SelectItem>
                                {BASE_NOTES.map((note) => (
                                  <SelectItem key={note} value={note}>{note}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <ToggleGroup
                              type="single"
                              variant="outline"
                              value={parseKey(vocalSettings.songKey).accidental}
                              onValueChange={(v) => {
                                const currentBase = parseKey(vocalSettings.songKey).base
                                if (currentBase) {
                                  updateVocalSetting('songKey', combineKey(currentBase, v as '' | '#' | 'b'))
                                }
                              }}
                              disabled={!parseKey(vocalSettings.songKey).base}
                              className="h-8"
                            >
                              <ToggleGroupItem value="#" aria-label="Sharp" className="h-8 w-8 text-base font-medium">
                                ♯
                              </ToggleGroupItem>
                              <ToggleGroupItem value="b" aria-label="Flat" className="h-8 w-8 text-base font-medium">
                                ♭
                              </ToggleGroupItem>
                            </ToggleGroup>
                          </div>
                        </Field>
                        <Field orientation="horizontal" className="justify-between" data-disabled={!hasKey}>
                          <FieldLabel htmlFor="vocal-show-key" className="text-xs font-normal">
                            Show key in header
                          </FieldLabel>
                          <Switch
                            id="vocal-show-key"
                            checked={vocalSettings.showKey}
                            onCheckedChange={(checked) => updateVocalSetting('showKey', checked)}
                            disabled={!hasKey}
                          />
                        </Field>
                      </FieldGroup>
                    </FieldSet>

                    <FieldSeparator />

                    {/* Typography */}
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wider">Typography</FieldLegend>
                      <FieldGroup className="gap-3 items-start">
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Font Size</FieldLabel>
                          <div className="inline-flex w-auto!">
                            <span className="inline-flex items-center justify-center h-8 px-3 text-xs tabular-nums border border-r-0 border-input bg-background w-16">
                              {vocalSettings.fontSizePx}px
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none border-r-0"
                              onClick={() => updateVocalSetting('fontSizePx', Math.max(10, vocalSettings.fontSizePx - 1))}
                              disabled={vocalSettings.fontSizePx <= 10}
                            >
                              <HugeiconsIcon icon={MinusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none"
                              onClick={() => updateVocalSetting('fontSizePx', Math.min(24, vocalSettings.fontSizePx + 1))}
                              disabled={vocalSettings.fontSizePx >= 24}
                            >
                              <HugeiconsIcon icon={PlusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </Field>
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Line Height</FieldLabel>
                          <div className="inline-flex w-auto!">
                            <span className="inline-flex items-center justify-center h-8 px-3 text-xs tabular-nums border border-r-0 border-input bg-background w-16">
                              {vocalSettings.lineHeightEm.toFixed(1)}em
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none border-r-0"
                              onClick={() => updateVocalSetting('lineHeightEm', Math.max(1.0, Math.round((vocalSettings.lineHeightEm - 0.1) * 10) / 10))}
                              disabled={vocalSettings.lineHeightEm <= 1.0}
                            >
                              <HugeiconsIcon icon={MinusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none"
                              onClick={() => updateVocalSetting('lineHeightEm', Math.min(3.0, Math.round((vocalSettings.lineHeightEm + 0.1) * 10) / 10))}
                              disabled={vocalSettings.lineHeightEm >= 3.0}
                            >
                              <HugeiconsIcon icon={PlusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </Field>
                      </FieldGroup>
                    </FieldSet>

                    <FieldSeparator />

                    {/* Layout */}
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wider">Layout</FieldLegend>
                      <Field className="items-start">
                        <FieldLabel className="text-xs w-auto!">Columns</FieldLabel>
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          value={String(vocalSettings.columns)}
                          onValueChange={(v) => {
                            const nextValue = Array.isArray(v) ? v[0] : v
                            if (!nextValue) return
                            updateVocalSetting('columns', Number.parseInt(nextValue, 10) as 1 | 2)
                          }}
                        >
                          <ToggleGroupItem value="1" className="h-8 w-8 text-xs">
                            1
                          </ToggleGroupItem>
                          <ToggleGroupItem value="2" className="h-8 w-8 text-xs">
                            2
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </Field>
                    </FieldSet>

                    <FieldSeparator />

                    {/* Groups */}
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wider">Groups</FieldLegend>
                      <FieldGroup className="gap-3">
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Style</FieldLabel>
                          <ToggleGroup
                            type="multiple"
                            variant="outline"
                            value={[
                              ...(vocalSettings.showGroupLabels ? ['labels'] : []),
                              ...(vocalSettings.groupStyle === 'outline' ? ['outline'] : []),
                            ]}
                            onValueChange={(values) => {
                              const nextValues = Array.isArray(values) ? values : [values]
                              updateVocalSetting('showGroupLabels', nextValues.includes('labels'))
                              updateVocalSetting(
                                'groupStyle',
                                nextValues.includes('outline') ? 'outline' : 'heading'
                              )
                            }}
                          >
                            <ToggleGroupItem value="labels" className="h-8 px-3 text-xs">
                              Titles
                            </ToggleGroupItem>
                            <ToggleGroupItem value="outline" className="h-8 px-3 text-xs">
                              Outline
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </Field>
                        <FieldGroup className="gap-2.5">
                          <Field orientation="horizontal" className="justify-between" data-disabled={!vocalSettings.showGroupLabels}>
                            <FieldLabel htmlFor="vocal-colorize-labels" className="text-xs font-normal">
                              Colorize labels
                            </FieldLabel>
                            <Switch
                              id="vocal-colorize-labels"
                              checked={vocalSettings.colorizeLabels}
                              onCheckedChange={(checked) => updateVocalSetting('colorizeLabels', checked)}
                              disabled={!vocalSettings.showGroupLabels || vocalSettings.groupStyle === 'none'}
                            />
                          </Field>
                          <Field orientation="horizontal" className="justify-between" data-disabled={vocalSettings.groupStyle !== 'outline'}>
                            <FieldLabel htmlFor="vocal-colorize-borders" className="text-xs font-normal">
                              Colorize borders
                            </FieldLabel>
                            <Switch
                              id="vocal-colorize-borders"
                              checked={vocalSettings.colorizeBorders}
                              onCheckedChange={(checked) => updateVocalSetting('colorizeBorders', checked)}
                              disabled={vocalSettings.groupStyle !== 'outline'}
                            />
                          </Field>
                        </FieldGroup>
                      </FieldGroup>
                    </FieldSet>
                  </FieldGroup>
                ) : (
                  <FieldGroup className="p-4 gap-4">
                    {/* Header */}
                    <FieldLegend className="text-sm font-semibold mb-0">Chord Chart Options</FieldLegend>
                    
                    {/* Song Info */}
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wider">Song Info</FieldLegend>
                      <FieldGroup className="gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <Field className="items-start">
                            <FieldLabel className="text-xs w-auto!">Key</FieldLabel>
                            <div className="inline-flex w-auto!">
                              <Select
                                value={parseKey(chordSettings.songKey).base || '_none'}
                              onValueChange={(v) => {
                                const currentAccidental = parseKey(chordSettings.songKey).accidental
                                if (!v || v === '_none') {
                                  updateChordSetting('songKey', '')
                                  return
                                }
                                updateChordSetting('songKey', combineKey(v, currentAccidental))
                              }}
                              >
                                <SelectTrigger className="h-8 w-16 text-xs rounded-none border-r-0">
                                  <SelectValue>{parseKey(chordSettings.songKey).base || '—'}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">—</SelectItem>
                                  {BASE_NOTES.map((note) => (
                                    <SelectItem key={note} value={note}>{note}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <ToggleGroup
                                type="single"
                                variant="outline"
                                value={parseKey(chordSettings.songKey).accidental}
                                onValueChange={(v) => {
                                  const currentBase = parseKey(chordSettings.songKey).base
                                  if (currentBase) {
                                    updateChordSetting('songKey', combineKey(currentBase, v as '' | '#' | 'b'))
                                  }
                                }}
                                disabled={!parseKey(chordSettings.songKey).base}
                                className="h-8"
                              >
                                <ToggleGroupItem value="#" aria-label="Sharp" className="h-8 w-8 text-base font-medium">
                                  ♯
                                </ToggleGroupItem>
                                <ToggleGroupItem value="b" aria-label="Flat" className="h-8 w-8 text-base font-medium">
                                  ♭
                                </ToggleGroupItem>
                              </ToggleGroup>
                            </div>
                          </Field>
                          <Field className="items-start">
                            <FieldLabel className="text-xs w-auto!">Capo</FieldLabel>
                            <div className="inline-flex w-auto!">
                              <Select
                                value={parseKey(chordSettings.capoKey).base || '_none'}
                              onValueChange={(v) => {
                                const currentAccidental = parseKey(chordSettings.capoKey).accidental
                                if (!v || v === '_none') {
                                  updateChordSetting('capoKey', '')
                                  return
                                }
                                updateChordSetting('capoKey', combineKey(v, currentAccidental))
                              }}
                              >
                                <SelectTrigger className="h-8 w-16 text-xs rounded-none border-r-0">
                                  <SelectValue>{parseKey(chordSettings.capoKey).base || '—'}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">—</SelectItem>
                                  {BASE_NOTES.map((note) => (
                                    <SelectItem key={note} value={note}>{note}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <ToggleGroup
                                type="single"
                                variant="outline"
                                value={parseKey(chordSettings.capoKey).accidental}
                                onValueChange={(v) => {
                                  const currentBase = parseKey(chordSettings.capoKey).base
                                  if (currentBase) {
                                    updateChordSetting('capoKey', combineKey(currentBase, v as '' | '#' | 'b'))
                                  }
                                }}
                                disabled={!parseKey(chordSettings.capoKey).base}
                                className="h-8"
                              >
                                <ToggleGroupItem value="#" aria-label="Sharp" className="h-8 w-8 text-base font-medium">
                                  ♯
                                </ToggleGroupItem>
                                <ToggleGroupItem value="b" aria-label="Flat" className="h-8 w-8 text-base font-medium">
                                  ♭
                                </ToggleGroupItem>
                              </ToggleGroup>
                            </div>
                          </Field>
                        </div>
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Fret Shift</FieldLabel>
                          <div className="inline-flex w-auto!">
                            <span className="inline-flex items-center justify-center h-8 px-3 text-xs tabular-nums border border-r-0 border-input bg-background w-16">
                              {chordSettings.fretShift}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none border-r-0"
                              onClick={() => updateChordSetting('fretShift', chordSettings.fretShift - 1)}
                              disabled={chordSettings.fretShift <= MIN_FRET_SHIFT}
                              aria-label="Decrease fret shift"
                            >
                              <HugeiconsIcon icon={MinusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none border-l-0"
                              onClick={() => updateChordSetting('fretShift', chordSettings.fretShift + 1)}
                              disabled={chordSettings.fretShift >= MAX_FRET_SHIFT}
                              aria-label="Increase fret shift"
                            >
                              <HugeiconsIcon icon={PlusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </Field>
                      </FieldGroup>
                    </FieldSet>

                    <FieldSeparator />

                    {/* Typography */}
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wider">Typography</FieldLegend>
                      <FieldGroup className="gap-3 items-start">
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Lyrics</FieldLabel>
                          <div className="inline-flex w-auto!">
                            <span className="inline-flex items-center justify-center h-8 px-3 text-xs tabular-nums border border-r-0 border-input bg-background w-16">
                              {chordSettings.lyricFontSizePx}px
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none border-r-0"
                              onClick={() => updateChordSetting('lyricFontSizePx', Math.max(10, chordSettings.lyricFontSizePx - 1))}
                              disabled={chordSettings.lyricFontSizePx <= 10}
                            >
                              <HugeiconsIcon icon={MinusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none"
                              onClick={() => updateChordSetting('lyricFontSizePx', Math.min(20, chordSettings.lyricFontSizePx + 1))}
                              disabled={chordSettings.lyricFontSizePx >= 20}
                            >
                              <HugeiconsIcon icon={PlusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </Field>
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Chords</FieldLabel>
                          <div className="inline-flex w-auto!">
                            <span className="inline-flex items-center justify-center h-8 px-3 text-xs tabular-nums border border-r-0 border-input bg-background w-16">
                              {chordSettings.chordFontSizePx}px
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none border-r-0"
                              onClick={() => updateChordSetting('chordFontSizePx', Math.max(8, chordSettings.chordFontSizePx - 1))}
                              disabled={chordSettings.chordFontSizePx <= 8}
                            >
                              <HugeiconsIcon icon={MinusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-none"
                              onClick={() => updateChordSetting('chordFontSizePx', Math.min(18, chordSettings.chordFontSizePx + 1))}
                              disabled={chordSettings.chordFontSizePx >= 18}
                            >
                              <HugeiconsIcon icon={PlusSignIcon} className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </Field>
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Line Height</FieldLabel>
                          <ToggleGroup
                            type="single"
                            variant="outline"
                            value={chordSettings.lineHeight ?? 'normal'}
                            onValueChange={(value) => {
                              const nextValue = Array.isArray(value) ? value[0] : value
                              if (nextValue) {
                                updateChordSetting('lineHeight', nextValue as 'normal' | 'compact')
                              }
                            }}
                          >
                            <ToggleGroupItem value="normal" className="h-8 px-3 text-xs">
                              Normal
                            </ToggleGroupItem>
                            <ToggleGroupItem value="compact" className="h-8 px-3 text-xs">
                              Compact
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </Field>
                      </FieldGroup>
                    </FieldSet>

                    <FieldSeparator />

                    {/* Display */}
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wider">Display</FieldLegend>
                      <FieldGroup className="gap-2.5">
                        <Field orientation="horizontal" className="justify-between">
                          <FieldLabel htmlFor="chord-dim-lyrics" className="text-xs font-normal">
                            Dim lyrics
                          </FieldLabel>
                          <Switch
                            id="chord-dim-lyrics"
                            checked={chordSettings.dimLyrics ?? true}
                            onCheckedChange={(checked) => updateChordSetting('dimLyrics', checked)}
                          />
                        </Field>
                        <Field orientation="horizontal" className="justify-between">
                          <FieldLabel htmlFor="chord-colorize-chords" className="text-xs font-normal">
                            Colorize chords
                          </FieldLabel>
                          <Switch
                            id="chord-colorize-chords"
                            checked={chordSettings.colorizeChords ?? true}
                            onCheckedChange={(checked) => updateChordSetting('colorizeChords', checked)}
                          />
                        </Field>
                      </FieldGroup>
                    </FieldSet>

                    <FieldSeparator />

                    {/* Groups */}
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wider">Groups</FieldLegend>
                      <FieldGroup className="gap-3">
                        <Field className="items-start">
                          <FieldLabel className="text-xs w-auto!">Style</FieldLabel>
                          <ToggleGroup
                            type="multiple"
                            variant="outline"
                            value={[
                              ...(chordSettings.showGroupLabels ? ['labels'] : []),
                              ...(chordSettings.groupStyle === 'outline' ? ['outline'] : []),
                            ]}
                            onValueChange={(values) => {
                              const nextValues = Array.isArray(values) ? values : [values]
                              updateChordSetting('showGroupLabels', nextValues.includes('labels'))
                              updateChordSetting(
                                'groupStyle',
                                nextValues.includes('outline') ? 'outline' : 'heading'
                              )
                            }}
                          >
                            <ToggleGroupItem value="labels" className="h-8 px-3 text-xs">
                              Titles
                            </ToggleGroupItem>
                            <ToggleGroupItem value="outline" className="h-8 px-3 text-xs">
                              Outline
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </Field>
                        <FieldGroup className="gap-2.5">
                          <Field orientation="horizontal" className="justify-between" data-disabled={!chordSettings.showGroupLabels}>
                            <FieldLabel htmlFor="chord-colorize-labels" className="text-xs font-normal">
                              Colorize labels
                            </FieldLabel>
                            <Switch
                              id="chord-colorize-labels"
                              checked={chordSettings.colorizeLabels}
                              onCheckedChange={(checked) => updateChordSetting('colorizeLabels', checked)}
                              disabled={!chordSettings.showGroupLabels || chordSettings.groupStyle === 'none'}
                            />
                          </Field>
                          <Field orientation="horizontal" className="justify-between" data-disabled={chordSettings.groupStyle !== 'outline'}>
                            <FieldLabel htmlFor="chord-colorize-borders" className="text-xs font-normal">
                              Colorize borders
                            </FieldLabel>
                            <Switch
                              id="chord-colorize-borders"
                              checked={chordSettings.colorizeBorders}
                              onCheckedChange={(checked) => updateChordSetting('colorizeBorders', checked)}
                              disabled={chordSettings.groupStyle !== 'outline'}
                            />
                          </Field>
                        </FieldGroup>
                      </FieldGroup>
                    </FieldSet>

                    {/* Help text */}
                    <FieldDescription className="text-[10px] pt-1">
                      Click words in the chart to add chord labels.
                    </FieldDescription>
                  </FieldGroup>
                )}
              </PopoverContent>
            </Popover>

            <Popover open={isNotesOpen} onOpenChange={setIsNotesOpen}>
              <PopoverTrigger
                render={
                  <Button variant={notePlacementActive ? 'default' : 'outline'} size="sm" aria-pressed={notePlacementActive}>
                    <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                    Notes
                  </Button>
                }
              />
              <PopoverContent className="w-56 p-3" align="start">
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    Click a word to link a note, then click anywhere to place it. Or click anywhere to place an unlinked note.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setIsNotesOpen(false)
                      setNotePlacementActive(true)
                      setOpenVocalNoteId(null)
                      setOpenChordNoteId(null)
                    }}
                  >
                    Add note
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {activeChartType === 'chord' && (
              <Popover
                open={isTransposeOpen}
                onOpenChange={(open) => {
                  setIsTransposeOpen(open)
                  if (open) {
                    setTransposeTarget(chordSettings.songKey)
                  }
                }}
              >
                <PopoverTrigger
                  render={
                    <Button variant="outline" size="sm">
                      <HugeiconsIcon icon={Exchange01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                      Transpose
                    </Button>
                  }
                />
                <PopoverContent className="w-64 p-4" align="start">
                  <FieldGroup className="gap-3">
                    <FieldLegend className="text-sm font-semibold mb-0">Transpose Key</FieldLegend>
                    <FieldDescription className="text-xs">
                      Choose a new key for the chord chart.
                    </FieldDescription>
                    <Field className="items-start">
                      <FieldLabel className="text-xs w-auto!">Key</FieldLabel>
                      <div className="inline-flex w-auto!">
                        <Select
                          value={parseKey(transposeTarget).base || '_none'}
                          onValueChange={(v) => {
                            const currentAccidental = parseKey(transposeTarget).accidental
                            if (!v || v === '_none') {
                              setTransposeTarget('')
                              return
                            }
                            setTransposeTarget(combineKey(v, currentAccidental))
                          }}
                        >
                          <SelectTrigger className="h-8 w-16 text-xs rounded-none border-r-0">
                            <SelectValue>{parseKey(transposeTarget).base || '—'}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">—</SelectItem>
                            {BASE_NOTES.map((note) => (
                              <SelectItem key={note} value={note}>{note}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          value={parseKey(transposeTarget).accidental}
                          onValueChange={(v) => {
                            const currentBase = parseKey(transposeTarget).base
                            if (currentBase) {
                              setTransposeTarget(combineKey(currentBase, v as '' | '#' | 'b'))
                            }
                          }}
                          disabled={!parseKey(transposeTarget).base}
                          className="h-8"
                        >
                          <ToggleGroupItem value="#" aria-label="Sharp" className="h-8 w-8 text-base font-medium">
                            ♯
                          </ToggleGroupItem>
                          <ToggleGroupItem value="b" aria-label="Flat" className="h-8 w-8 text-base font-medium">
                            ♭
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </Field>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsTransposeOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!transposeTarget || transposeTarget === chordSettings.songKey}
                        onClick={() => {
                          applyTranspose(transposeTarget)
                          setIsTransposeOpen(false)
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  </FieldGroup>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Print button */}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <HugeiconsIcon icon={PrinterIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
        <div className="chart-print-root bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))] print:fixed print:inset-0 print:p-0 print:m-0 print:w-full print:max-w-none print:bg-transparent print:shadow-none">
          {activeChartType === 'vocal' ? (
            <VocalChartPreview
              songTitle={songTitle}
              orderedGroups={orderedGroups}
              settings={vocalSettings}
              notePlacementActive={notePlacementActive}
              onPlaceNote={addVocalNote}
              openNoteId={openVocalNoteId}
              onOpenNoteIdChange={setOpenVocalNoteId}
              onUpdateNote={updateVocalNote}
              onDeleteNote={deleteVocalNote}
            />
          ) : (
            <ChordChartEditor
              songId={songId}
              groupSlug={groupSlug}
              arrangementId={selectedArrangement.id}
              songTitle={songTitle}
              orderedGroups={orderedGroups}
              settings={chordSettings}
              onSettingsChange={setChordSettings}
              vocalSettings={vocalSettings}
              hasChanges={hasChanges}
              setHasChanges={setHasChanges}
              notePlacementActive={notePlacementActive}
              onPlaceNote={addChordNote}
              openNoteId={openChordNoteId}
              onOpenNoteIdChange={setOpenChordNoteId}
              onUpdateNote={updateChordNote}
              onDeleteNote={deleteChordNote}
            />
          )}
        </div>
      </div>
    </div>
  )
}
