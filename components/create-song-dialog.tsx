'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SingleFileUploader } from '@/components/single-file-uploader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ButtonGroup } from '@/components/ui/button-group'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import {
  createSong,
  checkForDuplicateSong,
  checkForDuplicateLyrics,
  extractTextFromFile,
  type DuplicateCheckResult,
} from '@/lib/actions/songs'
import { type MusicGroup } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, InformationCircleIcon, Copy01Icon, ArrowDataTransferHorizontalIcon, Loading01Icon } from '@hugeicons/core-free-icons'

interface CreateSongDialogProps {
  groupId?: string
  groupSlug?: string
  groups?: MusicGroup[]
  defaultGroupSlug?: string
  trigger?: React.ReactElement
}

export function CreateSongDialog({
  groupId,
  groupSlug,
  groups,
  defaultGroupSlug,
  trigger,
}: CreateSongDialogProps) {
  const router = useRouter()

  const supportedFormats = ['.txt', '.rtf', '.docx', '.pdf']

  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedGroupSlug, setSelectedGroupSlug] = useState(
    defaultGroupSlug ?? groups?.[0]?.slug ?? groupSlug ?? ''
  )

  const activeGroup: { id: string; slug: string; name?: string } | null = (() => {
    if (groups?.length) {
      const g = groups.find((x) => x.slug === selectedGroupSlug) ?? groups[0]
      return g ? { id: g.id, slug: g.slug, name: g.name } : null
    }
    if (groupId && groupSlug) return { id: groupId, slug: groupSlug }
    return null
  })()

  // Step 1: choose file or skip
  const [fileUploaderKey, setFileUploaderKey] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isParsingFile, setIsParsingFile] = useState(false)

  // Step 2: unified details dialog (used by both flows)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [defaultKey, setDefaultKey] = useState('')
  const [ccliId, setCcliId] = useState('')
  const [artist, setArtist] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [extractedTitle, setExtractedTitle] = useState<string | null>(null)

  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateCheckResult | null>(null)
  const [duplicateDecision, setDuplicateDecision] = useState<'duplicate' | 'override' | null>(null)

  function resetAll(open = false) {
    setIsOpen(open)
    setIsLoading(false)
    setError(null)

    setSelectedFile(null)
    setFileUploaderKey((x) => x + 1)
    setIsParsingFile(false)

    setDetailsOpen(false)
    setTitle('')
    setLyrics('')
    setDefaultKey('')
    setCcliId('')
    setArtist('')
    setLinkUrl('')
    setExtractedTitle(null)
    setDuplicateInfo(null)
    setDuplicateDecision(null)
  }

  function openDetailsManual() {
    setError(null)
    setExtractedTitle(null)
    setTitle('')
    setLyrics('')
    setDefaultKey('')
    setCcliId('')
    setArtist('')
    setLinkUrl('')
    setDuplicateInfo(null)
    setDuplicateDecision(null)
    setSelectedFile(null)
    setDetailsOpen(true)
  }

  async function openDetailsFromFile() {
    if (!activeGroup) {
      setError('Please choose a group')
      return
    }
    if (!selectedFile) {
      setError('Please choose a file')
      return
    }

    setIsLoading(true)
    setError(null)
    // keep any pre-check duplicateInfo/decision from file selection

    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      const extractResult = await extractTextFromFile(fd)

      if (!extractResult.success) {
        setError(extractResult.error || 'Failed to extract text from file')
        setIsLoading(false)
        return
      }

      const parsedTitle = (extractResult.title || selectedFile.name.split('.').slice(0, -1).join('.')).trim()
      const parsedLyrics = (extractResult.text ?? '').trim()

      setExtractedTitle(parsedTitle || null)
      setTitle(parsedTitle)
      setLyrics(parsedLyrics)
      setDefaultKey('')
      setCcliId('')
      setArtist('')
      setLinkUrl('')

      if (extractResult.defaultKey) setDefaultKey(extractResult.defaultKey)
      if (extractResult.ccliId) setCcliId(extractResult.ccliId)
      if (extractResult.artist) setArtist(extractResult.artist)
      if (extractResult.linkUrl) setLinkUrl(extractResult.linkUrl)

      setDetailsOpen(true)
      setIsLoading(false)
    } catch (err) {
      console.error('Error parsing file:', err)
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  async function handleCreate() {
    if (!activeGroup) {
      setError('Please choose a group')
      return
    }
    if (!title.trim()) {
      setError('Title is required')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Check duplicates before creating (same flow for file/manual)
      if (!duplicateDecision) {
        const check = await checkForDuplicateSong(activeGroup.id, title.trim(), lyrics.trim() || undefined)
        if (check.isDuplicate) {
          setDuplicateInfo(check)
          setIsLoading(false)
          return
        }
        setDuplicateInfo(null)
      }

      const overrideExistingId =
        duplicateDecision === 'override' ? duplicateInfo?.existingSong?.id ?? null : null

      const formData = new FormData()
      formData.append('title', title.trim())
      formData.append('lyrics', lyrics)

      if (defaultKey.trim()) formData.append('default_key', defaultKey.trim())
      if (ccliId.trim()) formData.append('ccli_id', ccliId.trim())
      if (artist.trim()) formData.append('artist', artist.trim())
      if (linkUrl.trim()) formData.append('link_url', linkUrl.trim())

      if (overrideExistingId) formData.append('overrideExistingId', overrideExistingId)
      if (selectedFile) formData.append('file', selectedFile)

      const result = await createSong(activeGroup.id, activeGroup.slug, formData)

      if (result.success && result.song) {
        resetAll(false)
        router.push(`/groups/${activeGroup.slug}/songs/${result.song.id}`)
        return
      }

      setError(result.error || 'Failed to create song')
      setIsLoading(false)
    } catch (err) {
      console.error('Error creating song:', err)
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  async function parseFileAndPrecheckDuplicate(file: File) {
    if (!activeGroup) return

    setIsParsingFile(true)
    setError(null)
    setDuplicateInfo(null)
    setDuplicateDecision(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const extractResult = await extractTextFromFile(fd)
      if (!extractResult.success) {
        setError(extractResult.error || 'Failed to extract text from file')
        setIsParsingFile(false)
        return
      }

      const parsedTitle = (extractResult.title || file.name.split('.').slice(0, -1).join('.')).trim()
      const parsedLyrics = (extractResult.text ?? '').trim()

      // Prime details view so "Continue" is fast
      setExtractedTitle(parsedTitle || null)
      setTitle(parsedTitle)
      setLyrics(parsedLyrics)
      setDefaultKey('')
      setCcliId('')
      setArtist('')
      setLinkUrl('')

      if (extractResult.defaultKey) setDefaultKey(extractResult.defaultKey)
      if (extractResult.ccliId) setCcliId(extractResult.ccliId)
      if (extractResult.artist) setArtist(extractResult.artist)
      if (extractResult.linkUrl) setLinkUrl(extractResult.linkUrl)

      // Lyrics-only duplicate check (even if title differs)
      const lyricDup = await checkForDuplicateLyrics(activeGroup.id, parsedLyrics)
      if (lyricDup.isDuplicate) {
        setDuplicateInfo(lyricDup)
      } else {
        setDuplicateInfo(null)
      }
    } catch (err) {
      console.error('Failed to precheck duplicate:', err)
      setError('Failed to analyze file')
    } finally {
      setIsParsingFile(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetAll(false)
          return
        }
        setIsOpen(true)
      }}
    >
      <DialogTrigger nativeButton={trigger ? false : true} render={trigger || <Button size="sm" />}>
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
          <div className="space-y-2">
            <Label>Group</Label>
            <Select value={selectedGroupSlug} onValueChange={(value) => setSelectedGroupSlug(value ?? '')}>
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

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Upload a lyric file</p>

            {/* Duplicate banner shown BEFORE Continue */}
            {duplicateInfo?.isDuplicate && (
              <div className="space-y-2">
                <Alert className="border-primary/20 bg-primary/10 text-foreground">
                  <HugeiconsIcon
                    icon={InformationCircleIcon}
                    strokeWidth={2}
                    className="text-primary"
                  />
                  <AlertTitle>Duplicate lyrics found</AlertTitle>
                  <AlertDescription>
                    {duplicateInfo.matchType === 'title_and_lyrics'
                      ? 'A song with the same title and lyrics already exists in this group.'
                      : duplicateInfo.matchType === 'title'
                        ? 'A song with the same title already exists in this group.'
                        : 'These lyrics look like an existing song in this group.'}
                    {duplicateInfo.existingSong?.title ? (
                      <>
                        {' '}
                        Existing: <span className="font-medium">{duplicateInfo.existingSong.title}</span>
                      </>
                    ) : null}
                  </AlertDescription>
                </Alert>

                <ButtonGroup className="w-full">
                  <Button
                    variant="outline"
                    className="flex-1 justify-center"
                    disabled={isLoading || isParsingFile}
                    onClick={() => {
                      setSelectedFile(null)
                      setDuplicateInfo(null)
                      setDuplicateDecision(null)
                      setFileUploaderKey((x) => x + 1)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={duplicateDecision === 'duplicate' ? 'default' : 'outline'}
                    className="flex-1 justify-center"
                    disabled={isLoading || isParsingFile}
                    onClick={() => setDuplicateDecision('duplicate')}
                  >
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                    Create duplicate
                  </Button>
                  <Button
                    variant={duplicateDecision === 'override' ? 'default' : 'outline'}
                    className="flex-1 justify-center"
                    disabled={isLoading || isParsingFile || !duplicateInfo.existingSong?.id}
                    onClick={() => setDuplicateDecision('override')}
                  >
                    <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                    Replace
                  </Button>
                </ButtonGroup>
              </div>
            )}

            <SingleFileUploader
              key={fileUploaderKey}
              accept={supportedFormats.join(',')}
              disabled={!activeGroup || isLoading || isParsingFile}
              isBusy={isLoading || isParsingFile}
              helpText={`Supported: ${supportedFormats.join(', ')}`}
              onFileSelected={(file) => {
                setSelectedFile(file)
                setError(null)
                parseFileAndPrecheckDuplicate(file)
              }}
              onFileCleared={() => {
                setSelectedFile(null)
                setError(null)
                setFileUploaderKey((x) => x + 1)
                setDuplicateInfo(null)
                setDuplicateDecision(null)
                setIsParsingFile(false)
              }}
            />
          </div>

          <Button
            className="w-full"
            disabled={
              !activeGroup ||
              !selectedFile ||
              isLoading ||
              isParsingFile ||
              Boolean(duplicateInfo?.isDuplicate && !duplicateDecision)
            }
            onClick={openDetailsFromFile}
          >
            {isLoading || isParsingFile ? (
              <>
                <HugeiconsIcon icon={Loading01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4 animate-spin" />
                {isParsingFile ? 'Checking…' : 'Parsing…'}
              </>
            ) : (
              'Continue'
            )}
          </Button>

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
            disabled={!activeGroup || isLoading}
            onClick={openDetailsManual}
          >
            Skip upload and enter details manually
          </Button>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>

        {/* Unified nested details dialog for BOTH upload and manual */}
        <Dialog open={detailsOpen} onOpenChange={(open) => setDetailsOpen(open)}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" showOverlay={false}>
            <DialogHeader>
              <DialogTitle>Song details</DialogTitle>
            </DialogHeader>

            <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
              <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto pr-1 pb-2">
              {selectedFile && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Uploaded file</p>
                  <div className="flex items-center justify-between gap-2 rounded-none border border-border px-4 py-2">
                    <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                      <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                      <p className="truncate text-[13px] font-medium">{selectedFile.name}</p>
                    </div>
                    <Button
                      aria-label="Remove file"
                      className="-me-2 size-8 text-muted-foreground/80 hover:bg-transparent hover:text-foreground"
                      onClick={() => {
                        setSelectedFile(null)
                        setFileUploaderKey((x) => x + 1)
                      }}
                      size="icon"
                      variant="ghost"
                      disabled={isLoading}
                    >
                      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4 rotate-45" />
                    </Button>
                  </div>
                </div>
              )}

              {duplicateInfo?.isDuplicate && (
                <div className="space-y-2">
                  <Alert className="border-primary/20 bg-primary/10 text-foreground">
                    <HugeiconsIcon
                      icon={InformationCircleIcon}
                      strokeWidth={2}
                      className="text-primary"
                    />
                    <AlertTitle>Duplicate song found</AlertTitle>
                    <AlertDescription>
                      {duplicateInfo.matchType === 'title_and_lyrics'
                        ? 'A song with the same title and lyrics already exists in this group.'
                        : 'A song with the same title already exists in this group.'}
                      {duplicateInfo.existingSong?.title ? (
                        <>
                          {' '}
                          Existing: <span className="font-medium">{duplicateInfo.existingSong.title}</span>
                        </>
                      ) : null}
                    </AlertDescription>
                  </Alert>

                  <ButtonGroup className="w-full">
                    <Button
                      variant="outline"
                      className="flex-1 justify-center"
                      disabled={isLoading}
                      onClick={() => {
                        setDuplicateDecision(null)
                        setDuplicateInfo(null)
                        setDetailsOpen(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant={duplicateDecision === 'duplicate' ? 'default' : 'outline'}
                      className="flex-1 justify-center"
                      disabled={isLoading}
                      onClick={() => setDuplicateDecision('duplicate')}
                    >
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                      Create duplicate
                    </Button>
                    <Button
                      variant={duplicateDecision === 'override' ? 'default' : 'outline'}
                      className="flex-1 justify-center"
                      disabled={isLoading || !duplicateInfo.existingSong?.id}
                      onClick={() => setDuplicateDecision('override')}
                    >
                      <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                      Replace
                    </Button>
                  </ButtonGroup>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="song_title">Song Title</Label>
                <Input
                  id="song_title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    setDuplicateInfo(null)
                    setDuplicateDecision(null)
                  }}
                  placeholder="e.g., Amazing Grace"
                  autoFocus
                />
                {extractedTitle && extractedTitle !== title.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Detected title: <span className="font-medium">{extractedTitle}</span>
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Song info (optional)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="default_key">Key</Label>
                    <Input
                      id="default_key"
                      placeholder="e.g., E"
                      value={defaultKey}
                      onChange={(e) => setDefaultKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ccli_id">CCLI ID</Label>
                    <Input id="ccli_id" placeholder="e.g., 1234567" value={ccliId} onChange={(e) => setCcliId(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="artist">Artist / Author</Label>
                    <Input id="artist" placeholder="e.g., Chris Tomlin" value={artist} onChange={(e) => setArtist(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="link_url">Video / Link</Label>
                    <Input id="link_url" placeholder="e.g., https://youtube.com/..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 flex flex-col space-y-2">
                <Label htmlFor="lyrics">Lyrics / Slide Text</Label>
                <Textarea
                  id="lyrics"
                  value={lyrics}
                  onChange={(e) => {
                    setLyrics(e.target.value)
                    setDuplicateInfo(null)
                    setDuplicateDecision(null)
                  }}
                  placeholder="Enter song lyrics or slide text here..."
                  className="flex-1 min-h-0 h-full overflow-y-auto resize-none"
                />
                <p className="text-xs text-muted-foreground">This text will be used to generate slides.</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            </div>

            <DialogFooter className="pt-2 sm:justify-between sm:flex-row-reverse">
              <div className="flex gap-2">
                <Button
                  disabled={isLoading || (duplicateInfo?.isDuplicate && !duplicateDecision)}
                  onClick={handleCreate}
                >
                  {isLoading ? (
                    <>
                      <HugeiconsIcon icon={Loading01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    'Create song'
                  )}
                </Button>
                <DialogClose nativeButton render={<Button variant="outline" />}>
                  Back
                </DialogClose>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogFooter className="pt-2">
          <DialogClose nativeButton render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
