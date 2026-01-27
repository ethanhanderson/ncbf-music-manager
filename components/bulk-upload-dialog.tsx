'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ButtonGroup } from '@/components/ui/button-group'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Upload02Icon,
  CloudUploadIcon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  AlertCircleIcon,
  Loading01Icon,
  Delete02Icon,
  InformationCircleIcon,
  Copy01Icon,
  ArrowDataTransferHorizontalIcon,
} from '@hugeicons/core-free-icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { type MusicGroup } from '@/lib/supabase/server'
import {
  createSongFromFile,
  checkForDuplicateSong,
  extractTextFromFile,
  revalidateSongPaths,
  type DuplicateCheckResult,
} from '@/lib/actions/songs'
import { cn } from '@/lib/utils'

type UploadStatus = 'pending' | 'checking' | 'duplicate' | 'uploading' | 'success' | 'error' | 'skipped'
type DuplicateAction = 'skip' | 'duplicate' | 'override'

interface QueuedFile {
  id: string
  file: File
  status: UploadStatus
  error?: string
  songId?: string
  // Duplicate detection
  extractedText?: string
  songInfo?: {
    title?: string
    defaultKey?: string
    ccliId?: string
    artist?: string
    linkUrl?: string
  }
  duplicateInfo?: DuplicateCheckResult
  duplicateAction?: DuplicateAction
}

interface BulkUploadDialogProps {
  groupId?: string
  groupSlug?: string
  groups?: MusicGroup[]
  defaultGroupSlug?: string
  /** Optional custom trigger element */
  trigger?: React.ReactElement
  /** If providing a non-<button> trigger (e.g. Card), set this to false */
  triggerNativeButton?: boolean
}

const MAX_CONCURRENT_UPLOADS = 5

