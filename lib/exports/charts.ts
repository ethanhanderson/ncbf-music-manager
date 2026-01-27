import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import type { SongSlide } from '@/lib/supabase/server'

export type SlideGroupDefinition = {
  key: string
  label: SongSlide['label']
  customLabel?: string
  slides: SongSlide[]
}

export type ChartNoteLinkedWord = {
  wordKey: string
  slideId: string
  lineIndex: number
  wordStart: number
  wordText: string
}

export type ChartNote = {
  id: string
  text: string
  xPct: number
  yPct: number
  pageIndex?: number
  linkedWord?: ChartNoteLinkedWord
  createdAtMs: number
  markerNumber?: number
}

export type ChordPlacement = {
  slideId: string
  lineIndex: number
  charIndex: number
  chord: string
}

export type VocalChartSettings = {
  songKey: string
  fontSizePx: number
  lineHeightEm: number
  columns: 1 | 2
  showKey: boolean
  groupStyle: 'heading' | 'outline' | 'none'
  showGroupLabels: boolean
  colorizeLabels: boolean
  colorizeBorders: boolean
  notes: ChartNote[]
}

export type ChordChartSettings = {
  songKey: string
  capoKey: string
  fretShift: number
  lyricFontSizePx: number
  chordFontSizePx: number
  lineHeight: 'normal' | 'compact'
  groupStyle: 'heading' | 'outline' | 'none'
  showGroupLabels: boolean
  colorizeLabels: boolean
  colorizeBorders: boolean
  dimLyrics: boolean
  colorizeChords: boolean
  placements: ChordPlacement[]
  customQualities: string[]
  notes: ChartNote[]
}

export type ChartData = {
  version: 1
  vocal?: Partial<VocalChartSettings>
  chord?: Partial<ChordChartSettings>
}

const DEFAULT_VOCAL_SETTINGS: VocalChartSettings = {
  songKey: '',
  fontSizePx: 14,
  lineHeightEm: 1.6,
  columns: 2,
  showKey: true,
  groupStyle: 'heading',
  showGroupLabels: true,
  colorizeLabels: true,
  colorizeBorders: false,
  notes: [],
}

const DEFAULT_CHORD_SETTINGS: ChordChartSettings = {
  songKey: '',
  capoKey: '',
  fretShift: 0,
  lyricFontSizePx: 12,
  chordFontSizePx: 11,
  lineHeight: 'normal',
  groupStyle: 'heading',
  showGroupLabels: true,
  colorizeLabels: true,
  colorizeBorders: false,
  dimLyrics: true,
  colorizeChords: true,
  placements: [],
  customQualities: [],
  notes: [],
}

const GROUP_LABELS: Record<SongSlide['label'], string> = {
  title: 'Title',
  verse: 'Verse',
  chorus: 'Chorus',
  bridge: 'Bridge',
  'pre-chorus': 'Pre-Chorus',
  intro: 'Intro',
  outro: 'Outro',
  tag: 'Tag',
  interlude: 'Interlude',
  custom: 'Custom',
}

const GROUP_COLORS = {
  title: { label: 'primary', border: 'primary' },
  verse: { label: 'secondaryForeground', border: 'secondary' },
  chorus: { label: 'accentForeground', border: 'accent' },
  bridge: { label: 'destructive', border: 'destructive' },
  'pre-chorus': { label: 'foreground', border: 'border' },
  intro: { label: 'mutedForeground', border: 'border' },
  outro: { label: 'mutedForeground', border: 'border' },
  tag: { label: 'primary', border: 'primary' },
  interlude: { label: 'mutedForeground', border: 'border' },
  custom: { label: 'mutedForeground', border: 'border' },
} as const

const CHORD_ROOT_COLORS: Record<string, string> = {
  A: '#DC2626',
  B: '#EA580C',
  C: '#D97706',
  D: '#16A34A',
  E: '#0D9488',
  F: '#2563EB',
  G: '#9333EA',
}

const THEME_COLORS = {
  background: 'oklch(1 0 0)',
  foreground: 'oklch(0.145 0 0)',
  primary: 'oklch(0.67 0.16 58)',
  primaryForeground: 'oklch(0.99 0.02 95)',
  secondary: 'oklch(0.967 0.001 286.375)',
  secondaryForeground: 'oklch(0.21 0.006 285.885)',
  muted: 'oklch(0.97 0 0)',
  mutedForeground: 'oklch(0.556 0 0)',
  accent: 'oklch(0.67 0.16 58)',
  accentForeground: 'oklch(0.99 0.02 95)',
  destructive: 'oklch(0.58 0.22 27)',
  border: 'oklch(0.922 0 0)',
} as const

type PdfRgb = { r: number; g: number; b: number }

