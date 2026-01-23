import { createClient } from '@supabase/supabase-js'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

type SongSlide = {
  id: string
  label: 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'outro' | 'intro' | 'tag' | 'interlude' | 'title' | 'custom'
  customLabel?: string
  lines: string[]
}

type ParsedSong = {
  title: string
  slides: SongSlide[]
  warnings: string[]
}

type ImportOptions = {
  rootDir: string
  groupId: string
  limit?: number
  dryRun: boolean
}

const GROUP_KEY_SEPARATOR = '::'

function getGroupKey(label: SongSlide['label'], customLabel?: string) {
  return `${label}${GROUP_KEY_SEPARATOR}${customLabel ?? ''}`
}

function buildSlideGroupsFromSlides(slides: SongSlide[]) {
  const map = new Map<string, { key: string; label: SongSlide['label']; customLabel?: string; slides: SongSlide[] }>()
  const ordered: Array<{ key: string; label: SongSlide['label']; customLabel?: string; slides: SongSlide[] }> = []

  slides.forEach((slide) => {
    const key = getGroupKey(slide.label, slide.customLabel)
    const existing = map.get(key)
    if (existing) {
      existing.slides.push(slide)
      return
    }
    const entry = {
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(__dirname, '../../test slide files/Text')

function normalizeTitle(title: string) {
  return title.trim().toLowerCase()
}

function stripTitleSuffix(title: string) {
  return title.replace(/\s*\.(pro|pptx?|txt)$/i, '').trim()
}

function parseArgs(argv: string[]) {
  const options: Partial<ImportOptions> & { groupSlug?: string; help?: boolean } = {
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg.startsWith('--root=')) {
      options.rootDir = arg.split('=').slice(1).join('=')
      continue
    }
    if (arg === '--root') {
      options.rootDir = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--group-id=')) {
      options.groupId = arg.split('=').slice(1).join('=')
      continue
    }
    if (arg === '--group-id') {
      options.groupId = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--group-slug=')) {
      options.groupSlug = arg.split('=').slice(1).join('=')
      continue
    }
    if (arg === '--group-slug') {
      options.groupSlug = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=').slice(1).join('='))
      options.limit = Number.isFinite(value) ? value : undefined
      continue
    }
    if (arg === '--limit') {
      const value = Number(argv[i + 1])
      options.limit = Number.isFinite(value) ? value : undefined
      i += 1
      continue
    }
  }

  return options
}

function printHelp() {
  console.log(`
Usage: bun scripts/import-text-songs.ts [options]

Options:
  --root <path>        Root directory containing .txt files
  --group-id <uuid>    Group ID to assign songs to
  --group-slug <slug>  Group slug (looked up to resolve group ID)
  --limit <n>          Limit number of files to import
  --dry-run            Print actions without inserting
  -h, --help           Show help

Environment:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  IMPORT_GROUP_ID (optional)
  IMPORT_GROUP_SLUG (optional)
`)
}

async function listTextFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.name === '__MACOSX' || entry.name.startsWith('.')) {
      continue
    }
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      const nested = await listTextFiles(fullPath)
      files.push(...nested)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (entry.name.startsWith('._')) {
      continue
    }
    if (entry.name.toLowerCase().endsWith('.txt')) {
      files.push(fullPath)
    }
  }

  return files
}

function splitBlocks(text: string) {
  return text
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
}

