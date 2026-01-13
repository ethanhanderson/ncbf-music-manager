'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Document, ExtractionJob } from '@/lib/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { 
  Clock, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Copy, 
  Download,
  ArrowLeft,
  RefreshCw,
  Trash2
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from '@/lib/utils'
import { retryExtraction, deleteDocument } from './actions'

interface DocumentWithJob extends Document {
  extraction_jobs?: ExtractionJob[]
}

interface DocumentDetailProps {
  document: DocumentWithJob
  initialJob?: ExtractionJob
}

const statusConfig = {
  queued: {
    icon: Clock,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'Queued',
    description: 'Waiting to be processed...',
  },
  processing: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    label: 'Processing',
    description: 'Extracting text from slides...',
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Completed',
    description: 'Extraction complete!',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'Failed',
    description: 'Extraction failed',
  },
}

export function DocumentDetail({ document: doc, initialJob }: DocumentDetailProps) {
  const [job, setJob] = useState<ExtractionJob | undefined>(initialJob)
  const [linesPerSlide, setLinesPerSlide] = useState(initialJob?.lines_per_slide || 2)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleRetry = async () => {
    setIsRetrying(true)
    const result = await retryExtraction(doc.id)
    if (result.success) {
      toast.success('Extraction restarted')
      // Reload to get the new job
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to retry')
    }
    setIsRetrying(false)
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this document?')) return
    
    setIsDeleting(true)
    const result = await deleteDocument(doc.id)
    if (result.success) {
      toast.success('Document deleted')
      router.push('/dashboard')
    } else {
      toast.error(result.error || 'Failed to delete')
      setIsDeleting(false)
    }
  }

  // Format function for ProPresenter output
  const formatForProPresenter = useCallback((lines: string[], lps: number, title?: string): string => {
    if (lines.length === 0) return ''

    const slides: string[] = []
    
    // Add title slide if present
    if (title) {
      slides.push(title)
    }

    // Group lines into slides
    for (let i = 0; i < lines.length; i += lps) {
      const slideLines = lines.slice(i, i + lps)
      slides.push(slideLines.join('\n'))
    }

    return slides.join('\n\n')
  }, [])

  // Compute formatted text based on current state
  const customFormatText = useMemo(() => {
    if (job?.lines && job.status === 'completed') {
      const lines = job.lines as string[]
      return formatForProPresenter(lines, linesPerSlide, job.detected_title || undefined)
    }
    return ''
  }, [job?.lines, job?.status, job?.detected_title, linesPerSlide, formatForProPresenter])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!job?.id) return

    const channel = supabase
      .channel(`job-${job.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'extraction_jobs',
          filter: `id=eq.${job.id}`,
        },
        (payload) => {
          setJob(payload.new as ExtractionJob)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [job?.id, supabase])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const downloadAsFile = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('File downloaded!')
  }

  const status = job?.status || 'queued'
  const config = statusConfig[status as keyof typeof statusConfig]
  const StatusIcon = config.icon

  const lines = (job?.lines as string[]) || []
  const outputText = job?.propresenter_text || customFormatText

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{doc.filename}</h1>
          <p className="text-sm text-muted-foreground">
            Uploaded {formatDistanceToNow(new Date(doc.created_at))}
          </p>
        </div>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${config.bgColor}`}>
                <StatusIcon className={`h-6 w-6 ${config.color} ${status === 'processing' ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <CardTitle>{config.label}</CardTitle>
                <CardDescription>
                  {job?.error || config.description}
                </CardDescription>
              </div>
            </div>
            {job?.slide_count && (
              <div className="text-right">
                <p className="text-2xl font-bold">{job.slide_count}</p>
                <p className="text-sm text-muted-foreground">slides</p>
              </div>
            )}
          </div>
        </CardHeader>
        {(status === 'queued' || status === 'processing') && (
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{job?.progress || 0}%</span>
              </div>
              <Progress value={job?.progress || 0} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Results */}
      {status === 'completed' && job && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {job.detected_title || 'Extracted Content'}
                </CardTitle>
                <CardDescription>
                  {lines.length} lines extracted
                  {job.warning && (
                    <span className="text-yellow-500 ml-2">• {job.warning}</span>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="formatted" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="formatted">ProPresenter Format</TabsTrigger>
                <TabsTrigger value="raw">Raw Lines</TabsTrigger>
              </TabsList>

              <TabsContent value="formatted" className="space-y-4">
                {/* Lines per slide control */}
                <div className="flex items-center space-x-4">
                  <Label htmlFor="lines-per-slide" className="whitespace-nowrap">
                    Lines per slide:
                  </Label>
                  <Input
                    id="lines-per-slide"
                    type="number"
                    min={1}
                    max={10}
                    value={linesPerSlide}
                    onChange={(e) => setLinesPerSlide(Math.max(1, parseInt(e.target.value) || 2))}
                    className="w-20"
                  />
                </div>

                <Textarea
                  value={outputText}
                  readOnly
                  className="font-mono text-sm min-h-[300px]"
                />

                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(outputText)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    onClick={() => {
                      const baseName = doc.filename.replace(/\.(ppt|pptx)$/i, '')
                      downloadAsFile(outputText, `${baseName}.txt`)
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="raw" className="space-y-4">
                <Textarea
                  value={lines.join('\n')}
                  readOnly
                  className="font-mono text-sm min-h-[300px]"
                />

                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(lines.join('\n'))}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Raw Lines
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Failed state */}
      {status === 'failed' && job?.error && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-500">Extraction Failed</CardTitle>
            <CardDescription>{job.error}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              The extraction process encountered an error. You can retry the extraction or upload a different file.
            </p>
            <div className="flex space-x-2">
              <Button onClick={handleRetry} disabled={isRetrying}>
                {isRetrying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Retry Extraction
              </Button>
              <Button variant="outline" asChild>
                <Link href="/upload">
                  Upload Different File
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Document Info</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Format</dt>
              <dd className="font-medium uppercase">{doc.format}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Size</dt>
              <dd className="font-medium">
                {doc.file_size_bytes 
                  ? `${(doc.file_size_bytes / 1024 / 1024).toFixed(2)} MB`
                  : 'Unknown'
                }
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Uploaded</dt>
              <dd className="font-medium">
                {new Date(doc.created_at).toLocaleString()}
              </dd>
            </div>
            {job?.updated_at && (
              <div>
                <dt className="text-muted-foreground">Last Updated</dt>
                <dd className="font-medium">
                  {new Date(job.updated_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
