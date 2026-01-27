'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createSet } from '@/lib/actions/sets'
import type { CrossGroupSongMatchSummary, SongArrangementSummary } from '@/lib/actions/songs'
import type { Song } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import {
  pickWeightedSongs,
  type AgePreference,
  type PlayPreference,
} from '@/lib/utils/set-song-picker'
import { RadioCardGroup } from '@/components/radio-card-group'
import { HugeiconsIcon } from '@hugeicons/react'
import { mergeProps } from '@base-ui/react/merge-props'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  Add01Icon,
  Alert01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
  CalendarAdd01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ChevronDown,
  ChevronUp,
  Clock01Icon,
  DragDropVerticalIcon,
  Edit01Icon,
  Exchange01Icon,
  InformationCircleIcon,
  Layers01Icon,
  ShuffleIcon,
} from '@hugeicons/core-free-icons'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export interface CreateSetDialogProps {
  groupId?: string
  groupSlug?: string
  songs?: Song[]
  arrangements?: SongArrangementSummary[]
  upcomingSetSongIds?: string[]
  crossGroupMatches?: Record<string, CrossGroupSongMatchSummary>
  crossGroupLookbackDays?: number
  crossGroupMatchesLoaded?: boolean
  lastSetDate?: string // YYYY-MM-DD format of the most recent set's service date
  existingSetDates?: string[] // All existing set dates in YYYY-MM-DD format
  groups?: Array<{ id: string; name: string; slug: string }>
  trigger?: ReactNode
}

interface SelectedSetSong {
  id: string
  title: string
  arrangementId: string | null
  notes: string
}

type SongWithStats = Song & {
  totalUses?: number | null
  lastUsedDate?: string | null
}

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return
      if (typeof ref === 'function') {
        ref(node)
      } else {
        ;(ref as React.MutableRefObject<T | null>).current = node
      }
    })
  }
}

