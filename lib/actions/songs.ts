'use server'

import { revalidatePath } from 'next/cache'
import {
  createServerSupabaseClient,
  type MusicGroup,
  type Song,
  type SongArrangement,
  type SongAsset,
} from '@/lib/supabase/server'
import { extractText } from '@/lib/extractors'
import { createDefaultArrangementFromLyrics } from '@/lib/actions/song-arrangements'
import { createSongRevisionSnapshot } from '@/lib/actions/song-revisions'

export type SongWithGroup = Song & { music_groups: MusicGroup }

export interface DuplicateCheckResult {
  isDuplicate: boolean
  existingSong?: Song
  matchType?: 'title' | 'title_and_lyrics' | 'lyrics'
}

export interface SongListStats {
  arrangementCount: number
  lastUsedDate: string | null
  totalUses: number
}

/**
 * Normalize text for comparison by removing extra whitespace, 
 * converting to lowercase, and removing common punctuation
 */
function normalizeTextForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim()
}

/**
 * Check if lyrics are similar enough to be considered a match.
 * Uses a simple similarity threshold.
 */
function areLyricsSimilar(text1: string, text2: string, threshold = 0.85): boolean {
  const norm1 = normalizeTextForComparison(text1)
  const norm2 = normalizeTextForComparison(text2)
  
  // If either is empty, they can't match on lyrics
  if (!norm1 || !norm2) return false
  
  // Simple length-based quick reject
  const lenRatio = Math.min(norm1.length, norm2.length) / Math.max(norm1.length, norm2.length)
  if (lenRatio < 0.5) return false
  
  // For short texts, require exact match
  if (norm1.length < 50 || norm2.length < 50) {
    return norm1 === norm2
  }
  
  // For longer texts, check if one contains most of the other
  // or if they share significant common substrings
  const words1 = new Set(norm1.split(' '))
  const words2 = new Set(norm2.split(' '))
  
  let commonWords = 0
  for (const word of words1) {
    if (words2.has(word)) commonWords++
  }
  
  const similarity = (2 * commonWords) / (words1.size + words2.size)
  return similarity >= threshold
}

async function getSlidesTextBySongIds(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  songIds: string[]
): Promise<Map<string, string>> {
  if (songIds.length === 0) {
    return new Map()
  }

  const { data: groupRows, error: groupError } = await supabase
    .from('song_slide_groups')
    .select('id, song_id, label, custom_label, position')
    .in('song_id', songIds)

  if (groupError || !groupRows) {
    console.error('Error fetching song slide groups:', groupError)
    return new Map()
  }

  const { data: slideRows, error: slideError } = await supabase
    .from('song_slides')
    .select('song_id, slide_group_id, position, lines')
    .in('song_id', songIds)

  if (slideError || !slideRows) {
    console.error('Error fetching song slides:', slideError)
    return new Map()
  }

  const groupsBySong = new Map<string, Array<{ id: string; position: number }>>()
  groupRows.forEach((group) => {
    const list = groupsBySong.get(group.song_id) ?? []
    list.push({ id: group.id, position: group.position })
    groupsBySong.set(group.song_id, list)
  })

  const slidesByGroupId = new Map<string, Array<{ position: number; lines: string[] }>>()
  slideRows.forEach((slide) => {
    const list = slidesByGroupId.get(slide.slide_group_id) ?? []
    list.push({ position: slide.position, lines: slide.lines })
    slidesByGroupId.set(slide.slide_group_id, list)
  })

  const result = new Map<string, string>()
  groupsBySong.forEach((groups, songId) => {
    const orderedGroups = [...groups].sort((a, b) => a.position - b.position)
    const slideBlocks: string[] = []

    orderedGroups.forEach((group) => {
      const groupSlides = slidesByGroupId.get(group.id) ?? []
      groupSlides
        .sort((a, b) => a.position - b.position)
        .forEach((slide) => {
          slideBlocks.push(slide.lines.join('\n'))
        })
    })

    result.set(songId, slideBlocks.join('\n\n'))
  })

  return result
}

