'use server'

import { revalidatePath } from 'next/cache'
import {
  createServerSupabaseClient,
  type SongArrangement,
  type SongSlide,
  type SongSlideGroupArrangementItem,
} from '@/lib/supabase/server'
import { extractText } from '@/lib/extractors'

function buildGroupArrangementFromSlides(slides: SongSlide[]): SongSlideGroupArrangementItem[] {
  const arrangement: SongSlideGroupArrangementItem[] = []
  let lastKey: string | null = null

  slides.forEach((slide) => {
    const key = `${slide.label}::${slide.customLabel ?? ''}`
    if (key !== lastKey) {
      arrangement.push({
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        label: slide.label,
        customLabel: slide.customLabel,
      })
      lastKey = key
    }
  })

  return arrangement
}

function buildMasterGroupArrangementFromSlides(slides: SongSlide[]): SongSlideGroupArrangementItem[] {
  const arrangement: SongSlideGroupArrangementItem[] = []
  const seen = new Set<string>()

  slides.forEach((slide) => {
    const key = `${slide.label}::${slide.customLabel ?? ''}`
    if (!seen.has(key)) {
      seen.add(key)
      arrangement.push({
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        label: slide.label,
        customLabel: slide.customLabel,
      })
    }
  })

  return arrangement
}

export async function getSongArrangements(songId: string, groupId: string): Promise<SongArrangement[]> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('song_arrangements')
    .select('*')
    .eq('song_id', songId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching song arrangements:', error)
    return []
  }

  return data || []
}

export async function getSongArrangementById(arrangementId: string): Promise<SongArrangement | null> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('song_arrangements')
    .select('*')
    .eq('id', arrangementId)
    .single()

  if (error) {
    console.error('Error fetching song arrangement:', error)
    return null
  }

  return data
}

