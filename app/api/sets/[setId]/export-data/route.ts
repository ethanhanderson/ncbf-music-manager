import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export async function GET(_: Request, { params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params
  if (!setId) {
    return NextResponse.json({ error: 'Set id is required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data: set, error } = await supabase
    .from('sets')
    .select(`
      service_date,
      set_songs(
        position,
        song_id,
        arrangement_id,
        songs(title)
      )
    `)
    .eq('id', setId)
    .single()

  if (error || !set) {
    return NextResponse.json({ error: 'Set not found' }, { status: 404 })
  }

  const songs = (set.set_songs ?? [])
    .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
    .map((setSong, index: number) => ({
      songId: setSong.song_id,
      title: setSong.songs?.title ?? `Song ${index + 1}`,
      arrangementId: setSong.arrangement_id ?? null,
      position: setSong.position ?? index + 1,
    }))

  return NextResponse.json({
    setTitle: formatDate(set.service_date),
    songs,
  })
}
