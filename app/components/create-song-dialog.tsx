'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createSong,
  checkForDuplicateSong,
  extractTextFromFile,
  type DuplicateCheckResult,
} from '@/lib/actions/songs'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CloudUploadIcon,
  Loading01Icon,
  ArrowLeft01Icon,
  InformationCircleIcon,
  Copy01Icon,
  ArrowDataTransferHorizontalIcon,
} from '@hugeicons/core-free-icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type MusicGroup } from '@/lib/supabase/server'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface CreateSongDialogProps {
  groupId?: string
  groupSlug?: string
  groups?: MusicGroup[]
  defaultGroupSlug?: string
  trigger?: React.ReactElement
}

type DuplicateAction = 'skip' | 'duplicate' | 'override'

interface PendingUpload {
  file?: File
  title: string
  lyrics?: string
  extractedText?: string
  duplicateInfo: DuplicateCheckResult
}

export function CreateSongDialog({
  groupId,
  groupSlug,
  groups,
  defaultGroupSlug,
  trigger,
}: CreateSongDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'upload' | 'manual'>('upload')
  const [isLoading, setIsLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroupSlug, setSelectedGroupSlug] = useState(
    defaultGroupSlug ?? groups?.[0]?.slug ?? groupSlug ?? ''
  )
  
  // Duplicate detection state
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const supportedFormats = ['.txt', '.rtf', '.docx', '.pdf']

  const activeGroup: { id: string; slug: string; name?: string } | null = (() => {
    if (groups?.length) {
      const g = groups.find((x) => x.slug === selectedGroupSlug) ?? groups[0]
      return g ? { id: g.id, slug: g.slug, name: g.name } : null
    }
    if (groupId && groupSlug) return { id: groupId, slug: groupSlug }
    return null
  })()

  function resetState(open = false) {
    setIsOpen(open)
    setMode('upload')
    setIsLoading(false)
    setError(null)
    setDragOver(false)
    setPendingUpload(null)
    setShowDuplicateDialog(false)
  }

  async function handleFileUpload(file: File) {
    setIsLoading(true)
    setError(null)

    if (!activeGroup) {
      setError('Please choose a group')
      setIsLoading(false)
      return
    }

    try {
      // First extract text from the file
      const formData = new FormData()
      formData.append('file', file)
      const extractResult = await extractTextFromFile(formData)

      if (!extractResult.success) {
        setError(extractResult.error || 'Failed to extract text from file')
        setIsLoading(false)
        return
      }

      const title = extractResult.title || file.name.split('.').slice(0, -1).join('.')

      // Check for duplicates
      const duplicateCheck = await checkForDuplicateSong(
        activeGroup.id,
        title,
        extractResult.text
      )

      if (duplicateCheck.isDuplicate) {
        // Show duplicate dialog
        setPendingUpload({
          file,
          title,
          extractedText: extractResult.text,
          duplicateInfo: duplicateCheck,
        })
        setShowDuplicateDialog(true)
        setIsLoading(false)
        return
      }

      // No duplicate, proceed with creation
      await proceedWithCreation(file)
    } catch (error) {
      console.error('Error handling file upload:', error)
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  async function handleManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!activeGroup) {
      setError('Please choose a group')
      setIsLoading(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    const title = formData.get('title') as string
    const lyrics = formData.get('lyrics') as string | null

    if (!title?.trim()) {
      setError('Title is required')
      setIsLoading(false)
      return
    }

    try {
      // Check for duplicates
      const duplicateCheck = await checkForDuplicateSong(
        activeGroup.id,
        title.trim(),
        lyrics?.trim()
      )

      if (duplicateCheck.isDuplicate) {
        // Show duplicate dialog
        setPendingUpload({
          title: title.trim(),
          lyrics: lyrics?.trim() || undefined,
          duplicateInfo: duplicateCheck,
        })
        setShowDuplicateDialog(true)
        setIsLoading(false)
        return
      }

      // No duplicate, proceed with creation
      await proceedWithManualCreation(formData)
    } catch (error) {
      console.error('Error handling manual submit:', error)
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  async function proceedWithCreation(file: File, overrideExistingId?: string) {
    if (!activeGroup) return

    setIsLoading(true)
    setShowDuplicateDialog(false)

    const formData = new FormData()
    formData.append('file', file)
    if (overrideExistingId) {
      formData.append('overrideExistingId', overrideExistingId)
    }

    try {
      const result = await createSong(activeGroup.id, activeGroup.slug, formData)

      if (result.success && result.song) {
        resetState(false)
        router.push(`/groups/${activeGroup.slug}/songs/${result.song.id}`)
      } else {
        setError(result.error || 'Failed to create song from file')
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error creating song from file:', error)
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  async function proceedWithManualCreation(formData: FormData, overrideExistingId?: string) {
    if (!activeGroup) return

    setIsLoading(true)
    setShowDuplicateDialog(false)

    if (overrideExistingId) {
      formData.append('overrideExistingId', overrideExistingId)
    }

    try {
      const result = await createSong(activeGroup.id, activeGroup.slug, formData)

      if (result.success && result.song) {
        resetState(false)
        router.push(`/groups/${activeGroup.slug}/songs/${result.song.id}`)
      } else {
        setError(result.error || 'Failed to create song')
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error creating song manually:', error)
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  async function handleDuplicateAction(action: DuplicateAction) {
    if (!pendingUpload || !activeGroup) return

    if (action === 'skip') {
      // Cancel and close
      resetState(false)
      return
    }

    const overrideId = action === 'override' 
      ? pendingUpload.duplicateInfo.existingSong?.id 
      : undefined

    if (pendingUpload.file) {
      await proceedWithCreation(pendingUpload.file, overrideId)
    } else {
      const formData = new FormData()
      formData.append('title', pendingUpload.title)
      if (pendingUpload.lyrics) formData.append('lyrics', pendingUpload.lyrics)
      await proceedWithManualCreation(formData, overrideId)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  // Duplicate confirmation dialog content
  if (showDuplicateDialog && pendingUpload) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && resetState(false)}>
        <DialogTrigger render={<Button size="sm" />}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
          Add Song
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="h-5 w-5 text-amber-500" />
              Duplicate Song Found
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                {pendingUpload.duplicateInfo.matchType === 'title_and_lyrics'
                  ? 'A song with the same title and lyrics already exists in this group.'
                  : 'A song with the same title already exists in this group.'}
              </p>
                {pendingUpload.duplicateInfo.existingSong && (
                <div className="text-sm">
                  <p className="font-medium text-foreground">
                    Existing: {pendingUpload.duplicateInfo.existingSong.title}
                  </p>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              What would you like to do?
            </p>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => handleDuplicateAction('skip')}
                disabled={isLoading}
              >
                <div className="text-left">
                  <p className="font-medium">Cancel</p>
                  <p className="text-xs text-muted-foreground">Don&apos;t create this song</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => handleDuplicateAction('duplicate')}
                disabled={isLoading}
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="mr-3 h-4 w-4 shrink-0" />
                <div className="text-left">
                  <p className="font-medium">Create Duplicate</p>
                  <p className="text-xs text-muted-foreground">Add as a new song anyway</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => handleDuplicateAction('override')}
                disabled={isLoading}
              >
                <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} className="mr-3 h-4 w-4 shrink-0" />
                <div className="text-left">
                  <p className="font-medium">Replace Existing</p>
                  <p className="text-xs text-muted-foreground">Update the existing song&apos;s slides</p>
                </div>
              </Button>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <HugeiconsIcon icon={Loading01Icon} strokeWidth={2} className="h-4 w-4 animate-spin" />
                Processing...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetState(false)
          return
        }
        setIsOpen(true)
      }}
    >
      <DialogTrigger
        nativeButton={trigger ? false : true}
        render={trigger || <Button size="sm" />}
      >
        {!trigger && (
          <>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Add Song
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Song</DialogTitle>
        </DialogHeader>

        {groups && groups.length > 1 && (
          <div className="space-y-2 mb-4">
            <Label>Group</Label>
            <Select
              value={selectedGroupSlug}
              onValueChange={(value) => setSelectedGroupSlug(value ?? "")}
            >
              <SelectTrigger className="h-10 w-full data-[size=default]:h-10">
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
          </div>
        )}
        
        {mode === 'upload' ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div
                className={`border-2 border-dashed rounded-none p-8 text-center transition-colors cursor-pointer ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
                } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
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
                  disabled={isLoading}
                />
                
                {isLoading ? (
                  <div className="space-y-2">
                    <HugeiconsIcon
                      icon={Loading01Icon}
                      strokeWidth={2}
                      className="mx-auto h-8 w-8 text-muted-foreground animate-spin"
                    />
                    <p className="text-sm text-muted-foreground">Processing file...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={2} className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop a file here or click to upload
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Supported: {supportedFormats.join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
            </div>

            <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setMode('manual')}
                disabled={isLoading}
            >
                Enter Song Manually
            </Button>

            <DialogFooter>
              <DialogClose nativeButton render={<Button variant="outline" />}>Cancel</DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Song Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g., Amazing Grace"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lyrics">Lyrics / Slide Text</Label>
              <Textarea
                id="lyrics"
                name="lyrics"
                placeholder="Enter song lyrics or slide text here..."
                className="min-h-[150px]"
              />
              <p className="text-xs text-muted-foreground">
                This text will be used to generate slides.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter className="pt-2 sm:justify-between sm:flex-row-reverse">
              <div className="flex gap-2">
                <DialogClose nativeButton render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <HugeiconsIcon icon={Loading01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Add Song'
                  )}
                </Button>
              </div>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setMode('upload')
                  setError(null)
                }}
                className="text-muted-foreground justify-self-start"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                Back to Upload
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
