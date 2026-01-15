import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET: Download original file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params
    const supabase = createServerSupabaseClient()
    
    // Get asset details
    const { data: asset, error } = await supabase
      .from('song_assets')
      .select('storage_bucket, storage_path, original_filename, mime_type')
      .eq('id', assetId)
      .single()
    
    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    
    // Download from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path)
    
    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError)
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
    }
    
    // Return file with proper headers
    const buffer = await fileData.arrayBuffer()
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': asset.mime_type,
        'Content-Disposition': `attachment; filename="${asset.original_filename}"`,
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
