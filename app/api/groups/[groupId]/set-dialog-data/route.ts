import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCrossGroupSongMatches, getSongsWithArrangementsAndStats } from '@/lib/actions/songs'
import { getUpcomingSetSongIds } from '@/lib/actions/sets'

const CROSS_GROUP_LOOKBACK_DAYS = 365

interface RouteParams {
  params: Promise<{ groupId: string }>
}

export async function GET(_: Request, { params }: RouteParams) {
  const { groupId } = await params

  if (!groupId) {
    return NextResponse.json({ error: 'Group id is required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    groupId
  )
  const { data: group, error: groupError } = await supabase
    .from('music_groups')
    .select('id, name, slug')
    .eq(isUuid ? 'id' : 'slug', groupId)
    .single()

  if (groupError || !group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  const [{ songs, arrangements }, { data: sets, error: setsError }, upcomingSetSongIds, crossGroupMatches] =
    await Promise.all([
      getSongsWithArrangementsAndStats(group.id),
      supabase
        .from('sets')
        .select('service_date')
        .eq('group_id', group.id)
        .order('service_date', { ascending: false }),
      getUpcomingSetSongIds(group.id),
      getCrossGroupSongMatches(group.id, CROSS_GROUP_LOOKBACK_DAYS),
    ])

  if (setsError) {
    console.error('Error fetching group sets:', setsError)
  }

  const existingSetDates = (sets ?? []).map((set) => set.service_date)
  const lastSetDate = existingSetDates[0] ?? null

  return NextResponse.json({
    group,
    songs,
    arrangements,
    upcomingSetSongIds,
    crossGroupMatches,
    crossGroupLookbackDays: CROSS_GROUP_LOOKBACK_DAYS,
    crossGroupMatchesLoaded: true,
    lastSetDate,
    existingSetDates,
  })
}
