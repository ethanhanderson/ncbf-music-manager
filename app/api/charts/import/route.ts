import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractText, getSupportedExtensions, getSupportedMimeTypes } from '@/lib/extractors'
import { parseChordChartText } from '@/lib/charts/import/parse'
import { matchParsedLinesToSlides } from '@/lib/charts/import/match'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const songId = formData.get('songId') as string | null
    const arrangementId = formData.get('arrangementId') as string | null
    const groupIdInput = formData.get('groupId') as string | null
    const includeNotesValue = formData.get('includeNotes') as string | null
    const includeNotes = includeNotesValue !== 'false'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!songId) {
      return NextResponse.json({ error: 'songId is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    let groupId = groupIdInput
    if (!groupId) {
      const { data: song, error } = await supabase
        .from('songs')
        .select('group_id')
        .eq('id', songId)
        .single()
      if (error || !song?.group_id) {
        return NextResponse.json({ error: 'Failed to resolve group for song' }, { status: 400 })
      }
      groupId = song.group_id
    }

    const [
      { data: groupRows, error: groupError },
      { data: slideRows, error: slideError },
      { data: arrangementRows },
    ] = await Promise.all([
      supabase
        .from('song_slide_groups')
        .select('id, position')
        .eq('song_id', songId)
        .eq('group_id', groupId)
        .order('position', { ascending: true }),
      supabase
        .from('song_slides')
        .select('id, slide_group_id, lines, position')
        .eq('song_id', songId)
        .eq('group_id', groupId)
        .order('position', { ascending: true }),
      arrangementId
        ? supabase
          .from('song_arrangement_groups')
          .select('slide_group_id, position')
          .eq('arrangement_id', arrangementId)
          .order('position', { ascending: true })
        : Promise.resolve({ data: null }),
    ])

    if (groupError || !groupRows) {
      console.error('Error fetching song slide groups:', groupError)
      return NextResponse.json({ error: 'Failed to load song slide groups' }, { status: 500 })
    }
    if (slideError || !slideRows) {
      console.error('Error fetching song slides:', slideError)
      return NextResponse.json({ error: 'Failed to load song slides' }, { status: 500 })
    }

    const defaultGroupOrder = groupRows.map((row) => row.id)
    const arrangementOrder = arrangementRows?.map((row) => row.slide_group_id) ?? []
    const arrangementSet = new Set(arrangementOrder)
    const groupIdSet = new Set(defaultGroupOrder)
    const orderedGroupIds = [
      ...arrangementOrder.filter((id) => groupIdSet.has(id)),
      ...defaultGroupOrder.filter((id) => !arrangementSet.has(id)),
    ]

    const slidesByGroupId = new Map<string, Array<{ id: string; lines: string[]; position: number }>>()
    slideRows.forEach((row) => {
      const list = slidesByGroupId.get(row.slide_group_id) ?? []
      list.push({ id: row.id, lines: row.lines ?? [''], position: row.position })
      slidesByGroupId.set(row.slide_group_id, list)
    })

    const slideLines = orderedGroupIds.flatMap((groupId) => {
      const groupSlides = slidesByGroupId.get(groupId) ?? []
      return groupSlides
        .sort((a, b) => a.position - b.position)
        .flatMap((slide) =>
          (slide.lines ?? ['']).map((line, lineIndex) => ({
            slideId: slide.id,
            lineIndex,
            text: line ?? '',
          }))
        )
    })

    if (slideLines.length === 0) {
      return NextResponse.json({ error: 'No slide content available for this song' }, { status: 400 })
    }

    const mimeType = file.type || 'application/octet-stream'
    const supportedMimeTypes = getSupportedMimeTypes()
    const supportedExtensions = getSupportedExtensions().map((ext) => ext.replace('.', ''))
    const ext = file.name.toLowerCase().split('.').pop() || ''

    if (!supportedMimeTypes.includes(mimeType) && !supportedExtensions.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type. Supported formats: ${supportedExtensions.join(', ')}` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { text, warning } = await extractText(buffer, mimeType, file.name)
    if (!text.trim()) {
      return NextResponse.json({ error: 'No text could be extracted from the file' }, { status: 400 })
    }

    const parseResult = parseChordChartText(text)
    const matchResult = matchParsedLinesToSlides(parseResult.lines, slideLines, { includeNotes })

    const warnings = [
      ...(warning ? [warning] : []),
      ...parseResult.warnings,
      ...matchResult.warnings,
    ]
    if (matchResult.unmatchedLines.length > 0) {
      warnings.push('Some lyric lines could not be matched to slides.')
    }
    if (matchResult.placements.length === 0) {
      warnings.push('No chord placements were detected in the uploaded file.')
    }

    return NextResponse.json({
      placements: matchResult.placements,
      notes: matchResult.notes,
      summary: matchResult.summary,
      warnings,
      unmatchedLines: matchResult.unmatchedLines,
    })
  } catch (error) {
    console.error('Chart import error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
