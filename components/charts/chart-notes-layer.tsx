"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ChartNote } from '@/components/song-charts-manager'

interface ChartNotesLayerProps {
  notes: ChartNote[]
  openNoteId: string | null
  onOpenNoteIdChange: (noteId: string | null) => void
  onUpdateNote: (noteId: string, patch: Partial<ChartNote>) => void
  onDeleteNote: (noteId: string) => void
}

interface ChartNoteItemProps {
  note: ChartNote
  isOpen: boolean
  draftText: string
  layerRef: RefObject<HTMLDivElement | null>
  dragStateRef: MutableRefObject<{
    noteId: string
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    dragging: boolean
    pointerId: number
  } | null>
  suppressClickRef: MutableRefObject<boolean>
  onOpenNoteIdChange: (noteId: string | null) => void
  onDeleteNote: (noteId: string) => void
  onDraftTextChange: (value: string) => void
  onSave: (note: ChartNote) => void
  scheduleUpdate: (noteId: string, xPct: number, yPct: number) => void
}

const ChartNoteItem = memo(function ChartNoteItem({
  note,
  isOpen,
  draftText,
  layerRef,
  dragStateRef,
  suppressClickRef,
  onOpenNoteIdChange,
  onDeleteNote,
  onDraftTextChange,
  onSave,
  scheduleUpdate,
}: ChartNoteItemProps) {
  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => onOpenNoteIdChange(open ? note.id : null)}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium px-1.5 py-0.5 bg-background/90 border border-border text-foreground shadow-sm cursor-move"
            data-chart-note="true"
            style={{
              left: `${note.xPct * 100}%`,
              top: `${note.yPct * 100}%`,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              const layer = layerRef.current
              if (!layer) return
              const rect = layer.getBoundingClientRect()
              if (rect.width === 0 || rect.height === 0) return
              const pointerX = event.clientX - rect.left
              const pointerY = event.clientY - rect.top
              const noteCenterX = note.xPct * rect.width
              const noteCenterY = note.yPct * rect.height
              dragStateRef.current = {
                noteId: note.id,
                startX: event.clientX,
                startY: event.clientY,
                offsetX: noteCenterX - pointerX,
                offsetY: noteCenterY - pointerY,
                dragging: false,
                pointerId: event.pointerId,
              }
              try {
                event.currentTarget.setPointerCapture(event.pointerId)
              } catch {
                // Ignore capture errors (older browsers)
              }
            }}
            onPointerMove={(event) => {
              const dragState = dragStateRef.current
              if (!dragState || dragState.pointerId !== event.pointerId) return
              const layer = layerRef.current
              if (!layer) return
              const rect = layer.getBoundingClientRect()
              if (rect.width === 0 || rect.height === 0) return
              const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)
              if (!dragState.dragging && distance < 3) return
              dragState.dragging = true
              const pointerX = event.clientX - rect.left
              const pointerY = event.clientY - rect.top
              const nextX = (pointerX + dragState.offsetX) / rect.width
              const nextY = (pointerY + dragState.offsetY) / rect.height
              scheduleUpdate(
                dragState.noteId,
                Math.min(1, Math.max(0, nextX)),
                Math.min(1, Math.max(0, nextY))
              )
              suppressClickRef.current = true
            }}
            onPointerUp={(event) => {
              const dragState = dragStateRef.current
              if (dragState?.pointerId !== event.pointerId) return
              dragStateRef.current = null
              try {
                event.currentTarget.releasePointerCapture(event.pointerId)
              } catch {
                // Ignore capture errors
              }
              if (dragState?.dragging) {
                suppressClickRef.current = true
                window.setTimeout(() => {
                  suppressClickRef.current = false
                }, 0)
              }
            }}
            onClick={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault()
                event.stopPropagation()
                suppressClickRef.current = false
              }
            }}
          >
            {note.markerNumber !== undefined && (
              <span className="mr-1 rounded-sm border border-border px-1 text-[9px] text-muted-foreground">
                {note.markerNumber}
              </span>
            )}
            {note.text || 'Note'}
          </button>
        }
      />
      <PopoverContent className="w-56 p-3" align="start">
        <div className="flex flex-col gap-2">
          {note.markerNumber !== undefined && (
            <p className="text-[11px] text-muted-foreground">
              Footnote {note.markerNumber}
            </p>
          )}
          <Input
            value={isOpen ? draftText : note.text}
            onChange={(event) => onDraftTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSave(note)
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onOpenNoteIdChange(null)
              }
            }}
            aria-label="Edit note text"
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onDeleteNote(note.id)
                onOpenNoteIdChange(null)
              }}
            >
              Delete
            </Button>
            <Button type="button" size="sm" onClick={() => onSave(note)}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})

export function ChartNotesLayer({
  notes,
  openNoteId,
  onOpenNoteIdChange,
  onUpdateNote,
  onDeleteNote,
}: ChartNotesLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    noteId: string
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    dragging: boolean
    pointerId: number
  } | null>(null)
  const suppressClickRef = useRef(false)
  const pendingUpdateRef = useRef<{ noteId: string; xPct: number; yPct: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const openNote = useMemo(
    () => notes.find((note) => note.id === openNoteId) ?? null,
    [notes, openNoteId]
  )
  const [draftText, setDraftText] = useState('')

  useEffect(() => {
    if (openNote) {
      setDraftText(openNote.text)
    }
  }, [openNote])

  const handleSave = useCallback((note: ChartNote) => {
    const nextText = draftText.trim() || 'Note'
    onUpdateNote(note.id, { text: nextText })
    onOpenNoteIdChange(null)
  }, [draftText, onOpenNoteIdChange, onUpdateNote])

  const flushPendingUpdate = useCallback(() => {
    if (!pendingUpdateRef.current) return
    const { noteId, xPct, yPct } = pendingUpdateRef.current
    onUpdateNote(noteId, { xPct, yPct })
    pendingUpdateRef.current = null
    rafRef.current = null
  }, [onUpdateNote])

  const scheduleUpdate = useCallback((noteId: string, xPct: number, yPct: number) => {
    pendingUpdateRef.current = { noteId, xPct, yPct }
    if (rafRef.current === null) {
      rafRef.current = window.requestAnimationFrame(flushPendingUpdate)
    }
  }, [flushPendingUpdate])

  return (
    <div ref={layerRef} className="absolute inset-0 pointer-events-none">
      {notes.map((note) => (
        <ChartNoteItem
          key={note.id}
          note={note}
          isOpen={openNoteId === note.id}
          draftText={draftText}
          layerRef={layerRef}
          dragStateRef={dragStateRef}
          suppressClickRef={suppressClickRef}
          onOpenNoteIdChange={onOpenNoteIdChange}
          onDeleteNote={onDeleteNote}
          onDraftTextChange={setDraftText}
          onSave={handleSave}
          scheduleUpdate={scheduleUpdate}
        />
      ))}
    </div>
  )
}