function TruncatedSongTitle({ title }: { title: string }) {
  const textRef = useRef<HTMLDivElement | null>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useLayoutEffect(() => {
    const element = textRef.current
    if (!element) return

    const update = () => {
      const rect = element.getBoundingClientRect()
      const visibleWidth = rect.width
      const overflow = element.scrollWidth - visibleWidth
      const fallbackTruncate = title.length > 28
      setIsTruncated(overflow > 1 || fallbackTruncate)
    }

    const raf = requestAnimationFrame(update)
    const timeout = window.setTimeout(update, 120)

    if (typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(raf)
    }

    const observer = new ResizeObserver(update)
    observer.observe(element)
    const cleanupFonts =
      typeof document !== 'undefined' && 'fonts' in document
        ? (document as Document & { fonts?: FontFaceSet }).fonts?.addEventListener?.('loadingdone', update)
        : undefined

    if (typeof document !== 'undefined' && 'fonts' in document) {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
      fonts?.addEventListener?.('loadingdone', update)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timeout)
      observer.disconnect()
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
      fonts?.removeEventListener?.('loadingdone', update)
      void cleanupFonts
    }
  }, [title])

  if (!isTruncated) {
    return (
      <div
        ref={textRef}
        className="flex-1 min-w-0 max-w-[240px] text-xs font-medium truncate sm:max-w-[280px]"
      >
        {title}
      </div>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={(triggerProps) => (
          <button
            {...triggerProps}
            ref={composeRefs(triggerProps.ref, textRef)}
            type="button"
            className="flex-1 min-w-0 max-w-[240px] text-left text-xs font-medium truncate sm:max-w-[280px] cursor-default"
            title={title}
            aria-label={title}
          >
            {title}
          </button>
        )}
      />
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

function formatSongUsageDate(dateString?: string | null) {
  if (!dateString) return null
  const date = new Date(`${dateString}T00:00:00`)
  return {
    relative: formatDistanceToNowStrict(date, { addSuffix: true }),
    absolute: format(date, 'PPP'),
  }
}

function formatMatchType(matchType: 'title' | 'title_and_lyrics' | 'lyrics') {
  switch (matchType) {
    case 'title_and_lyrics':
      return 'Title + lyrics match'
    case 'lyrics':
      return 'Lyrics match'
    default:
      return 'Title match'
  }
}

function isDateWithinWeeks(dateString: string, weeks: number) {
  const date = new Date(`${dateString}T00:00:00`)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - weeks * 7)
  return date >= cutoff
}

function SortableSongRow({
  song,
  arrangements,
  onRemove,
  onArrangementChange,
  onNotesChange,
  crossGroupSummary,
}: {
  song: SelectedSetSong
  arrangements: SongArrangementSummary[]
  onRemove: () => void
  onArrangementChange: (arrangementId: string | null) => void
  onNotesChange: (notes: string) => void
  crossGroupSummary?: CrossGroupSongMatchSummary
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })
  const defaultArrangementId =
    arrangements.find((arrangement) => arrangement.name === 'Default')?.id ??
    arrangements[0]?.id ??
    null
  const effectiveArrangementId = song.arrangementId ?? defaultArrangementId
  const arrangementLabel = effectiveArrangementId
    ? arrangements.find((arrangement) => arrangement.id === effectiveArrangementId)?.name ?? 'Unknown arrangement'
    : 'No arrangements'
  const crossGroupMatches = crossGroupSummary?.matches ?? []
  const visibleMatches = crossGroupMatches.slice(0, 3)
  const hiddenMatchCount = Math.max(0, crossGroupMatches.length - visibleMatches.length)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-none border border-border/60 px-2.5 py-2',
        isDragging && 'bg-muted/60'
      )}
    >
      <div className="flex w-full max-w-full items-center gap-2 overflow-hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <button
            {...attributes}
            {...listeners}
            ref={setActivatorNodeRef}
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground cursor-ns-resize active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="h-4 w-4" />
          </button>
          <TruncatedSongTitle title={song.title} />
          <Badge variant="outline" className="h-5 px-2 text-[10px] whitespace-nowrap gap-1">
            <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="h-3 w-3" />
            <span className="truncate">{arrangementLabel}</span>
          </Badge>
          {crossGroupMatches.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={(triggerProps) => (
                  <Badge
                    {...triggerProps}
                    variant="secondary"
                    className="h-5 px-2 text-[10px] whitespace-nowrap cursor-default"
                  >
                    Seen elsewhere
                  </Badge>
                )}
              />
              <TooltipContent className="max-w-xs">
                <div className="space-y-2 text-xs">
                  {visibleMatches.map((match) => {
                    const usage = formatSongUsageDate(match.lastUsedDate)
                    return (
                      <div key={match.matchedSongId} className="space-y-0.5">
                        <div className="font-medium">
                          {match.matchedSongTitle} · {match.matchedGroup.name}
                        </div>
                        <div className="text-muted-foreground">
                          {formatMatchType(match.matchType)}
                          {usage?.relative ? ` · last used ${usage.relative}` : ''}
                        </div>
                      </div>
                    )
                  })}
                  {hiddenMatchCount > 0 && (
                    <div className="text-muted-foreground">+{hiddenMatchCount} more matches</div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Popover>
            <PopoverTrigger
              render={(popoverProps) => (
                <Tooltip>
                  <TooltipTrigger
                    render={(tooltipProps) => {
                      const mergedProps = mergeProps<'button'>(popoverProps, tooltipProps)
                      const { ref: mergedRef, ...restProps } = mergedProps
                      return (
                        <Button
                          {...restProps}
                          ref={composeRefs(mergedRef, popoverProps.ref, tooltipProps.ref)}
                          type="button"
                          variant="secondary"
                          size="icon-xs"
                          className="h-7 w-7 cursor-pointer"
                          aria-label="Edit arrangement"
                        >
                          <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="h-4 w-4" />
                        </Button>
                      )
                    }}
                  />
                  <TooltipContent>Arrangement</TooltipContent>
                </Tooltip>
              )}
            />
            <PopoverContent className="w-[240px]" align="end">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Arrangement</Label>
                <Select
                  value={effectiveArrangementId ?? ''}
                  onValueChange={(value) => onArrangementChange(value)}
                  disabled={arrangements.length === 0}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue>{arrangementLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {arrangements.map((arrangement) => (
                      <SelectItem key={arrangement.id} value={arrangement.id}>
                        {arrangement.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger
              render={(popoverProps) => (
                <Tooltip>
                  <TooltipTrigger
                    render={(tooltipProps) => {
                      const mergedProps = mergeProps<'button'>(popoverProps, tooltipProps)
                      const { ref: mergedRef, ...restProps } = mergedProps
                      return (
                        <Button
                          {...restProps}
                          ref={composeRefs(mergedRef, popoverProps.ref, tooltipProps.ref)}
                          type="button"
                          variant="secondary"
                          size="icon-xs"
                          className="h-7 w-7 cursor-pointer"
                          aria-label="Edit notes"
                        >
                          <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="h-4 w-4" />
                        </Button>
                      )
                    }}
                  />
                  <TooltipContent>Notes</TooltipContent>
                </Tooltip>
              )}
            />
            <PopoverContent className="w-[260px]" align="end">
              <div className="space-y-2">
                <Label htmlFor={`set-song-notes-${song.id}`} className="text-xs text-muted-foreground">
                  Notes
                </Label>
                <Textarea
                  id={`set-song-notes-${song.id}`}
                  value={song.notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  rows={3}
                  placeholder="Add notes for this song..."
                  className="text-sm"
                />
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger
              render={(triggerProps) => (
                <Button
                  {...triggerProps}
                  type="button"
                  variant="destructive"
                  size="icon-xs"
                  onClick={onRemove}
                  className="h-7 w-7 cursor-pointer"
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="h-4 w-4" />
                </Button>
              )}
            />
            <TooltipContent>Remove song</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function getUpcomingSunday(today = new Date()): Date {
  const date = new Date(today)
  // "Upcoming Sunday" => next Sunday; if today is Sunday, choose next week
  const daysUntilSunday = (7 - date.getDay()) % 7 || 7
  date.setDate(date.getDate() + daysUntilSunday)
  date.setHours(0, 0, 0, 0)
  return date
}

function getSundayAfterDate(dateString: string): Date {
  // Parse the date string (YYYY-MM-DD) and get the following Sunday
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  // Always get the next Sunday (7 days after if already a Sunday)
  const daysUntilSunday = (7 - date.getDay()) % 7 || 7
  date.setDate(date.getDate() + daysUntilSunday)
  date.setHours(0, 0, 0, 0)
  return date
}

export function CreateSetDialog({
  groupId,
  groupSlug,
  songs = [],
  arrangements = [],
  upcomingSetSongIds = [],
  crossGroupMatches: initialCrossGroupMatches = {},
  crossGroupLookbackDays: initialCrossGroupLookbackDays = 365,
  crossGroupMatchesLoaded: initialCrossGroupMatchesLoaded = false,
  lastSetDate,
  existingSetDates = [],
  groups = [],
  trigger,
}: CreateSetDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState(groupId ?? '')
  const [activeGroupSlug, setActiveGroupSlug] = useState(groupSlug ?? '')
  const [activeGroupName, setActiveGroupName] = useState(
    groupId ? groups.find((group) => group.id === groupId)?.name ?? '' : ''
  )
  const [activeSongs, setActiveSongs] = useState<SongWithStats[]>(songs)
  const [activeArrangements, setActiveArrangements] = useState<SongArrangementSummary[]>(arrangements)
  const [activeUpcomingSetSongIds, setActiveUpcomingSetSongIds] = useState<string[]>(upcomingSetSongIds)
  const [activeLastSetDate, setActiveLastSetDate] = useState<string | undefined>(lastSetDate)
  const [activeExistingSetDates, setActiveExistingSetDates] = useState<string[]>(existingSetDates)
  const [crossGroupMatchesBySongId, setCrossGroupMatchesBySongId] = useState<
    Record<string, CrossGroupSongMatchSummary>
  >(initialCrossGroupMatches)
  const [crossGroupLookbackDays, setCrossGroupLookbackDays] = useState(initialCrossGroupLookbackDays)
  const [crossGroupMatchesLoaded, setCrossGroupMatchesLoaded] = useState(initialCrossGroupMatchesLoaded)
  const [isGroupLoading, setIsGroupLoading] = useState(false)
  const isDialogDataLoadingRef = useRef(false)

  const getDefaultServiceDate = useCallback(
    (overrideLastSetDate?: string) => {
      const nextLastSetDate = overrideLastSetDate ?? activeLastSetDate
      if (nextLastSetDate) {
        return getSundayAfterDate(nextLastSetDate)
      }
      return getUpcomingSunday()
    },
    [activeLastSetDate]
  )

  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serviceDate, setServiceDate] = useState<Date | undefined>(() =>
    selectedGroupId ? getDefaultServiceDate() : undefined
  )
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isSongPickerOpen, setIsSongPickerOpen] = useState(false)
  const [isRandomPickerOpen, setIsRandomPickerOpen] = useState(false)
  const [selectedSongs, setSelectedSongs] = useState<SelectedSetSong[]>([])
  const [isDraggingList, setIsDraggingList] = useState(false)
  const [randomCount, setRandomCount] = useState(5)
  const [randomPlayPreference, setRandomPlayPreference] = useState<PlayPreference>('neutral')
  const [randomAgePreference, setRandomAgePreference] = useState<AgePreference>('neutral')
  const [randomSkipRecentlyPlayed, setRandomSkipRecentlyPlayed] = useState(true)
  const [randomRecentWeeks, setRandomRecentWeeks] = useState(8)
  const [randomApplyMode, setRandomApplyMode] = useState<'append' | 'replace'>('append')
  const router = useRouter()

  // Parse existing set dates into Date objects for calendar highlighting
  const existingSetDateObjects = useMemo(() => {
    return activeExistingSetDates.map((dateStr) => {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    })
  }, [activeExistingSetDates])

  const hasSongStats = useMemo(
    () => activeSongs.length > 0 && activeSongs.every((song) => typeof song.totalUses === 'number'),
    [activeSongs]
  )

  // Check if the selected date already has a set
  const isDateWithExistingSet = useMemo(() => {
    if (!serviceDate) return false
    return existingSetDateObjects.some(
      (date) => date.toDateString() === serviceDate.toDateString()
    )
  }, [serviceDate, existingSetDateObjects])

  // Check if there's an upcoming set and the current selection is the next Sunday after it
  const showUpcomingSetAlert = useMemo(() => {
    if (!activeLastSetDate || !serviceDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Parse last set date
    const [year, month, day] = activeLastSetDate.split('-').map(Number)
    const lastSet = new Date(year, month - 1, day)
    
    // Only show alert if last set is in the future (upcoming)
    if (lastSet < today) return false
    
    // Check if service date is the Sunday after the last set
    const sundayAfterLastSet = getSundayAfterDate(activeLastSetDate)
    return serviceDate.toDateString() === sundayAfterLastSet.toDateString()
  }, [activeLastSetDate, serviceDate])

  const arrangementsBySong = useMemo(() => {
    const map = new Map<string, SongArrangementSummary[]>()
    activeArrangements.forEach((arrangement) => {
      const existing = map.get(arrangement.song_id)
      if (existing) {
        existing.push(arrangement)
      } else {
        map.set(arrangement.song_id, [arrangement])
      }
    })
    return map
  }, [activeArrangements])

  const upcomingSetSongIdSet = useMemo(
    () => new Set(activeUpcomingSetSongIds),
    [activeUpcomingSetSongIds]
  )

  const recentWindowOptions = useMemo(() => {
    const maxWeeks = Math.max(1, Math.floor(crossGroupLookbackDays / 7))
    const options = [1, 2, 3, 4, 5].filter((weeks) => weeks <= maxWeeks)
    return options.length ? options : [maxWeeks]
  }, [crossGroupLookbackDays])

  useEffect(() => {
    if (recentWindowOptions.includes(randomRecentWeeks)) return
    setRandomRecentWeeks(recentWindowOptions[recentWindowOptions.length - 1])
  }, [randomRecentWeeks, recentWindowOptions])

  const recentCrossGroupSongIdSet = useMemo(() => {
    if (!randomSkipRecentlyPlayed) return new Set<string>()
    const recentIds = new Set<string>()
    const entries = Object.entries(crossGroupMatchesBySongId)
    entries.forEach(([songId, summary]) => {
      if (!summary?.lastUsedDate) return
      if (isDateWithinWeeks(summary.lastUsedDate, randomRecentWeeks)) {
        recentIds.add(songId)
      }
    })
    activeSongs.forEach((song) => {
      if (!song.lastUsedDate) return
      if (isDateWithinWeeks(song.lastUsedDate, randomRecentWeeks)) {
        recentIds.add(song.id)
      }
    })
    return recentIds
  }, [activeSongs, crossGroupMatchesBySongId, randomRecentWeeks, randomSkipRecentlyPlayed])

  const randomCandidateCount = useMemo(() => {
    const selectedIdSet =
      randomApplyMode === 'replace'
        ? new Set<string>()
        : new Set(selectedSongs.map((song) => song.id))
    return activeSongs.filter((song) => {
      if (selectedIdSet.has(song.id)) return false
      if (randomSkipRecentlyPlayed && recentCrossGroupSongIdSet.has(song.id)) return false
      return true
    }).length
  }, [
    activeSongs,
    randomApplyMode,
    randomSkipRecentlyPlayed,
    recentCrossGroupSongIdSet,
    selectedSongs,
  ])
  const maxRandomCount = Math.max(1, randomCandidateCount)

  useEffect(() => {
    if (randomCandidateCount <= 0) return
    setRandomCount((prev) => Math.min(prev, randomCandidateCount))
  }, [randomCandidateCount])

  const selectedSongsPayload = useMemo(
    () =>
      selectedSongs.map((song, index) => {
        const songArrangements = arrangementsBySong.get(song.id) ?? []
        const defaultArrangementId =
          songArrangements.find((arrangement) => arrangement.name === 'Default')?.id ??
          songArrangements[0]?.id ??
          null
        return {
          songId: song.id,
          arrangementId: song.arrangementId ?? defaultArrangementId,
          notes: song.notes?.trim() || null,
          position: index + 1,
        }
      }),
    [arrangementsBySong, selectedSongs]
  )

  const handleAddSong = (song: Song) => {
    setSelectedSongs((prev) => {
      if (prev.some((item) => item.id === song.id)) {
        return prev
      }
      const songArrangements = arrangementsBySong.get(song.id) ?? []
      const defaultArrangement =
        songArrangements.find((arrangement) => arrangement.name === 'Default')?.id ??
        songArrangements[0]?.id ??
        null
      return [
        ...prev,
        {
          id: song.id,
          title: song.title,
          arrangementId: defaultArrangement,
          notes: '',
        },
      ]
    })
  }

  const handleRemoveSong = (songId: string) => {
    setSelectedSongs((prev) => prev.filter((song) => song.id !== songId))
  }

  const buildSelectedSong = useCallback(
    (song: { id: string; title: string }): SelectedSetSong => {
      const songArrangements = arrangementsBySong.get(song.id) ?? []
      const defaultArrangement =
        songArrangements.find((arrangement) => arrangement.name === 'Default')?.id ??
        songArrangements[0]?.id ??
        null
      return {
        id: song.id,
        title: song.title,
        arrangementId: defaultArrangement,
        notes: '',
      }
    },
    [arrangementsBySong]
  )

  const handleRandomPick = useCallback(() => {
    const selectedIds =
      randomApplyMode === 'replace' ? [] : selectedSongs.map((song) => song.id)
    const recentlyPlayedSongIds = randomSkipRecentlyPlayed
      ? Array.from(recentCrossGroupSongIdSet)
      : []
    const picks = pickWeightedSongs({
      songs: activeSongs.map((song) => ({
        id: song.id,
        title: song.title,
        created_at: song.created_at ?? null,
        totalUses: song.totalUses ?? 0,
      })),
      selectedSongIds: selectedIds,
      recentlyPlayedSongIds,
      config: {
        count: randomCount,
        playPreference: randomPlayPreference,
        agePreference: randomAgePreference,
        skipRecentlyPlayed: randomSkipRecentlyPlayed,
      },
    })

    if (picks.length === 0) {
      return
    }

    setSelectedSongs((prev) => {
      const base = randomApplyMode === 'replace' ? [] : prev
      const existingIds = new Set(base.map((song) => song.id))
      const next = [...base]
      picks.forEach((song) => {
        if (existingIds.has(song.id)) return
        next.push(buildSelectedSong(song))
        existingIds.add(song.id)
      })
      return next
    })

    setIsRandomPickerOpen(false)
  }, [
    activeSongs,
    buildSelectedSong,
    randomAgePreference,
    randomApplyMode,
    randomCount,
    randomPlayPreference,
    randomSkipRecentlyPlayed,
    recentCrossGroupSongIdSet,
    selectedSongs,
  ])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setIsDraggingList(false)
      const { active, over } = event
      if (!over || active.id === over.id) {
        return
      }

      setSelectedSongs((prev) => {
        const oldIndex = prev.findIndex((item) => item.id === active.id)
        const newIndex = prev.findIndex((item) => item.id === over.id)
        if (oldIndex === -1 || newIndex === -1) {
          return prev
        }
        return arrayMove(prev, oldIndex, newIndex)
      })
    },
    [setSelectedSongs]
  )

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!serviceDate) {
      setError('Service date is required')
      setIsLoading(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    if (!selectedGroupId || !activeGroupSlug) {
      setError('Select a group before creating a set')
      setIsLoading(false)
      return
    }

    const result = await createSet(selectedGroupId, formData)

    if (result.success && result.set) {
      setIsOpen(false)
      router.push(`/groups/${activeGroupSlug}/sets/${result.set.id}`)
    } else {
      setError(result.error || 'Failed to create set')
    }
    setIsLoading(false)
  }

  const isGroupSelected = Boolean(selectedGroupId)

  const loadGroupDialogData = useCallback(
    async (groupValue: string) => {
      if (!groupValue || isDialogDataLoadingRef.current) return
      isDialogDataLoadingRef.current = true
      setError(null)
      setIsGroupLoading(true)
      try {
        const response = await fetch(`/api/groups/${encodeURIComponent(groupValue)}/set-dialog-data`)
        if (!response.ok) {
          throw new Error('Failed to load group data')
        }
        const payload = (await response.json()) as {
          group: { id: string; name: string; slug: string }
          songs: SongWithStats[]
          arrangements: SongArrangementSummary[]
          upcomingSetSongIds: string[]
          crossGroupMatches: Record<string, CrossGroupSongMatchSummary>
          crossGroupLookbackDays: number
          crossGroupMatchesLoaded: boolean
          lastSetDate: string | null
          existingSetDates: string[]
        }
        setSelectedGroupId(payload.group.id)
        setActiveGroupSlug(payload.group.slug)
        setActiveGroupName(payload.group.name)
        setActiveSongs(payload.songs)
        setActiveArrangements(payload.arrangements)
        setActiveUpcomingSetSongIds(payload.upcomingSetSongIds)
        setActiveLastSetDate(payload.lastSetDate ?? undefined)
        setActiveExistingSetDates(payload.existingSetDates)
        setCrossGroupMatchesBySongId(payload.crossGroupMatches ?? {})
        setCrossGroupLookbackDays(payload.crossGroupLookbackDays ?? 365)
        setCrossGroupMatchesLoaded(payload.crossGroupMatchesLoaded ?? true)
        setServiceDate(getDefaultServiceDate(payload.lastSetDate ?? undefined))
      } catch (err) {
        console.error('Failed to fetch group set dialog data:', err)
        setError('Unable to load group data. Please try again.')
        setActiveGroupSlug('')
        setActiveGroupName('')
        setActiveSongs([])
        setActiveArrangements([])
        setActiveUpcomingSetSongIds([])
        setActiveLastSetDate(undefined)
        setActiveExistingSetDates([])
        setCrossGroupMatchesBySongId({})
        setCrossGroupLookbackDays(365)
        setCrossGroupMatchesLoaded(false)
        setServiceDate(undefined)
      } finally {
        setIsGroupLoading(false)
        isDialogDataLoadingRef.current = false
      }
    },
    [getDefaultServiceDate]
  )

  async function handleGroupChange(nextGroupId: string | null) {
    const nextValue = nextGroupId ?? ''
    const matchedGroup = groups.find((group) => group.id === nextValue || group.slug === nextValue)
    const resolvedGroupId = matchedGroup?.id ?? nextValue
    setSelectedGroupId(resolvedGroupId)
    setSelectedSongs([])
    setError(null)

    if (!resolvedGroupId) {
      setActiveGroupSlug('')
      setActiveGroupName('')
      setActiveSongs([])
      setActiveArrangements([])
      setActiveUpcomingSetSongIds([])
      setActiveLastSetDate(undefined)
      setActiveExistingSetDates([])
      setCrossGroupMatchesBySongId({})
      setCrossGroupLookbackDays(365)
      setCrossGroupMatchesLoaded(false)
      setServiceDate(undefined)
      return
    }

    if (matchedGroup) {
      setActiveGroupSlug(matchedGroup.slug)
      setActiveGroupName(matchedGroup.name)
    }

    await loadGroupDialogData(resolvedGroupId)
  }

  useEffect(() => {
    if (!isOpen || !selectedGroupId) return
    if (!activeSongs.length || !hasSongStats || !crossGroupMatchesLoaded) {
      void loadGroupDialogData(selectedGroupId)
    }
  }, [
    activeSongs.length,
    crossGroupMatchesLoaded,
    hasSongStats,
    isOpen,
    loadGroupDialogData,
    selectedGroupId,
  ])

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open) {
          setError(null)
          setIsDatePickerOpen(false)
          setIsSongPickerOpen(false)
          setIsRandomPickerOpen(false)
          setSelectedSongs([])
          if (groupId) {
            setSelectedGroupId(groupId)
            setActiveGroupSlug(groupSlug ?? '')
            setActiveSongs(songs)
            setActiveArrangements(arrangements)
            setActiveUpcomingSetSongIds(upcomingSetSongIds)
            setActiveLastSetDate(lastSetDate)
            setActiveExistingSetDates(existingSetDates)
            setCrossGroupMatchesBySongId(initialCrossGroupMatches)
            setCrossGroupLookbackDays(initialCrossGroupLookbackDays)
            setCrossGroupMatchesLoaded(initialCrossGroupMatchesLoaded)
            setServiceDate(getDefaultServiceDate(lastSetDate))
          } else {
            setSelectedGroupId('')
            setActiveGroupSlug('')
            setActiveGroupName('')
            setActiveSongs([])
            setActiveArrangements([])
            setActiveUpcomingSetSongIds([])
            setActiveLastSetDate(undefined)
            setActiveExistingSetDates([])
            setCrossGroupMatchesBySongId({})
            setCrossGroupLookbackDays(365)
            setCrossGroupMatchesLoaded(false)
            setServiceDate(undefined)
          }
        }
      }}
    >
      <DialogTrigger
        nativeButton={trigger ? false : true}
        render={
          trigger ? (
            <div className="contents">{trigger}</div>
          ) : (
            <Button size="sm">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
              New Set
            </Button>
          )
        }
      />

      <DialogContent className="max-w-2xl p-6 max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-lg font-semibold">Create New Set</DialogTitle>
        </DialogHeader>

        {showUpcomingSetAlert && (
          <Alert className="mb-2 border-primary/30 bg-primary/10 text-foreground *:data-[slot=alert-description]:text-foreground/80">
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="h-4 w-4 text-primary" />
            <AlertTitle>Auto-scheduled date</AlertTitle>
            <AlertDescription>
              This date was automatically set to the Sunday following your most recent upcoming set ({format(new Date(lastSetDate + 'T00:00:00'), 'MMM d')}).
            </AlertDescription>
          </Alert>
        )}

        {isDateWithExistingSet && (
          <Alert variant="destructive" className="mb-2">
            <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} className="h-4 w-4" />
            <AlertTitle>Date conflict</AlertTitle>
            <AlertDescription>
              A set already exists for this date. Consider choosing a different date.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 min-w-0">
          {!groupId && (
            <div className="space-y-2">
              <Label>Group</Label>
              <Select value={selectedGroupId} onValueChange={handleGroupChange}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Select a group">
                    {(value) => {
                      if (!value) return null
                      return groups.find((group) => group.id === value)?.name ?? value
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeGroupName && (
                <p className="text-xs text-muted-foreground">Creating a set for {activeGroupName}.</p>
              )}
            </div>
          )}

          {!isGroupSelected && !groupId && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Select a group to build an upcoming set.
              </CardContent>
            </Card>
          )}

          {isGroupSelected && (
            <>
          <div className="space-y-2">
            <Label htmlFor="service_date">Service Date</Label>
            <input
              id="service_date"
              name="service_date"
              type="hidden"
              value={serviceDate ? format(serviceDate, 'yyyy-MM-dd') : ''}
            />
            <div className="flex items-center gap-2">
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-empty={!serviceDate}
                      className={cn(
                        'data-[empty=true]:text-muted-foreground flex-1 justify-start text-left font-normal',
                      )}
                    >
                      {serviceDate ? format(serviceDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={serviceDate}
                    onSelect={(date) => {
                      setServiceDate(date)
                      setIsDatePickerOpen(false)
                    }}
                    captionLayout="dropdown"
                    initialFocus
                    disabled={{ before: new Date() }}
                    modifiers={{
                      existingSet: existingSetDateObjects,
                    }}
                    modifiersClassNames={{
                      existingSet: '[&_button]:relative [&_button]:after:absolute [&_button]:after:bottom-1 [&_button]:after:left-1/2 [&_button]:after:-translate-x-1/2 [&_button]:after:h-1 [&_button]:after:w-1 [&_button]:after:rounded-none [&_button]:after:bg-primary [&_button]:after:z-20 [&_button:hover]:after:bg-primary-foreground [&_button[data-selected-single=true]]:after:bg-primary-foreground',
                    }}
                  />
                    {activeExistingSetDates.length > 0 && (
                    <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-none bg-primary" />
                      Dates with existing sets
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setServiceDate(getDefaultServiceDate())}
                aria-label="Auto-set date"
                className="shrink-0"
                disabled={serviceDate?.toDateString() === getDefaultServiceDate().toDateString()}
              >
                Auto set
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Label>Songs</Label>
                <span className="text-xs text-muted-foreground">
                  {selectedSongs.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Popover open={isSongPickerOpen} onOpenChange={setIsSongPickerOpen}>
                  <PopoverTrigger
                    render={
                      <Button type="button" variant="outline" size="sm" className="h-9">
                        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                        Add songs
                      </Button>
                    }
                  />
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search songs..." />
                      <CommandList className="max-h-72">
                        <CommandEmpty>No songs found.</CommandEmpty>
                        <CommandGroup>
                          {activeSongs.map((song) => {
                            const isSelected = selectedSongs.some((item) => item.id === song.id)
                            const isUpcoming = upcomingSetSongIdSet.has(song.id)
                          const usage = formatSongUsageDate(song.lastUsedDate)
                          const totalUses = song.totalUses ?? 0
                          const usesLabel = `Used ${totalUses} ${totalUses === 1 ? 'time' : 'times'}`
                            return (
                              <CommandItem
                                key={song.id}
                                value={song.title}
                                onSelect={() => handleAddSong(song)}
                                className="cursor-pointer transition-colors data-[selected=true]:bg-muted/70 hover:bg-muted/50 [&>svg:last-child]:hidden"
                              >
                                <div className="grid w-full items-center gap-2 grid-cols-[minmax(0,1fr)_auto]">
                                <div className="min-w-0">
                                  <span className="block min-w-0 truncate text-sm font-medium">
                                    {song.title}
                                  </span>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                    {usage ? (
                                      <>
                                        <Tooltip>
                                          <TooltipTrigger
                                            render={(triggerProps) => (
                                              <span
                                                {...triggerProps}
                                                className="cursor-default underline-offset-2 hover:underline"
                                              >
                                                Last used {usage.relative}
                                              </span>
                                            )}
                                          />
                                          <TooltipContent>{usage.absolute}</TooltipContent>
                                        </Tooltip>
                                        <span aria-hidden="true">•</span>
                                        <span>{usesLabel}</span>
                                      </>
                                    ) : (
                                      <span>Never used</span>
                                    )}
                                  </div>
                                </div>
                                  <div className="flex items-center justify-end gap-2">
                                    {isUpcoming && (
                                      <Badge
                                        variant="secondary"
                                        className="h-5 px-2 text-[10px] whitespace-nowrap"
                                      >
                                        Upcoming set
                                      </Badge>
                                    )}
                                    {isSelected ? (
                                      <HugeiconsIcon
                                        icon={CheckmarkCircle02Icon}
                                        strokeWidth={2}
                                        className="h-4 w-4 text-primary"
                                      />
                                    ) : (
                                      <Button
                                        type="button"
                                        size="xs"
                                        variant="outline"
                                        className="h-6 px-2 text-[11px]"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          handleAddSong(song)
                                        }}
                                      >
                                        Add
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <Popover open={isRandomPickerOpen} onOpenChange={setIsRandomPickerOpen}>
                  <PopoverTrigger
                  render={(popoverProps) => (
                      <Tooltip>
                        <TooltipTrigger
                        render={(triggerProps) => {
                          const mergedProps = mergeProps<'button'>(popoverProps, triggerProps)
                          const { ref: mergedRef, ...restProps } = mergedProps
                          return (
                            <Button
                              {...restProps}
                              ref={composeRefs(mergedRef, popoverProps.ref, triggerProps.ref)}
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              aria-label="Random pick"
                            >
                              <HugeiconsIcon icon={ShuffleIcon} strokeWidth={2} className="h-4 w-4" />
                            </Button>
                          )
                        }}
                        />
                        <TooltipContent>Random pick</TooltipContent>
                      </Tooltip>
                  )}
                  />
                <PopoverContent className="w-[280px] p-4 rounded-none" align="end">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label
                          htmlFor="random-pick-count"
                          className="text-xs text-muted-foreground mb-1 block"
                        >
                          How many
                        </Label>
                        <Input
                          id="random-pick-count"
                          type="number"
                          min={1}
                          max={maxRandomCount}
                          value={randomCount}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value)
                            if (!Number.isFinite(nextValue)) return
                            const clamped = Math.max(1, Math.min(nextValue, maxRandomCount))
                            setRandomCount(clamped)
                          }}
                        className="h-8 rounded-none"
                        />
                        <p className="text-xs text-muted-foreground">
                          {randomCandidateCount} available candidates
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground mb-1 block">Play frequency</Label>
                      <RadioCardGroup
                        value={randomPlayPreference}
                        onValueChange={(value) => setRandomPlayPreference(value as PlayPreference)}
                        options={[
                          { value: 'less', label: 'Less', icon: ArrowDown01Icon },
                          { value: 'neutral', label: 'Neutral', icon: ArrowUpDownIcon },
                          { value: 'more', label: 'More', icon: ArrowUp01Icon },
                        ]}
                      />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground mb-1 block">Song age</Label>
                      <RadioCardGroup
                        value={randomAgePreference}
                        onValueChange={(value) => setRandomAgePreference(value as AgePreference)}
                        options={[
                          { value: 'older', label: 'Older', icon: Clock01Icon },
                          { value: 'neutral', label: 'Neutral', icon: ArrowUpDownIcon },
                          { value: 'newer', label: 'Newer', icon: CalendarAdd01Icon },
                        ]}
                      />
                      </div>

                      <div
                        className={cn(
                          'flex items-center justify-between gap-2 border border-border/70 px-2 py-2 rounded-none transition-colors',
                          randomSkipRecentlyPlayed && 'border-primary/50'
                        )}
                      >
                        <Label
                          className={cn(
                            'text-xs',
                            randomSkipRecentlyPlayed ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          Skip songs recently played by other groups
                        </Label>
                        <Checkbox
                          checked={randomSkipRecentlyPlayed}
                          onCheckedChange={(value) => setRandomSkipRecentlyPlayed(Boolean(value))}
                          aria-label="Skip songs recently played by other groups"
                          className="rounded-none"
                        />
                      </div>

                      {randomSkipRecentlyPlayed && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground mb-1 block">Time window</Label>
                          <Select
                            value={String(randomRecentWeeks)}
                            onValueChange={(value) => {
                              const nextValue = Number(value)
                              if (!Number.isFinite(nextValue)) return
                              setRandomRecentWeeks(nextValue)
                            }}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue>{`Last ${randomRecentWeeks} weeks`}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {recentWindowOptions.map((weeks) => (
                                <SelectItem key={weeks} value={String(weeks)}>
                                  {weeks === 1 ? 'Last week' : `Last ${weeks} weeks`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {selectedSongs.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground mb-1 block">Apply mode</Label>
                          <RadioCardGroup
                            value={randomApplyMode}
                            onValueChange={(value) => setRandomApplyMode(value as 'append' | 'replace')}
                            options={[
                              { value: 'append', label: 'Append', icon: Add01Icon },
                              { value: 'replace', label: 'Replace', icon: Exchange01Icon },
                            ]}
                          />
                        </div>
                      )}

                      <Button
                        type="button"
                        size="sm"
                      className="w-full rounded-none"
                        onClick={handleRandomPick}
                        disabled={randomCandidateCount === 0 || randomCount < 1}
                      >
                        Pick songs
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {selectedSongs.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No songs selected yet.
                </CardContent>
              </Card>
            ) : (
              <div
                className={`max-h-60 w-full overflow-y-auto overflow-x-hidden${isDraggingList ? ' overscroll-contain' : ''}`}
                onWheel={isDraggingList ? (event) => event.preventDefault() : undefined}
                onTouchMove={isDraggingList ? (event) => event.preventDefault() : undefined}
              >
                <TooltipProvider delay={200}>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragStart={() => setIsDraggingList(true)}
                    onDragCancel={() => setIsDraggingList(false)}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={selectedSongs.map((song) => song.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="w-full max-w-full space-y-2 pr-1 overflow-x-hidden">
                        {selectedSongs.map((song) => {
                          const songArrangements = arrangementsBySong.get(song.id) ?? []
                          return (
                            <SortableSongRow
                              key={song.id}
                              song={song}
                              arrangements={songArrangements}
                              onRemove={() => handleRemoveSong(song.id)}
                              crossGroupSummary={crossGroupMatchesBySongId[song.id]}
                              onArrangementChange={(arrangementId) => {
                                setSelectedSongs((prev) =>
                                  prev.map((item) =>
                                    item.id === song.id ? { ...item, arrangementId } : item
                                  )
                                )
                              }}
                              onNotesChange={(notes) => {
                                setSelectedSongs((prev) =>
                                  prev.map((item) => (item.id === song.id ? { ...item, notes } : item))
                                )
                              }}
                            />
                          )
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </TooltipProvider>
              </div>
            )}
            <input
              type="hidden"
              name="set_songs"
              value={selectedSongsPayload.length > 0 ? JSON.stringify(selectedSongsPayload) : ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Any notes for the service..."
              rows={3}
            />
          </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isGroupLoading || (!groupId && !isGroupSelected)}>
              {isLoading ? 'Creating...' : 'Create Set'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
