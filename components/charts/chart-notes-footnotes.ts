import type { ChartNote } from '@/components/song-charts-manager'

export interface WordRange {
  word: string
  start: number
  end: number
}

export interface OrderedGroupForNotes {
  slides: Array<{
    id: string
    lines: string[]
  }>
}

export function parseLineIntoWords(line: string): WordRange[] {
  const words: WordRange[] = []
  const regex = /\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    words.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length - 1,
    })
  }
  return words
}

export function buildWordOrder(orderedGroups: OrderedGroupForNotes[]) {
  const orderedWordKeys: string[] = []
  const wordIndexByKey = new Map<string, number>()
  let index = 0

  orderedGroups.forEach((group) => {
    group.slides.forEach((slide) => {
      slide.lines.forEach((line, lineIndex) => {
        const words = parseLineIntoWords(line)
        words.forEach((word) => {
          const key = `${slide.id}-${lineIndex}-${word.start}`
          orderedWordKeys.push(key)
          wordIndexByKey.set(key, index)
          index += 1
        })
      })
    })
  })

  return { orderedWordKeys, wordIndexByKey }
}

export function renumberLinkedNotes(
  notes: ChartNote[],
  wordIndexByKey: Map<string, number>
) {
  const linkedNotes = notes.filter((note) => note.linkedWord?.wordKey)
  if (linkedNotes.length === 0) {
    const hasMarkers = notes.some((note) => note.markerNumber !== undefined)
    if (!hasMarkers) return { notes, changed: false }
    return {
      notes: notes.map((note) => (note.markerNumber === undefined ? note : { ...note, markerNumber: undefined })),
      changed: true,
    }
  }

  const sorted = [...linkedNotes].sort((a, b) => {
    const aKey = a.linkedWord?.wordKey ?? ''
    const bKey = b.linkedWord?.wordKey ?? ''
    const aIndex = wordIndexByKey.get(aKey) ?? Number.POSITIVE_INFINITY
    const bIndex = wordIndexByKey.get(bKey) ?? Number.POSITIVE_INFINITY
    if (aIndex !== bIndex) return aIndex - bIndex
    const aTime = a.createdAtMs ?? 0
    const bTime = b.createdAtMs ?? 0
    if (aTime !== bTime) return aTime - bTime
    return a.id.localeCompare(b.id)
  })

  const markerById = new Map<string, number>()
  sorted.forEach((note, i) => {
    markerById.set(note.id, i + 1)
  })

  let changed = false
  const nextNotes = notes.map((note) => {
    const markerNumber = markerById.get(note.id)
    if (markerNumber === undefined) {
      if (note.markerNumber === undefined) return note
      changed = true
      return { ...note, markerNumber: undefined }
    }
    if (note.markerNumber === markerNumber) return note
    changed = true
    return { ...note, markerNumber }
  })

  return { notes: nextNotes, changed }
}
