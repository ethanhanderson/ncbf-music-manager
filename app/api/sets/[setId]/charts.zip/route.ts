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

type ChartItem = {
  songId: string
  arrangementId: string | null
  include: {
    vocal: boolean
    chord: boolean
  }
}

type ChartFormat = 'pdf' | 'docx' | 'txt'

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
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  try {
    const { setId } = await params
    const body = await request.json().catch(() => ({}))
    const items = Array.isArray(body?.items) ? body.items : []
    const formats = Array.isArray(body?.formats) ? body.formats : []
    const requestedFormats = formats.filter((format: unknown) => format === 'pdf' || format === 'docx' || format === 'txt') as ChartFormat[]
    const chartFormats = requestedFormats.length > 0 ? requestedFormats : (['pdf'] as ChartFormat[])
    const requestedItems: ChartItem[] = items.filter((item: ChartItem) =>
      item?.songId && (item?.include?.vocal || item?.include?.chord)
    )

    if (requestedItems.length === 0) {
      return NextResponse.json({ error: 'No charts selected' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data: set, error: setError } = await supabase
      .from('sets')
      .select(`
        *,
        music_groups(name),
        set_songs(
          *,
          songs(*),
          song_arrangements(*)
        )
      `)
      .eq('id', setId)
      .single()

    if (setError || !set) {
      return NextResponse.json({ error: 'Set not found' }, { status: 404 })
    }

    const itemBySongId = new Map(requestedItems.map((item) => [item.songId, item]))
    const setSongs = (set.set_songs || []).sort(
      (a: { position: number }, b: { position: number }) => a.position - b.position
    )

    const zip = new JSZip()
    const singleItem = requestedItems.length === 1
    const singleFormat = chartFormats.length === 1

    for (const setSong of setSongs) {
      const song = setSong.songs
      if (!song) continue
      const item = itemBySongId.get(setSong.song_id)
      if (!item) continue

      const arrangements = Array.isArray(setSong.song_arrangements)
        ? setSong.song_arrangements
        : setSong.song_arrangements
          ? [setSong.song_arrangements]
          : []
      let arrangement = item.arrangementId
        ? arrangements.find((entry: { id: string }) => entry.id === item.arrangementId)
        : null
      if (!arrangement) {
        arrangement = arrangements.find((entry: { is_locked?: boolean }) => entry.is_locked) ?? arrangements[0] ?? null
      }

      const orderedGroups = await getOrderedGroups({
        supabase,
        songId: setSong.song_id,
        groupId: set.group_id,
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

      const position = String(setSong.position ?? 0).padStart(2, '0')
      const safeTitle = sanitizeFilename(song.title)

      for (const format of chartFormats) {
        if (item.include.vocal) {
          if (format === 'pdf') {
            const pdfBytes = await renderVocalChartPdf({
              title: song.title,
              groups: orderedGroups,
              settings: chartData.vocal,
            })
            const filename = `${position} - ${safeTitle} (Vocal).pdf`
            if (singleItem && singleFormat && !item.include.chord) {
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
            if (singleItem && singleFormat && !item.include.chord) {
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
            if (singleItem && singleFormat && !item.include.chord) {
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

        if (item.include.chord) {
          if (format === 'pdf') {
            const pdfBytes = await renderChordChartPdf({
              title: song.title,
              groups: orderedGroups,
              settings: chartData.chord,
            })
            const filename = `${position} - ${safeTitle} (Chord).pdf`
            if (singleItem && singleFormat && !item.include.vocal) {
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
            if (singleItem && singleFormat && !item.include.vocal) {
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
            if (singleItem && singleFormat && !item.include.vocal) {
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

    const safeSetTitle = sanitizeFilename(formatDate(set.service_date))
    const zipFilename = `${safeSetTitle} - Charts.zip`

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
      },
    })
  } catch (error) {
    console.error('Charts export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
