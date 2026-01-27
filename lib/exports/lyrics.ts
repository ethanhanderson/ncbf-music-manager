import { Document, Packer, Paragraph, TextRun } from 'docx'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { SongSlide } from '@/lib/supabase/server'

export async function buildLyricsText(slides: SongSlide[], notes?: string | null) {
  const blocks = slides
    .map((slide) => (slide.lines ?? []).join('\n'))
    .map((block) => block.trimEnd())
    .filter((block) => block.trim().length > 0)

  const body = blocks.join('\n\n')
  if (notes?.trim()) {
    return `[Notes: ${notes.trim()}]\n\n${body}`
  }
  return body
}

export async function lyricsToTxt(text: string) {
  return text
}

function escapeRtf(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\par\n')
}

export async function lyricsToRtf(text: string) {
  const escaped = escapeRtf(text)
  return `{\\rtf1\\ansi\\deff0\n${escaped}\n}`
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

function getGroupKey(label: SongSlide['label'], customLabel?: string, uniqueId?: string) {
  if (label === 'custom' && !customLabel) {
    return `${label}::${uniqueId ?? ''}`
  }
  return `${label}::${customLabel ?? ''}`
}

function getGroupDisplayLabel(label: SongSlide['label'], customLabel?: string) {
  if (label === 'custom' && !customLabel) {
    return ''
  }
  const base = GROUP_LABELS[label] ?? 'Custom'
  if ((label === 'verse' || label === 'chorus') && customLabel) {
    return `${base} ${customLabel}`
  }
  if (label === 'custom' && customLabel) {
    return customLabel
  }
  return base
}

function buildVocalGroups(slides: SongSlide[]) {
  const map = new Map<string, { label: SongSlide['label']; customLabel?: string; lines: string[] }>()
  const ordered: Array<{ label: SongSlide['label']; customLabel?: string; lines: string[] }> = []

  slides.forEach((slide) => {
    const key = getGroupKey(slide.label, slide.customLabel, slide.id)
    const existing = map.get(key)
    const lines = slide.lines ?? ['']
    if (existing) {
      existing.lines.push(...lines)
      return
    }
    const entry = {
      label: slide.label,
      customLabel: slide.customLabel,
      lines: [...lines],
    }
    map.set(key, entry)
    ordered.push(entry)
  })

  return ordered
}

type LyricsLayoutInput = {
  title: string
  songKey?: string | null
  slides: SongSlide[]
  notes?: string | null
}

export async function lyricsToDocx({ title, songKey, slides, notes }: LyricsLayoutInput) {
  const groups = buildVocalGroups(slides)
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32 })],
      spacing: { after: 160 },
    })
  )

  if (songKey) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Key: ${songKey}`, size: 22 })],
        spacing: { after: 200 },
      })
    )
  }

  if (notes?.trim()) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Notes: ${notes.trim()}`, size: 20 })],
        spacing: { after: 200 },
      })
    )
  }

  groups.forEach((group) => {
    const label = getGroupDisplayLabel(group.label, group.customLabel)
    if (label) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: label.toUpperCase(), bold: true, size: 20 })],
          spacing: { before: 120, after: 80 },
        })
      )
    }
    group.lines.forEach((line) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line || ' ', size: 22 })],
        })
      )
    })
    children.push(new Paragraph({ text: ' ' }))
  })

  const doc = new Document({
    sections: [
      {
        properties: {
          column: {
            count: 2,
            space: 720,
          },
        },
        children,
      },
    ],
  })
  return Packer.toBuffer(doc)
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

export async function lyricsToPdf({ title, songKey, slides, notes }: LyricsLayoutInput) {
  const pdfDoc = await PDFDocument.create()
  const bodyFont = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const headingFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const fontSize = 12
  const headingSize = 10
  const titleSize = 16
  const lineHeight = fontSize * 1.4
  const headingHeight = headingSize * 1.3
  const pageWidth = 612
  const pageHeight = 792
  const margin = 54
  const columnGap = 24
  const columnCount = 2
  const columnWidth = (pageWidth - margin * 2 - columnGap * (columnCount - 1)) / columnCount

  const groups = buildVocalGroups(slides)

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let columnIndex = 0
  let cursorY = pageHeight - margin

  const getColumnX = () => margin + columnIndex * (columnWidth + columnGap)

  const advance = (height: number) => {
    if (cursorY - height < margin) {
      if (columnIndex < columnCount - 1) {
        columnIndex += 1
        cursorY = pageHeight - margin
      } else {
        page = pdfDoc.addPage([pageWidth, pageHeight])
        columnIndex = 0
        cursorY = pageHeight - margin
      }
    }
  }

  advance(titleSize + lineHeight)
  page.drawText(title, {
    x: getColumnX(),
    y: cursorY - titleSize,
    size: titleSize,
    font: headingFont,
  })
  cursorY -= titleSize + lineHeight * 0.5

  if (songKey) {
    advance(lineHeight)
    page.drawText(`Key: ${songKey}`, {
      x: getColumnX(),
      y: cursorY - fontSize,
      size: fontSize,
      font: bodyFont,
    })
    cursorY -= lineHeight
  }

  if (notes?.trim()) {
    const noteLines = wrapLine(`Notes: ${notes.trim()}`, columnWidth, bodyFont, fontSize)
    for (const noteLine of noteLines) {
      advance(lineHeight)
      page.drawText(noteLine, {
        x: getColumnX(),
        y: cursorY - fontSize,
        size: fontSize,
        font: bodyFont,
      })
      cursorY -= lineHeight
    }
    cursorY -= lineHeight * 0.25
  }

  groups.forEach((group) => {
    const label = getGroupDisplayLabel(group.label, group.customLabel)
    if (label) {
      advance(headingHeight)
      page.drawText(label.toUpperCase(), {
        x: getColumnX(),
        y: cursorY - headingSize,
        size: headingSize,
        font: headingFont,
      })
      cursorY -= headingHeight
    }

    group.lines.forEach((line) => {
      const wrapped = wrapLine(line ?? '', columnWidth, bodyFont, fontSize)
      wrapped.forEach((wrappedLine) => {
        advance(lineHeight)
        page.drawText(wrappedLine || ' ', {
          x: getColumnX(),
          y: cursorY - fontSize,
          size: fontSize,
          font: bodyFont,
        })
        cursorY -= lineHeight
      })
    })

    cursorY -= lineHeight * 0.3
  })

  return pdfDoc.save()
}
