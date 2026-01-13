import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { DocumentDetail } from './document-detail'

interface PageProps {
  params: Promise<{ documentId: string }>
}

export default async function DocumentPage({ params }: PageProps) {
  const { documentId } = await params
  const supabase = await createClient()

  // Fetch document with its extraction job
  const { data: document, error } = await supabase
    .from('documents')
    .select(`
      *,
      extraction_jobs (*)
    `)
    .eq('id', documentId)
    .single()

  if (error || !document) {
    notFound()
  }

  const job = document.extraction_jobs?.[0]

  return (
    <DocumentDetail 
      document={document} 
      initialJob={job}
    />
  )
}
