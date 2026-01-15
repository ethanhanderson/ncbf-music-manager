import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractText } from '@/lib/extractors'
import { createDefaultArrangementFromLyrics } from '@/lib/actions/song-arrangements'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST: Re-extract text from an existing asset
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params
    const supabase = createServerSupabaseClient()
    
    // Get asset details
    const { data: asset, error } = await supabase
      .from('song_assets')
      .select('*')
      .eq('id', assetId)
      .single()
    
    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    
    // Mark as extracting
    await supabase
      .from('song_assets')
      .update({ extract_status: 'extracting' })
      .eq('id', assetId)
    
    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path)
    
    if (downloadError || !fileData) {
      await supabase
        .from('song_assets')
        .update({
          extract_status: 'failed',
          extract_warning: 'Failed to download file from storage',
        })
        .eq('id', assetId)
      
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
    }
    
    // Extract text
    try {
      const buffer = Buffer.from(await fileData.arrayBuffer())
      const { text, warning } = await extractText(buffer, asset.mime_type, asset.original_filename)
      
      if (asset.asset_type === 'lyrics_source' && text.trim()) {
        let resolvedGroupId = asset.group_id
        if (!resolvedGroupId) {
          const { data: song } = await supabase
            .from('songs')
            .select('group_id')
            .eq('id', asset.song_id)
            .single()
          resolvedGroupId = song?.group_id ?? null
        }
        if (resolvedGroupId) {
          await createDefaultArrangementFromLyrics(asset.song_id, resolvedGroupId, text)
        }
      }
      
      // Update asset status without storing extracted text
      await supabase
        .from('song_assets')
        .update({
          extracted_text: null,
          extract_status: 'extracted',
          extract_warning: warning || null,
        })
        .eq('id', assetId)
      
      return NextResponse.json({
        id: assetId,
        extractedText: null,
        warning,
        status: 'extracted',
      })
    } catch (extractError) {
      const errorMessage = extractError instanceof Error ? extractError.message : 'Unknown extraction error'
      
      await supabase
        .from('song_assets')
        .update({
          extract_status: 'failed',
          extract_warning: errorMessage,
        })
        .eq('id', assetId)
      
      return NextResponse.json({
        id: assetId,
        extractedText: null,
        warning: errorMessage,
        status: 'failed',
      })
    }
  } catch (error) {
    console.error('Extract handler error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
