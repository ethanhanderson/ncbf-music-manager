import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  try {
    const { setId } = await params
    const supabase = createServerSupabaseClient()

    // Get set with songs
    const { data: set, error: setError } = await supabase
      .from('sets')
      .select(`
        *,
        music_groups(name),
        set_songs(
          *,
          songs(*)
        )
      `)
      .eq('id', setId)
      .single()

    if (setError || !set) {
      return NextResponse.json({ error: 'Set not found' }, { status: 404 })
    }

    // Sort songs by position
    const setSongs = (set.set_songs || []).sort(
      (a: { position: number }, b: { position: number }) => a.position - b.position
    )

    // Create zip file
    const zip = new JSZip()

    // Add README with set info
    const readmeLines = [
      `Set: ${formatDate(set.service_date)}`,
      `Group: ${set.music_groups?.name || 'Unknown'}`,
      `Date: ${formatDate(set.service_date)}`,
      '',
    ]

    if (set.notes) {
      readmeLines.push('Notes:', set.notes, '')
    }

    readmeLines.push('Songs:', '')
    setSongs.forEach((setSong: { position: number; songs: { title: string } }, index: number) => {
      readmeLines.push(`${index + 1}. ${setSong.songs?.title || 'Unknown'}`)
    })

    zip.file('_README.txt', readmeLines.join('\n'))

    // Get lyrics for each song
    for (let i = 0; i < setSongs.length; i++) {
      const setSong = setSongs[i]
      const song = setSong.songs
      if (!song) continue

      // Get the best lyrics asset for this song
      const { data: assets } = await supabase
        .from('song_assets')
        .select('extracted_text, extract_status')
        .eq('song_id', song.id)
        .eq('asset_type', 'lyrics_source')
        .eq('extract_status', 'extracted')
        .order('created_at', { ascending: false })
        .limit(1)

      const asset = assets?.[0]
      const position = String(i + 1).padStart(2, '0')
      const safeTitle = song.title.replace(/[^a-zA-Z0-9\s-]/g, '').trim()
      const filename = `${position} - ${safeTitle}.txt`

      if (asset?.extracted_text) {
        // Add song notes if any
        let content = asset.extracted_text
        if (setSong.notes) {
          content = `[Notes: ${setSong.notes}]\n\n${content}`
        }
        zip.file(filename, content)
      } else {
        // Create placeholder file
        zip.file(
          filename,
          `Lyrics not available for "${song.title}"\n\nPlease upload lyrics to the song library.`
        )
      }
    }

    // Generate zip buffer
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    // Create filename
    const safeSetTitle = formatDate(set.service_date)
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
    const zipFilename = `${safeSetTitle} - ProPresenter.zip`

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
      },
    })
  } catch (error) {
    console.error('ProPresenter export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