/**
 * Check if a song with the same title (and optionally lyrics) already exists
 */
export async function checkForDuplicateSong(
  groupId: string,
  title: string,
  lyrics?: string
): Promise<DuplicateCheckResult> {
  const supabase = createServerSupabaseClient()
  
  // Normalize title for comparison
  const normalizedTitle = title.toLowerCase().trim()
  
  // Find songs with matching titles in this group
  const { data: existingSongs, error } = await supabase
    .from('songs')
    .select('*')
    .eq('group_id', groupId)
  
  if (error || !existingSongs) {
    return { isDuplicate: false }
  }
  
  // Find title matches
  const titleMatches = existingSongs.filter(
    song => song.title.toLowerCase().trim() === normalizedTitle
  )
  
  if (titleMatches.length === 0) {
    return { isDuplicate: false }
  }
  
  // If we have lyrics, check for lyrics match too
  if (lyrics?.trim()) {
    const songIds = titleMatches.map((song) => song.id)
    const lyricsBySongId = await getSlidesTextBySongIds(supabase, songIds)
    
    for (const song of titleMatches) {
      const existingLyrics = lyricsBySongId.get(song.id) ?? ''
      
      if (existingLyrics && areLyricsSimilar(lyrics, existingLyrics)) {
        return {
          isDuplicate: true,
          existingSong: song,
          matchType: 'title_and_lyrics',
        }
      }
    }
    
    // Title matches but lyrics don't
    return {
      isDuplicate: true,
      existingSong: titleMatches[0],
      matchType: 'title',
    }
  }
  
  // Just title match (no lyrics to compare)
  return {
    isDuplicate: true,
    existingSong: titleMatches[0],
    matchType: 'title',
  }
}

/**
 * Check if lyrics are a duplicate of ANY song in this group (even if title differs).
 */
export async function checkForDuplicateLyrics(
  groupId: string,
  lyrics: string
): Promise<DuplicateCheckResult> {
  const supabase = createServerSupabaseClient()

  const text = lyrics?.trim()
  if (!text) return { isDuplicate: false }

  // Fetch all songs in the group (IDs needed to load slide text)
  const { data: songs, error } = await supabase
    .from('songs')
    .select('id, title, group_id, created_at, default_key, ccli_id, artist, link_url')
    .eq('group_id', groupId)

  if (error || !songs || songs.length === 0) {
    return { isDuplicate: false }
  }

  const songIds = songs.map((s) => s.id)
  const lyricsBySongId = await getSlidesTextBySongIds(supabase, songIds)

  for (const song of songs as Song[]) {
    const existingLyrics = lyricsBySongId.get(song.id) ?? ''
    if (!existingLyrics) continue
    if (areLyricsSimilar(text, existingLyrics)) {
      return { isDuplicate: true, existingSong: song, matchType: 'lyrics' }
    }
  }

  return { isDuplicate: false }
}

/**
 * Extract text from a file without creating a song.
 * Used for duplicate checking before song creation.
 */
export async function extractTextFromFile(
  formData: FormData
): Promise<{ success: boolean; text?: string; title?: string; error?: string }> {
  const file = formData.get('file') as File | null
  
  if (!file) {
    return { success: false, error: 'No file provided' }
  }
  
  const title = file.name.split('.').slice(0, -1).join('.').trim()
  const mimeType = file.type || 'application/octet-stream'
  
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const { text } = await extractText(buffer, mimeType, file.name)
    
    return { success: true, text, title }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to extract text'
    return { success: false, error: errorMessage, title }
  }
}

export async function getSongs(groupId: string, search?: string): Promise<Song[]> {
  const supabase = createServerSupabaseClient()
  let query = supabase
    .from('songs')
    .select('*')
    .eq('group_id', groupId)
    .order('title')

  if (search?.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching songs:', error)
    return []
  }

  return data || []
}

export type SongArrangementSummary = Pick<SongArrangement, 'id' | 'song_id' | 'name'>

