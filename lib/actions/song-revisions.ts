'use server'

import { randomUUID } from 'crypto'
import { createServerSupabaseClient, type Song, type SongSlide, type SongSlideGroup } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { updateSongArrangementSlides } from '@/lib/actions/song-arrangements'

type SlideGroupSnapshot = {
  id: string
  label: SongSlide['label']
  customLabel?: string | null
  position: number
}

async function fetchSongSnapshot(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  songId: string,
  groupId: string
): Promise<{
  song: Song | null
  slides: SongSlide[]
  slideGroups: SongSlideGroup[]
}> {
  const [{ data: song }, { data: groupRows }, { data: slideRows }] = await Promise.all([
    supabase.from('songs').select('*').eq('id', songId).eq('group_id', groupId).single(),
    supabase
      .from('song_slide_groups')
      .select('id, label, custom_label, position')
      .eq('song_id', songId)
      .eq('group_id', groupId)
      .order('position', { ascending: true }),
    supabase
      .from('song_slides')
      .select('id, slide_group_id, lines, position')
      .eq('song_id', songId)
      .eq('group_id', groupId)
      .order('position', { ascending: true }),
  ])

  if (!song) {
    return { song: null, slides: [], slideGroups: [] }
  }

  const slideGroups = (groupRows ?? []).map((group) => ({
    id: group.id,
    label: group.label as SongSlide['label'],
    customLabel: group.custom_label,
    position: group.position,
  }))

  if (slideGroups.length === 0) {
    return { song, slides: [], slideGroups: [] }
  }

  const slidesByGroupId = new Map<string, Array<{ id: string; lines: string[]; position: number }>>()
  slideRows?.forEach((row) => {
    const list = slidesByGroupId.get(row.slide_group_id) ?? []
    list.push({ id: row.id, lines: row.lines ?? [''], position: row.position })
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

  return { song, slides, slideGroups }
}

export async function getSongRevisions(songId: string, groupId: string) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('song_revisions')
    .select('*')
    .eq('song_id', songId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching song revisions:', error)
    return []
  }

  return data || []
}

function parseSlidesFromRevision(value: unknown): SongSlide[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const slide = entry as {
      id?: string
      label?: SongSlide['label']
      customLabel?: string | null
      lines?: string[]
    }
    if (!slide.label || !Array.isArray(slide.lines)) return []
    return [
      {
        id: slide.id ?? randomUUID(),
        label: slide.label,
        customLabel: slide.customLabel ?? undefined,
        lines: slide.lines.length > 0 ? slide.lines : [''],
      },
    ]
  })
}

export async function createSongRevisionSnapshot(
  songId: string,
  groupId: string,
  options: { slides?: SongSlide[]; slideGroups?: SlideGroupSnapshot[] } = {}
) {
  const supabase = createServerSupabaseClient()
  const { song, slides, slideGroups } = await fetchSongSnapshot(supabase, songId, groupId)

  if (!song) {
    return
  }

  const snapshotSlides = options.slides ?? slides
  const snapshotGroups =
    options.slideGroups ??
    slideGroups.map((group) => ({
      id: group.id,
      label: group.label,
      customLabel: group.customLabel ?? null,
      position: group.position,
    }))

  const { error } = await supabase.from('song_revisions').insert({
    song_id: songId,
    group_id: groupId,
    title: song.title,
    artist: song.artist,
    ccli_id: song.ccli_id,
    default_key: song.default_key,
    link_url: song.link_url,
    slides: snapshotSlides as unknown as Json,
    slide_groups: snapshotGroups as unknown as Json,
  })

  if (error) {
    console.error('Error creating song revision:', error)
  }
}

export async function restoreSongRevision(
  revisionId: string,
  groupId: string,
  groupSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { data: revision, error } = await supabase
    .from('song_revisions')
    .select('*')
    .eq('id', revisionId)
    .eq('group_id', groupId)
    .single()

  if (error || !revision) {
    console.error('Error fetching revision:', error)
    return { success: false, error: 'Revision not found' }
  }

  const songId = revision.song_id
  const slides = parseSlidesFromRevision(revision.slides)

  const { error: updateError } = await supabase
    .from('songs')
    .update({
      title: revision.title,
      artist: revision.artist,
      ccli_id: revision.ccli_id,
      default_key: revision.default_key,
      link_url: revision.link_url,
    })
    .eq('id', songId)
    .eq('group_id', groupId)

  if (updateError) {
    console.error('Error restoring song info:', updateError)
    return { success: false, error: 'Failed to restore song info' }
  }

  const { data: arrangements, error: arrangementsError } = await supabase
    .from('song_arrangements')
    .select('id, is_locked, created_at')
    .eq('song_id', songId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })

  if (arrangementsError) {
    console.error('Error fetching arrangements:', arrangementsError)
    return { success: false, error: 'Failed to restore arrangements' }
  }

  let arrangementId = arrangements?.find((arrangement) => arrangement.is_locked)?.id ?? arrangements?.[0]?.id ?? null
  if (!arrangementId) {
    const { data: created, error: createError } = await supabase
      .from('song_arrangements')
      .insert({
        song_id: songId,
        group_id: groupId,
        name: 'Default',
        is_locked: true,
      })
      .select()
      .single()
    if (createError || !created) {
      console.error('Error creating default arrangement:', createError)
      return { success: false, error: 'Failed to restore arrangements' }
    }
    arrangementId = created.id
  }

  const slideResult = await updateSongArrangementSlides(
    arrangementId,
    slides,
    groupSlug,
    songId,
    groupId,
    null
  )

  if (!slideResult.success) {
    return { success: false, error: slideResult.error || 'Failed to restore slides' }
  }

  await createSongRevisionSnapshot(songId, groupId)
  return { success: true }
}
