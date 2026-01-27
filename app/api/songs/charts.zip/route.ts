import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient, type SongSlide } from '@/lib/supabase/server'
import { getSongSlides } from '@/lib/actions/song-arrangements'
import {
  normalizeChartData,
  parseChartData,
  renderChordChartDocx,
  renderChordChartPdf,
  renderChordChartTxt,
  renderVocalChartDocx,
  renderVocalChartPdf,
  renderVocalChartTxt,
  type SlideGroupDefinition,
} from '@/lib/exports/charts'

export const runtime = 'nodejs'
export const maxDuration = 60

type ChartFormat = 'pdf' | 'docx' | 'txt'

type RequestPayload = {
  songIds?: string[]
  formats?: ChartFormat[]
  include?: {
    vocal?: boolean
    chord?: boolean
  }
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9\s-]/g, '').trim()
}

function getGroupKey(label: SlideGroupDefinition['label'], customLabel?: string | null, uniqueId?: string) {
  if (label === 'custom' && !customLabel) {
    return `${label}::${uniqueId ?? ''}`
  }
  return `${label}::${customLabel ?? ''}`
}

function buildSlideGroups(slides: SongSlide[]): SlideGroupDefinition[] {
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

async function getOrderedGroups({
  supabase,
  songId,
  groupId,
  arrangementId,
  arrangementLocked,
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>
  songId: string
  groupId: string
  arrangementId: string | null
  arrangementLocked: boolean
}): Promise<SlideGroupDefinition[]> {
  const [{ slides, slideGroups }, { data: arrangementRows }] = await Promise.all([
    getSongSlides(songId, groupId),
    arrangementId
      ? supabase
        .from('song_arrangement_groups')
        .select('slide_group_id, position')
        .eq('arrangement_id', arrangementId)
        .order('position', { ascending: true })
      : Promise.resolve({ data: null }),
  ])

  if (slides.length === 0) {
    return []
  }

  const groupDefinitions = buildSlideGroups(slides)
  const groupDefinitionMap = new Map(groupDefinitions.map((group) => [group.key, group]))
  const defaultKeys = groupDefinitions.map((group) => group.key)

  const slideGroupKeyById = new Map(
    slideGroups.map((group) => [group.id, getGroupKey(group.label, group.customLabel, group.id)])
  )

  const arrangementKeys = (arrangementRows ?? [])
    .map((row) => slideGroupKeyById.get(row.slide_group_id))
    .filter((value): value is string => Boolean(value))

  const baseKeys = arrangementKeys.length > 0 ? arrangementKeys : defaultKeys
  const present = new Set(baseKeys)
  const orderedKeys = arrangementLocked
    ? defaultKeys
    : [...baseKeys, ...defaultKeys.filter((key) => !present.has(key))]

  return orderedKeys
    .map((key) => groupDefinitionMap.get(key))
    .filter((value): value is SlideGroupDefinition => Boolean(value))
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestPayload
    const songIds = Array.isArray(body.songIds)
      ? body.songIds.filter((id): id is string => typeof id === 'string')
      : []
    const formats = Array.isArray(body.formats) ? body.formats : []
    const includeVocal = body.include?.vocal ?? true
    const includeChord = body.include?.chord ?? true
    const requestedFormats = formats.filter((format) => format === 'pdf' || format === 'docx' || format === 'txt') as ChartFormat[]

    if (songIds.length === 0) {
      return NextResponse.json({ error: 'No songs selected' }, { status: 400 })
    }
    if (!includeVocal && !includeChord) {
      return NextResponse.json({ error: 'No chart types selected' }, { status: 400 })
    }

    const chartFormats = requestedFormats.length > 0 ? requestedFormats : (['pdf'] as ChartFormat[])

    const supabase = createServerSupabaseClient()
    const { data: songs, error } = await supabase
      .from('songs')
      .select(`
        id,
        title,
        default_key,
        group_id,
        song_arrangements(*)
      `)
      .in('id', songIds)

    if (error || !songs?.length) {
      return NextResponse.json({ error: 'Songs not found' }, { status: 404 })
    }

    const songById = new Map(songs.map((song) => [song.id, song]))
    const orderedSongs = songIds.map((id) => songById.get(id)).filter(Boolean)

    const zip = new JSZip()
    const singleSong = orderedSongs.length === 1
    const singleFormat = chartFormats.length === 1
    const singleType = includeVocal !== includeChord

    for (let i = 0; i < orderedSongs.length; i += 1) {
      const song = orderedSongs[i]
      if (!song) continue

      const arrangements = Array.isArray(song.song_arrangements)
        ? song.song_arrangements
        : song.song_arrangements
          ? [song.song_arrangements]
          : []
      let arrangement = arrangements.find((entry: { is_locked?: boolean }) => entry.is_locked) ?? arrangements[0] ?? null

      const orderedGroups = await getOrderedGroups({
        supabase,
        songId: song.id,
        groupId: song.group_id,
        arrangementId: arrangement?.id ?? null,
        arrangementLocked: Boolean(arrangement?.is_locked),
      })

      const chartData = normalizeChartData(parseChartData(arrangement?.chords_text ?? null))
      if (!chartData.vocal.songKey && song.default_key) {
        chartData.vocal.songKey = song.default_key
      }
      if (!chartData.chord.songKey && song.default_key) {
        chartData.chord.songKey = song.default_key
      }

      const position = String(i + 1).padStart(2, '0')
      const safeTitle = sanitizeFilename(song.title)

      for (const format of chartFormats) {
        if (includeVocal) {
          if (format === 'pdf') {
            const pdfBytes = await renderVocalChartPdf({
              title: song.title,
              groups: orderedGroups,
              settings: chartData.vocal,
            })
            const filename = `${position} - ${safeTitle} (Vocal).pdf`
            if (singleSong && singleFormat && singleType && !includeChord) {
              return new NextResponse(new Uint8Array(pdfBytes), {
                headers: {
                  'Content-Type': 'application/pdf',
                  'Content-Disposition': `attachment; filename="${filename}"`,
                },
              })
            }
            zip.file(filename, pdfBytes)
          } else if (format === 'docx') {
            const docxBuffer = await renderVocalChartDocx({
              title: song.title,
              groups: orderedGroups,
              settings: chartData.vocal,
            })
            const filename = `${position} - ${safeTitle} (Vocal).docx`
            if (singleSong && singleFormat && singleType && !includeChord) {
              return new NextResponse(new Uint8Array(docxBuffer), {
                headers: {
                  'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'Content-Disposition': `attachment; filename="${filename}"`,
                },
              })
            }
            zip.file(filename, docxBuffer)
          } else {
            const text = renderVocalChartTxt({
              title: song.title,
              groups: orderedGroups,
              settings: chartData.vocal,
            })
            const filename = `${position} - ${safeTitle} (Vocal).txt`
            if (singleSong && singleFormat && singleType && !includeChord) {
              return new NextResponse(text, {
                headers: {
                  'Content-Type': 'text/plain; charset=utf-8',
                  'Content-Disposition': `attachment; filename="${filename}"`,
                },
              })
            }
            zip.file(filename, text)
          }
        }

        if (includeChord) {
          if (format === 'pdf') {
            const pdfBytes = await renderChordChartPdf({
              title: song.title,
              groups: orderedGroups,
              settings: chartData.chord,
            })
            const filename = `${position} - ${safeTitle} (Chord).pdf`
            if (singleSong && singleFormat && singleType && !includeVocal) {
              return new NextResponse(new Uint8Array(pdfBytes), {
                headers: {
                  'Content-Type': 'application/pdf',
                  'Content-Disposition': `attachment; filename="${filename}"`,
                },
              })
            }
            zip.file(filename, pdfBytes)
          } else if (format === 'docx') {
            const docxBuffer = await renderChordChartDocx({
              title: song.title,
              groups: orderedGroups,
              settings: chartData.chord,
            })
            const filename = `${position} - ${safeTitle} (Chord).docx`
            if (singleSong && singleFormat && singleType && !includeVocal) {
              return new NextResponse(new Uint8Array(docxBuffer), {
                headers: {
                  'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'Content-Disposition': `attachment; filename="${filename}"`,
                },
              })
            }
            zip.file(filename, docxBuffer)
          } else {
            const text = renderChordChartTxt({
              title: song.title,
              groups: orderedGroups,
              settings: chartData.chord,
            })
            const filename = `${position} - ${safeTitle} (Chord).txt`
            if (singleSong && singleFormat && singleType && !includeVocal) {
              return new NextResponse(text, {
                headers: {
                  'Content-Type': 'text/plain; charset=utf-8',
                  'Content-Disposition': `attachment; filename="${filename}"`,
                },
              })
            }
            zip.file(filename, text)
          }
        }
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="Song Charts.zip"',
      },
    })
  } catch (error) {
    console.error('Song charts export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
