'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SongRevision, SongSlide } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { RefreshIcon } from '@hugeicons/core-free-icons'
import { restoreSongRevision } from '@/lib/actions/song-revisions'

const SLIDE_LABELS: Record<SongSlide['label'], string> = {
  title: 'Title',
  verse: 'Verse',
  chorus: 'Chorus',
  bridge: 'Bridge',
  'pre-chorus': 'Pre-Chorus',
  intro: 'Intro',
  outro: 'Outro',
  tag: 'Tag',
  interlude: 'Interlude',
  custom: 'Ungrouped',
}

const GROUP_STYLE_CLASSES: Record<
  SongSlide['label'],
  { bg: string; text: string; border: string }
> = {
  title: { bg: 'bg-primary', text: 'text-primary-foreground', border: 'border-primary' },
  verse: { bg: 'bg-secondary', text: 'text-secondary-foreground', border: 'border-secondary' },
  chorus: { bg: 'bg-accent', text: 'text-accent-foreground', border: 'border-accent' },
  bridge: { bg: 'bg-destructive', text: 'text-destructive-foreground', border: 'border-destructive' },
  'pre-chorus': { bg: 'bg-muted', text: 'text-foreground', border: 'border-border' },
  intro: { bg: 'bg-card', text: 'text-card-foreground', border: 'border-border' },
  outro: { bg: 'bg-card', text: 'text-card-foreground', border: 'border-border' },
  tag: { bg: 'bg-popover', text: 'text-popover-foreground', border: 'border-border' },
  interlude: { bg: 'bg-muted/70', text: 'text-foreground', border: 'border-border' },
  custom: { bg: 'bg-muted', text: 'text-foreground', border: 'border-border' },
}

interface SongRevisionHistoryCardProps {
  revisions: SongRevision[]
  currentSlides: SongSlide[]
  groupId: string
  groupSlug: string
}

