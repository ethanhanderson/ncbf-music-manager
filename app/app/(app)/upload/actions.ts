'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type CreateDocumentResult = {
  success: true
  documentId: string
  jobId: string
  storagePath: string
} | {
  success: false
  error: string
}

export async function createDocumentAndJob(
  filename: string,
  format: 'ppt' | 'pptx',
  fileSize: number
): Promise<CreateDocumentResult> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Generate IDs
  const documentId = crypto.randomUUID()
  const jobId = crypto.randomUUID()
  const storagePath = `${user.id}/${documentId}/${filename}`

  // Create document record
  const { error: docError } = await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: user.id,
      filename,
      storage_path: storagePath,
      format,
      file_size_bytes: fileSize,
    })

  if (docError) {
    console.error('Error creating document:', docError)
    return { success: false, error: 'Failed to create document record' }
  }

  // Create extraction job record
  const { error: jobError } = await supabase
    .from('extraction_jobs')
    .insert({
      id: jobId,
      document_id: documentId,
      user_id: user.id,
      status: 'queued',
      progress: 0,
    })

  if (jobError) {
    console.error('Error creating job:', jobError)
    // Clean up the document we created
    await supabase.from('documents').delete().eq('id', documentId)
    return { success: false, error: 'Failed to create extraction job' }
  }

  return {
    success: true,
    documentId,
    jobId,
    storagePath,
  }
}

export async function enqueueExtractionJob(
  documentId: string,
  jobId: string
): Promise<{ success: boolean; error?: string }> {
  // Use service client to call the queue function
  const supabase = await createServiceClient()

  const { error } = await supabase
    .rpc('enqueue_presentation_extraction', {
      p_document_id: documentId,
      p_job_id: jobId,
    })

  if (error) {
    console.error('Error enqueuing job:', error)
    return { success: false, error: 'Failed to enqueue extraction job' }
  }

  return { success: true }
}

export async function redirectToDocument(documentId: string) {
  redirect(`/documents/${documentId}`)
}
