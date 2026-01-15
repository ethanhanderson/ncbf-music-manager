import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET: Retrieve asset details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params
    const supabase = createServerSupabaseClient()
    
    const { data: asset, error } = await supabase
      .from('song_assets')
      .select('*')
      .eq('id', assetId)
      .single()
    
    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    
    return NextResponse.json(asset)
  } catch (error) {
    console.error('Get asset error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Remove asset and its storage file
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params
    const supabase = createServerSupabaseClient()
    
    // Get asset to find storage path
    const { data: asset, error: fetchError } = await supabase
      .from('song_assets')
      .select('storage_bucket, storage_path')
      .eq('id', assetId)
      .single()
    
    if (fetchError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(asset.storage_bucket)
      .remove([asset.storage_path])
    
    if (storageError) {
      console.error('Storage delete error:', storageError)
      // Continue anyway to delete the DB record
    }
    
    // Delete from database
    const { error: deleteError } = await supabase
      .from('song_assets')
      .delete()
      .eq('id', assetId)
    
    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete asset error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
