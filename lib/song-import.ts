export type ParsedSongImport = {
  title?: string
  defaultKey?: string
  ccliId?: string
  artist?: string
  linkUrl?: string
  lyrics: string
  hasGroupHeadings: boolean
}

const HEADING_PATTERN =
  /^(?:\(?)(verse|v|chorus|c|bridge|b|pre-?chorus|pc|outro|ending|intro|opening|tag|coda|interlude|instrumental)(?:\s*\d+)?(?:\)?)$/i

function isBracketHeading(line: string) {
  return /^\[.+\]$/.test(line.trim())
}

export function hasLyricGroupHeadings(lines: string[] | string): boolean {
  const list = Array.isArray(lines) ? lines : normalizeText(lines).split('\n')
  return list.some((line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    return HEADING_PATTERN.test(trimmed) || isBracketHeading(trimmed)
  })
}

function normalizeText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '')
}

function isLikelyMetadataLine(line: string) {
  return Boolean(
    line.match(/CCLI\s*(?:#|ID)?\s*[:\-]?\s*\d{4,}/i) ||
      line.match(/\bKey\b\s*[:\-]?\s*[A-G](?:#|b)?m?/i) ||
      line.match(/\b(?:Artist|Author|Written by|Words(?:\s+and\s+Music)?\s+by|Music\s+by|Lyrics\s+by)\b/i)
  )
}

function extractArtist(line: string) {
  const match =
    line.match(/\b(?:words?\s*(?:and\s+)?music|music|lyrics|written|author)\s+by\b\s*[:\-]?\s*(.+)/i) ??
    line.match(/\bartist\b\s*[:\-]?\s*(.+)/i)
  if (!match?.[1]) return undefined
  let value = match[1]
  value = value.split(/\bCCLI\b/i)[0] ?? value
  value = value.split(/\s+-\s+/)[0] ?? value
  value = value.trim()
  return value || undefined
}

function extractTitleLine(line: string) {
  const match = line.match(/^\s*(?:title|song title|song name)\s*[:\-]\s*(.+)$/i)
  if (!match?.[1]) return undefined
  const value = match[1].trim()
  return value || undefined
}

function extractDefaultKey(line: string) {
  const match = line.match(/\bKey\b\s*[:\-]?\s*([A-G](?:#|b)?m?(?:\s*\/\s*[A-G](?:#|b)?m?)?)/i)
  return match?.[1]?.trim()
}

function extractCcli(line: string) {
  const match = line.match(/CCLI\s*(?:#|ID)?\s*[:\-]?\s*(\d{4,})/i)
  return match?.[1]?.trim()
}

function extractLink(line: string) {
  const match = line.match(/https?:\/\/\S+/i)
  if (!match?.[0]) return undefined
  return match[0].replace(/[),.;]+$/, '')
}

function buildHeadingBlocks(lines: string[]) {
  const blocks: string[] = []
  let current: string[] = []

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current.length > 0 && current[current.length - 1] !== '') {
        current.push('')
      }
      return
    }

    if (HEADING_PATTERN.test(trimmed) || isBracketHeading(trimmed)) {
      if (current.length > 0) {
        blocks.push(current.join('\n').trim())
      }
      current = [trimmed]
      return
    }

    current.push(trimmed)
  })

  if (current.length > 0) {
    blocks.push(current.join('\n').trim())
  }

  return blocks.filter(Boolean).join('\n\n')
}

export function parseSongImportText(text: string, options?: { fallbackTitle?: string }) {
  const normalized = normalizeText(text)
  const lines = normalized.split('\n')

  const firstHeadingIndex = lines.findIndex((line) => {
    const trimmed = line.trim()
    return trimmed && (HEADING_PATTERN.test(trimmed) || isBracketHeading(trimmed))
  })

  const headerLimit = firstHeadingIndex > 0 ? firstHeadingIndex : Math.min(lines.length, 8)
  const headerLines = lines.slice(0, headerLimit)

  let title: string | undefined
  let defaultKey: string | undefined
  let ccliId: string | undefined
  let artist: string | undefined
  let linkUrl: string | undefined

  const removeHeaderIndices = new Set<number>()

  headerLines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const titleMatch = extractTitleLine(trimmed)
    if (titleMatch && !title) {
      title = titleMatch
      removeHeaderIndices.add(index)
      return
    }

    const ccliMatch = extractCcli(trimmed)
    if (ccliMatch && !ccliId) {
      ccliId = ccliMatch
      removeHeaderIndices.add(index)
    }

    const keyMatch = extractDefaultKey(trimmed)
    if (keyMatch && !defaultKey) {
      defaultKey = keyMatch
      removeHeaderIndices.add(index)
    }

    const artistMatch = extractArtist(trimmed)
    if (artistMatch && !artist) {
      artist = artistMatch
      removeHeaderIndices.add(index)
    }

    const linkMatch = extractLink(trimmed)
    if (linkMatch && !linkUrl) {
      linkUrl = linkMatch
      removeHeaderIndices.add(index)
    }
  })

  if (!title) {
    const candidateIndex = headerLines.findIndex((line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (extractLink(trimmed)) return false
      if (extractTitleLine(trimmed)) return false
      if (isLikelyMetadataLine(trimmed)) return false
      if (HEADING_PATTERN.test(trimmed) || isBracketHeading(trimmed)) return false
      return true
    })
    if (candidateIndex >= 0) {
      title = headerLines[candidateIndex].trim()
      removeHeaderIndices.add(candidateIndex)
    }
  }

  const lyricsLines = lines.filter((_, index) => !removeHeaderIndices.has(index))
  const hasHeadings = hasLyricGroupHeadings(lyricsLines)

  const lyrics = hasHeadings
    ? buildHeadingBlocks(lyricsLines)
    : lyricsLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  return {
    title: title || options?.fallbackTitle,
    defaultKey,
    ccliId,
    artist,
    linkUrl,
    lyrics,
    hasGroupHeadings: hasHeadings,
  } satisfies ParsedSongImport
}
