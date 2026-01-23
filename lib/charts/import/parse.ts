import type { ChartImportParseResult, ParsedChord, ParsedLyricLine } from '@/lib/charts/import/types'

const HEADER_LABELS = new Set([
  'verse',
  'chorus',
  'bridge',
  'pre-chorus',
  'prechorus',
  'intro',
  'outro',
  'tag',
  'interlude',
])

const NOTE_PREFIXES = ['note:', 'notes:', 'comment:', 'comments:']

function normalizeChordToken(token: string): string {
  return token.replace(/^[^A-Ga-g]+/, '').replace(/[^A-Ga-g0-9#b/()+.-]+$/g, '')
}

function isChordToken(token: string): boolean {
  const normalized = normalizeChordToken(token)
  if (!normalized) return false
  const upper = normalized.toUpperCase()
  if (upper === 'N.C.' || upper === 'NC') return true
  return /^[A-G](#|b)?[0-9a-zA-Z+()\-./]*(\/[A-G](#|b)?[0-9a-zA-Z+()\-./]*)?$/i.test(normalized)
}

function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return false
  let chordCount = 0
  for (const token of tokens) {
    if (isChordToken(token)) chordCount += 1
  }
  return chordCount / tokens.length >= 0.6
}

function extractNoteText(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  for (const prefix of NOTE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim() || trimmed
    }
  }
  if (lower.startsWith('{comment:') || lower.startsWith('{c:')) {
    const content = trimmed.replace(/^\{(comment|c):/i, '').replace(/\}$/i, '').trim()
    return content || trimmed
  }
  if (trimmed.startsWith('*')) {
    return trimmed.slice(1).trim() || trimmed
  }
  if (trimmed.startsWith('//')) {
    return trimmed.slice(2).trim() || trimmed
  }
  return null
}

function isHeaderLine(line: string): boolean {
  const cleaned = line.replace(/[^a-zA-Z-]/g, '').toLowerCase()
  return HEADER_LABELS.has(cleaned)
}

function hasInlineChords(line: string): boolean {
  return /\[[^\]]+\]/.test(line)
}

function parseInlineChordLine(line: string): { text: string; chords: ParsedChord[] } {
  const chords: ParsedChord[] = []
  let output = ''
  let lastIndex = 0
  const regex = /\[([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    const chordText = match[1]?.trim() ?? ''
    output += line.slice(lastIndex, match.index)
    const charIndex = output.length
    if (chordText && isChordToken(chordText)) {
      chords.push({ chord: chordText, charIndex })
    }
    lastIndex = match.index + match[0].length
  }
  output += line.slice(lastIndex)
  return { text: output, chords }
}

function parseChordPositions(line: string): ParsedChord[] {
  const chords: ParsedChord[] = []
  const regex = /\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    const rawToken = match[0] ?? ''
    const normalized = normalizeChordToken(rawToken)
    if (!normalized || !isChordToken(normalized)) continue
    chords.push({ chord: normalized, charIndex: match.index })
  }
  return chords
}

export function parseChordChartText(text: string): ChartImportParseResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const parsed: ParsedLyricLine[] = []
  const warnings: string[] = []
  let pendingNotes: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? ''
    const line = rawLine.trimEnd()
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const noteText = extractNoteText(trimmed)
    if (noteText) {
      pendingNotes.push(noteText)
      continue
    }

    if (isHeaderLine(trimmed)) {
      continue
    }

    if (hasInlineChords(trimmed)) {
      const { text: lyricText, chords } = parseInlineChordLine(line)
      const textValue = lyricText.trim()
      if (!textValue) {
        continue
      }
      parsed.push({
        text: lyricText,
        chords,
        notes: pendingNotes,
        sourceLineIndex: i,
      })
      pendingNotes = []
      continue
    }

    if (isChordLine(trimmed)) {
      let nextIndex = i + 1
      while (nextIndex < lines.length && !lines[nextIndex]?.trim()) {
        nextIndex += 1
      }
      if (nextIndex < lines.length) {
        const nextLine = lines[nextIndex] ?? ''
        const nextTrimmed = nextLine.trim()
        if (nextTrimmed && !isChordLine(nextTrimmed) && !isHeaderLine(nextTrimmed)) {
          const chords = parseChordPositions(line)
          if (nextTrimmed) {
            parsed.push({
              text: nextLine,
              chords,
              notes: pendingNotes,
              sourceLineIndex: nextIndex,
            })
            pendingNotes = []
            i = nextIndex
            continue
          }
        }
      }
    }

    parsed.push({
      text: line,
      chords: [],
      notes: pendingNotes,
      sourceLineIndex: i,
    })
    pendingNotes = []
  }

  if (pendingNotes.length > 0) {
    warnings.push('Some notes were not attached to a lyric line.')
  }

  return { lines: parsed, warnings }
}