export function BulkUploadDialog({
  groupId,
  groupSlug,
  groups,
  defaultGroupSlug,
  trigger,
  triggerNativeButton = true,
}: BulkUploadDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectedGroupSlug, setSelectedGroupSlug] = useState(
    defaultGroupSlug ?? groups?.[0]?.slug ?? groupSlug ?? ''
  )
  const [globalDuplicateAction, setGlobalDuplicateAction] = useState<DuplicateAction | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const abortControllerRef = useRef<AbortController | null>(null)

  const supportedFormats = ['.txt', '.rtf', '.docx', '.pdf']

  const activeGroup: { id: string; slug: string; name?: string } | null = (() => {
    if (groups?.length) {
      const g = groups.find((x) => x.slug === selectedGroupSlug) ?? groups[0]
      return g ? { id: g.id, slug: g.slug, name: g.name } : null
    }
    if (groupId && groupSlug) return { id: groupId, slug: groupSlug }
    return null
  })()

  // Stats
  const pendingCount = queue.filter((f) => f.status === 'pending').length
  const checkingCount = queue.filter((f) => f.status === 'checking').length
  const duplicateCount = queue.filter((f) => f.status === 'duplicate').length
  const uploadingCount = queue.filter((f) => f.status === 'uploading').length
  const successCount = queue.filter((f) => f.status === 'success').length
  const errorCount = queue.filter((f) => f.status === 'error').length
  const skippedCount = queue.filter((f) => f.status === 'skipped').length

  // Files ready to upload (resolved duplicates + pending)
  const readyToUpload = queue.filter(
    (f) => f.status === 'pending' || (f.status === 'duplicate' && f.duplicateAction)
  )

  function resetState() {
    setQueue([])
    setIsProcessing(false)
    setDragOver(false)
    setGlobalDuplicateAction(null)
    abortControllerRef.current = null
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return

    const newFiles: QueuedFile[] = Array.from(files)
      .filter((file) => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase()
        return supportedFormats.includes(ext)
      })
      .map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        status: 'pending' as const,
      }))

    setQueue((prev) => [...prev, ...newFiles])
    
    // Auto-check for duplicates after adding files
    if (activeGroup && newFiles.length > 0) {
      checkDuplicates(newFiles)
    }
  }

  async function checkDuplicates(filesToCheck: QueuedFile[]) {
    if (!activeGroup) return

    setIsProcessing(true)

    for (const queuedFile of filesToCheck) {
      // Mark as checking
      setQueue((prev) =>
        prev.map((f) =>
          f.id === queuedFile.id ? { ...f, status: 'checking' as const } : f
        )
      )

      try {
        // Extract text from file
        const formData = new FormData()
        formData.append('file', queuedFile.file)
        const extractResult = await extractTextFromFile(formData)

        if (!extractResult.success) {
          setQueue((prev) =>
            prev.map((f) =>
              f.id === queuedFile.id
                ? { ...f, status: 'error' as const, error: extractResult.error }
                : f
            )
          )
          continue
        }

        const title = extractResult.title || queuedFile.file.name.split('.').slice(0, -1).join('.')
        
        // Check for duplicate
        const duplicateCheck = await checkForDuplicateSong(
          activeGroup.id,
          title,
          extractResult.text
        )

        if (duplicateCheck.isDuplicate) {
          setQueue((prev) =>
            prev.map((f) =>
              f.id === queuedFile.id
                ? {
                    ...f,
                    status: 'duplicate' as const,
                    extractedText: extractResult.text,
                    songInfo: {
                      title: extractResult.title,
                      defaultKey: extractResult.defaultKey,
                      ccliId: extractResult.ccliId,
                      artist: extractResult.artist,
                      linkUrl: extractResult.linkUrl,
                    },
                    duplicateInfo: duplicateCheck,
                    // Auto-apply global action if set
                    duplicateAction: globalDuplicateAction || undefined,
                  }
                : f
            )
          )
        } else {
          // No duplicate, ready to upload
          setQueue((prev) =>
            prev.map((f) =>
              f.id === queuedFile.id
                ? {
                    ...f,
                    status: 'pending' as const,
                    extractedText: extractResult.text,
                    songInfo: {
                      title: extractResult.title,
                      defaultKey: extractResult.defaultKey,
                      ccliId: extractResult.ccliId,
                      artist: extractResult.artist,
                      linkUrl: extractResult.linkUrl,
                    },
                  }
                : f
            )
          )
        }
      } catch {
        setQueue((prev) =>
          prev.map((f) =>
            f.id === queuedFile.id
              ? { ...f, status: 'error' as const, error: 'Failed to check for duplicates' }
              : f
          )
        )
      }
    }

    setIsProcessing(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFilesSelected(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFilesSelected(e.dataTransfer.files)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function removeFile(id: string) {
    setQueue((prev) => prev.filter((f) => f.id !== id))
  }

  function setDuplicateAction(id: string, action: DuplicateAction) {
    setQueue((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, duplicateAction: action } : f
      )
    )
  }

  function applyGlobalDuplicateAction(action: DuplicateAction) {
    setGlobalDuplicateAction(action)
    setQueue((prev) =>
      prev.map((f) =>
        f.status === 'duplicate' ? { ...f, duplicateAction: action } : f
      )
    )
  }

  function clearCompleted() {
    setQueue((prev) => prev.filter((f) => f.status !== 'success' && f.status !== 'skipped'))
  }

  function clearAll() {
    if (isProcessing) {
      abortControllerRef.current?.abort()
    }
    resetState()
  }

  function confirmCancelProcessing() {
    if (isProcessing) {
      abortControllerRef.current?.abort()
    }
    resetState()
    setShowCancelConfirm(false)
    setIsOpen(false)
  }

  const uploadFile = useCallback(
    async (queuedFile: QueuedFile): Promise<void> => {
      if (!activeGroup) return

      // Handle skip action
      if (queuedFile.duplicateAction === 'skip') {
        setQueue((prev) =>
          prev.map((f) =>
            f.id === queuedFile.id ? { ...f, status: 'skipped' as const } : f
          )
        )
        return
      }

      setQueue((prev) =>
        prev.map((f) =>
          f.id === queuedFile.id ? { ...f, status: 'uploading' as const } : f
        )
      )

      try {
        const formData = new FormData()
        formData.append('file', queuedFile.file)

        const result = await createSongFromFile(
          activeGroup.id,
          activeGroup.slug,
          formData,
          {
            overrideExistingId:
              queuedFile.duplicateAction === 'override'
                ? queuedFile.duplicateInfo?.existingSong?.id
                : undefined,
            extractedText: queuedFile.extractedText,
            title: queuedFile.songInfo?.title,
            defaultKey: queuedFile.songInfo?.defaultKey,
            ccliId: queuedFile.songInfo?.ccliId,
            artist: queuedFile.songInfo?.artist,
            linkUrl: queuedFile.songInfo?.linkUrl,
          }
        )

        if (result.success && result.song) {
          setQueue((prev) =>
            prev.map((f) =>
              f.id === queuedFile.id
                ? { ...f, status: 'success' as const, songId: result.song?.id }
                : f
            )
          )
        } else {
          setQueue((prev) =>
            prev.map((f) =>
              f.id === queuedFile.id
                ? { ...f, status: 'error' as const, error: result.error || 'Upload failed' }
                : f
            )
          )
        }
      } catch {
        setQueue((prev) =>
          prev.map((f) =>
            f.id === queuedFile.id
              ? { ...f, status: 'error' as const, error: 'Upload failed' }
              : f
          )
        )
      }
    },
    [activeGroup]
  )

  async function startUpload() {
    if (!activeGroup) return

    // Get files ready to upload
    const filesToUpload = queue.filter(
      (f) =>
        f.status === 'pending' ||
        (f.status === 'duplicate' && f.duplicateAction && f.duplicateAction !== 'skip')
    )

    // Mark skipped files
    const filesToSkip = queue.filter(
      (f) => f.status === 'duplicate' && f.duplicateAction === 'skip'
    )
    if (filesToSkip.length > 0) {
      setQueue((prev) =>
        prev.map((f) =>
          filesToSkip.some((s) => s.id === f.id)
            ? { ...f, status: 'skipped' as const }
            : f
        )
      )
    }

    if (filesToUpload.length === 0) {
      router.refresh()
      return
    }

    setIsProcessing(true)
    abortControllerRef.current = new AbortController()

    // Process in batches with concurrent limit
    const executing: Promise<void>[] = []

    for (const file of filesToUpload) {
      if (abortControllerRef.current?.signal.aborted) break

      const promise = uploadFile(file).then(() => {
        executing.splice(executing.indexOf(promise), 1)
      })
      executing.push(promise)

      if (executing.length >= MAX_CONCURRENT_UPLOADS) {
        await Promise.race(executing)
      }
    }

    await Promise.all(executing)
    
    // Revalidate paths after all uploads complete
    if (activeGroup) {
      await revalidateSongPaths(activeGroup.slug)
    }
    
    setIsProcessing(false)
    router.refresh()
  }

  function retryFailed() {
    setQueue((prev) =>
      prev.map((f) =>
        f.status === 'error' ? { ...f, status: 'pending' as const, error: undefined } : f
      )
    )
  }

  // Check if there are unresolved duplicates
  const unresolvedDuplicates = queue.filter(
    (f) => f.status === 'duplicate' && !f.duplicateAction
  )

  const canStartUpload =
    !isProcessing &&
    activeGroup &&
    (pendingCount > 0 || (duplicateCount > 0 && unresolvedDuplicates.length === 0))

  return (
    <>
      <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && isProcessing) {
          setShowCancelConfirm(true)
          return
        }
        if (!open) {
          resetState()
        }
        setIsOpen(open)
      }}
    >
      <DialogTrigger
        nativeButton={trigger ? triggerNativeButton : true}
        render={trigger || <Button variant="secondary" size="sm" />}
      >
        {!trigger && (
          <>
            <HugeiconsIcon icon={Upload02Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Bulk Upload
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Upload Songs</DialogTitle>
          <DialogDescription>
            Add multiple lyric files at once. We’ll check for duplicates before uploading to{' '}
            <span className="text-foreground font-medium">
              {activeGroup?.name ?? activeGroup?.slug ?? 'this group'}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 flex-1 min-h-0">
          {groups && groups.length > 1 && (
            <div className="grid gap-2">
              <Label>Group</Label>
              <Select
                value={selectedGroupSlug}
                onValueChange={(value) => setSelectedGroupSlug(value ?? '')}
                disabled={isProcessing || queue.length > 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose group">
                    {(value) => {
                      if (!value) return null
                      return groups?.find((g) => g.slug === value)?.name ?? value
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent side="bottom" align="start" sideOffset={4}>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.slug}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                You can’t change the group once files are queued.
              </p>
            </div>
          )}

          {/* Drop zone */}
          <Card size="sm" className="py-0">
            <CardContent className="px-0">
              <div
                className={cn(
                  "border border-dashed px-4 py-6 text-center transition-colors cursor-pointer select-none",
                  dragOver
                    ? "bg-muted border-foreground/20"
                    : "bg-background border-border hover:bg-muted/40",
                  isProcessing && "opacity-60 pointer-events-none"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={supportedFormats.join(',')}
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isProcessing}
                  multiple
                />
                <div className="mx-auto max-w-md grid gap-2">
                  <div className="mx-auto size-9 grid place-items-center border bg-muted/40">
                    <HugeiconsIcon
                      icon={CloudUploadIcon}
                      strokeWidth={2}
                      className="size-4 text-muted-foreground"
                    />
                  </div>
                  <div className="grid gap-0.5">
                    <p className="text-sm font-medium">Add files</p>
                    <p className="text-xs text-muted-foreground">
                      Drop files here, or click to browse.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supported: {supportedFormats.join(', ')} · You can select multiple files.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Queue list */}
          {queue.length > 0 && (
            <Card size="sm" className="flex-1 min-h-0">
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-0.5">
                    <CardTitle>Queue</CardTitle>
                    <CardDescription>
                      Resolve duplicates, then upload. You can close the dialog anytime.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Badge variant="outline">Total {queue.length}</Badge>
                    {checkingCount > 0 && <Badge variant="secondary">Checking {checkingCount}</Badge>}
                    {duplicateCount > 0 && <Badge variant="outline">Duplicates {duplicateCount}</Badge>}
                    {pendingCount > 0 && <Badge variant="secondary">Ready {pendingCount}</Badge>}
                    {uploadingCount > 0 && <Badge variant="secondary">Uploading {uploadingCount}</Badge>}
                    {successCount > 0 && <Badge variant="outline">Done {successCount}</Badge>}
                    {skippedCount > 0 && <Badge variant="outline">Skipped {skippedCount}</Badge>}
                    {errorCount > 0 && <Badge variant="destructive">Failed {errorCount}</Badge>}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="min-h-0 flex flex-col gap-3">
                {/* Global duplicate actions */}
                {duplicateCount > 0 && unresolvedDuplicates.length > 0 && (
                  <div className="border bg-muted/40 p-3">
                    <div className="flex items-start gap-2">
                      <HugeiconsIcon
                        icon={InformationCircleIcon}
                        strokeWidth={2}
                        className="mt-0.5 size-4 text-muted-foreground"
                      />
                      <div className="grid gap-2 flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {unresolvedDuplicates.length} duplicate file
                          {unresolvedDuplicates.length !== 1 ? 's' : ''} need an action
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Choose what to do with duplicates found in this group.
                        </p>
                        <ButtonGroup className="flex-wrap gap-2 w-full justify-start">
                          <Button size="xs" variant="outline" onClick={() => applyGlobalDuplicateAction('skip')}>
                            Skip all
                          </Button>
                          <Button size="xs" variant="outline" onClick={() => applyGlobalDuplicateAction('duplicate')}>
                            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3.5" />
                            Create duplicates
                          </Button>
                          <Button size="xs" variant="outline" onClick={() => applyGlobalDuplicateAction('override')}>
                            <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} className="size-3.5" />
                            Override existing
                          </Button>
                        </ButtonGroup>
                      </div>
                    </div>
                  </div>
                )}

                {/* Overall progress bar */}
                {isProcessing && uploadingCount > 0 && (
                  <div className="grid gap-1.5">
                    <div className="h-2 bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{
                          width: `${((successCount + errorCount + skippedCount) / queue.length) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Processing {successCount + errorCount + skippedCount + uploadingCount} of {queue.length}
                    </p>
                  </div>
                )}

                {/* File list */}
                <div className="flex-1 min-h-0 overflow-y-auto border">
                  <div className="divide-y">
                    {queue.map((queuedFile) => (
                      <div
                        key={queuedFile.id}
                        className={cn(
                          "flex items-start gap-3 px-3 py-2",
                          queuedFile.status === 'error' && "bg-destructive/5 border-l-2 border-l-destructive",
                          queuedFile.status === 'duplicate' && "bg-muted/40 border-l-2 border-l-foreground/20",
                          queuedFile.status === 'success' && "bg-primary/5 border-l-2 border-l-primary/40",
                          (queuedFile.status === 'checking' || queuedFile.status === 'uploading') &&
                            "bg-muted/30 border-l-2 border-l-primary/20",
                          (queuedFile.status === 'pending' || queuedFile.status === 'skipped') &&
                            "bg-background border-l-2 border-l-border"
                        )}
                      >
                        {/* Status icon */}
                        <div className="shrink-0 mt-0.5">
                          {queuedFile.status === 'pending' && (
                            <div className="size-4 rounded-none border-2 border-muted-foreground/30" />
                          )}
                          {(queuedFile.status === 'checking' || queuedFile.status === 'uploading') && (
                            <HugeiconsIcon
                              icon={Loading01Icon}
                              strokeWidth={2}
                              className="size-4 text-muted-foreground animate-spin"
                            />
                          )}
                          {queuedFile.status === 'duplicate' && (
                            <HugeiconsIcon
                              icon={InformationCircleIcon}
                              strokeWidth={2}
                              className="size-4 text-muted-foreground"
                            />
                          )}
                          {queuedFile.status === 'success' && (
                            <HugeiconsIcon
                              icon={CheckmarkCircle02Icon}
                              strokeWidth={2}
                              className="size-4 text-muted-foreground"
                            />
                          )}
                          {queuedFile.status === 'skipped' && (
                            <HugeiconsIcon
                              icon={Cancel01Icon}
                              strokeWidth={2}
                              className="size-4 text-muted-foreground"
                            />
                          )}
                          {queuedFile.status === 'error' && (
                            <HugeiconsIcon
                              icon={AlertCircleIcon}
                              strokeWidth={2}
                              className="size-4 text-destructive"
                            />
                          )}
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0 grid gap-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-medium">{queuedFile.file.name}</p>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {(queuedFile.file.size / 1024).toFixed(1)} KB
                            </span>
                          </div>

                          {queuedFile.status === 'checking' && (
                            <p className="text-xs text-muted-foreground">Checking for duplicates…</p>
                          )}

                          {queuedFile.status === 'uploading' && (
                            <p className="text-xs text-muted-foreground">Uploading…</p>
                          )}

                          {queuedFile.status === 'duplicate' && queuedFile.duplicateInfo && (
                            <div className="grid gap-1.5">
                              <p className="text-xs text-muted-foreground">
                                {queuedFile.duplicateInfo.matchType === 'title_and_lyrics'
                                  ? 'Exact match (title & lyrics)'
                                  : 'Title matches an existing song'}
                                {queuedFile.duplicateInfo.existingSong && (
                                  <span className="text-muted-foreground">
                                    {' '}— {queuedFile.duplicateInfo.existingSong.title}
                                  </span>
                                )}
                              </p>

                              {!queuedFile.duplicateAction ? (
                                <ButtonGroup className="w-full">
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => setDuplicateAction(queuedFile.id, 'skip')}
                                  >
                                    Skip
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => setDuplicateAction(queuedFile.id, 'duplicate')}
                                  >
                                    Create duplicate
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => setDuplicateAction(queuedFile.id, 'override')}
                                  >
                                    Override
                                  </Button>
                                </ButtonGroup>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Action:{' '}
                                  {queuedFile.duplicateAction === 'skip'
                                    ? 'Skip'
                                    : queuedFile.duplicateAction === 'duplicate'
                                      ? 'Create duplicate'
                                      : 'Override existing'}
                                </p>
                              )}
                            </div>
                          )}

                          {queuedFile.status === 'skipped' && (
                            <p className="text-xs text-muted-foreground">Skipped (duplicate)</p>
                          )}

                          {queuedFile.error && (
                            <p className="text-xs text-destructive truncate">{queuedFile.error}</p>
                          )}
                        </div>

                        {/* Remove button */}
                        {(queuedFile.status === 'pending' || queuedFile.status === 'duplicate') &&
                          !isProcessing && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="shrink-0 mt-0.5"
                              onClick={() => removeFile(queuedFile.id)}
                              aria-label="Remove file"
                            >
                              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                            </Button>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="justify-between gap-2">
                <div className="flex gap-2">
                  {(successCount > 0 || skippedCount > 0) && (
                    <Button variant="ghost" size="sm" onClick={clearCompleted} disabled={isProcessing}>
                      Clear completed
                    </Button>
                  )}
                  {errorCount > 0 && !isProcessing && (
                    <Button variant="ghost" size="sm" onClick={retryFailed}>
                      Retry failed
                    </Button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {unresolvedDuplicates.length > 0
                    ? `${unresolvedDuplicates.length} duplicate${unresolvedDuplicates.length !== 1 ? 's' : ''} unresolved`
                    : null}
                </div>
              </CardFooter>
            </Card>
          )}
        </div>

        <DialogFooter className="shrink-0 sm:justify-between">
          <div>
            {queue.length > 0 && !isProcessing && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                Clear all
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <DialogClose nativeButton render={<Button variant="outline" />}>
              {isProcessing ? 'Cancel' : 'Close'}
            </DialogClose>
            <Button onClick={startUpload} disabled={!canStartUpload}>
              {isProcessing ? (
                <>
                  <HugeiconsIcon
                    icon={Loading01Icon}
                    strokeWidth={2}
                    className="mr-1.5 h-4 w-4 animate-spin"
                  />
                  Processing...
                </>
              ) : unresolvedDuplicates.length > 0 ? (
                'Resolve Duplicates First'
              ) : (
                <>
                  <HugeiconsIcon icon={Upload02Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                  Upload {readyToUpload.length} {readyToUpload.length === 1 ? 'file' : 'files'}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel bulk upload?</AlertDialogTitle>
            <AlertDialogDescription>
              Uploads are still processing. Cancelling will stop the remaining files in the queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Keep uploading</AlertDialogCancel>
            <AlertDialogAction size="sm" variant="destructive" onClick={confirmCancelProcessing}>
              Cancel uploads
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
