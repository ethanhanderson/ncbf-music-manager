import type {
  ChartImportNote,
  ChartImportPlacement,
  ChartImportSummary,
  ParsedLyricLine,
  SlideLine,
} from '@/lib/charts/import/types'

interface MatchResult {
  placements: ChartImportPlacement[]
  notes: ChartImportNote[]
  summary: ChartImportSummary
  warnings: string[]
  unmatchedLines: string[]
}

function normalizeLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function lineMatchScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) {
    const minLen = Math.min(a.length, b.length)
    const maxLen = Math.max(a.length, b.length)
    return 0.9 * (minLen / maxLen)
  }

  const wordsA = a.split(' ').filter(Boolean)
  const wordsB = b.split(' ').filter(Boolean)
  if (wordsA.length === 0 || wordsB.length === 0) return 0

  const setB = new Set(wordsB)
  let common = 0
  for (const word of wordsA) {
    if (setB.has(word)) common += 1
  }
  return common / Math.max(wordsA.length, wordsB.length)
}

function getWordRanges(line: string) {
  const ranges: Array<{ word: string; start: number; end: number }> = []
  const regex = /\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    ranges.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length - 1,
    })
  }
  return ranges
}

function snapCharIndexToWord(line: string, charIndex: number): { start: number; word: string } | null {
  const ranges = getWordRanges(line)
  if (ranges.length === 0) return null
  const inWord = ranges.find((range) => charIndex >= range.start && charIndex <= range.end)
  if (inWord) return { start: inWord.start, word: inWord.word }
  const next = ranges.find((range) => range.start >= charIndex)
  if (next) return { start: next.start, word: next.word }
  const last = ranges[ranges.length - 1]
  return { start: last.start, word: last.word }
}

export function matchParsedLinesToSlides(
  parsedLines: ParsedLyricLine[],
  slideLines: SlideLine[],
  options?: { includeNotes?: boolean }
): MatchResult {
  const placements: ChartImportPlacement[] = []
  const notes: ChartImportNote[] = []
  const warnings: string[] = []
  const unmatchedLines: string[] = []
  const includeNotes = options?.includeNotes ?? true

  let slideIndex = 0
  const windowSize = 8

  parsedLines.forEach((line) => {
    const normalized = normalizeLine(line.text)
    if (!normalized) return

    let bestIndex = -1
    let bestScore = 0
    const maxIndex = Math.min(slideLines.length - 1, slideIndex + windowSize)

    for (let i = slideIndex; i <= maxIndex; i += 1) {
      const targetNormalized = normalizeLine(slideLines[i]?.text ?? '')
      const score = lineMatchScore(normalized, targetNormalized)
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
      if (score === 1) break
    }

    const wordCount = normalized.split(' ').filter(Boolean).length
    const threshold = wordCount <= 2 ? 0.75 : 0.6

    if (bestIndex === -1 || bestScore < threshold) {
      unmatchedLines.push(line.text)
      return
    }

    const matched = slideLines[bestIndex]
    slideIndex = bestIndex + 1
    const lineText = matched.text ?? ''

    for (const chord of line.chords) {
      const rawIndex = Math.min(Math.max(0, chord.charIndex), Math.max(0, lineText.length - 1))
      const snapped = snapCharIndexToWord(lineText, rawIndex)
      const charIndex = snapped?.start ?? rawIndex
      placements.push({
        slideId: matched.slideId,
        lineIndex: matched.lineIndex,
        charIndex,
        chord: chord.chord,
      })
    }

    if (includeNotes && line.notes.length > 0) {
      const word = snapCharIndexToWord(lineText, 0)
      if (!word) {
        warnings.push('Some notes could not be linked to a lyric line.')
        return
      }
      for (const noteText of line.notes) {
        notes.push({
          text: noteText,
          slideId: matched.slideId,
          lineIndex: matched.lineIndex,
          wordStart: word.start,
          wordText: word.word,
        })
      }
    }
  })

  const summary: ChartImportSummary = {
    totalLines: parsedLines.length,
    matchedLines: parsedLines.length - unmatchedLines.length,
    unmatchedLines: unmatchedLines.length,
    placementCount: placements.length,
    noteCount: notes.length,
  }

  return { placements, notes, summary, warnings, unmatchedLines }
}
