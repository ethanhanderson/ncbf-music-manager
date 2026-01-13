/**
 * Cloudflare Worker for processing PPT/PPTX extraction jobs.
 * 
 * This worker runs on a cron schedule, dequeues jobs from Supabase Queues,
 * downloads files from Supabase Storage, extracts text using WASM,
 * and updates job status/results back to the database.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Import WASM module (built with wasm-pack)
// @ts-ignore - WASM module will be available after build
import init, { extract_presentation, format_for_propresenter } from './wasm/ppt_worker_wasm.js'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_STORAGE_BUCKET: string
  ENVIRONMENT?: string
}

interface QueueMessage {
  msg_id: number
  document_id: string
  job_id: string
  enqueued_at: string
}

interface Document {
  id: string
  filename: string
  storage_path: string
  format: string
}

interface ExtractionResult {
  format: string
  slide_count: number
  detected_title: string | null
  lines: string[]
  warning: string | null
}

interface FormatResult {
  text: string
  slide_count: number
}

// Batch size for processing
const BATCH_SIZE = 5
// Visibility timeout in seconds
const VISIBILITY_TIMEOUT = 120

export default {
  /**
   * Scheduled handler - runs on cron schedule
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`[${new Date().toISOString()}] Cron triggered`)
    
    try {
      // Initialize WASM module
      await init()
      
      // Create Supabase client with service role
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })

      // Dequeue messages
      const { data: messages, error: dequeueError } = await supabase.rpc(
        'dequeue_presentation_extractions',
        {
          p_batch_size: BATCH_SIZE,
          p_visibility_timeout_seconds: VISIBILITY_TIMEOUT,
        }
      )

      if (dequeueError) {
        console.error('Error dequeuing messages:', dequeueError)
        return
      }

      if (!messages || messages.length === 0) {
        console.log('No messages in queue')
        return
      }

      console.log(`Processing ${messages.length} jobs`)

      // Process each message
      for (const message of messages as QueueMessage[]) {
        await processJob(supabase, env, message)
      }

    } catch (error) {
      console.error('Worker error:', error)
    }
  },

  /**
   * HTTP handler - for testing/debugging
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Manual trigger for testing
    if (url.pathname === '/trigger' && request.method === 'POST') {
      ctx.waitUntil(this.scheduled({} as ScheduledController, env, ctx))
      return new Response(JSON.stringify({ message: 'Processing triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not Found', { status: 404 })
  },
}

/**
 * Process a single extraction job
 */
async function processJob(
  supabase: SupabaseClient,
  env: Env,
  message: QueueMessage
): Promise<void> {
  const { msg_id, document_id, job_id } = message
  console.log(`Processing job ${job_id} for document ${document_id}`)

  try {
    // Update job status to processing
    await updateJobStatus(supabase, job_id, 'processing', 5)

    // Fetch document metadata
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single()

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message || 'Unknown error'}`)
    }

    await updateJobStatus(supabase, job_id, 'processing', 15)

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .download(document.storage_path)

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || 'Unknown error'}`)
    }

    await updateJobStatus(supabase, job_id, 'processing', 30)

    // Convert to Uint8Array for WASM
    const arrayBuffer = await fileData.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    // Extract text using WASM
    console.log(`Extracting text from ${document.filename}`)
    const extractionResult: ExtractionResult = extract_presentation(bytes, document.filename)

    await updateJobStatus(supabase, job_id, 'processing', 70)

    // Format for ProPresenter
    const linesPerSlide = 2 // Default
    const formatResult: FormatResult = format_for_propresenter(
      extractionResult.lines,
      linesPerSlide,
      extractionResult.detected_title
    )

    await updateJobStatus(supabase, job_id, 'processing', 90)

    // Update job with results
    const { error: updateError } = await supabase
      .from('extraction_jobs')
      .update({
        status: 'completed',
        progress: 100,
        slide_count: extractionResult.slide_count,
        detected_title: extractionResult.detected_title,
        lines: extractionResult.lines,
        propresenter_text: formatResult.text,
        warning: extractionResult.warning,
      })
      .eq('id', job_id)

    if (updateError) {
      throw new Error(`Failed to update job: ${updateError.message}`)
    }

    // Acknowledge the message
    await supabase.rpc('ack_presentation_extraction', { p_msg_id: msg_id })

    console.log(`Job ${job_id} completed successfully`)

  } catch (error) {
    console.error(`Job ${job_id} failed:`, error)

    // Update job as failed
    await supabase
      .from('extraction_jobs')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', job_id)

    // Archive the message (move to dead letter)
    await supabase.rpc('archive_presentation_extraction', { p_msg_id: msg_id })
  }
}

/**
 * Update job status and progress
 */
async function updateJobStatus(
  supabase: SupabaseClient,
  jobId: string,
  status: string,
  progress: number
): Promise<void> {
  const { error } = await supabase
    .from('extraction_jobs')
    .update({ status, progress })
    .eq('id', jobId)

  if (error) {
    console.error(`Failed to update job status: ${error.message}`)
  }
}