type FontBytes = {
  regular: ArrayBuffer
  semiBold: ArrayBuffer
  bold: ArrayBuffer
  mono: ArrayBuffer
  monoBold: ArrayBuffer
}

const fontCache: { value?: Promise<FontBytes> } = {}

function parseOklch(value: string) {
  const match = /oklch\(([^)]+)\)/.exec(value)
  if (!match) return null
  const parts = match[1].trim().split(/\s+/).map(Number)
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null
  return { l: parts[0], c: parts[1], h: parts[2] }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function oklchToRgb(value: string): PdfRgb {
  const parsed = parseOklch(value)
  if (!parsed) return { r: 0, g: 0, b: 0 }
  const { l, c, h } = parsed
  const rad = (h / 180) * Math.PI
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b

  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

  const toSrgb = (channel: number) => {
    const clamped = clamp(channel)
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
  }

  return {
    r: clamp(toSrgb(rLin)),
    g: clamp(toSrgb(gLin)),
    b: clamp(toSrgb(bLin)),
  }
}

function hexToRgb(value: string): PdfRgb {
  const normalized = value.replace('#', '')
  const parsed = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized
  const int = Number.parseInt(parsed, 16)
  if (Number.isNaN(int)) return { r: 0, g: 0, b: 0 }
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
  }
}

function rgbToHex({ r, g, b }: PdfRgb) {
  const toHex = (channel: number) => Math.round(clamp(channel) * 255).toString(16).padStart(2, '0')
  return `${toHex(r)}${toHex(g)}${toHex(b)}`
}

const resolvedThemeColors = {
  background: oklchToRgb(THEME_COLORS.background),
  foreground: oklchToRgb(THEME_COLORS.foreground),
  primary: oklchToRgb(THEME_COLORS.primary),
  primaryForeground: oklchToRgb(THEME_COLORS.primaryForeground),
  secondary: oklchToRgb(THEME_COLORS.secondary),
  secondaryForeground: oklchToRgb(THEME_COLORS.secondaryForeground),
  muted: oklchToRgb(THEME_COLORS.muted),
  mutedForeground: oklchToRgb(THEME_COLORS.mutedForeground),
  accent: oklchToRgb(THEME_COLORS.accent),
  accentForeground: oklchToRgb(THEME_COLORS.accentForeground),
  destructive: oklchToRgb(THEME_COLORS.destructive),
  border: oklchToRgb(THEME_COLORS.border),
}

function pxToPt(value: number) {
  return value * 0.75
}

function getGroupDisplayLabel(group: SlideGroupDefinition) {
  if (group.label === 'custom' && !group.customLabel) {
    return ''
  }
  const base = GROUP_LABELS[group.label] ?? 'Custom'
  if ((group.label === 'verse' || group.label === 'chorus') && group.customLabel) {
    return `${base} ${group.customLabel}`
  }
  if (group.label === 'custom' && group.customLabel) {
    return group.customLabel
  }
  return base
}

function getChordRootColor(chord: string) {
  const match = chord.match(/^([A-G])/)
  if (!match) return resolvedThemeColors.foreground
  const hex = CHORD_ROOT_COLORS[match[1]] ?? '#000000'
  return hexToRgb(hex)
}

function wrapLine(line: string, maxWidth: number, font: { widthOfTextAtSize: (text: string, size: number) => number }, fontSize: number) {
  if (!line) return ['']
  const words = line.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test
      continue
    }
    if (current) {
      lines.push(current)
      current = word
      continue
    }
    let chunk = ''
    for (const char of word) {
      const next = chunk + char
      if (font.widthOfTextAtSize(next, fontSize) > maxWidth) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk = next
      }
    }
    current = chunk
  }
  if (current) {
    lines.push(current)
  }
  return lines.length > 0 ? lines : ['']
}

function chunkLine(line: string, maxChars: number) {
  if (!line) return ['']
  const chunks: string[] = []
  for (let start = 0; start < line.length; start += maxChars) {
    chunks.push(line.slice(start, start + maxChars))
  }
  return chunks.length > 0 ? chunks : ['']
}

function buildChordTextLine(line: string, placements: ChordPlacement[]) {
  if (placements.length === 0) return ''
  const sorted = [...placements].sort((a, b) => a.charIndex - b.charIndex)
  let length = line.length
  sorted.forEach((placement) => {
    length = Math.max(length, placement.charIndex + placement.chord.length)
  })
  const chars = Array.from({ length }, () => ' ')
  sorted.forEach((placement) => {
    const start = Math.max(0, placement.charIndex)
    for (let i = 0; i < placement.chord.length; i += 1) {
      const index = start + i
      if (index >= chars.length) {
        chars.push(placement.chord[i] ?? ' ')
      } else {
        chars[index] = placement.chord[i] ?? ' '
      }
    }
  })
  return chars.join('').trimEnd()
}

