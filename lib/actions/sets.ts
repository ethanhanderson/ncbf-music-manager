'use server'

import { revalidatePath } from 'next/cache'
import { cache } from 'react'
import { createServerSupabaseClient, type Set, type SetWithSongs } from '@/lib/supabase/server'

export type SetCatalogRow = Set & {
  music_groups: { name: string; slug: string } | null
  songCount: number
}

export const getGroupSets = cache(async (
  groupId: string
): Promise<Array<Set & { songCount: number; arrangementCount: number }>> => {
  const supabase = createServerSupabaseClient()
  const { data: sets, error } = await supabase
    .from('sets')
    .select('*')
    .eq('group_id', groupId)
    .order('service_date', { ascending: false })
  
  if (error || !sets) {
    console.error('Error fetching sets:', error)
    return []
  }

  if (sets.length === 0) {
    return []
  }

  const setIds = sets.map(s => s.id)
  const { data: setSongs, error: setSongsError } = await supabase
    .from('set_songs')
    .select('set_id, arrangement_id')
    .in('set_id', setIds)

  if (setSongsError) {
      console.error('Error fetching set songs:', setSongsError)
  }

  const songCounts = new Map<string, number>()
  const arrangementCounts = new Map<string, number>()
  setSongs?.forEach(row => {
      songCounts.set(row.set_id, (songCounts.get(row.set_id) ?? 0) + 1)
      if (row.arrangement_id) {
        arrangementCounts.set(row.set_id, (arrangementCounts.get(row.set_id) ?? 0) + 1)
      }
  })
  
  return sets.map(set => ({
      ...set,
      songCount: songCounts.get(set.id) ?? 0,
      arrangementCount: arrangementCounts.get(set.id) ?? 0,
  }))
})

export const getUpcomingSets = cache(
  async (limit = 10): Promise<(Set & { music_groups: { name: string; slug: string } })[]> => {
    const supabase = createServerSupabaseClient()
    const today = new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('sets')
      .select('*, music_groups(name, slug)')
      .gte('service_date', today)
      .order('service_date', { ascending: true })
      .limit(limit)
    
    if (error) {
      console.error('Error fetching upcoming sets:', error)
      return []
    }
    
    return data || []
  }
)

export const getUpcomingSetWithSongs = cache(async (): Promise<SetWithSongs | null> => {
  const supabase = createServerSupabaseClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('sets')
    .select(`
      *,
      music_groups(*),
      set_songs(
        *,
        songs(*),
        song_arrangements(*)
      )
    `)
    .gte('service_date', today)
    .order('service_date', { ascending: true })
    .limit(1)

  if (error) {
    console.error('Error fetching upcoming set:', error)
    return null
  }

  const set = data?.[0] ?? null
  if (set?.set_songs) {
    set.set_songs.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
  }

  return set
})

export const getAllSetsWithGroups = cache(async ({
  groupIds,
}: {
  groupIds?: string[]
} = {}): Promise<SetCatalogRow[]> => {
  const supabase = createServerSupabaseClient()
  let query = supabase
    .from('sets')
    .select('*, music_groups(name, slug)')
    .order('service_date', { ascending: false })

  if (groupIds?.length) {
    query = query.in('group_id', groupIds)
  }

  let setSongsQuery = supabase
    .from('set_songs')
    .select('set_id, sets!inner(group_id)')

  if (groupIds?.length) {
    setSongsQuery = setSongsQuery.in('sets.group_id', groupIds)
  }

  const [{ data: sets, error }, { data: setSongs, error: setSongsError }] = await Promise.all([
    query,
    setSongsQuery,
  ])

  if (error || !sets) {
    console.error('Error fetching sets catalog:', error)
    return []
  }

  if (sets.length === 0) {
    return []
  }

  if (setSongsError) {
    console.error('Error fetching set song counts:', setSongsError)
  }

  const songCounts = new Map<string, number>()
  for (const row of setSongs || []) {
    if (!row.set_id) continue
    songCounts.set(row.set_id, (songCounts.get(row.set_id) ?? 0) + 1)
  }

  return sets.map((set) => ({
    ...(set as Set & { music_groups: { name: string; slug: string } | null }),
    songCount: songCounts.get(set.id) ?? 0,
  }))
})

