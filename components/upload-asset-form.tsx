'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import { CloudUploadIcon, Loading01Icon } from '@hugeicons/core-free-icons'

interface UploadAssetFormProps {
  songId: string
  assetType: 'lyrics_source' | 'chord_chart' | 'arrangement_doc' | 'other'
}

export function UploadAssetForm({ songId, assetType }: UploadAssetFormProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const supportedFormats = ['.txt', '.rtf', '.docx', '.pdf']

  async function handleUpload(file: File) {
    setIsUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('songId', songId)
    formData.append('assetType', assetType)

    try {
      const response = await fetch('/api/song-assets/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Upload failed')
      } else {
        router.refresh()
      }
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleUpload(file)
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

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-none p-6 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
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
          disabled={isUploading}
        />
        
        {isUploading ? (
          <div className="space-y-2">
            <HugeiconsIcon
              icon={Loading01Icon}
              strokeWidth={2}
              className="mx-auto h-8 w-8 text-muted-foreground animate-spin"
            />
            <p className="text-sm text-muted-foreground">Uploading & generating slides...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={2} className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop a file here or click to upload
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {supportedFormats.map((format) => (
          <Badge key={format} variant="outline" className="text-xs">
            {format}
          </Badge>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <p className="text-xs text-muted-foreground">
        Slides will be generated from the uploaded text.
      </p>
    </div>
  )
}
