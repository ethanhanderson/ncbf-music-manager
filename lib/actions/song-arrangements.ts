'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import {
  createServerSupabaseClient,
  type SongArrangement,
  type SongSlide,
  type SongSlideGroup,
} from '@/lib/supabase/server'
import { extractText } from '@/lib/extractors'
import { createSongRevisionSnapshot } from '@/lib/actions/song-revisions'

const GROUP_KEY_SEPARATOR = '::'

function getGroupKey(
  label: SongSlide['label'],
  customLabel?: string | null,
  uniqueId?: string
) {
  // "Ungrouped" slides should each be their own group.
  // We model this by making the group key unique per slide/group id.
  if (label === 'custom' && !customLabel) {
    return `${label}${GROUP_KEY_SEPARATOR}${uniqueId ?? ''}`
  }
  return `${label}${GROUP_KEY_SEPARATOR}${customLabel ?? ''}`
}

interface SlideGroupDefinition {
  key: string
  label: SongSlide['label']
  customLabel?: string
  slides: SongSlide[]
}

function buildSlideGroupsFromSlides(slides: SongSlide[]): SlideGroupDefinition[] {
  const map = new Map<string, SlideGroupDefinition>()
  const ordered: SlideGroupDefinition[] = []

  slides.forEach((slide) => {
    const key = getGroupKey(slide.label, slide.customLabel, slide.id)
    const existing = map.get(key)
    if (existing) {
      existing.slides.push(slide)
      return
    }
    const entry: SlideGroupDefinition = {
      key,
      label: slide.label,
      customLabel: slide.customLabel,
      slides: [slide],
    }
    map.set(key, entry)
    ordered.push(entry)
  })

  return ordered
}

function toSongSlideGroup(row: {
  id: string
  label: string
  custom_label: string | null
  position: number
}): SongSlideGroup {
  return {
    id: row.id,
    label: row.label as SongSlide['label'],
    customLabel: row.custom_label,
    position: row.position,
  }
}

function areOrdersEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

async function replaceArrangementGroups(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  arrangementId: string,
  groupIds: string[]
) {
  await supabase.from('song_arrangement_groups').delete().eq('arrangement_id', arrangementId)
  if (groupIds.length === 0) return

  const rows = groupIds.map((slideGroupId, index) => ({
    arrangement_id: arrangementId,
    slide_group_id: slideGroupId,
    position: index + 1,
  }))

  await supabase.from('song_arrangement_groups').insert(rows)
}

async function buildGroupIdByKey(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  songId: string
) {
  const { data: groups, error } = await supabase
    .from('song_slide_groups')
    .select('id, label, custom_label')
    .eq('song_id', songId)

  if (error) {
    throw error
  }

  return new Map(
    (groups ?? []).map((group) => [
      getGroupKey(group.label as SongSlide['label'], group.custom_label, group.id),
      group.id,
    ])
  )
}