export async function createSongArrangement(
  songId: string,
  groupId: string,
  groupSlug: string,
  name: string,
  slides?: SongSlide[]
): Promise<{ success: boolean; error?: string; arrangement?: SongArrangement }> {
  const supabase = createServerSupabaseClient()
  const masterGroupArrangement = slides?.length ? buildMasterGroupArrangementFromSlides(slides) : null

  const { data, error } = await supabase
    .from('song_arrangements')
    .insert({
      song_id: songId,
      group_id: groupId,
      name: name.trim(),
      slides: slides || null,
      group_arrangement: masterGroupArrangement,
      master_group_arrangement: masterGroupArrangement,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating song arrangement:', error)
    return { success: false, error: 'Failed to create arrangement' }
  }

  revalidatePath(`/groups/${groupSlug}/songs/${songId}`)
  return { success: true, arrangement: data }
}

export async function duplicateSongArrangement(
  arrangementId: string,
  newName: string,
  groupSlug: string
): Promise<{ success: boolean; error?: string; arrangement?: SongArrangement }> {
  const supabase = createServerSupabaseClient()

  // Get the original arrangement
  const { data: original, error: fetchError } = await supabase
    .from('song_arrangements')
    .select('*')
    .eq('id', arrangementId)
    .single()

  if (fetchError || !original) {
    return { success: false, error: 'Original arrangement not found' }
  }

  // Create the duplicate
  const { data, error } = await supabase
    .from('song_arrangements')
    .insert({
      song_id: original.song_id,
      group_id: original.group_id,
      name: newName.trim(),
      slides: original.slides,
      group_arrangement: original.group_arrangement,
      master_group_arrangement: original.master_group_arrangement,
      chords_text: original.chords_text,
      notes: original.notes,
    })
    .select()
    .single()

  if (error) {
    console.error('Error duplicating song arrangement:', error)
    return { success: false, error: 'Failed to duplicate arrangement' }
  }

  revalidatePath(`/groups/${groupSlug}/songs/${original.song_id}`)
  return { success: true, arrangement: data }
}

export async function renameSongArrangement(
  arrangementId: string,
  name: string,
  groupSlug: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('song_arrangements')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', arrangementId)

  if (error) {
    console.error('Error renaming song arrangement:', error)
    return { success: false, error: 'Failed to rename arrangement' }
  }

  revalidatePath(`/groups/${groupSlug}/songs/${songId}`)
  return { success: true }
}

export async function updateSongArrangementSlides(
  arrangementId: string,
  slides: SongSlide[],
  groupSlug: string,
  songId: string,
  groupArrangement?: SongSlideGroupArrangementItem[] | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const masterGroupArrangement = buildMasterGroupArrangementFromSlides(slides)
  const updates: Record<string, unknown> = {
    slides,
    master_group_arrangement: masterGroupArrangement,
    updated_at: new Date().toISOString(),
  }
  if (typeof groupArrangement !== 'undefined') {
    updates.group_arrangement = groupArrangement
  } else {
    updates.group_arrangement = masterGroupArrangement
  }

  const { error } = await supabase
    .from('song_arrangements')
    .update(updates)
    .eq('id', arrangementId)

  if (error) {
    console.error('Error updating song arrangement slides:', error)
    return { success: false, error: 'Failed to update slides' }
  }

  revalidatePath(`/groups/${groupSlug}/songs/${songId}`)
  return { success: true }
}

export async function deleteSongArrangement(
  arrangementId: string,
  groupSlug: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('song_arrangements')
    .delete()
    .eq('id', arrangementId)

  if (error) {
    console.error('Error deleting song arrangement:', error)
    return { success: false, error: 'Failed to delete arrangement' }
  }

  revalidatePath(`/groups/${groupSlug}/songs/${songId}`)
  return { success: true }
}

/**
 * Parse lyrics text into slides by splitting on blank lines (paragraph breaks)
 */
export async function parseLyricsToSlides(text: string): Promise<SongSlide[]> {
  const blocks = text.split(/\n\s*\n/).filter(block => block.trim())
  
  return blocks.map((block, index) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    
    // Try to detect the slide type from the first line
    const firstLine = lines[0]?.toLowerCase() || ''
    let label: SongSlide['label'] = 'verse'
    let customLabel: string | undefined
    
    // Check for common section markers
    if (/^(title|song title|song name)\s*$/i.test(firstLine)) {
      label = 'title'
      if (/^(title|song title|song name)\s*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^(verse|v)\s*\d*/i.test(firstLine)) {
      label = 'verse'
      if (/^(verse|v)\s*\d*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^(chorus|c)\s*\d*/i.test(firstLine)) {
      label = 'chorus'
      if (/^(chorus|c)\s*\d*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^(bridge|b)\s*\d*/i.test(firstLine)) {
      label = 'bridge'
      if (/^(bridge|b)\s*\d*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^(pre-?chorus|pc)\s*\d*/i.test(firstLine)) {
      label = 'pre-chorus'
      if (/^(pre-?chorus|pc)\s*\d*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^(outro|ending)\s*\d*/i.test(firstLine)) {
      label = 'outro'
      if (/^(outro|ending)\s*\d*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^(intro|opening)\s*\d*/i.test(firstLine)) {
      label = 'intro'
      if (/^(intro|opening)\s*\d*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^(tag|coda)\s*\d*/i.test(firstLine)) {
      label = 'tag'
      if (/^(tag|coda)\s*\d*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^(interlude|instrumental)\s*\d*/i.test(firstLine)) {
      label = 'interlude'
      if (/^(interlude|instrumental)\s*\d*$/i.test(lines[0])) {
        lines.shift()
      }
    } else if (/^\[.+\]$/.test(firstLine)) {
      label = 'custom'
      customLabel = lines[0].replace(/^\[|\]$/g, '')
      lines.shift()
    }
    
    return {
      id: `slide-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      label,
      customLabel,
      lines: lines.length > 0 ? lines : [''],
    }
  })
}

/**
 * Create a default arrangement for a song using its lyrics.
 * This is called automatically when lyrics are uploaded.
 */
export async function createDefaultArrangementFromLyrics(
  songId: string,
  groupId: string,
  lyricsText: string
): Promise<{ success: boolean; error?: string; arrangement?: SongArrangement }> {
  const supabase = createServerSupabaseClient()
  
  // Check if a "Default" arrangement already exists
  const { data: existing } = await supabase
    .from('song_arrangements')
    .select('id')
    .eq('song_id', songId)
    .eq('name', 'Default')
    .single()
  
  if (existing) {
    // Update existing default arrangement with new slides
    const slides = await parseLyricsToSlides(lyricsText)
    const masterGroupArrangement = buildMasterGroupArrangementFromSlides(slides)
    const { error } = await supabase
      .from('song_arrangements')
      .update({
        slides,
        group_arrangement: masterGroupArrangement,
        master_group_arrangement: masterGroupArrangement,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    
    if (error) {
      console.error('Error updating default arrangement:', error)
      return { success: false, error: 'Failed to update default arrangement' }
    }
    
    return { success: true }
  }
  
  // Create new default arrangement
  const slides = await parseLyricsToSlides(lyricsText)
  const masterGroupArrangement = buildMasterGroupArrangementFromSlides(slides)
  
  const { data, error } = await supabase
    .from('song_arrangements')
    .insert({
      song_id: songId,
      group_id: groupId,
      name: 'Default',
      slides,
      group_arrangement: masterGroupArrangement,
      master_group_arrangement: masterGroupArrangement,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating default arrangement:', error)
    return { success: false, error: 'Failed to create default arrangement' }
  }
  
  return { success: true, arrangement: data }
}

/**
 * Create default arrangements for multiple songs in bulk.
 * Only creates arrangements for songs that have lyrics and don't already have a Default arrangement.
 */
export async function createDefaultArrangementsForSongs(
  songIds: string[],
  groupSlug: string
): Promise<{ success: boolean; created: number; skipped: number; error?: string }> {
  const supabase = createServerSupabaseClient()
  let created = 0
  let skipped = 0
  
  for (const songId of songIds) {
    // Check if song already has a Default arrangement
    const { data: existingArrangement } = await supabase
      .from('song_arrangements')
      .select('id')
      .eq('song_id', songId)
      .eq('name', 'Default')
      .single()
    
    if (existingArrangement) {
      skipped++
      continue
    }
    
    const { data: asset } = await supabase
      .from('song_assets')
      .select('id, group_id, storage_bucket, storage_path, mime_type, original_filename')
      .eq('song_id', songId)
      .eq('asset_type', 'lyrics_source')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (!asset) {
      skipped++
      continue
    }
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path)
    
    if (downloadError || !fileData) {
      skipped++
      continue
    }
    
    let extractedText = ''
    try {
      const buffer = Buffer.from(await fileData.arrayBuffer())
      const { text, warning } = await extractText(buffer, asset.mime_type, asset.original_filename)
      extractedText = text
      await supabase
        .from('song_assets')
        .update({
          extracted_text: null,
          extract_status: 'extracted',
          extract_warning: warning || null,
        })
        .eq('id', asset.id)
    } catch (extractError) {
      const errorMessage = extractError instanceof Error ? extractError.message : 'Unknown extraction error'
      await supabase
        .from('song_assets')
        .update({
          extract_status: 'failed',
          extract_warning: errorMessage,
        })
        .eq('id', asset.id)
      skipped++
      continue
    }
    
    if (!extractedText.trim()) {
      skipped++
      continue
    }
    
    // Create the default arrangement
    const slides = await parseLyricsToSlides(extractedText)
    const masterGroupArrangement = buildMasterGroupArrangementFromSlides(slides)
    
    const { error } = await supabase
      .from('song_arrangements')
      .insert({
        song_id: songId,
        group_id: asset.group_id,
        name: 'Default',
        slides,
        group_arrangement: masterGroupArrangement,
        master_group_arrangement: masterGroupArrangement,
      })
    
    if (error) {
      console.error(`Error creating default arrangement for song ${songId}:`, error)
      skipped++
    } else {
      created++
    }
  }
  
  // Revalidate paths
  revalidatePath(`/groups/${groupSlug}/songs`)
  revalidatePath('/songs')
  
  return { success: true, created, skipped }
}
