export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getSetById } from '@/lib/actions/sets'
import { getSongById } from '@/lib/actions/songs'
import { getSongArrangements, getSongSlides } from '@/lib/actions/song-arrangements'
import { SongChartsPrintClient } from '@/components/song-charts-print-client'

interface ChartPrintPageProps {
  params: Promise<{ setId: string; songId: string }>
  searchParams: Promise<{ arrangementId?: string }>
}

export default async function ChartPrintPage({ params, searchParams }: ChartPrintPageProps) {
  const { setId, songId } = await params
  const { arrangementId } = await searchParams

  const set = await getSetById(setId)
  if (!set) {
    notFound()
  }

  const groupId = set.group_id
  const groupSlug = set.music_groups?.slug ?? ''

  const [song, arrangements, { slides, slideGroups }] = await Promise.all([
    getSongById(songId, groupId),
    getSongArrangements(songId, groupId),
    getSongSlides(songId, groupId),
  ])

  if (!song) {
    notFound()
  }

  let selectedArrangementId = arrangementId ?? null
  if (selectedArrangementId && !arrangements.some((entry) => entry.id === selectedArrangementId)) {
    selectedArrangementId = null
  }
  if (!selectedArrangementId) {
    selectedArrangementId = arrangements.find((arrangement) => arrangement.is_locked)?.id ?? arrangements[0]?.id ?? null
  }

  return (
    <div className="min-h-screen bg-background">
      <SongChartsPrintClient
        songId={songId}
        groupId={groupId}
        groupSlug={groupSlug}
        songTitle={song.title}
        songDefaultKey={song.default_key}
        arrangements={arrangements}
        selectedArrangementId={selectedArrangementId}
        slides={slides}
        slideGroups={slideGroups}
      />
    </div>
  )
}