async function saveSongSlides({
  supabase,
  songId,
  groupId,
  slides,
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>
  songId: string
  groupId: string
  slides: SongSlide[]
}) {
  const now = new Date().toISOString()
  const groupDefinitions = buildSlideGroupsFromSlides(slides)
  const groupOrderKeys = groupDefinitions.map((group) => group.key)

  const { data: existingGroups, error: groupsError } = await supabase
    .from('song_slide_groups')
    .select('id, label, custom_label')
    .eq('song_id', songId)

  if (groupsError) {
    throw groupsError
  }

  const existingGroupIdByKey = new Map(
    (existingGroups ?? []).map((group) => [
      getGroupKey(group.label as SongSlide['label'], group.custom_label, group.id),
      group.id,
    ])
  )

  const groupRecords = groupDefinitions.map((group, index) => ({
    id:
      group.label === 'custom' && !group.customLabel
        ? // Keep ungrouped groups stable by using the slide id as the group id.
          // (Each ungrouped slide becomes its own slide group.)
          group.slides[0]?.id ?? randomUUID()
        : (existingGroupIdByKey.get(group.key) ?? randomUUID()),
    song_id: songId,
    group_id: groupId,
    label: group.label,
    custom_label: group.customLabel ?? null,
    position: index + 1,
    updated_at: now,
  }))

  const groupIdByKey = new Map(
    groupRecords.map((group) => [getGroupKey(group.label as SongSlide['label'], group.custom_label, group.id), group.id])
  )
  const groupOrderIds = groupDefinitions
    .map((group) => groupIdByKey.get(group.key))
    .filter((value): value is string => Boolean(value))

  if (groupRecords.length > 0) {
    const { error: upsertError } = await supabase
      .from('song_slide_groups')
      .upsert(groupRecords, { onConflict: 'id' })

    if (upsertError) {
      throw upsertError
    }
  }

  const existingIds = new Set((existingGroups ?? []).map((group) => group.id))
  const keepIds = new Set(groupRecords.map((group) => group.id))
  const toDelete = Array.from(existingIds).filter((id) => !keepIds.has(id))
  if (toDelete.length > 0) {
    await supabase.from('song_slide_groups').delete().in('id', toDelete)
  }

  await supabase.from('song_slides').delete().eq('song_id', songId)

  const slideRows = groupDefinitions.flatMap((group) => {
    const slideGroupId = groupIdByKey.get(group.key)
    if (!slideGroupId) return []
    return group.slides.map((slide, index) => ({
      // Preserve slide ids so "Ungrouped" groups can stay stable.
      id: slide.id,
      song_id: songId,
      group_id: groupId,
      slide_group_id: slideGroupId,
      position: index + 1,
      lines: slide.lines.length > 0 ? slide.lines : [''],
      updated_at: now,
    }))
  })

  if (slideRows.length > 0) {
    const { error: slideInsertError } = await supabase.from('song_slides').insert(slideRows)
    if (slideInsertError) {
      throw slideInsertError
    }
  }

  return { groupOrderIds, groupOrderKeys, groupIdByKey }
}

async function syncArrangementGroups({
  supabase,
  songId,
  groupOrderIds,
  groupIdByKey,
  arrangementId,
  arrangementOrderKeys,
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>
  songId: string
  groupOrderIds: string[]
  groupIdByKey: Map<string, string>
  arrangementId?: string
  arrangementOrderKeys?: string[] | null
}) {
  const { data: arrangements, error: arrangementsError } = await supabase
    .from('song_arrangements')
    .select('id, is_locked')
    .eq('song_id', songId)

  if (arrangementsError) {
    throw arrangementsError
  }

  const arrangementIds = (arrangements ?? []).map((arrangement) => arrangement.id)
  if (arrangementIds.length === 0) return

  const { data: arrangementGroups, error: arrangementGroupsError } = await supabase
    .from('song_arrangement_groups')
    .select('arrangement_id, slide_group_id, position')
    .in('arrangement_id', arrangementIds)
    .order('position', { ascending: true })

  if (arrangementGroupsError) {
    throw arrangementGroupsError
  }

  const orderMap = new Map<string, string[]>()
  arrangementGroups?.forEach((row) => {
    const list = orderMap.get(row.arrangement_id) ?? []
    list.push(row.slide_group_id)
    orderMap.set(row.arrangement_id, list)
  })

  const groupIdSet = new Set(groupOrderIds)
  const preferredOrderIds = arrangementOrderKeys
    ? arrangementOrderKeys
      .map((key) => groupIdByKey.get(key))
      .filter((value): value is string => Boolean(value))
    : null

  for (const arrangement of arrangements ?? []) {
    const existingOrder = orderMap.get(arrangement.id) ?? []
    let baseOrder = existingOrder
    if (arrangementId && arrangement.id === arrangementId && preferredOrderIds && !arrangement.is_locked) {
      baseOrder = preferredOrderIds
    }
    if (arrangement.is_locked) {
      baseOrder = groupOrderIds
    }

    const filtered = baseOrder.filter((id) => groupIdSet.has(id))
    const present = new Set(filtered)
    const missing = groupOrderIds.filter((id) => !present.has(id))
    const nextOrder = arrangement.is_locked ? groupOrderIds : [...filtered, ...missing]

    if (!areOrdersEqual(existingOrder, nextOrder)) {
      await replaceArrangementGroups(supabase, arrangement.id, nextOrder)
    }
  }
}

