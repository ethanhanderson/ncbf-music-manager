export interface ParsedChord {
  chord: string
  charIndex: number
}

export interface ParsedLyricLine {
  text: string
  chords: ParsedChord[]
  notes: string[]
  sourceLineIndex: number
}

export interface SlideLine {
  slideId: string
  lineIndex: number
  text: string
}

export interface ChartImportPlacement {
  slideId: string
  lineIndex: number
  charIndex: number
  chord: string
}

export interface ChartImportNote {
  text: string
  slideId: string
  lineIndex: number
  wordStart: number
  wordText: string
}

export interface ChartImportSummary {
  totalLines: number
  matchedLines: number
  unmatchedLines: number
  placementCount: number
  noteCount: number
}

export interface ChartImportResponse {
  placements: ChartImportPlacement[]
  notes: ChartImportNote[]
  summary: ChartImportSummary
  warnings: string[]
  unmatchedLines: string[]
}

export interface ChartImportParseResult {
  lines: ParsedLyricLine[]
  warnings: string[]
}