function normalizeLines(block: string) {
  return block
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function parseSongFile(filePath: string, rawContent: string): ParsedSong {
  const normalized = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  if (lines.length > 0) {
    lines[0] = lines[0].replace(/^\uFEFF/, '')
  }

  const firstLine = lines[0] ?? ''
  const fileNameTitle = path.parse(filePath).name
  const warnings: string[] = []

  let title = fileNameTitle
  if (/^\s*title\s*:/i.test(firstLine)) {
    title = firstLine.replace(/^\s*title\s*:/i, '').trim() || fileNameTitle
  } else {
    warnings.push('Missing Title: line; using filename')
  }

  title = stripTitleSuffix(title)

  const remaining = lines.slice(1).join('\n').trim()
  const blocks = splitBlocks(remaining)

  if (blocks.length === 0) {
    return { title, slides: [], warnings: [...warnings, 'No lyric blocks found'] }
  }

  const slides: SongSlide[] = []
  const titleLines = normalizeLines(blocks[0])
  slides.push({
    id: randomUUID(),
    label: 'title',
    lines: titleLines.length ? titleLines : [title],
  })

  for (const block of blocks.slice(1)) {
    const verseLines = normalizeLines(block)
    if (!verseLines.length) {
      continue
    }
    slides.push({
      id: randomUUID(),
      label: 'verse',
      lines: verseLines,
    })
  }

  return { title, slides, warnings }
}

async function resolveGroupId(
  supabase: ReturnType<typeof createClient>,
  groupId: string | undefined,
  groupSlug: string | undefined
) {
  if (groupId?.trim()) {
    return groupId.trim()
  }

  const slug = groupSlug?.trim()
  if (!slug) {
    return null
  }

  const { data, error } = await supabase
    .from('music_groups')
    .select('id')
    .eq('slug', slug)
    .single()

  if (error || !data) {
    console.error(`Failed to resolve group slug "${slug}":`, error?.message)
    return null
  }

  return data.id
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY')
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const resolvedGroupId = await resolveGroupId(
    supabase,
    args.groupId ?? process.env.IMPORT_GROUP_ID,
    args.groupSlug ?? process.env.IMPORT_GROUP_SLUG
  )

  if (!resolvedGroupId) {
    throw new Error('Missing group id or group slug. Provide --group-id or --group-slug (or IMPORT_GROUP_ID / IMPORT_GROUP_SLUG).')
  }

  const rootDir = path.resolve(args.rootDir ?? DEFAULT_ROOT)
  const dryRun = args.dryRun ?? false
  const filePaths = await listTextFiles(rootDir)
  const limitedFiles = typeof args.limit === 'number' ? filePaths.slice(0, args.limit) : filePaths

  console.log(`Found ${filePaths.length} .txt files under ${rootDir}`)
  if (typeof args.limit === 'number') {
    console.log(`Limiting to ${limitedFiles.length} files`)
  }

  const { data: existingSongs, error: existingError } = await supabase
    .from('songs')
    .select('id, title')
    .eq('group_id', resolvedGroupId)

  if (existingError) {
    throw new Error(`Failed to load existing songs: ${existingError.message}`)
  }

  const existingByTitle = new Map<string, { id: string; title: string }>()
  existingSongs?.forEach(song => {
    existingByTitle.set(normalizeTitle(song.title), song)
  })

  let createdSongs = 0
  let createdArrangements = 0
  let skippedSongs = 0
  let existingSongsCount = 0
  let skippedArrangements = 0
  let warnedSongs = 0

  for (const filePath of limitedFiles) {
    const rawContent = await readFile(filePath, 'utf8')
    const parsed = parseSongFile(filePath, rawContent)

    if (parsed.warnings.length) {
      warnedSongs += 1
      console.warn(`[warn] ${path.basename(filePath)}: ${parsed.warnings.join('; ')}`)
    }

    if (!parsed.slides.length) {
      console.warn(`[skip] ${path.basename(filePath)}: no slides to import`)
      skippedSongs += 1
      continue
    }

    const existing = existingByTitle.get(normalizeTitle(parsed.title))
    let songId = existing?.id

    if (!songId) {
      if (dryRun) {
        console.log(`[dry-run] create song "${parsed.title}"`)
      } else {
        const { data: insertedSong, error: insertError } = await supabase
          .from('songs')
          .insert({ title: parsed.title, group_id: resolvedGroupId })
          .select()
          .single()

        if (insertError || !insertedSong) {
          console.error(`[error] Failed to create song "${parsed.title}": ${insertError?.message}`)
          skippedSongs += 1
          continue
        }

        songId = insertedSong.id
      }

      createdSongs += 1
    } else {
      existingSongsCount += 1
    }

    if (!songId) {
      continue
    }

    const { data: existingArrangement, error: arrangementError } = await supabase
      .from('song_arrangements')
      .select('id')
      .eq('song_id', songId)
      .eq('name', 'Default')
      .limit(1)

    if (arrangementError) {
      console.error(`[error] Failed to check arrangement for "${parsed.title}": ${arrangementError.message}`)
      skippedArrangements += 1
      continue
    }

    if (existingArrangement && existingArrangement.length > 0) {
      skippedArrangements += 1
      continue
    }

    if (dryRun) {
      console.log(`[dry-run] create arrangement "Default" for "${parsed.title}" (${parsed.slides.length} slides)`)
      createdArrangements += 1
      continue
    }

    const { data: arrangement, error: arrangementInsertError } = await supabase
      .from('song_arrangements')
      .insert({
        song_id: songId,
        group_id: resolvedGroupId,
        name: 'Default',
        is_locked: true,
      })
      .select('id')
      .single()

    if (arrangementInsertError || !arrangement) {
      console.error(`[error] Failed to create arrangement for "${parsed.title}": ${arrangementInsertError.message}`)
      skippedArrangements += 1
      continue
    }

    const groupDefinitions = buildSlideGroupsFromSlides(parsed.slides)
    const groupRows = groupDefinitions.map((group, index) => ({
      id: randomUUID(),
      song_id: songId,
      group_id: resolvedGroupId,
      label: group.label,
      custom_label: group.customLabel ?? null,
      position: index + 1,
    }))

    if (groupRows.length > 0) {
      const { error: groupInsertError } = await supabase.from('song_slide_groups').insert(groupRows)
      if (groupInsertError) {
        console.error(`[error] Failed to create slide groups for "${parsed.title}": ${groupInsertError.message}`)
        skippedArrangements += 1
        continue
      }
    }

    const groupIdByKey = new Map(groupRows.map((group) => [getGroupKey(group.label, group.custom_label ?? undefined), group.id]))
    const slideRows = groupDefinitions.flatMap((group) => {
      const groupId = groupIdByKey.get(group.key)
      if (!groupId) return []
      return group.slides.map((slide, index) => ({
        id: randomUUID(),
        song_id: songId,
        group_id: resolvedGroupId,
        slide_group_id: groupId,
        position: index + 1,
        lines: slide.lines.length > 0 ? slide.lines : [''],
      }))
    })

    if (slideRows.length > 0) {
      const { error: slideInsertError } = await supabase.from('song_slides').insert(slideRows)
      if (slideInsertError) {
        console.error(`[error] Failed to create slides for "${parsed.title}": ${slideInsertError.message}`)
        skippedArrangements += 1
        continue
      }
    }

    const arrangementGroupRows = groupRows.map((group, index) => ({
      arrangement_id: arrangement.id,
      slide_group_id: group.id,
      position: index + 1,
    }))

    if (arrangementGroupRows.length > 0) {
      const { error: arrangementGroupError } = await supabase
        .from('song_arrangement_groups')
        .insert(arrangementGroupRows)
      if (arrangementGroupError) {
        console.error(
          `[error] Failed to create arrangement order for "${parsed.title}": ${arrangementGroupError.message}`
        )
        skippedArrangements += 1
        continue
      }
    }

    createdArrangements += 1
  }

  console.log('\nImport summary')
  console.log(`  Songs created: ${createdSongs}`)
  console.log(`  Songs skipped (invalid): ${skippedSongs}`)
  console.log(`  Songs already existed: ${existingSongsCount}`)
  console.log(`  Arrangements created: ${createdArrangements}`)
  console.log(`  Arrangements skipped: ${skippedArrangements}`)
  console.log(`  Files with warnings: ${warnedSongs}`)
}

main().catch(error => {
  console.error('Import failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