export async function getSongArrangements(songId: string, groupId: string): Promise<SongArrangement[]> {
  const supabase = createServerSupabaseClient()
  const { data: arrangements, error } = await supabase
    .from('song_arrangements')
    .select('*')
    .eq('song_id', songId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })

  if (error || !arrangements) {
    console.error('Error fetching song arrangements:', error)
    return []
  }

  const arrangementIds = arrangements.map((arrangement) => arrangement.id)
  if (arrangementIds.length === 0) return []

  const { data: arrangementGroups } = await supabase
    .from('song_arrangement_groups')
    .select('arrangement_id, slide_group_id, position')
    .in('arrangement_id', arrangementIds)
    .order('position', { ascending: true })

  const orderMap = new Map<string, string[]>()
  arrangementGroups?.forEach((row) => {
    const list = orderMap.get(row.arrangement_id) ?? []
    list.push(row.slide_group_id)
    orderMap.set(row.arrangement_id, list)
  })

  return arrangements.map((arrangement) => ({
    ...arrangement,
    group_order: orderMap.get(arrangement.id) ?? [],
  }))
}

export async function getSongArrangementById(arrangementId: string): Promise<SongArrangement | null> {
  const supabase = createServerSupabaseClient()
  const { data: arrangement, error } = await supabase
    .from('song_arrangements')
    .select('*')
    .eq('id', arrangementId)
    .single()

  if (error || !arrangement) {
    console.error('Error fetching song arrangement:', error)
    return null
  }

  const { data: arrangementGroups } = await supabase
    .from('song_arrangement_groups')
    .select('slide_group_id, position')
    .eq('arrangement_id', arrangementId)
    .order('position', { ascending: true })

  return {
    ...arrangement,
    group_order: arrangementGroups?.map((row) => row.slide_group_id) ?? [],
  }
}

export async function updateSongArrangementOrder(
  arrangementId: string,
  songId: string,
  groupOrderKeys: string[],
  groupSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  const { data: arrangement, error: arrangementError } = await supabase
    .from('song_arrangements')
    .select('id, is_locked')
    .eq('id', arrangementId)
    .single()

  if (arrangementError || !arrangement) {
    console.error('Error fetching song arrangement:', arrangementError)
    return { success: false, error: 'Arrangement not found' }
  }

  if (arrangement.is_locked) {
    return { success: false, error: 'Default arrangement cannot be reordered' }
  }

  try {
    const groupIdByKey = await buildGroupIdByKey(supabase, songId)
    const orderIds = groupOrderKeys
      .map((key) => groupIdByKey.get(key))
      .filter((value): value is string => Boolean(value))

    await replaceArrangementGroups(supabase, arrangementId, orderIds)
  } catch (error) {
    console.error('Error updating arrangement order:', error)
    return { success: false, error: 'Failed to update arrangement order' }
  }

  revalidatePath(`/groups/${groupSlug}/songs/${songId}`)
  return { success: true }
}

export async function getSongSlides(
  songId: string,
  groupId: string
): Promise<{ slides: SongSlide[]; slideGroups: SongSlideGroup[] }> {
  const supabase = createServerSupabaseClient()
  const { data: groupRows, error: groupError } = await supabase
    .from('song_slide_groups')
    .select('id, label, custom_label, position')
    .eq('song_id', songId)
    .eq('group_id', groupId)
    .order('position', { ascending: true })

  if (groupError) {
    console.error('Error fetching song slide groups:', groupError)
    return { slides: [], slideGroups: [] }
  }

  const slideGroups = (groupRows ?? []).map(toSongSlideGroup)
  if (slideGroups.length === 0) {
    return { slides: [], slideGroups: [] }
  }

  const { data: slideRows, error: slideError } = await supabase
    .from('song_slides')
    .select('id, slide_group_id, lines, position')
    .eq('song_id', songId)
    .eq('group_id', groupId)
    .order('position', { ascending: true })

  if (slideError) {
    console.error('Error fetching song slides:', slideError)
    return { slides: [], slideGroups }
  }

  const slidesByGroupId = new Map<string, Array<{ id: string; lines: string[]; position: number }>>()
  slideRows?.forEach((row) => {
    const list = slidesByGroupId.get(row.slide_group_id) ?? []
    list.push({ id: row.id, lines: row.lines, position: row.position })
    slidesByGroupId.set(row.slide_group_id, list)
  })

  const slides: SongSlide[] = []
  slideGroups.forEach((group) => {
    const groupSlides = slidesByGroupId.get(group.id) ?? []
    groupSlides
      .sort((a, b) => a.position - b.position)
      .forEach((slide) => {
        slides.push({
          id: slide.id,
          label: group.label,
          customLabel: group.customLabel ?? undefined,
          lines: slide.lines ?? [''],
        })
      })
  })

  return { slides, slideGroups }
}