export function parseChartData(raw: string | null) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version === 1) {
      return parsed as ChartData
    }
  } catch {
    return null
  }
  return null
}

export function normalizeChartData(chartData: ChartData | null) {
  return {
    vocal: {
      ...DEFAULT_VOCAL_SETTINGS,
      ...chartData?.vocal,
    },
    chord: {
      ...DEFAULT_CHORD_SETTINGS,
      ...chartData?.chord,
    },
  }
}

async function fetchFontCss(family: string, weights: number[]) {
  const weightValue = weights.sort((a, b) => a - b).join(';')
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weightValue}&display=swap`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch font CSS for ${family}`)
  }
  return response.text()
}

function pickFontUrl(css: string, weight: number) {
  const blocks = css.match(/@font-face\s*\{[^}]+\}/g) ?? []
  const candidates: Array<{ url: string; min: number; max: number }> = []

  blocks.forEach((block) => {
    const urlMatch = /src:\s*url\(([^)]+)\)\s*format\(["'](woff2|woff|truetype|opentype)["']\)/.exec(block)
    if (!urlMatch?.[1]) return
    const weightMatch = /font-weight:\s*([^;]+);/.exec(block)
    if (!weightMatch?.[1]) return
    const weightValue = weightMatch[1].trim()
    const rangeMatch = /^(\d+)\s+(\d+)$/.exec(weightValue)
    if (rangeMatch) {
      candidates.push({
        url: urlMatch[1],
        min: Number(rangeMatch[1]),
        max: Number(rangeMatch[2]),
      })
      return
    }
    const numeric = Number(weightValue)
    if (Number.isFinite(numeric)) {
      candidates.push({ url: urlMatch[1], min: numeric, max: numeric })
    }
  })

  const exact = candidates.find((candidate) => candidate.min <= weight && candidate.max >= weight)
  if (exact) return exact.url
  return candidates[0]?.url ?? null
}