export async function getSongsWithArrangements(
  groupId: string
): Promise<{ songs: Song[]; arrangements: SongArrangementSummary[] }> {
  const supabase = createServerSupabaseClient()
  const { data: songs, error: songsError } = await supabase
    .from('songs')
    .select('*')
    .eq('group_id', groupId)
    .order('title')

  if (songsError || !songs) {
    console.error('Error fetching songs:', songsError)
    return { songs: [], arrangements: [] }
  }

  if (songs.length === 0) {
    return { songs, arrangements: [] }
  }

  const songIds = songs.map((song) => song.id)
  const { data: arrangements, error: arrangementsError } = await supabase
    .from('song_arrangements')
    .select('id, song_id, name')
    .in('song_id', songIds)
    .order('created_at', { ascending: true })

  if (arrangementsError) {
    console.error('Error fetching song arrangements:', arrangementsError)
    return { songs, arrangements: [] }
  }

  return { songs, arrangements: (arrangements as SongArrangementSummary[]) || [] }
}

function buildSongStats(
  songs: Song[],
  arrangementRows: Array<{ song_id: string }>,
  usageRows: Array<{ song_id: string; sets?: { service_date: string } | null }>
): Record<string, SongListStats> {
  const stats: Record<string, SongListStats> = {}
  songs.forEach((song) => {
    stats[song.id] = { arrangementCount: 0, lastUsedDate: null, totalUses: 0 }
  })

  arrangementRows.forEach((row) => {
    if (!stats[row.song_id]) return
    stats[row.song_id].arrangementCount += 1
  })

  usageRows.forEach((row) => {
    if (!stats[row.song_id] || !row.sets?.service_date) return
    stats[row.song_id].totalUses += 1
    const next = row.sets.service_date
    const current = stats[row.song_id].lastUsedDate
    if (!current || new Date(next) > new Date(current)) {
      stats[row.song_id].lastUsedDate = next
    }
  })

  return stats
}

export async function getSongsWithStats(
  groupId: string,
  search?: string
): Promise<Array<Song & SongListStats>> {
  const supabase = createServerSupabaseClient()
  let query = supabase
    .from('songs')
    .select('*')
    .eq('group_id', groupId)
    .order('title')

  if (search?.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  const { data: songs, error: songsError } = await query

  if (songsError || !songs) {
    console.error('Error fetching songs:', songsError)
    return []
  }

  if (songs.length === 0) {
    return []
  }

  const songIds = songs.map((song) => song.id)

  const [{ data: arrangements }, { data: usageRows }] = await Promise.all([
    supabase
      .from('song_arrangements')
      .select('song_id')
      .in('song_id', songIds),
    supabase
      .from('set_songs')
      .select('song_id, sets!inner(service_date, group_id)')
      .in('song_id', songIds)
      .eq('sets.group_id', groupId),
  ])

  const stats = buildSongStats(
    songs,
    arrangements as Array<{ song_id: string }> || [],
    usageRows as Array<{ song_id: string; sets?: { service_date: string } | null }> || []
  )

  return songs.map((song) => ({
    ...song,
    ...stats[song.id],
  }))
}

export async function getSongsWithArrangementsAndStats(
  groupId: string
): Promise<{ songs: Array<Song & SongListStats>; arrangements: SongArrangementSummary[] }> {
  const supabase = createServerSupabaseClient()
  const { data: songs, error: songsError } = await supabase
    .from('songs')
    .select('*')
    .eq('group_id', groupId)
    .order('title')

  if (songsError || !songs) {
    console.error('Error fetching songs:', songsError)
    return { songs: [], arrangements: [] }
  }

  if (songs.length === 0) {
    return { songs: [], arrangements: [] }
  }

  const songIds = songs.map((song) => song.id)
  const [{ data: arrangements }, { data: usageRows }] = await Promise.all([
    supabase
      .from('song_arrangements')
      .select('id, song_id, name')
      .in('song_id', songIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('set_songs')
      .select('song_id, sets!inner(service_date, group_id)')
      .in('song_id', songIds)
      .eq('sets.group_id', groupId),
  ])

  const stats = buildSongStats(
    songs,
    (arrangements as Array<{ song_id: string }>) || [],
    (usageRows as Array<{ song_id: string; sets?: { service_date: string } | null }>) || []
  )

  return {
    songs: songs.map((song) => ({
      ...song,
      ...stats[song.id],
    })),
    arrangements: (arrangements as SongArrangementSummary[]) || [],
  }
}

export async function getRecentSongs(groupId: string, limit: number = 5): Promise<Song[]> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching recent songs:', error)
    return []
  }

  return data || []
}