export async function createSongArrangement(
  songId: string,
  groupId: string,
  groupSlug: string,
  name: string
): Promise<{ success: boolean; error?: string; arrangement?: SongArrangement }> {
  const supabase = createServerSupabaseClient()
  const trimmedName = name.trim()
  const isDefault = trimmedName.toLowerCase() === 'default'

  if (isDefault) {
    const { data: existingDefault } = await supabase
      .from('song_arrangements')
      .select('id')
      .eq('song_id', songId)
      .eq('name', 'Default')
      .single()
    if (existingDefault) {
      return { success: false, error: 'Default arrangement already exists' }
    }
  }

  const { data: arrangement, error } = await supabase
    .from('song_arrangements')
    .insert({
      song_id: songId,
      group_id: groupId,
      name: trimmedName,
      is_locked: isDefault,
    })
    .select()
    .single()

  if (error || !arrangement) {
    console.error('Error creating song arrangement:', error)
    return { success: false, error: 'Failed to create arrangement' }
  }

  const { data: groups } = await supabase
    .from('song_slide_groups')
    .select('id')
    .eq('song_id', songId)
    .order('position', { ascending: true })

  const groupOrderIds = (groups ?? []).map((group) => group.id)
  if (groupOrderIds.length > 0) {
    await replaceArrangementGroups(supabase, arrangement.id, groupOrderIds)
  }

  revalidatePath(`/groups/${groupSlug}/songs/${songId}`)
  return { success: true, arrangement: { ...arrangement, group_order: groupOrderIds } }
}

export async function duplicateSongArrangement(
  arrangementId: string,
  newName: string,
  groupSlug: string
): Promise<{ success: boolean; error?: string; arrangement?: SongArrangement }> {
  const supabase = createServerSupabaseClient()

  const { data: original, error: fetchError } = await supabase
    .from('song_arrangements')
    .select('*')
    .eq('id', arrangementId)
    .single()

  if (fetchError || !original) {
    return { success: false, error: 'Original arrangement not found' }
  }

  const { data: arrangementGroups } = await supabase
    .from('song_arrangement_groups')
    .select('slide_group_id, position')
    .eq('arrangement_id', arrangementId)
    .order('position', { ascending: true })

  const { data: arrangement, error } = await supabase
    .from('song_arrangements')
    .insert({
      song_id: original.song_id,
      group_id: original.group_id,
      name: newName.trim(),
      chords_text: original.chords_text,
      notes: original.notes,
      is_locked: false,
    })
    .select()
    .single()

  if (error || !arrangement) {
    console.error('Error duplicating song arrangement:', error)
    return { success: false, error: 'Failed to duplicate arrangement' }
  }

  const groupOrderIds = arrangementGroups?.map((row) => row.slide_group_id) ?? []
  if (groupOrderIds.length > 0) {
    await replaceArrangementGroups(supabase, arrangement.id, groupOrderIds)
  }

  revalidatePath(`/groups/${groupSlug}/songs/${original.song_id}`)
  return { success: true, arrangement: { ...arrangement, group_order: groupOrderIds } }
}

export async function renameSongArrangement(
  arrangementId: string,
  name: string,
  groupSlug: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const trimmedName = name.trim()
  if (trimmedName.toLowerCase() === 'default') {
    return { success: false, error: 'Default arrangement name is reserved' }
  }

  const { data: arrangement, error: fetchError } = await supabase
    .from('song_arrangements')
    .select('id, is_locked')
    .eq('id', arrangementId)
    .single()

  if (fetchError || !arrangement) {
    return { success: false, error: 'Arrangement not found' }
  }

  if (arrangement.is_locked) {
    return { success: false, error: 'Default arrangement cannot be renamed' }
  }

  const { error } = await supabase
    .from('song_arrangements')
    .update({ name: trimmedName, updated_at: new Date().toISOString() })
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
  groupId: string,
  groupOrderKeys?: string[] | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  try {
    const { groupOrderIds, groupIdByKey } = await saveSongSlides({
      supabase,
      songId,
      groupId,
      slides,
    })

    await syncArrangementGroups({
      supabase,
      songId,
      groupOrderIds,
      groupIdByKey,
      arrangementId,
      arrangementOrderKeys: groupOrderKeys ?? null,
    })
  } catch (error) {
    console.error('Error updating song slides:', error)
    return { success: false, error: 'Failed to update slides' }
  }

  await createSongRevisionSnapshot(songId, groupId)

  revalidatePath(`/groups/${groupSlug}/songs/${songId}`)
  return { success: true }
}