function parseSlides(value: unknown): SongSlide[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const slide = entry as {
        id?: string
        label?: SongSlide['label']
        customLabel?: string | null
        lines?: string[]
      }
      if (!slide.label || !Array.isArray(slide.lines)) return null
      return {
        id: slide.id ?? crypto.randomUUID(),
        label: slide.label,
        customLabel: slide.customLabel ?? undefined,
        lines: slide.lines.length > 0 ? slide.lines : [''],
      }
    })
    .filter((entry): entry is SongSlide => Boolean(entry))
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return (
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) + ` at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  )
}

export function SongRevisionHistoryCard({
  revisions,
  currentSlides,
  groupId,
  groupSlug,
}: SongRevisionHistoryCardProps) {
  const router = useRouter()
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const selectedRevision = useMemo(
    () => revisions.find((revision) => revision.id === selectedRevisionId) ?? null,
    [revisions, selectedRevisionId]
  )
  const previewSlides = useMemo(
    () => (selectedRevision ? parseSlides(selectedRevision.slides) : []),
    [selectedRevision]
  )

  const currentPreviewSlides = useMemo(() => currentSlides ?? [], [currentSlides])
  const changeSummary = useMemo(() => {
    const currentCount = currentPreviewSlides.length
    const revisionCount = previewSlides.length
    const currentLines = currentPreviewSlides.reduce((total, slide) => total + (slide.lines?.length ?? 0), 0)
    const revisionLines = previewSlides.reduce((total, slide) => total + (slide.lines?.length ?? 0), 0)
    const overlap = Math.min(currentCount, revisionCount)
    let changedSlides = 0
    for (let index = 0; index < overlap; index += 1) {
      const currentSlide = currentPreviewSlides[index]
      const revisionSlide = previewSlides[index]
      const currentText = (currentSlide?.lines ?? []).join('\n')
      const revisionText = (revisionSlide?.lines ?? []).join('\n')
      const currentLabel = `${currentSlide?.label ?? ''}:${currentSlide?.customLabel ?? ''}`
      const revisionLabel = `${revisionSlide?.label ?? ''}:${revisionSlide?.customLabel ?? ''}`
      if (currentText !== revisionText || currentLabel !== revisionLabel) {
        changedSlides += 1
      }
    }
    const addedSlides = Math.max(revisionCount - currentCount, 0)
    const removedSlides = Math.max(currentCount - revisionCount, 0)

    return {
      currentCount,
      revisionCount,
      currentLines,
      revisionLines,
      changedSlides,
      addedSlides,
      removedSlides,
    }
  }, [currentPreviewSlides, previewSlides])

  const handleRestore = async () => {
    if (!selectedRevision) return
    setIsRestoring(true)
    setRestoreError(null)
    const result = await restoreSongRevision(selectedRevision.id, groupId, groupSlug)
    if (!result.success) {
      setRestoreError(result.error ?? 'Failed to restore revision')
      setIsRestoring(false)
      return
    }
    setIsRestoring(false)
    setIsConfirmOpen(false)
    setSelectedRevisionId(null)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Version history</CardTitle>
        <Dialog>
          <DialogTrigger
            render={
              <Button variant="outline" size="sm">
                View revisions
              </Button>
            }
          />
          <DialogContent className="sm:max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Song revisions</DialogTitle>
            </DialogHeader>
            {revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No revisions yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] flex-1 min-h-0">
                <div className="space-y-3">
                  {revisions.map((revision, index) => (
                    <button
                      key={revision.id}
                      type="button"
                      className={`w-full rounded-none border px-4 py-3 text-left transition-colors ${
                        selectedRevisionId === revision.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedRevisionId(revision.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">Revision {revisions.length - index}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(revision.created_at)}</div>
                        </div>
                        <Badge variant="outline" className="rounded-none">
                          {revision.title}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="rounded-none border border-border bg-card p-3 flex flex-col min-h-0">
                  {selectedRevision ? (
                    <div className="space-y-3 flex flex-col min-h-0">
                      <Card className="rounded-none">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Revision changes</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <div className="flex items-center justify-between gap-2">
                            <span>Slides</span>
                            <span className="font-medium text-foreground">
                              {changeSummary.currentCount} → {changeSummary.revisionCount}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>Total lines</span>
                            <span className="font-medium text-foreground">
                              {changeSummary.currentLines} → {changeSummary.revisionLines}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>Changed slides</span>
                            <span className="font-medium text-foreground">{changeSummary.changedSlides}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>Added / removed</span>
                            <span className="font-medium text-foreground">
                              +{changeSummary.addedSlides} / -{changeSummary.removedSlides}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Current vs revision</p>
                          <p className="text-xs text-muted-foreground">
                            Revision from {formatDateTime(selectedRevision.created_at)}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setIsConfirmOpen(true)}>
                          <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                          Restore
                        </Button>
                      </div>
                      <ScrollArea className="flex-1 min-h-0 pr-2">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Current</div>
                            {currentPreviewSlides.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No current slides.</p>
                            ) : (
                              currentPreviewSlides.map((slide, index) => (
                                <SlideCard
                                  key={`current-${slide.id}-${index}`}
                                  slide={slide}
                                  index={index}
                                  slides={currentPreviewSlides}
                                />
                              ))
                            )}
                          </div>
                          <div className="space-y-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Revision</div>
                            {previewSlides.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No slides saved for this revision.</p>
                            ) : (
                              previewSlides.map((slide, index) => (
                                <SlideCard
                                  key={`revision-${slide.id}-${index}`}
                                  slide={slide}
                                  index={index}
                                  slides={previewSlides}
                                />
                              ))
                            )}
                          </div>
                        </div>
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Select a revision to preview it.</div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Restore this revision?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will replace the current song info and slides with the selected revision.
            </p>
            {restoreError ? <p className="text-sm text-destructive">{restoreError}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={isRestoring}>
                Cancel
              </Button>
              <Button onClick={handleRestore} disabled={isRestoring}>
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                {isRestoring ? 'Restoring...' : 'Restore'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Versions</span>
          <span className="font-medium text-foreground">{revisions.length}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function SlideCard({ slide, index, slides }: { slide: SongSlide; index: number; slides: SongSlide[] }) {
  const prev = slides[index - 1]
  const isFirstInGroup =
    !prev || prev.label !== slide.label || (prev.customLabel ?? '') !== (slide.customLabel ?? '')
  const label = SLIDE_LABELS[slide.label] ?? 'Slide'

  return (
    <div className={`rounded-none border ${GROUP_STYLE_CLASSES[slide.label].border} bg-card`}>
      <div
        className={`border-b border-border/10 px-3 py-1 text-xs font-medium ${
          GROUP_STYLE_CLASSES[slide.label].bg
        } ${GROUP_STYLE_CLASSES[slide.label].text}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="tabular-nums">{index + 1}</span>
          {isFirstInGroup ? (
            <span className="ml-auto truncate">
              {label}
              {slide.customLabel ? ` ${slide.customLabel}` : ''}
            </span>
          ) : null}
        </div>
      </div>
      <div className="whitespace-pre-wrap px-3 py-2 font-mono text-sm text-foreground/90">
        {(slide.lines ?? []).join('\n') || ' '}
      </div>
    </div>
  )
}
