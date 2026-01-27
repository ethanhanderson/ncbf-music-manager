import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSongSlides } from '@/lib/actions/song-arrangements'
import { buildLyricsText, lyricsToDocx, lyricsToPdf, lyricsToRtf, lyricsToTxt } from '@/lib/exports/lyrics'

export const runtime = 'nodejs'

type LyricsFormat = 'txt' | 'docx' | 'pdf' | 'rtf'

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9\s-]/g, '').trim()
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  try {
    const { setId } = await params
    const body = await request.json().catch(() => ({}))
    const formats = Array.isArray(body?.formats) ? body.formats : []
    const songIds = Array.isArray(body?.songIds) ? body.songIds.filter((id: unknown) => typeof id === 'string') : []
    const requestedFormats = formats.filter((format: unknown) =>
      format === 'txt' || format === 'docx' || format === 'pdf' || format === 'rtf'
    ) as LyricsFormat[]
    if (requestedFormats.length === 0) {
      return NextResponse.json({ error: 'No formats selected' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
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

    const selectedSongIds = new Set(songIds)
    const setSongs = (set.set_songs || [])
      .filter((setSong: { song_id: string }) => {
        if (selectedSongIds.size === 0) return true
        return selectedSongIds.has(setSong.song_id)
      })
      .sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      )

    if (setSongs.length === 0) {
      return NextResponse.json({ error: 'No songs selected' }, { status: 400 })
    }

    const zip = new JSZip()
    const singleSong = setSongs.length === 1
    const singleFormat = requestedFormats.length === 1
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
    setSongs.forEach((setSong: { songs: { title: string } }, index: number) => {
      readmeLines.push(`${index + 1}. ${setSong.songs?.title || 'Unknown'}`)
    })
    zip.file('_README.txt', readmeLines.join('\n'))

    for (let i = 0; i < setSongs.length; i += 1) {
      const setSong = setSongs[i]
      const song = setSong.songs
      if (!song) continue

      const { slides } = await getSongSlides(song.id, set.group_id)
      let text = await buildLyricsText(slides, setSong.notes)
      if (!text.trim()) {
        text = `Lyrics not available for "${song.title}".\n\nPlease upload lyrics to the song library.`
      }

      const position = String(i + 1).padStart(2, '0')
      const safeTitle = sanitizeFilename(song.title)

      for (const format of requestedFormats) {
        const filename = `${position} - ${safeTitle}.${format}`
        if (format === 'txt') {
          const content = await lyricsToTxt(text)
          if (singleSong && singleFormat) {
            return new NextResponse(content, {
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
              },
            })
          }
          zip.file(filename, content)
        } else if (format === 'rtf') {
          const content = await lyricsToRtf(text)
          if (singleSong && singleFormat) {
            return new NextResponse(content, {
              headers: {
                'Content-Type': 'application/rtf',
                'Content-Disposition': `attachment; filename="${filename}"`,
              },
            })
          }
          zip.file(filename, content)
        } else if (format === 'docx') {
          const docxBuffer = await lyricsToDocx({
            title: song.title,
            songKey: song.default_key ?? null,
            slides,
            notes: setSong.notes,
          })
          if (singleSong && singleFormat) {
            return new NextResponse(new Uint8Array(docxBuffer), {
              headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename}"`,
              },
            })
          }
          zip.file(filename, docxBuffer)
        } else if (format === 'pdf') {
          const pdfBytes = await lyricsToPdf({
            title: song.title,
            songKey: song.default_key ?? null,
            slides,
            notes: setSong.notes,
          })
          if (singleSong && singleFormat) {
            return new NextResponse(new Uint8Array(pdfBytes), {
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
              },
            })
          }
          zip.file(filename, pdfBytes)
        }
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    const safeSetTitle = sanitizeFilename(formatDate(set.service_date))
    const zipFilename = `${safeSetTitle} - Lyrics.zip`

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
      },
    })
  } catch (error) {
    console.error('Lyrics export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