async function fetchFontBytes(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch font file: ${url}`)
  }
  return response.arrayBuffer()
}

async function loadFonts(): Promise<FontBytes> {
  if (!fontCache.value) {
    fontCache.value = (async () => {
      const [sansCss, monoCss] = await Promise.all([
        fetchFontCss('Geist', [400, 600, 700]),
        fetchFontCss('Geist Mono', [400, 700]),
      ])

      const sansRegularUrl = pickFontUrl(sansCss, 400)
      const sansSemiBoldUrl = pickFontUrl(sansCss, 600) ?? pickFontUrl(sansCss, 700)
      const sansBoldUrl = pickFontUrl(sansCss, 700) ?? pickFontUrl(sansCss, 600)
      const monoRegularUrl = pickFontUrl(monoCss, 400)
      const monoBoldUrl = pickFontUrl(monoCss, 700) ?? pickFontUrl(monoCss, 600)

      if (!sansRegularUrl || !sansSemiBoldUrl || !sansBoldUrl || !monoRegularUrl || !monoBoldUrl) {
        throw new Error('Unable to resolve Google font URLs for chart export.')
      }

      const [regular, semiBold, bold, mono, monoBold] = await Promise.all([
        fetchFontBytes(sansRegularUrl),
        fetchFontBytes(sansSemiBoldUrl),
        fetchFontBytes(sansBoldUrl),
        fetchFontBytes(monoRegularUrl),
        fetchFontBytes(monoBoldUrl),
      ])

      return { regular, semiBold, bold, mono, monoBold }
    })()
  }
  return fontCache.value
}

function drawNote({
  page,
  note,
  pageWidth,
  pageHeight,
  margin,
  font,
}: {
  page: ReturnType<PDFDocument['addPage']>
  note: ChartNote
  pageWidth: number
  pageHeight: number
  margin: number
  font: PDFFont
}) {
  const text = note.text?.trim() || 'Note'
  const fontSize = pxToPt(10)
  const paddingX = pxToPt(6)
  const paddingY = pxToPt(4)
  const textWidth = font.widthOfTextAtSize(text, fontSize)
  const boxWidth = textWidth + paddingX * 2 + (note.markerNumber !== undefined ? pxToPt(10) : 0)
  const boxHeight = fontSize + paddingY * 2
  const x = margin + note.xPct * (pageWidth - margin * 2)
  const y = pageHeight - margin - note.yPct * (pageHeight - margin * 2)
  const left = x - boxWidth / 2
  const bottom = y - boxHeight / 2
  page.drawRectangle({
    x: left,
    y: bottom,
    width: boxWidth,
    height: boxHeight,
    color: rgb(resolvedThemeColors.background.r, resolvedThemeColors.background.g, resolvedThemeColors.background.b),
    borderColor: rgb(resolvedThemeColors.border.r, resolvedThemeColors.border.g, resolvedThemeColors.border.b),
    borderWidth: 0.75,
  })
  let textX = left + paddingX
  if (note.markerNumber !== undefined) {
    const markerText = `${note.markerNumber}`
    page.drawText(markerText, {
      x: textX,
      y: bottom + paddingY,
      size: pxToPt(9),
      font,
      color: rgb(resolvedThemeColors.mutedForeground.r, resolvedThemeColors.mutedForeground.g, resolvedThemeColors.mutedForeground.b),
    })
    textX += pxToPt(10)
  }
  page.drawText(text, {
    x: textX,
    y: bottom + paddingY,
    size: fontSize,
    font,
    color: rgb(resolvedThemeColors.foreground.r, resolvedThemeColors.foreground.g, resolvedThemeColors.foreground.b),
  })
}

function renderDocxRun(text: string, options: { size: number; bold?: boolean; color?: string; font?: string }) {
  return new TextRun({
    text,
    bold: options.bold,
    size: Math.round(options.size),
    color: options.color,
    font: options.font,
  })
}

export async function renderVocalChartPdf({
  title,
  groups,
  settings,
}: {
  title: string
  groups: SlideGroupDefinition[]
  settings: VocalChartSettings
}) {
  const pdfDoc = await PDFDocument.create()
  const fontBytes = await loadFonts()
  pdfDoc.registerFontkit(fontkit)
  const bodyFont = await pdfDoc.embedFont(fontBytes.regular)
  const headingFont = await pdfDoc.embedFont(fontBytes.semiBold)
  const titleFont = await pdfDoc.embedFont(fontBytes.bold)

  const pageWidth = 612
  const pageHeight = 792
  const margin = pxToPt(20)
  const columnGap = pxToPt(32)
  const columnCount = settings.columns === 1 ? 1 : 2
  const bodyHeight = settings.columns === 2 ? 9.5 * 72 : pageHeight - margin * 2
  const bodyWidth = pageWidth - margin * 2
  const columnWidth = columnCount === 1 ? bodyWidth : (bodyWidth - columnGap) / 2

  const titleSize = 18
  const infoSize = pxToPt(14)
  const labelSize = 10
  const fontSize = pxToPt(settings.fontSizePx)
  const lineHeight = fontSize * settings.lineHeightEm
  const labelLineHeight = labelSize * 1.2
  const groupSpacing = pxToPt(16)
  const labelSpacing = pxToPt(4)
  const headerPadding = pxToPt(20)

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  const pages = [{ page, index: 0 }]
  let columnIndex = 0
  let cursorY = pageHeight - margin

  const drawHeader = () => {
    cursorY = pageHeight - margin
    page.drawText(title, {
      x: margin,
      y: cursorY - titleSize,
      size: titleSize,
      font: titleFont,
      color: rgb(resolvedThemeColors.foreground.r, resolvedThemeColors.foreground.g, resolvedThemeColors.foreground.b),
    })
    cursorY -= titleSize + pxToPt(6)
    if (settings.showKey && settings.songKey) {
      page.drawText(`Key: ${settings.songKey}`, {
        x: margin,
        y: cursorY - infoSize,
        size: infoSize,
        font: bodyFont,
        color: rgb(resolvedThemeColors.mutedForeground.r, resolvedThemeColors.mutedForeground.g, resolvedThemeColors.mutedForeground.b),
      })
      cursorY -= infoSize + pxToPt(4)
    }
    const borderY = cursorY - headerPadding
    page.drawLine({
      start: { x: margin, y: borderY },
      end: { x: pageWidth - margin, y: borderY },
      thickness: 1,
      color: rgb(resolvedThemeColors.border.r, resolvedThemeColors.border.g, resolvedThemeColors.border.b),
    })
    cursorY = borderY - headerPadding
  }

  drawHeader()
  const bodyTop = cursorY
  const bodyBottom = bodyTop - bodyHeight

  const advance = (height: number) => {
    if (cursorY - height < bodyBottom) {
      if (columnIndex < columnCount - 1) {
        columnIndex += 1
        cursorY = bodyTop
      } else {
        page = pdfDoc.addPage([pageWidth, pageHeight])
        pages.push({ page, index: pages.length })
        columnIndex = 0
        drawHeader()
        cursorY = bodyTop
      }
    }
  }

  const columnX = () => margin + columnIndex * (columnWidth + columnGap)

  groups.forEach((group) => {
    const label = getGroupDisplayLabel(group)
    const colors = GROUP_COLORS[group.label] ?? GROUP_COLORS.custom
    const labelColor = settings.colorizeLabels
      ? resolvedThemeColors[colors.label]
      : resolvedThemeColors.mutedForeground
    const borderColor = settings.colorizeBorders
      ? resolvedThemeColors[colors.border]
      : resolvedThemeColors.border

    if (settings.groupStyle === 'outline') {
      advance(pxToPt(12) + labelLineHeight)
    }

    if (settings.showGroupLabels && label && settings.groupStyle !== 'none') {
      advance(labelLineHeight + labelSpacing)
      page.drawText(label.toUpperCase(), {
        x: columnX(),
        y: cursorY - labelSize,
        size: labelSize,
        font: headingFont,
        color: rgb(labelColor.r, labelColor.g, labelColor.b),
      })
      cursorY -= labelLineHeight + labelSpacing
    }

    const groupStartY = cursorY
    const groupPadding = settings.groupStyle === 'outline' ? pxToPt(12) : 0

    if (settings.groupStyle === 'outline') {
      cursorY -= groupPadding
    }

    group.slides.forEach((slide) => {
      slide.lines.forEach((line) => {
        const wrapped = wrapLine(line ?? '', columnWidth - groupPadding * 2, bodyFont, fontSize)
        wrapped.forEach((wrappedLine) => {
          advance(lineHeight)
          page.drawText(wrappedLine || ' ', {
            x: columnX() + groupPadding,
            y: cursorY - fontSize,
            size: fontSize,
            font: bodyFont,
            color: rgb(resolvedThemeColors.foreground.r, resolvedThemeColors.foreground.g, resolvedThemeColors.foreground.b),
          })
          cursorY -= lineHeight
        })
      })
    })

    if (settings.groupStyle === 'outline') {
      const groupEndY = cursorY
      page.drawRectangle({
        x: columnX(),
        y: groupEndY - groupPadding,
        width: columnWidth,
        height: groupStartY - groupEndY + groupPadding * 2,
        borderWidth: 1,
        borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
      })
    }

    cursorY -= groupSpacing
  })

  const firstPage = pages[0]
  if (firstPage) {
    settings.notes.forEach((note) => {
      drawNote({ page: firstPage.page, note, pageWidth, pageHeight, margin, font: bodyFont })
    })
  }

  return pdfDoc.save()
}

export function renderVocalChartTxt({
  title,
  groups,
  settings,
}: {
  title: string
  groups: SlideGroupDefinition[]
  settings: VocalChartSettings
}) {
  const lines: string[] = []
  lines.push(title)
  if (settings.showKey && settings.songKey) {
    lines.push(`Key: ${settings.songKey}`)
  }
  lines.push('')

  groups.forEach((group) => {
    const label = getGroupDisplayLabel(group)
    const showLabel = settings.showGroupLabels && label && settings.groupStyle !== 'none'
    if (showLabel) {
      lines.push(label.toUpperCase())
    }
    group.slides.forEach((slide) => {
      slide.lines.forEach((line) => {
        lines.push(line ?? '')
      })
    })
    lines.push('')
  })

  return lines.join('\n').trimEnd()
}

export async function renderChordChartPdf({
  title,
  groups,
  settings,
}: {
  title: string
  groups: SlideGroupDefinition[]
  settings: ChordChartSettings
}) {
  const pdfDoc = await PDFDocument.create()
  const fontBytes = await loadFonts()
  pdfDoc.registerFontkit(fontkit)
  const bodyFont = await pdfDoc.embedFont(fontBytes.mono)
  const chordFont = await pdfDoc.embedFont(fontBytes.monoBold)
  const headingFont = await pdfDoc.embedFont(fontBytes.semiBold)
  const titleFont = await pdfDoc.embedFont(fontBytes.bold)

  const pageWidth = 612
  const pageHeight = 792
  const margin = pxToPt(20)
  const columnGap = pxToPt(32)
  const columnCount = 2
  const bodyHeight = 9.5 * 72
  const bodyWidth = pageWidth - margin * 2
  const columnWidth = (bodyWidth - columnGap) / columnCount

  const titleSize = 18
  const infoSize = pxToPt(14)
  const labelSize = 10
  const lyricFontSize = pxToPt(settings.lyricFontSizePx)
  const chordFontSize = pxToPt(settings.chordFontSizePx)
  const lineHeightEm = settings.lineHeight === 'compact' ? 1.15 : 1.3
  const lyricLineHeight = lyricFontSize * lineHeightEm
  const chordLineHeight = chordFontSize * 1.2
  const rowHeight = lyricLineHeight + chordLineHeight
  const groupSpacing = pxToPt(24)
  const labelSpacing = pxToPt(6)
  const headerPadding = pxToPt(20)

  const charWidth = bodyFont.widthOfTextAtSize('M', lyricFontSize)
  const maxChars = Math.max(1, Math.floor(columnWidth / charWidth))

  const placementMap = new Map<string, ChordPlacement[]>()
  settings.placements.forEach((placement) => {
    const key = `${placement.slideId}-${placement.lineIndex}`
    const list = placementMap.get(key) ?? []
    list.push(placement)
    placementMap.set(key, list)
  })
  placementMap.forEach((list) => list.sort((a, b) => a.charIndex - b.charIndex))

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  const pages = [{ page, index: 0 }]
  let columnIndex = 0
  let cursorY = pageHeight - margin
  let pageIndex = 0

  const drawHeader = () => {
    cursorY = pageHeight - margin
    page.drawText(title, {
      x: margin,
      y: cursorY - titleSize,
      size: titleSize,
      font: titleFont,
      color: rgb(resolvedThemeColors.foreground.r, resolvedThemeColors.foreground.g, resolvedThemeColors.foreground.b),
    })
    cursorY -= titleSize + pxToPt(6)

    const infoParts = [
      settings.songKey ? `Key: ${settings.songKey}` : null,
      settings.capoKey ? `Capo: ${settings.capoKey}` : null,
      Number.isFinite(settings.fretShift) ? `Fret shift: ${settings.fretShift > 0 ? `+${settings.fretShift}` : settings.fretShift}` : null,
    ].filter(Boolean)
    if (infoParts.length > 0) {
      page.drawText(infoParts.join('  •  '), {
        x: margin,
        y: cursorY - infoSize,
        size: infoSize,
        font: bodyFont,
        color: rgb(resolvedThemeColors.mutedForeground.r, resolvedThemeColors.mutedForeground.g, resolvedThemeColors.mutedForeground.b),
      })
      cursorY -= infoSize + pxToPt(4)
    }
    const borderY = cursorY - headerPadding
    page.drawLine({
      start: { x: margin, y: borderY },
      end: { x: pageWidth - margin, y: borderY },
      thickness: 1,
      color: rgb(resolvedThemeColors.border.r, resolvedThemeColors.border.g, resolvedThemeColors.border.b),
    })
    cursorY = borderY - headerPadding
  }

  drawHeader()
  const bodyTop = cursorY
  const bodyBottom = bodyTop - bodyHeight

  const advance = (height: number) => {
    if (cursorY - height < bodyBottom) {
      if (columnIndex < columnCount - 1) {
        columnIndex += 1
        cursorY = bodyTop
      } else {
        page = pdfDoc.addPage([pageWidth, pageHeight])
        pages.push({ page, index: pages.length })
        columnIndex = 0
        pageIndex += 1
        drawHeader()
        cursorY = bodyTop
      }
    }
  }

  const columnX = () => margin + columnIndex * (columnWidth + columnGap)
  const lyricColor = settings.dimLyrics ? resolvedThemeColors.mutedForeground : resolvedThemeColors.foreground

  if (!settings.placements.length) {
    advance(rowHeight)
    page.drawText('No chord chart data saved for this arrangement.', {
      x: columnX(),
      y: cursorY - lyricFontSize,
      size: lyricFontSize,
      font: bodyFont,
      color: rgb(resolvedThemeColors.mutedForeground.r, resolvedThemeColors.mutedForeground.g, resolvedThemeColors.mutedForeground.b),
    })
    cursorY -= rowHeight
  }

  groups.forEach((group) => {
    const label = getGroupDisplayLabel(group)
    const colors = GROUP_COLORS[group.label] ?? GROUP_COLORS.custom
    const labelColor = settings.colorizeLabels
      ? resolvedThemeColors[colors.label]
      : resolvedThemeColors.mutedForeground
    const borderColor = settings.colorizeBorders
      ? resolvedThemeColors[colors.border]
      : resolvedThemeColors.border

    if (settings.showGroupLabels && label && settings.groupStyle !== 'none') {
      advance(labelSize + labelSpacing)
      page.drawText(label.toUpperCase(), {
        x: columnX(),
        y: cursorY - labelSize,
        size: labelSize,
        font: headingFont,
        color: rgb(labelColor.r, labelColor.g, labelColor.b),
      })
      cursorY -= labelSize + labelSpacing
    }

    const groupStartY = cursorY
    const groupPadding = settings.groupStyle === 'outline' ? pxToPt(12) : 0
    if (settings.groupStyle === 'outline') {
      cursorY -= groupPadding
    }

    group.slides.forEach((slide) => {
      slide.lines.forEach((line, lineIndex) => {
        const chunks = chunkLine(line ?? '', maxChars)
        const linePlacements = placementMap.get(`${slide.id}-${lineIndex}`) ?? []
        chunks.forEach((chunk, chunkIndex) => {
          advance(rowHeight)
          const chunkStart = chunkIndex * maxChars
          const chordY = cursorY - chordFontSize
          const lyricY = cursorY - chordLineHeight - lyricFontSize

          linePlacements.forEach((placement) => {
            if (placement.charIndex < chunkStart || placement.charIndex >= chunkStart + maxChars) return
            const xOffset = (placement.charIndex - chunkStart) * charWidth
            const color = settings.colorizeChords ? getChordRootColor(placement.chord) : resolvedThemeColors.foreground
            page.drawText(placement.chord, {
              x: columnX() + groupPadding + xOffset,
              y: chordY,
              size: chordFontSize,
              font: chordFont,
              color: rgb(color.r, color.g, color.b),
            })
          })

          page.drawText(chunk || ' ', {
            x: columnX() + groupPadding,
            y: lyricY,
            size: lyricFontSize,
            font: bodyFont,
            color: rgb(lyricColor.r, lyricColor.g, lyricColor.b),
          })

          cursorY -= rowHeight
        })
      })
    })

    if (settings.groupStyle === 'outline') {
      const groupEndY = cursorY
      page.drawRectangle({
        x: columnX(),
        y: groupEndY - groupPadding,
        width: columnWidth,
        height: groupStartY - groupEndY + groupPadding * 2,
        borderWidth: 1,
        borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
      })
    }

    cursorY -= groupSpacing
  })

  pages.forEach((entry) => {
    settings.notes.forEach((note) => {
      if ((note.pageIndex ?? 0) !== entry.index) return
      drawNote({ page: entry.page, note, pageWidth, pageHeight, margin, font: bodyFont })
    })
  })

  return pdfDoc.save()
}

export function renderChordChartTxt({
  title,
  groups,
  settings,
}: {
  title: string
  groups: SlideGroupDefinition[]
  settings: ChordChartSettings
}) {
  const lines: string[] = []
  lines.push(title)

  const infoParts = [
    settings.songKey ? `Key: ${settings.songKey}` : null,
    settings.capoKey ? `Capo: ${settings.capoKey}` : null,
    Number.isFinite(settings.fretShift)
      ? `Fret shift: ${settings.fretShift > 0 ? `+${settings.fretShift}` : settings.fretShift}`
      : null,
  ].filter(Boolean)

  if (infoParts.length > 0) {
    lines.push(infoParts.join('  •  '))
  }
  lines.push('')

  if (!settings.placements.length) {
    lines.push('No chord chart data saved for this arrangement.')
    return lines.join('\n').trimEnd()
  }

  const placementMap = new Map<string, ChordPlacement[]>()
  settings.placements.forEach((placement) => {
    const key = `${placement.slideId}-${placement.lineIndex}`
    const list = placementMap.get(key) ?? []
    list.push(placement)
    placementMap.set(key, list)
  })
  placementMap.forEach((list) => list.sort((a, b) => a.charIndex - b.charIndex))

  groups.forEach((group) => {
    const label = getGroupDisplayLabel(group)
    const showLabel = settings.showGroupLabels && label && settings.groupStyle !== 'none'
    if (showLabel) {
      lines.push(label.toUpperCase())
    }

    group.slides.forEach((slide) => {
      slide.lines.forEach((line, lineIndex) => {
        const lineText = line ?? ''
        const placements = placementMap.get(`${slide.id}-${lineIndex}`) ?? []
        const chordLine = buildChordTextLine(lineText, placements)
        lines.push(chordLine)
        lines.push(lineText)
      })
    })
    lines.push('')
  })

  return lines.join('\n').trimEnd()
}

export async function renderVocalChartDocx({
  title,
  groups,
  settings,
}: {
  title: string
  groups: SlideGroupDefinition[]
  settings: VocalChartSettings
}) {
  const fontSize = Math.round(pxToPt(settings.fontSizePx) * 2)
  const labelSize = Math.round(10 * 2)
  const titleSize = Math.round(18 * 2)
  const infoSize = Math.round(pxToPt(14) * 2)
  const lineSpacing = Math.round(fontSize * settings.lineHeightEm)
  const marginTwips = Math.round(pxToPt(20) * 20)

  const children: Paragraph[] = []
  children.push(
    new Paragraph({
      children: [renderDocxRun(title, { size: titleSize, bold: true, font: 'Geist' })],
      spacing: { after: 160 },
    })
  )
  if (settings.showKey && settings.songKey) {
    children.push(
      new Paragraph({
        children: [renderDocxRun(`Key: ${settings.songKey}`, { size: infoSize, font: 'Geist' })],
        spacing: { after: 200 },
      })
    )
  }

  groups.forEach((group) => {
    const label = getGroupDisplayLabel(group)
    const colors = GROUP_COLORS[group.label] ?? GROUP_COLORS.custom
    const labelColor = settings.colorizeLabels
      ? rgbToHex(resolvedThemeColors[colors.label])
      : rgbToHex(resolvedThemeColors.mutedForeground)

    if (settings.showGroupLabels && label && settings.groupStyle !== 'none') {
      children.push(
        new Paragraph({
          children: [renderDocxRun(label.toUpperCase(), { size: labelSize, bold: true, color: labelColor, font: 'Geist' })],
          spacing: { before: 120, after: 80 },
        })
      )
    }

    group.slides.forEach((slide) => {
      slide.lines.forEach((line) => {
        children.push(
          new Paragraph({
            children: [renderDocxRun(line || ' ', { size: fontSize, font: 'Geist' })],
            spacing: { line: lineSpacing },
          })
        )
      })
    })
    children.push(new Paragraph({ text: ' ' }))
  })

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
              right: marginTwips,
            },
          },
          column: {
            count: settings.columns,
            space: Math.round(pxToPt(32) * 20),
          },
        },
        children,
      },
    ],
  })
  return Packer.toBuffer(doc)
}

export async function renderChordChartDocx({
  title,
  groups,
  settings,
}: {
  title: string
  groups: SlideGroupDefinition[]
  settings: ChordChartSettings
}) {
  const lyricSize = Math.round(pxToPt(settings.lyricFontSizePx) * 2)
  const chordSize = Math.round(pxToPt(settings.chordFontSizePx) * 2)
  const labelSize = Math.round(10 * 2)
  const titleSize = Math.round(18 * 2)
  const infoSize = Math.round(pxToPt(14) * 2)
  const marginTwips = Math.round(pxToPt(20) * 20)
  const lineSpacing = Math.round(lyricSize * (settings.lineHeight === 'compact' ? 1.15 : 1.3))

  const children: Paragraph[] = []
  children.push(
    new Paragraph({
      children: [renderDocxRun(title, { size: titleSize, bold: true, font: 'Geist' })],
      spacing: { after: 160 },
    })
  )

  const infoParts = [
    settings.songKey ? `Key: ${settings.songKey}` : null,
    settings.capoKey ? `Capo: ${settings.capoKey}` : null,
    Number.isFinite(settings.fretShift) ? `Fret shift: ${settings.fretShift > 0 ? `+${settings.fretShift}` : settings.fretShift}` : null,
  ].filter(Boolean)

  if (infoParts.length > 0) {
    children.push(
      new Paragraph({
        children: [renderDocxRun(infoParts.join('  •  '), { size: infoSize, font: 'Geist Mono' })],
        spacing: { after: 200 },
      })
    )
  }

  const placementMap = new Map<string, ChordPlacement[]>()
  settings.placements.forEach((placement) => {
    const key = `${placement.slideId}-${placement.lineIndex}`
    const list = placementMap.get(key) ?? []
    list.push(placement)
    placementMap.set(key, list)
  })
  placementMap.forEach((list) => list.sort((a, b) => a.charIndex - b.charIndex))

  groups.forEach((group) => {
    const label = getGroupDisplayLabel(group)
    const colors = GROUP_COLORS[group.label] ?? GROUP_COLORS.custom
    const labelColor = settings.colorizeLabels
      ? rgbToHex(resolvedThemeColors[colors.label])
      : rgbToHex(resolvedThemeColors.mutedForeground)

    if (settings.showGroupLabels && label && settings.groupStyle !== 'none') {
      children.push(
        new Paragraph({
          children: [renderDocxRun(label.toUpperCase(), { size: labelSize, bold: true, color: labelColor, font: 'Geist' })],
          spacing: { before: 120, after: 80 },
        })
      )
    }

    group.slides.forEach((slide) => {
      slide.lines.forEach((line, lineIndex) => {
        const placements = placementMap.get(`${slide.id}-${lineIndex}`) ?? []
        const chordLine = placements.length > 0
          ? placements
            .sort((a, b) => a.charIndex - b.charIndex)
            .map((placement) => `${' '.repeat(Math.max(0, placement.charIndex))}${placement.chord}`)
            .join(' ')
          : ''

        if (chordLine) {
          children.push(
            new Paragraph({
              children: [renderDocxRun(chordLine, { size: chordSize, bold: true, font: 'Geist Mono' })],
              spacing: { line: lineSpacing },
            })
          )
        }
        children.push(
          new Paragraph({
            children: [renderDocxRun(line || ' ', { size: lyricSize, font: 'Geist Mono' })],
            spacing: { line: lineSpacing },
          })
        )
      })
    })
    children.push(new Paragraph({ text: ' ' }))
  })

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
              right: marginTwips,
            },
          },
          column: {
            count: 2,
            space: Math.round(pxToPt(32) * 20),
          },
        },
        children,
      },
    ],
  })
  return Packer.toBuffer(doc)
}
