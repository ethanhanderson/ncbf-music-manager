'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function retryExtraction(documentId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify document ownership
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .single()

  if (docError || !document) {
    return { success: false, error: 'Document not found' }
  }

  // Create a new extraction job
  const jobId = crypto.randomUUID()
  
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
    console.error('Error creating retry job:', jobError)
    return { success: false, error: 'Failed to create extraction job' }
  }

  // Enqueue the job
  const serviceClient = await createServiceClient()
  const { error: enqueueError } = await serviceClient
    .rpc('enqueue_presentation_extraction', {
      p_document_id: documentId,
      p_job_id: jobId,
    })

  if (enqueueError) {
    console.error('Error enqueuing retry job:', enqueueError)
    // Clean up the job we created
    await supabase.from('extraction_jobs').delete().eq('id', jobId)
    return { success: false, error: 'Failed to enqueue extraction job' }
  }

  revalidatePath(`/documents/${documentId}`)
  return { success: true }
}

export async function deleteDocument(documentId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get document to find storage path
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .single()

  if (docError || !document) {
    return { success: false, error: 'Document not found' }
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('presentations')
    .remove([document.storage_path])

  if (storageError) {
    console.error('Error deleting from storage:', storageError)
    // Continue with database deletion even if storage fails
  }

  // Delete document (cascade will delete extraction_jobs)
  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (deleteError) {
    return { success: false, error: 'Failed to delete document' }
  }

  return { success: true }
}
