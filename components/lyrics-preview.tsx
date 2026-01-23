'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { updateSongAssetText } from '@/lib/actions/songs'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertTriangle } from '@hugeicons/core-free-icons'

interface LyricsPreviewProps {
  assetId: string
  text: string
  warning?: string | null
}

export function LyricsPreview({ assetId, text, warning }: LyricsPreviewProps) {
  const [editedText, setEditedText] = useState(text)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setEditedText(text)
    setIsDirty(false)
  }, [text])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [editedText])

  async function handleSave() {
    setIsSaving(true)
    const result = await updateSongAssetText(assetId, editedText)
    if (result.success) {
      setIsDirty(false)
      router.refresh()
    }
    setIsSaving(false)
  }

  return (
    <div className="space-y-3">
      {warning && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <HugeiconsIcon icon={AlertTriangle} strokeWidth={2} className="h-4 w-4 shrink-0" />
          {warning}
        </div>
      )}

      <Textarea
        ref={textareaRef}
        value={editedText}
        onChange={(e) => {
          setEditedText(e.target.value)
          setIsDirty(true)
        }}
        rows={8}
        className="font-mono text-sm resize-none overflow-hidden"
      />

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditedText(text)
            setIsDirty(false)
          }}
          disabled={!isDirty || isSaving}
        >
          Reset
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
