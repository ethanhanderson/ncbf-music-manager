import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Upload, FileText, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from '@/lib/utils'

const statusIcons = {
  queued: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
}

const statusColors = {
  queued: 'text-yellow-500',
  processing: 'text-blue-500 animate-spin',
  completed: 'text-green-500',
  failed: 'text-red-500',
}

export default async function DashboardPage() {
  const supabase = await createClient()

  // Get recent documents with their latest job status
  const { data: documents, error } = await supabase
    .from('documents')
    .select(`
      *,
      extraction_jobs (
        id,
        status,
        progress,
        detected_title,
        slide_count,
        created_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching documents:', error)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your PowerPoint extractions
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload New
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents?.filter(d => d.extraction_jobs?.[0]?.status === 'completed').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Loader2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents?.filter(d => 
                d.extraction_jobs?.[0]?.status === 'queued' || 
                d.extraction_jobs?.[0]?.status === 'processing'
              ).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>
            Your recently uploaded PowerPoint files
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!documents || documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No documents yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload your first PowerPoint file to get started
              </p>
              <Button asChild className="mt-4">
                <Link href="/upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => {
                const job = doc.extraction_jobs?.[0]
                const status = job?.status || 'queued'
                const StatusIcon = statusIcons[status as keyof typeof statusIcons] || Clock
                const statusColor = statusColors[status as keyof typeof statusColors] || 'text-gray-500'

                return (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          {job?.detected_title || 'Processing...'} 
                          {job?.slide_count ? ` • ${job.slide_count} slides` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(doc.created_at))}
                      </span>
                      <StatusIcon className={`h-5 w-5 ${statusColor}`} />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