export const getUpcomingSetSongIds = cache(async (groupId: string): Promise<string[]> => {
  const supabase = createServerSupabaseClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('set_songs')
    .select('song_id, sets!inner(service_date, group_id)')
    .eq('sets.group_id', groupId)
    .gte('sets.service_date', today)

  if (error) {
    console.error('Error fetching upcoming set songs:', error)
    return []
  }

  const songIds = new Set<string>()
  data?.forEach((row) => {
    if (row.song_id) {
      songIds.add(row.song_id)
    }
  })

  return Array.from(songIds)
})

export const getSetById = cache(async (setId: string): Promise<SetWithSongs | null> => {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('sets')
    .select(`
      *,
      music_groups(*),
      set_songs(
        *,
        songs(*),
        song_arrangements(*)
      )
    `)
    .eq('id', setId)
    .single()
  
  if (error) {
    const errorCode = (error as { code?: string }).code
    const errorMessage = (error as { message?: string }).message ?? ''
    const isNotFound = errorCode === 'PGRST116' || errorMessage.includes('No rows')
    if (!isNotFound) {
      console.error('Error fetching set:', error)
    }
    return null
  }
  
  // Sort set_songs by position
  if (data?.set_songs) {
    data.set_songs.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
  }
  
  return data
})

export async function createSet(
  groupId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string; set?: Set }> {
  const serviceDate = formData.get('service_date') as string
  const notes = formData.get('notes') as string | null
  const rawSetSongs = formData.get('set_songs') as string | null
  
  if (!serviceDate) {
    return { success: false, error: 'Service date is required' }
  }
  
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('sets')
    .insert({
      group_id: groupId,
      service_date: serviceDate,
      notes: notes?.trim() || null,
    })
    .select()
    .single()
  
  if (error) {
    return { success: false, error: 'Failed to create set' }
  }

  const setSongs = parseSetSongsPayload(rawSetSongs)

  if (setSongs.length > 0) {
    const songIds = Array.from(new Set(setSongs.map((song) => song.songId)))
    const { data: validSongs, error: songFetchError } = await supabase
      .from('songs')
      .select('id')
      .eq('group_id', groupId)
      .in('id', songIds)

    if (!songFetchError && validSongs?.length) {
      const validSongIds = new Set(validSongs.map((song) => song.id))
      const missingArrangementSongIds = setSongs
        .filter((song) => !song.arrangementId && validSongIds.has(song.songId))
        .map((song) => song.songId)
      const defaultArrangementMap =
        missingArrangementSongIds.length > 0
          ? await getDefaultArrangementIds(supabase, missingArrangementSongIds)
          : new Map<string, string>()
      const rows = setSongs
        .filter((song) => validSongIds.has(song.songId))
        .map((song, index) => ({
          set_id: data.id,
          song_id: song.songId,
          arrangement_id:
            song.arrangementId || defaultArrangementMap.get(song.songId) || null,
          notes: song.notes?.trim() || null,
          position: song.position ?? index + 1,
        }))

      if (rows.length > 0) {
        const { error: setSongError } = await supabase.from('set_songs').insert(rows)
        if (setSongError) {
          console.error('Failed to add songs to new set:', setSongError)
        }
      }
    }
  }
  
  revalidatePath('/')
  return { success: true, set: data }
}

function parseSetSongsPayload(
  rawPayload: string | null
): Array<{ songId: string; arrangementId?: string | null; notes?: string | null; position?: number }> {
  if (!rawPayload?.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(rawPayload)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => ({
        songId: typeof item?.songId === 'string' ? item.songId : '',
        arrangementId: typeof item?.arrangementId === 'string' ? item.arrangementId : null,
        notes: typeof item?.notes === 'string' ? item.notes : null,
        position: typeof item?.position === 'number' ? item.position : undefined,
      }))
      .filter((item) => item.songId)
  } catch (error) {
    console.error('Failed to parse set songs payload:', error)
    return []
  }
}

export async function updateSet(setId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const serviceDate = formData.get('service_date') as string
  const notes = formData.get('notes') as string | null
  
  if (!serviceDate) {
    return { success: false, error: 'Service date is required' }
  }
  
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('sets')
    .update({
      service_date: serviceDate,
      notes: notes?.trim() || null,
    })
    .eq('id', setId)
  
  if (error) {
    return { success: false, error: 'Failed to update set' }
  }
  
  revalidatePath('/')
  return { success: true }
}

export async function deleteSet(setId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('sets')
    .delete()
    .eq('id', setId)
  
  if (error) {
    return { success: false, error: 'Failed to delete set' }
  }
  
  revalidatePath('/')
  return { success: true }
}