export async function getAllSongsWithGroups(options: {
  search?: string
  groupIds?: string[]
} = {}): Promise<SongWithGroup[]> {
  const supabase = createServerSupabaseClient()
  const term = options.search?.trim()

  let query = supabase
    .from('songs')
    .select('*, music_groups ( id, name, slug )')
    .order('created_at', { ascending: false })

  if (options.groupIds?.length) {
    query = query.in('group_id', options.groupIds)
  }

  if (term) {
    query = query.ilike('title', `%${term}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching songs with groups:', error)
    return []
  }

  return (data as SongWithGroup[]) || []
}

export async function getAllSongsWithGroupsWithStats(options: {
  search?: string
  groupIds?: string[]
} = {}): Promise<Array<SongWithGroup & SongListStats>> {
  const supabase = createServerSupabaseClient()
  const term = options.search?.trim()

  let query = supabase
    .from('songs')
    .select('*, music_groups ( id, name, slug )')
    .order('created_at', { ascending: false })

  if (options.groupIds?.length) {
    query = query.in('group_id', options.groupIds)
  }

  if (term) {
    query = query.ilike('title', `%${term}%`)
  }

  const { data: songs, error } = await query

  if (error || !songs) {
    console.error('Error fetching songs with groups:', error)
    return []
  }

  if (songs.length === 0) {
    return []
  }

  const songIds = songs.map((song) => song.id)

  const arrangementsQuery = supabase
    .from('song_arrangements')
    .select('song_id')
    .in('song_id', songIds)

  let usageQuery = supabase
    .from('set_songs')
    .select('song_id, sets!inner(service_date, group_id)')
    .in('song_id', songIds)

  if (options.groupIds?.length) {
    usageQuery = usageQuery.in('sets.group_id', options.groupIds)
  }

  const [{ data: arrangements }, { data: usageRows }] = await Promise.all([
    arrangementsQuery,
    usageQuery,
  ])

  const stats = buildSongStats(
    songs as Song[],
    arrangements as Array<{ song_id: string }> || [],
    usageRows as Array<{ song_id: string; sets?: { service_date: string } | null }> || []
  )

  return (songs as SongWithGroup[]).map((song) => ({
    ...song,
    ...stats[song.id],
  }))
}

export async function getSongById(id: string, groupId: string): Promise<Song | null> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('id', id)
    .eq('group_id', groupId)
    .single()

  if (error) {
    return null
  }

  return data
}

export async function getSongAssets(songId: string): Promise<SongAsset[]> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('song_assets')
    .select('*')
    .eq('song_id', songId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching song assets:', error)
    return []
  }

  return data || []
}

export async function createSong(
  groupId: string,
  groupSlug: string,
  formData: FormData
): Promise<{ success: boolean; error?: string; song?: Song }> {
  const title = formData.get('title') as string
  const file = formData.get('file') as File | null
  const lyrics = formData.get('lyrics') as string | null
  const overrideExistingId = formData.get('overrideExistingId') as string | null
  const defaultKeyRaw = formData.get('default_key')
  const ccliIdRaw = formData.get('ccli_id')
  const artistRaw = formData.get('artist')
  const linkUrlRaw = formData.get('link_url')

  let songTitle = title?.trim()

  // If no title provided but we have a file, use filename
  if (!songTitle && file) {
    songTitle = file.name.split('.').slice(0, -1).join('.')
  }

  if (!songTitle) {
    return { success: false, error: 'Title is required' }
  }

  const supabase = createServerSupabaseClient()

  const createMeta = {
    default_key: typeof defaultKeyRaw === 'string' && defaultKeyRaw.trim() ? defaultKeyRaw.trim() : null,
    ccli_id: typeof ccliIdRaw === 'string' && ccliIdRaw.trim() ? ccliIdRaw.trim() : null,
    artist: typeof artistRaw === 'string' && artistRaw.trim() ? artistRaw.trim() : null,
    link_url: typeof linkUrlRaw === 'string' && linkUrlRaw.trim() ? linkUrlRaw.trim() : null,
  }

  // If overriding an existing song
  if (overrideExistingId) {
    const { data: existingSong, error: fetchError } = await supabase
      .from('songs')
      .select('*')
      .eq('id', overrideExistingId)
      .eq('group_id', groupId)
      .single()

    if (fetchError || !existingSong) {
      return { success: false, error: 'Existing song not found' }
    }

    const updatePatch: Record<string, string | null> = { title: songTitle }
    if (createMeta.default_key) updatePatch.default_key = createMeta.default_key
    if (createMeta.ccli_id) updatePatch.ccli_id = createMeta.ccli_id
    if (createMeta.artist) updatePatch.artist = createMeta.artist
    if (createMeta.link_url) updatePatch.link_url = createMeta.link_url

    const { data: updatedSong, error: updateError } = await supabase
      .from('songs')
      .update(updatePatch)
      .eq('id', existingSong.id)
      .eq('group_id', groupId)
      .select()
      .single()

    if (updateError || !updatedSong) {
      return { success: false, error: 'Failed to update song' }
    }

    // Delete old lyrics_source assets for this song
    const { data: oldAssets } = await supabase
      .from('song_assets')
      .select('storage_path')
      .eq('song_id', existingSong.id)
      .eq('asset_type', 'lyrics_source')

    if (oldAssets?.length) {
      // Delete from storage
      await supabase.storage
        .from('music-assets')
        .remove(oldAssets.map(a => a.storage_path))
      
      // Delete asset records
      await supabase
        .from('song_assets')
        .delete()
        .eq('song_id', existingSong.id)
        .eq('asset_type', 'lyrics_source')
    }

    // Handle new content
    if (file) {
      const preExtractedText = lyrics?.trim() ? lyrics.trim() : undefined
      await processFileUpload(supabase, existingSong.id, groupId, file, preExtractedText)
    } else if (lyrics?.trim()) {
      await processManualLyrics(supabase, existingSong.id, groupId, lyrics.trim())
    }

    await createSongRevisionSnapshot(existingSong.id, groupId)

    revalidatePath(`/groups/${groupSlug}/songs`)
    revalidatePath(`/groups/${groupSlug}/songs/${existingSong.id}`)
    revalidatePath('/songs')
    return { success: true, song: updatedSong }
  }
  
  // Create new song
  const { data: song, error: songError } = await supabase
    .from('songs')
    .insert({
      title: songTitle,
      group_id: groupId,
      ...createMeta,
    })
    .select()
    .single()

  if (songError || !song) {
    return { success: false, error: 'Failed to create song' }
  }

  // Handle File Upload (if present)
  if (file) {
    const preExtractedText = lyrics?.trim() ? lyrics.trim() : undefined
    await processFileUpload(supabase, song.id, groupId, file, preExtractedText)
  }
  // Handle Manual Lyrics (if present and no file)
  else if (lyrics?.trim()) {
    await processManualLyrics(supabase, song.id, groupId, lyrics.trim())
  }

  await createSongRevisionSnapshot(song.id, groupId)

  revalidatePath(`/groups/${groupSlug}/songs`)
  revalidatePath('/songs')
  return { success: true, song: song }
}

async function processFileUpload(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  songId: string,
  groupId: string,
  file: File,
  preExtractedText?: string
) {
  const mimeType = file.type || 'application/octet-stream'
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const storagePath = `songs/${songId}/${timestamp}-${safeName}`
  
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('music-assets')
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    console.error('Failed to upload file:', uploadError)
    return
  }

  // If we have pre-extracted text, use it directly
  if (preExtractedText !== undefined) {
    await supabase
      .from('song_assets')
      .insert({
        song_id: songId,
        group_id: groupId,
        asset_type: 'lyrics_source',
        original_filename: file.name,
        mime_type: mimeType,
        storage_bucket: 'music-assets',
        storage_path: storagePath,
        extract_status: 'extracted',
      })
    
    // Auto-create default arrangement from lyrics
    if (preExtractedText.trim()) {
      await createDefaultArrangementFromLyrics(songId, groupId, preExtractedText)
    }
    return
  }

  // Create asset record and extract text
  const { data: asset, error: insertError } = await supabase
    .from('song_assets')
    .insert({
      song_id: songId,
      group_id: groupId,
      asset_type: 'lyrics_source',
      original_filename: file.name,
      mime_type: mimeType,
      storage_bucket: 'music-assets',
      storage_path: storagePath,
      extract_status: 'extracting',
    })
    .select()
    .single()

  if (insertError || !asset) {
    console.error('Failed to create asset record:', insertError)
    return
  }

  // Extract text
  try {
    const { text, warning } = await extractText(buffer, mimeType, file.name)
    
    await supabase
      .from('song_assets')
      .update({
        extract_status: 'extracted',
        extract_warning: warning || null,
      })
      .eq('id', asset.id)
    
    // Auto-create default arrangement from lyrics
    if (text?.trim()) {
      await createDefaultArrangementFromLyrics(songId, groupId, text)
    }
  } catch (extractError) {
    const errorMessage = extractError instanceof Error ? extractError.message : 'Unknown extraction error'
    await supabase
      .from('song_assets')
      .update({
        extract_status: 'failed',
        extract_warning: errorMessage,
      })
      .eq('id', asset.id)
  }
}

async function processManualLyrics(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  songId: string,
  groupId: string,
  lyrics: string
) {
  const timestamp = Date.now()
  const filename = 'manual-lyrics.txt'
  const storagePath = `songs/${songId}/${timestamp}-${filename}`
  const buffer = Buffer.from(lyrics)

  // Upload as text file
  const { error: uploadError } = await supabase.storage
    .from('music-assets')
    .upload(storagePath, buffer, {
      contentType: 'text/plain',
      upsert: false,
    })

  if (uploadError) {
    console.error('Failed to upload manual lyrics:', uploadError)
    return
  }

  // Create asset record
  await supabase
    .from('song_assets')
    .insert({
      song_id: songId,
      group_id: groupId,
      asset_type: 'lyrics_source',
      original_filename: filename,
      mime_type: 'text/plain',
      storage_bucket: 'music-assets',
      storage_path: storagePath,
      extract_status: 'extracted',
    })
  
  // Auto-create default arrangement from lyrics
  await createDefaultArrangementFromLyrics(songId, groupId, lyrics)
}

export async function createSongsBulk(
  groupId: string,
  groupSlug: string,
  formData: FormData
): Promise<{ success: boolean; error?: string; count?: number }> {
  const rawInput = formData.get('bulkInput') as string

  if (!rawInput?.trim()) {
    return { success: false, error: 'No input provided' }
  }

  const songsToCreate = rawInput
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // Each line is just a song title
      return { title: line, group_id: groupId }
    })

  if (songsToCreate.length === 0) {
    return { success: false, error: 'No valid songs found in input' }
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('songs')
    .insert(songsToCreate)

  if (error) {
    console.error('Bulk create error:', error)
    return { success: false, error: 'Failed to create songs' }
  }

  revalidatePath(`/groups/${groupSlug}/songs`)
  revalidatePath('/songs')
  return { success: true, count: songsToCreate.length }
}

export interface CreateSongFromFileOptions {
  /** If provided, replace this existing song's lyrics instead of creating new */
  overrideExistingId?: string
  /** Pre-extracted text (to avoid re-extraction) */
  extractedText?: string
}

export interface SongUsageInfo {
  totalUses: number
  upcomingUses: number
  firstUsedDate: string | null
  lastUsedDate: string | null
  arrangementCounts: Array<{ arrangementId: string | null; count: number }>
}

export async function getSongUsageInfo(songId: string, groupId: string): Promise<SongUsageInfo> {
  const supabase = createServerSupabaseClient()
  const today = new Date().toISOString().split('T')[0]

  const { count: totalUses, error: totalError } = await supabase
    .from('set_songs')
    .select('id, sets!inner(group_id)', { count: 'exact', head: true })
    .eq('song_id', songId)
    .eq('sets.group_id', groupId)

  if (totalError) {
    console.error('Error fetching song usage count:', totalError)
  }

  const { count: upcomingUses, error: upcomingError } = await supabase
    .from('set_songs')
    .select('id, sets!inner(service_date, group_id)', { count: 'exact', head: true })
    .eq('song_id', songId)
    .eq('sets.group_id', groupId)
    .gte('sets.service_date', today)

  if (upcomingError) {
    console.error('Error fetching song upcoming usage count:', upcomingError)
  }

  const { data: firstSet, error: firstError } = await supabase
    .from('sets')
    .select('service_date, set_songs!inner(song_id)')
    .eq('group_id', groupId)
    .eq('set_songs.song_id', songId)
    .order('service_date', { ascending: true })
    .limit(1)

  if (firstError) {
    console.error('Error fetching song first used date:', firstError)
  }

  const { data: lastSet, error: lastError } = await supabase
    .from('sets')
    .select('service_date, set_songs!inner(song_id)')
    .eq('group_id', groupId)
    .eq('set_songs.song_id', songId)
    .order('service_date', { ascending: false })
    .limit(1)

  if (lastError) {
    console.error('Error fetching song last used date:', lastError)
  }

  const { data: arrangementRows, error: arrangementError } = await supabase
    .from('set_songs')
    .select('arrangement_id, sets!inner(group_id)')
    .eq('song_id', songId)
    .eq('sets.group_id', groupId)

  if (arrangementError) {
    console.error('Error fetching song arrangement usage:', arrangementError)
  }

  const arrangementMap = new Map<string | null, number>()
  arrangementRows?.forEach((row: { arrangement_id: string | null }) => {
    const key = row.arrangement_id ?? null
    arrangementMap.set(key, (arrangementMap.get(key) ?? 0) + 1)
  })

  const arrangementCounts = Array.from(arrangementMap.entries())
    .map(([arrangementId, count]) => ({ arrangementId, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalUses: totalUses ?? 0,
    upcomingUses: upcomingUses ?? 0,
    firstUsedDate: firstSet?.[0]?.service_date ?? null,
    lastUsedDate: lastSet?.[0]?.service_date ?? null,
    arrangementCounts,
  }
}

/**
 * Creates a single song from a file upload, or overrides an existing song.
 * Optimized for bulk upload operations - handles one file at a time
 * so multiple can be processed concurrently from the client.
 */
export async function createSongFromFile(
  groupId: string,
  groupSlug: string,
  formData: FormData,
  options?: CreateSongFromFileOptions
): Promise<{ success: boolean; error?: string; song?: Song }> {
  const file = formData.get('file') as File | null

  if (!file) {
    return { success: false, error: 'No file provided' }
  }

  // Derive title from filename (remove extension)
  const songTitle = file.name.split('.').slice(0, -1).join('.').trim()

  if (!songTitle) {
    return { success: false, error: 'Could not derive song title from filename' }
  }

  const supabase = createServerSupabaseClient()

  // If overriding, update existing song's assets
  if (options?.overrideExistingId) {
    const { data: existingSong, error: fetchError } = await supabase
      .from('songs')
      .select('*')
      .eq('id', options.overrideExistingId)
      .eq('group_id', groupId)
      .single()

    if (fetchError || !existingSong) {
      return { success: false, error: 'Existing song not found' }
    }

    // Delete old lyrics_source assets for this song
    const { data: oldAssets } = await supabase
      .from('song_assets')
      .select('storage_path')
      .eq('song_id', existingSong.id)
      .eq('asset_type', 'lyrics_source')

    if (oldAssets?.length) {
      // Delete from storage
      await supabase.storage
        .from('music-assets')
        .remove(oldAssets.map(a => a.storage_path))
      
      // Delete asset records
      await supabase
        .from('song_assets')
        .delete()
        .eq('song_id', existingSong.id)
        .eq('asset_type', 'lyrics_source')
    }

    // Upload new file
    await processFileUpload(supabase, existingSong.id, groupId, file, options.extractedText)

    await createSongRevisionSnapshot(existingSong.id, groupId)

    return { success: true, song: existingSong }
  }

  // Create new song
  const { data: song, error: songError } = await supabase
    .from('songs')
    .insert({
      title: songTitle,
      group_id: groupId,
    })
    .select()
    .single()

  if (songError || !song) {
    console.error('Failed to create song:', songError)
    return { success: false, error: 'Failed to create song' }
  }

  // Process the file upload and extract text
  await processFileUpload(supabase, song.id, groupId, file, options?.extractedText)

  await createSongRevisionSnapshot(song.id, groupId)

  return { success: true, song }
}

/**
 * Revalidate song-related paths. Call after bulk operations complete.
 */
export async function revalidateSongPaths(groupSlug: string) {
  revalidatePath(`/groups/${groupSlug}/songs`)
  revalidatePath('/songs')
}

export async function updateSong(
  id: string,
  groupId: string,
  groupSlug: string,
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const title = formData.get('title') as string
  const defaultKeyRaw = formData.get('default_key')
  const ccliIdRaw = formData.get('ccli_id')
  const artistRaw = formData.get('artist')
  const linkUrlRaw = formData.get('link_url')

  if (!title?.trim()) {
    return { success: false, error: 'Title is required' }
  }

  const updatePatch: Record<string, string | null> = {
    title: title.trim(),
  }

  if (defaultKeyRaw !== null) {
    updatePatch.default_key = typeof defaultKeyRaw === 'string' && defaultKeyRaw.trim() ? defaultKeyRaw.trim() : null
  }
  if (ccliIdRaw !== null) {
    updatePatch.ccli_id = typeof ccliIdRaw === 'string' && ccliIdRaw.trim() ? ccliIdRaw.trim() : null
  }
  if (artistRaw !== null) {
    updatePatch.artist = typeof artistRaw === 'string' && artistRaw.trim() ? artistRaw.trim() : null
  }
  if (linkUrlRaw !== null) {
    updatePatch.link_url = typeof linkUrlRaw === 'string' && linkUrlRaw.trim() ? linkUrlRaw.trim() : null
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('songs')
    .update(updatePatch)
    .eq('id', id)
    .eq('group_id', groupId)

  if (error) {
    return { success: false, error: 'Failed to update song' }
  }

  await createSongRevisionSnapshot(id, groupId)

  revalidatePath(`/groups/${groupSlug}/songs`)
  revalidatePath(`/groups/${groupSlug}/songs/${id}`)
  return { success: true }
}

export async function deleteSong(
  id: string,
  groupId: string,
  groupSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('songs')
    .delete()
    .eq('id', id)
    .eq('group_id', groupId)

  if (error) {
    return { success: false, error: 'Failed to delete song' }
  }

  revalidatePath(`/groups/${groupSlug}/songs`)
  return { success: true }
}

export async function updateSongAssetText(
  assetId: string,
  text: string,
  revalidatePaths: string[] = []
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { data: asset, error: assetError } = await supabase
    .from('song_assets')
    .select('id, song_id, group_id, asset_type')
    .eq('id', assetId)
    .single()

  if (assetError || !asset) {
    return { success: false, error: 'Failed to load asset' }
  }

  let resolvedGroupId = asset.group_id

  if (asset.asset_type === 'lyrics_source' && text.trim()) {
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

  const { error } = await supabase
    .from('song_assets')
    .update({
      extract_status: 'extracted',
    })
    .eq('id', assetId)

  if (error) {
    return { success: false, error: 'Failed to update slides' }
  }

  if (asset.song_id && resolvedGroupId) {
    await createSongRevisionSnapshot(asset.song_id, resolvedGroupId)
  }

  revalidatePaths.forEach((path) => revalidatePath(path))
  return { success: true }
}
