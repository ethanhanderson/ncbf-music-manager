"use client"

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SingleFileUploader } from '@/components/single-file-uploader'
import { Switch } from '@/components/ui/switch'
import type { ChartImportResponse } from '@/lib/charts/import/types'

type ApplyMode = 'merge' | 'replace'

interface ChartImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  songId: string
  groupId: string
  arrangementId: string
  onApply: (payload: {
    result: ChartImportResponse
    mode: ApplyMode
    includeNotes: boolean
  }) => void
}

export function ChartImportDialog({
  open,
  onOpenChange,
  songId,
  groupId,
  arrangementId,
  onApply,
}: ChartImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [applyMode, setApplyMode] = useState<ApplyMode>('merge')
  const [includeNotes, setIncludeNotes] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ChartImportResponse | null>(null)

  const resetState = useCallback(() => {
    setSelectedFile(null)
    setApplyMode('merge')
    setIncludeNotes(true)
    setIsProcessing(false)
    setError(null)
    setResult(null)
  }, [])

  useEffect(() => {
    if (!open) {
      resetState()
    }
  }, [open, resetState])

  const processFile = useCallback(
    async (file: File, nextIncludeNotes = includeNotes) => {
      setIsProcessing(true)
      setError(null)
      setResult(null)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('songId', songId)
        formData.append('groupId', groupId)
        formData.append('arrangementId', arrangementId)
        formData.append('includeNotes', nextIncludeNotes ? 'true' : 'false')

        const response = await fetch('/api/charts/import', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          const message = payload?.error ?? 'Failed to process chart file.'
          throw new Error(message)
        }

        const data = (await response.json()) as ChartImportResponse
        setResult(data)
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Unexpected error while importing chart.'
        setError(message)
      } finally {
        setIsProcessing(false)
      }
    },
    [arrangementId, groupId, includeNotes, songId]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Chord Chart</DialogTitle>
          <DialogDescription>
            Upload a chord chart file and apply the parsed chords to this arrangement.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto">
          <SingleFileUploader
            accept=".txt,.rtf,.docx,.pdf"
            maxSize={10 * 1024 * 1024}
            isBusy={isProcessing}
            helpText="Supported formats: .txt, .rtf, .docx, .pdf (max 10MB)."
            onFileSelected={(file) => {
              setSelectedFile(file)
              void processFile(file)
            }}
            onFileCleared={() => {
              setSelectedFile(null)
              setResult(null)
              setError(null)
            }}
          />

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">Apply mode</span>
              <div className="inline-flex rounded-none border border-border overflow-hidden">
                <Button
                  type="button"
                  variant={applyMode === 'merge' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setApplyMode('merge')}
                >
                  Merge
                </Button>
                <Button
                  type="button"
                  variant={applyMode === 'replace' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setApplyMode('replace')}
                >
                  Replace
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="import-notes-toggle"
                checked={includeNotes}
                onCheckedChange={(checked) => {
                  setIncludeNotes(checked)
                  if (selectedFile) {
                    void processFile(selectedFile, checked)
                  }
                }}
              />
              <label htmlFor="import-notes-toggle" className="text-xs text-muted-foreground">
                Import comments as chart notes
              </label>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          {result && (
            <div className="rounded-none border border-border bg-muted/30 p-3 text-xs space-y-2">
              <div className="flex flex-wrap gap-3">
                <span>Matched lines: {result.summary.matchedLines}/{result.summary.totalLines}</span>
                <span>Chords: {result.summary.placementCount}</span>
                <span>Notes: {result.summary.noteCount}</span>
              </div>
              {result.warnings.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium">Warnings</p>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {result.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.unmatchedLines.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium">Unmatched lines (first 6)</p>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {result.unmatchedLines.slice(0, 6).map((line, index) => (
                      <li key={`${line}-${index}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!result) return
              onApply({ result, mode: applyMode, includeNotes })
              onOpenChange(false)
            }}
            disabled={!result || isProcessing}
          >
            Apply to chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
