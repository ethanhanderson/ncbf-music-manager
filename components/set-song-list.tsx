'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getSongArrangements } from '@/lib/actions/song-arrangements'
import {
  removeSongFromSet,
  reorderSetSongs,
  updateSetSongArrangement,
  updateSetSongNotes,
} from '@/lib/actions/sets'
import type { SetSongWithDetails, SongArrangement } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  DragDropVerticalIcon,
  Edit01Icon,
  Layers01Icon,
} from '@hugeicons/core-free-icons'
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

export interface SetSongListProps {
  setSongs: SetSongWithDetails[]
  setId: string
  groupId: string
  groupSlug: string
}

function composeRefs<T>(...refs: Array<Ref<T> | undefined>) {
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
      const fallbackTruncate = title.length > 42
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
        className="flex-1 min-w-0 max-w-[360px] truncate text-sm font-medium sm:max-w-[420px]"
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
            className="flex-1 min-w-0 max-w-[360px] text-left text-sm font-medium truncate sm:max-w-[420px] cursor-default"
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

const SortableSongRow = memo(function SortableSongRow({
  setSong,
  arrangements,
  groupSlug,
  position,
  onRemove,
  onArrangementChange,
  onNotesSave,
  isLoadingArrangements,
  onOpenArrangements,
}: {
  setSong: SetSongWithDetails
  arrangements: SongArrangement[]
  groupSlug: string
  position: number
  onRemove: () => Promise<void> | void
  onArrangementChange: (arrangementId: string | null) => void
  onNotesSave: (notes: string) => Promise<void>
  isLoadingArrangements: boolean
  onOpenArrangements: () => void
}) {
  const defaultArrangementId = useMemo(() => {
    const defaultArrangement = arrangements.find(
      (arrangement) => arrangement.is_locked || arrangement.name === 'Default'
    )
    return defaultArrangement?.id ?? arrangements[0]?.id ?? null
  }, [arrangements])
  const effectiveArrangementId = setSong.arrangement_id ?? defaultArrangementId
  const arrangementLabel = useMemo(() => {
    if (isLoadingArrangements) return 'Loading...'
    if (!effectiveArrangementId) return arrangements.length > 0 ? 'Unknown arrangement' : 'No arrangements'
    return (
      arrangements.find((arrangement) => arrangement.id === effectiveArrangementId)?.name ??
      setSong.song_arrangements?.name ??
      'Unknown arrangement'
    )
  }, [arrangements, effectiveArrangementId, isLoadingArrangements, setSong.song_arrangements?.name])
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: setSong.id })
  const [notesDraft, setNotesDraft] = useState(setSong.notes ?? '')
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  async function handleSaveNotes() {
    setIsSavingNotes(true)
    await onNotesSave(notesDraft)
    setIsSavingNotes(false)
    setNotesOpen(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-none border border-border/60 px-3 py-3',
        isDragging && 'bg-muted/60'
      )}
    >
      <div className="flex w-full max-w-full items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          ref={setActivatorNodeRef}
          type="button"
          className="mt-1 inline-flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground cursor-ns-resize active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3">
                <div className="text-base font-semibold text-foreground">
                  #{position}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/groups/${groupSlug}/songs/${setSong.song_id}`}
                    className="inline-flex max-w-full items-center"
                  >
                    <TruncatedSongTitle title={setSong.songs.title} />
                  </Link>
                  {(setSong.song_arrangements?.name ||
                    setSong.key_override ||
                    setSong.notes) && (
                    <div className="mt-2">
                      {(setSong.song_arrangements?.name || setSong.key_override) && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {setSong.song_arrangements?.name && (
                            <div className="inline-flex items-center gap-2 rounded-none border border-border/60 bg-muted/40 px-2.5 py-1">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Arrangement
                              </span>
                              <span className="font-medium text-foreground/80">{setSong.song_arrangements.name}</span>
                            </div>
                          )}
                          {setSong.key_override && (
                            <div className="inline-flex items-center gap-2 rounded-none border border-border/60 bg-muted/40 px-2.5 py-1">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Key</span>
                              <span className="font-medium text-foreground/80">{setSong.key_override}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {setSong.notes && (
                        <div className="mt-3 text-xs text-muted-foreground">
                          <div className="rounded-none border border-border/60 bg-muted/30 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Set notes</p>
                            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-foreground/80">
                              {setSong.notes}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ButtonGroup>
                <Popover onOpenChange={(open) => open && onOpenArrangements()}>
                  <PopoverTrigger
                    render={(triggerProps) => (
                      <Button
                        {...triggerProps}
                        type="button"
                        variant="outline"
                        size="xs"
                        className="h-7 px-2 text-xs"
                      >
                        <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="mr-1.5 h-3.5 w-3.5" />
                        Arrangement
                      </Button>
                    )}
                  />
                  <PopoverContent className="w-[260px]" align="end">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Arrangement</Label>
                      <Select
                        value={effectiveArrangementId ?? ''}
                        onValueChange={(value) => onArrangementChange(value)}
                        disabled={isLoadingArrangements || arrangements.length === 0}
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

                <Popover
                  open={notesOpen}
                  onOpenChange={(open) => {
                    setNotesOpen(open)
                    if (open) {
                      setNotesDraft(setSong.notes ?? '')
                    }
                  }}
                >
                  <PopoverTrigger
                    render={(triggerProps) => (
                      <Button
                        {...triggerProps}
                        type="button"
                        variant="outline"
                        size="xs"
                        className="h-7 px-2 text-xs"
                      >
                        <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="mr-1.5 h-3.5 w-3.5" />
                        Notes
                      </Button>
                    )}
                  />
                  <PopoverContent className="w-[280px]" align="end">
                    <div className="space-y-2">
                      <Label htmlFor={`set-song-notes-${setSong.id}`} className="text-xs text-muted-foreground">
                        Notes
                      </Label>
                      <Textarea
                        id={`set-song-notes-${setSong.id}`}
                        value={notesDraft}
                        onChange={(event) => setNotesDraft(event.target.value)}
                        rows={3}
                        placeholder="Add notes for this song..."
                        className="text-sm"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => setNotesOpen(false)}
                          disabled={isSavingNotes}
                        >
                          Cancel
                        </Button>
                        <Button type="button" size="xs" onClick={handleSaveNotes} disabled={isSavingNotes}>
                          {isSavingNotes ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </ButtonGroup>

              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-xs"
                      className="h-7 w-7 cursor-pointer"
                      title="Remove song"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="h-4 w-4" />
                    </Button>
                  }
                />
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove this song?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the song from the setlist. It does not delete the song.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      size="sm"
                      variant="destructive"
                      onClick={onRemove}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export function SetSongList({ setSongs, setId, groupId, groupSlug }: SetSongListProps) {
  const [orderedSongs, setOrderedSongs] = useState(setSongs)
  const [arrangementsBySongId, setArrangementsBySongId] = useState<Record<string, SongArrangement[]>>({})
  const [loadingArrangementId, setLoadingArrangementId] = useState<string | null>(null)
  const [isDraggingList, setIsDraggingList] = useState(false)

  useEffect(() => {
    setOrderedSongs(setSongs)
  }, [setSongs])

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
      const oldIndex = orderedSongs.findIndex((item) => item.id === active.id)
      const newIndex = orderedSongs.findIndex((item) => item.id === over.id)
      if (oldIndex === -1 || newIndex === -1) {
        return
      }

      const nextOrder = arrayMove(orderedSongs, oldIndex, newIndex).map((song, index) => ({
        ...song,
        position: index + 1,
      }))
      setOrderedSongs(nextOrder)
      void reorderSetSongs(setId, nextOrder.map((song) => song.id), groupSlug)
    },
    [groupSlug, orderedSongs, setId]
  )

  async function handleRemove(setSongId: string) {
    await removeSongFromSet(setSongId, setId, groupSlug)
    setOrderedSongs((prev) => prev.filter((song) => song.id !== setSongId))
  }

  async function ensureArrangements(songId: string) {
    if (arrangementsBySongId[songId]) return
    setLoadingArrangementId(songId)
    const arrangements = await getSongArrangements(songId, groupId)
    setArrangementsBySongId((prev) => ({ ...prev, [songId]: arrangements }))
    setLoadingArrangementId(null)
  }

  async function handleArrangementChange(
    setSongId: string,
    songId: string,
    arrangementId: string | null
  ) {
    await updateSetSongArrangement(setSongId, arrangementId, setId, groupSlug)
    const selectedArrangement = arrangementId
      ? arrangementsBySongId[songId]?.find((arrangement) => arrangement.id === arrangementId) ?? null
      : null
    setOrderedSongs((prev) =>
      prev.map((song) =>
        song.id === setSongId
          ? { ...song, arrangement_id: arrangementId, song_arrangements: selectedArrangement }
          : song
      )
    )
  }

  async function handleNotesSave(setSongId: string, notes: string) {
    await updateSetSongNotes(setSongId, notes, setId, groupSlug)
    setOrderedSongs((prev) =>
      prev.map((song) => (song.id === setSongId ? { ...song, notes } : song))
    )
  }

  return (
    <TooltipProvider delay={200}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={() => setIsDraggingList(true)}
        onDragCancel={() => setIsDraggingList(false)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedSongs.map((song) => song.id)} strategy={verticalListSortingStrategy}>
          <div
            className={cn('space-y-2', isDraggingList && 'select-none')}
          >
            {orderedSongs.map((setSong, index) => (
              <SortableSongRow
                key={setSong.id}
                setSong={setSong}
                arrangements={arrangementsBySongId[setSong.song_id] ?? []}
                groupSlug={groupSlug}
                position={index + 1}
                onRemove={() => handleRemove(setSong.id)}
                onArrangementChange={(arrangementId) =>
                  handleArrangementChange(setSong.id, setSong.song_id, arrangementId)
                }
                onNotesSave={(notes) => handleNotesSave(setSong.id, notes)}
                isLoadingArrangements={loadingArrangementId === setSong.song_id}
                onOpenArrangements={() => ensureArrangements(setSong.song_id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </TooltipProvider>
  )
}
