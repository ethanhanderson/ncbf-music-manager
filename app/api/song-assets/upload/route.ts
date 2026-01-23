import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractText, getSupportedMimeTypes } from '@/lib/extractors'
import { createDefaultArrangementFromLyrics } from '@/lib/actions/song-arrangements'

export const runtime = 'nodejs'
export const maxDuration = 60 // Allow up to 60 seconds for large file extraction

interface UploadRequest {
  songId: string
  arrangementId?: string
  groupId?: string
  assetType: 'lyrics_source' | 'chord_chart' | 'arrangement_doc' | 'other'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const file = formData.get('file') as File | null
    const songId = formData.get('songId') as string | null
    const arrangementId = formData.get('arrangementId') as string | null
    const groupId = formData.get('groupId') as string | null
    const assetType = formData.get('assetType') as UploadRequest['assetType'] | null
    
    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!songId) {
      return NextResponse.json({ error: 'songId is required' }, { status: 400 })
    }
    if (!assetType) {
      return NextResponse.json({ error: 'assetType is required' }, { status: 400 })
    }
    
    // Validate file type
    const supportedMimeTypes = getSupportedMimeTypes()
    const mimeType = file.type || 'application/octet-stream'
    const ext = file.name.toLowerCase().split('.').pop() || ''
    
    // Check by extension as fallback since browser MIME detection isn't always reliable
    const supportedExtensions = ['txt', 'rtf', 'docx', 'pdf']
    if (!supportedMimeTypes.includes(mimeType) && !supportedExtensions.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type. Supported formats: ${supportedExtensions.join(', ')}` },
        { status: 400 }
      )
    }
    
    const supabase = createServerSupabaseClient()
    
    // Generate a unique storage path
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `songs/${songId}/${timestamp}-${safeName}`
    
    // Convert file to buffer for upload and extraction
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Upload file to storage
    const { error: uploadError } = await supabase.storage
      .from('music-assets')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      })
    
    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file to storage' },
        { status: 500 }
      )
    }
    
    // Create the asset record
    const { data: asset, error: insertError } = await supabase
      .from('song_assets')
      .insert({
        song_id: songId,
        arrangement_id: arrangementId || null,
        group_id: groupId || null,
        asset_type: assetType,
        original_filename: file.name,
        mime_type: mimeType,
        storage_bucket: 'music-assets',
        storage_path: storagePath,
        extract_status: 'extracting',
      })
      .select()
      .single()
    
    if (insertError || !asset) {
      console.error('Database insert error:', insertError)
      // Clean up uploaded file
      await supabase.storage.from('music-assets').remove([storagePath])
      return NextResponse.json(
        { error: 'Failed to create asset record' },
        { status: 500 }
      )
    }
    
    // Extract text from the file
    try {
      const { text, warning } = await extractText(buffer, mimeType, file.name)
      
      if (assetType === 'lyrics_source' && text.trim()) {
        let resolvedGroupId = groupId
        if (!resolvedGroupId) {
          const { data: song } = await supabase
            .from('songs')
            .select('group_id')
            .eq('id', songId)
            .single()
          resolvedGroupId = song?.group_id ?? null
        }
        if (resolvedGroupId) {
          await createDefaultArrangementFromLyrics(songId, resolvedGroupId, text)
        }
      }
      
      // Update asset status (do not persist extracted text)
      const { error: updateError } = await supabase
        .from('song_assets')
        .update({
          extract_status: 'extracted',
          extract_warning: warning || null,
        })
        .eq('id', asset.id)
      
      if (updateError) {
        console.error('Failed to update asset with extracted text:', updateError)
      }
      
      return NextResponse.json({
        id: asset.id,
        filename: file.name,
        extractedText: null,
        warning,
        status: 'extracted',
      })
    } catch (extractError) {
      // Extraction failed, update status
      const errorMessage = extractError instanceof Error ? extractError.message : 'Unknown extraction error'
      
      await supabase
        .from('song_assets')
        .update({
          extract_status: 'failed',
          extract_warning: errorMessage,
        })
        .eq('id', asset.id)
      
      return NextResponse.json({
        id: asset.id,
        filename: file.name,
        extractedText: null,
        warning: errorMessage,
        status: 'failed',
      })
    }
  } catch (error) {
    console.error('Upload handler error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