export async function deleteSongArrangement(
  arrangementId: string,
  groupSlug: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  const { data: arrangement, error: fetchError } = await supabase
    .from('song_arrangements')
    .select('id, is_locked')
    .eq('id', arrangementId)
    .single()

  if (fetchError || !arrangement) {
    return { success: false, error: 'Arrangement not found' }
  }

  if (arrangement.is_locked) {
    return { success: false, error: 'Default arrangement cannot be deleted' }
  }

  const { error } = await supabase.from('song_arrangements').delete().eq('id', arrangementId)

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
export async function parseLyricsToSlides(
  text: string,
  options?: { forceUngrouped?: boolean }
): Promise<SongSlide[]> {
  const blocks = text.split(/\n\s*\n/).filter((block) => block.trim())

  return blocks.map((block) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    // "Raw" parsing: keep everything ungrouped (don't strip headings).
    // (We use this for brand-new songs so users can group later in the UI.)
    if (options?.forceUngrouped) {
      return {
        id: randomUUID(),
        label: 'custom',
        customLabel: undefined,
        lines: lines.length > 0 ? lines : [''],
      }
    }

    const firstLine = lines[0]?.toLowerCase() || ''
    let label: SongSlide['label'] = 'verse'
    let customLabel: string | undefined

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
      id: randomUUID(),
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
  const existingGroupsCount = await supabase
    .from('song_slide_groups')
    .select('id', { count: 'exact', head: true })
    .eq('song_id', songId)

  const isNewSong = (existingGroupsCount.count ?? 0) === 0
  const slides = await parseLyricsToSlides(lyricsText, { forceUngrouped: isNewSong })

  const { data: existing } = await supabase
    .from('song_arrangements')
    .select('id')
    .eq('song_id', songId)
    .eq('name', 'Default')
    .single()

  let arrangementId = existing?.id ?? null
  if (!arrangementId) {
    const { data: created, error } = await supabase
      .from('song_arrangements')
      .insert({
        song_id: songId,
        group_id: groupId,
        name: 'Default',
        is_locked: true,
      })
      .select()
      .single()

    if (error || !created) {
      console.error('Error creating default arrangement:', error)
      return { success: false, error: 'Failed to create default arrangement' }
    }

    arrangementId = created.id
  } else {
    await supabase
      .from('song_arrangements')
      .update({ is_locked: true, updated_at: new Date().toISOString() })
      .eq('id', arrangementId)
  }

  try {
    const { groupOrderIds, groupIdByKey } = await saveSongSlides({
      supabase,
      songId,
      groupId,
      slides,
    })

    await syncArrangementGroups({
      supabase,
      songId,
      groupOrderIds,
      groupIdByKey,
      arrangementId,
      arrangementOrderKeys: null,
    })
  } catch (error) {
    console.error('Error updating default arrangement:', error)
    return { success: false, error: 'Failed to update default arrangement' }
  }

  return { success: true }
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

    if (!asset.group_id) {
      skipped++
      continue
    }

    const result = await createDefaultArrangementFromLyrics(songId, asset.group_id, extractedText)
    if (result.success) {
      created++
    } else {
      skipped++
    }
  }

  revalidatePath(`/groups/${groupSlug}/songs`)
  revalidatePath('/songs')

  return { success: true, created, skipped }
}

/**
 * Update the chords_text field for an arrangement (used for storing chart data as JSON)
 */
export async function updateSongArrangementChordsText(
  arrangementId: string,
  chordsText: string,
  groupSlug: string,
  songId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('song_arrangements')
    .update({
      chords_text: chordsText,
      updated_at: new Date().toISOString(),
    })
    .eq('id', arrangementId)

  if (error) {
    console.error('Error updating arrangement chords_text:', error)
    return { success: false, error: 'Failed to save chart data' }
  }

  revalidatePath(`/groups/${groupSlug}/songs/${songId}`)
  return { success: true }
}