export async function addSongToSet(
  setId: string,
  songId: string,
  setGroupId: string,
  groupSlug: string,
  arrangementId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  // Ensure the song belongs to the same group as the set
  const { data: song } = await supabase
    .from('songs')
    .select('group_id')
    .eq('id', songId)
    .single()

  if (!song || song.group_id !== setGroupId) {
    return { success: false, error: 'Song does not belong to this group' }
  }

  // Get the current highest position
  const { data: existing } = await supabase
    .from('set_songs')
    .select('position')
    .eq('set_id', setId)
    .order('position', { ascending: false })
    .limit(1)
  
  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 1
  
  const resolvedArrangementId =
    arrangementId ||
    (await getDefaultArrangementIds(supabase, [songId])).get(songId) ||
    null

  const { error } = await supabase
    .from('set_songs')
    .insert({
      set_id: setId,
      song_id: songId,
      arrangement_id: resolvedArrangementId,
      position: nextPosition,
    })
  
  if (error) {
    return { success: false, error: 'Failed to add song to set' }
  }
  
  revalidatePath(`/groups/${groupSlug}/sets/${setId}`)
  return { success: true }
}

async function getDefaultArrangementIds(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  songIds: string[]
): Promise<Map<string, string>> {
  if (songIds.length === 0) return new Map()

  const { data: arrangements, error } = await supabase
    .from('song_arrangements')
    .select('id, song_id, is_locked, name')
    .in('song_id', songIds)
    .order('created_at', { ascending: true })

  if (error || !arrangements) {
    console.error('Error fetching default arrangements:', error)
    return new Map()
  }

  const bestBySong = new Map<
    string,
    { id: string; is_locked: boolean; name: string }
  >()

  arrangements.forEach((arrangement) => {
    const existing = bestBySong.get(arrangement.song_id)
    const score = arrangement.is_locked ? 2 : arrangement.name === 'Default' ? 1 : 0
    const existingScore = existing
      ? existing.is_locked
        ? 2
        : existing.name === 'Default'
          ? 1
          : 0
      : -1
    if (!existing || score > existingScore) {
      bestBySong.set(arrangement.song_id, arrangement)
    }
  })

  const resolved = new Map<string, string>()
  bestBySong.forEach((value, key) => {
    resolved.set(key, value.id)
  })

  return resolved
}

export async function removeSongFromSet(
  setSongId: string,
  setId: string,
  groupSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('set_songs')
    .delete()
    .eq('id', setSongId)
  
  if (error) {
    return { success: false, error: 'Failed to remove song from set' }
  }
  
  revalidatePath(`/groups/${groupSlug}/sets/${setId}`)
  return { success: true }
}

export async function updateSetSongPosition(
  setSongId: string,
  newPosition: number,
  setId: string,
  groupSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('set_songs')
    .update({ position: newPosition })
    .eq('id', setSongId)
  
  if (error) {
    return { success: false, error: 'Failed to update position' }
  }
  
  revalidatePath(`/groups/${groupSlug}/sets/${setId}`)
  return { success: true }
}

export async function updateSetSongNotes(
  setSongId: string,
  notes: string | null,
  setId: string,
  groupSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('set_songs')
    .update({ notes: notes?.trim() || null })
    .eq('id', setSongId)
  
  if (error) {
    return { success: false, error: 'Failed to update notes' }
  }
  
  revalidatePath(`/groups/${groupSlug}/sets/${setId}`)
  return { success: true }
}

export async function updateSetSongArrangement(
  setSongId: string,
  arrangementId: string | null,
  setId: string,
  groupSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('set_songs')
    .update({ arrangement_id: arrangementId })
    .eq('id', setSongId)

  if (error) {
    return { success: false, error: 'Failed to update arrangement' }
  }

  revalidatePath(`/groups/${groupSlug}/sets/${setId}`)
  return { success: true }
}

export async function reorderSetSongs(
  setId: string,
  orderedIds: string[],
  groupSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  
  // Update each song's position
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('set_songs')
      .update({ position: index + 1 })
      .eq('id', id)
      .eq('set_id', setId)
  )
  
  const results = await Promise.all(updates)
  const hasError = results.some(r => r.error)
  
  if (hasError) {
    return { success: false, error: 'Failed to reorder songs' }
  }
  
  revalidatePath(`/groups/${groupSlug}/sets/${setId}`)
  return { success: true }
}
