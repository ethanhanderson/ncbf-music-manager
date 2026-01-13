'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Upload, FileText, X, CheckCircle, Loader2 } from 'lucide-react'
import { createDocumentAndJob, enqueueExtractionJob } from './actions'

type UploadState = 'idle' | 'validating' | 'creating' | 'uploading' | 'enqueuing' | 'complete' | 'error'

const ALLOWED_EXTENSIONS = ['ppt', 'pptx']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export default function UploadPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      return { valid: false, error: 'Invalid file type. Please upload a .ppt or .pptx file.' }
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: 'File too large. Maximum size is 50MB.' }
    }
    
    return { valid: true }
  }

  const handleFile = useCallback((selectedFile: File) => {
    const validation = validateFile(selectedFile)
    if (!validation.valid) {
      toast.error(validation.error)
      return
    }
    setFile(selectedFile)
    setUploadState('idle')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }, [handleFile])

  const clearFile = () => {
    setFile(null)
    setUploadState('idle')
    setUploadProgress(0)
  }

  const handleUpload = async () => {
    if (!file) return

    const extension = file.name.split('.').pop()?.toLowerCase() as 'ppt' | 'pptx'

    try {
      // Step 1: Create document and job records
      setUploadState('creating')
      setUploadProgress(10)

      const result = await createDocumentAndJob(file.name, extension, file.size)
      
      if (!result.success) {
        throw new Error(result.error)
      }

      setUploadProgress(25)

      // Step 2: Upload file to storage
      setUploadState('uploading')
      
      const { error: uploadError } = await supabase.storage
        .from('presentations')
        .upload(result.storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      setUploadProgress(75)

      // Step 3: Enqueue the extraction job
      setUploadState('enqueuing')
      
      const enqueueResult = await enqueueExtractionJob(result.documentId, result.jobId)
      
      if (!enqueueResult.success) {
        throw new Error(enqueueResult.error)
      }

      setUploadProgress(100)
      setUploadState('complete')
      
      toast.success('File uploaded successfully! Extraction will begin shortly.')

      // Redirect to document page after a brief delay
      setTimeout(() => {
        router.push(`/documents/${result.documentId}`)
      }, 1500)

    } catch (error) {
      console.error('Upload error:', error)
      setUploadState('error')
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  const getStatusMessage = () => {
    switch (uploadState) {
      case 'creating':
        return 'Creating document record...'
      case 'uploading':
        return 'Uploading file...'
      case 'enqueuing':
        return 'Queuing extraction job...'
      case 'complete':
        return 'Upload complete! Redirecting...'
      case 'error':
        return 'Upload failed'
      default:
        return ''
    }
  }

  const isUploading = ['creating', 'uploading', 'enqueuing'].includes(uploadState)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Presentation</h1>
        <p className="text-muted-foreground">
          Upload a PowerPoint file to extract text for ProPresenter
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select File</CardTitle>
          <CardDescription>
            Drag and drop or click to select a .ppt or .pptx file (max 50MB)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12
                transition-colors cursor-pointer
                ${dragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-primary/50'
                }
              `}
            >
              <input
                type="file"
                accept=".ppt,.pptx"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">
                {dragActive ? 'Drop file here' : 'Drag & drop your file here'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected file display */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                {!isUploading && uploadState !== 'complete' && (
                  <Button variant="ghost" size="icon" onClick={clearFile}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {uploadState === 'complete' && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>

              {/* Progress bar */}
              {(isUploading || uploadState === 'complete') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{getStatusMessage()}</span>
                    <span className="font-medium">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}

              {/* Action buttons */}
              {uploadState === 'idle' && (
                <div className="flex justify-end space-x-4">
                  <Button variant="outline" onClick={clearFile}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpload}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload & Extract
                  </Button>
                </div>
              )}

              {isUploading && (
                <div className="flex justify-center">
                  <Button disabled>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </Button>
                </div>
              )}

              {uploadState === 'error' && (
                <div className="flex justify-end space-x-4">
                  <Button variant="outline" onClick={clearFile}>
                    Try Different File
                  </Button>
                  <Button onClick={handleUpload}>
                    Retry Upload
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Upload your PowerPoint file (.ppt or .pptx)</li>
            <li>Our system extracts all text from the slides</li>
            <li>Text is automatically cleaned and normalized for worship lyrics</li>
            <li>Download the formatted output ready for ProPresenter import</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
