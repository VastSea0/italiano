import { slugify, type ExportWord, type VerbEntry, type WordEntry } from './vocabulary'

export type TemplateVariant = 'flashcard' | 'table' | 'list'

export type GridConfig = {
  columns: number
  rows: number
}

export type PdfOptions = {
  template: TemplateVariant
  wordGroupLabel: string
  conjugationLabel: string
  grid: GridConfig
  data: ExportWord[]
}

type JsPDF = import('jspdf').jsPDF

type AutoTable = (doc: JsPDF, options: any) => void

export async function generateVocabularyPDF(options: PdfOptions) {
  if (options.data.length === 0) {
    throw new Error('No vocabulary entries available for export.')
  }

  const { jsPDF } = await import('jspdf')
  const { default: autoTableModule } = await import('jspdf-autotable')
  const autoTable = autoTableModule as AutoTable
  const doc = new jsPDF()

  switch (options.template) {
    case 'flashcard':
      generateFlashcardPDF(doc, options)
      break
    case 'table':
      generateTablePDF(doc, options, autoTable)
      break
    case 'list':
      generateListPDF(doc, options)
      break
    default:
      generateTablePDF(doc, options, autoTable)
      break
  }

  const date = new Date().toISOString().slice(0, 10)
  const filename = `${slugify(options.wordGroupLabel)}_${slugify(options.template)}_${date}.pdf`
  doc.save(filename)
}

function generateFlashcardPDF(doc: JsPDF, options: PdfOptions) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const { columns, rows } = options.grid
  const cardsPerPage = columns * rows

  const marginX = 20
  const marginY = 25
  const titleHeight = 20
  const usableWidth = pageWidth - marginX * 2
  const usableHeight = pageHeight - marginY * 2 - titleHeight
  const cardSpacingX = 6
  const cardSpacingY = 10
  const cardWidth = (usableWidth - cardSpacingX * (columns - 1)) / columns
  const cardHeight = (usableHeight - cardSpacingY * (rows - 1)) / rows
  const fontScale = Math.min(1, Math.max(0.7, (cardWidth * cardHeight) / (110 * 80)))

  let currentCardOnPage = 0
  let pageCounter = 0

  options.data.forEach((item, index) => {
    const cardIndex = currentCardOnPage % cardsPerPage
    if (cardIndex === 0) {
      if (pageCounter > 0) {
        doc.addPage()
      }
      pageCounter += 1
      doc.setFontSize(18 * fontScale)
      doc.setFont('helvetica', 'bold')
      doc.text('Italian Vocabulary Flashcards', pageWidth / 2, 15, { align: 'center' })
      doc.setFontSize(10 * fontScale)
      doc.setFont('helvetica', 'normal')
      const subtitle = `${options.wordGroupLabel} • ${options.conjugationLabel}`
      doc.text(subtitle, pageWidth / 2, 22, { align: 'center' })
    }

    const row = Math.floor(cardIndex / columns)
    const col = cardIndex % columns
    const x = marginX + col * (cardWidth + cardSpacingX)
    const y = marginY + titleHeight + row * (cardHeight + cardSpacingY)
    doc.setDrawColor(200, 200, 200)
    doc.rect(x, y, cardWidth, cardHeight)

    const contentPadding = 10
    const contentWidth = cardWidth - contentPadding * 2
    const startX = x + contentPadding
    let cursorY = y + contentPadding + 8

    const italianText = isVerbEntry(item) ? item.infinitive : (item as WordEntry).italian
    doc.setFontSize(16 * fontScale)
    doc.setFont('helvetica', 'bold')
    wrapText(doc, italianText ?? '', startX, cursorY, contentWidth, 8 * fontScale)
    cursorY += 12 * fontScale

    doc.setFontSize(11 * fontScale)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    wrapText(doc, item.english ?? 'N/A', startX, cursorY, contentWidth, 6 * fontScale)
    cursorY += 10 * fontScale

    if (isVerbEntry(item) && Array.isArray(item.present)) {
      cursorY = drawDetailLine(doc, 'Present', item.present.slice(0, 3).join(', '), startX, cursorY, contentWidth, fontScale)
    }
    if (isVerbEntry(item) && Array.isArray(item.past)) {
      cursorY = drawDetailLine(doc, 'Past', item.past.slice(0, 2).join(', '), startX, cursorY, contentWidth, fontScale)
    }
    if (isVerbEntry(item) && Array.isArray(item.presentContinuous)) {
      cursorY = drawDetailLine(
        doc,
        'Continuous',
        item.presentContinuous.slice(0, 2).join(', '),
        startX,
        cursorY,
        contentWidth,
        fontScale,
      )
    }
    if (hasForms(item)) {
      cursorY = drawDetailLine(doc, 'Forms', item.forms.slice(0, 3).join(', '), startX, cursorY, contentWidth, fontScale)
    }
    if (hasGender(item)) {
      const pluralSuffix = item.plural ? ` • Plural: ${item.plural}` : ''
      cursorY = drawDetailLine(doc, 'Gender', `${item.gender}${pluralSuffix}`, startX, cursorY, contentWidth, fontScale)
    }

    doc.setFontSize(9 * fontScale)
    doc.setTextColor(120, 120, 120)
    doc.text(item.category ?? '-', x + cardWidth / 2, y + cardHeight - 5, { align: 'center' })

    currentCardOnPage += 1
  })
}

function drawDetailLine(
  doc: JsPDF,
  label: string,
  value: string,
  startX: number,
  startY: number,
  maxWidth: number,
  fontScale: number,
): number {
  doc.setFontSize(9 * fontScale)
  doc.setFont('helvetica', 'normal')
  wrapText(doc, `${label}: ${value}`, startX, startY, maxWidth, 5 * fontScale)
  return startY + 8 * fontScale
}

function generateTablePDF(doc: JsPDF, options: PdfOptions, autoTable: AutoTable) {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Italian Vocabulary Table', 20, 20)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`${options.wordGroupLabel} • ${options.conjugationLabel}`, 20, 30)

  const body = options.data.map((item) => {
    let details = 'N/A'
    if (isVerbEntry(item) && Array.isArray(item.present)) {
      details = `Present: ${item.present.slice(0, 2).join(', ')}`
    }
    if (isVerbEntry(item) && Array.isArray(item.past)) {
      details += details === 'N/A' ? '' : ' | '
      details += `Past: ${item.past.slice(0, 2).join(', ')}`
    }
    if (hasForms(item)) {
      details = `Forms: ${item.forms.join(', ')}`
    }
    const italian = isVerbEntry(item) ? item.infinitive : (item as WordEntry).italian
    return [italian ?? '-', item.english ?? '-', item.category ?? '-', details]
  })

  autoTable(doc, {
    head: [['Italian', 'English', 'Type', 'Details']],
    body,
    startY: 40,
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [52, 152, 219],
      textColor: [255, 255, 255],
    },
  })
}

function generateListPDF(doc: JsPDF, options: PdfOptions) {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Italian Vocabulary List', 20, 20)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`${options.wordGroupLabel} • ${options.conjugationLabel}`, 20, 30)

  let cursorY = 40
  const lineHeight = 8
  const pageHeight = doc.internal.pageSize.getHeight()

  options.data.forEach((item, index) => {
    if (cursorY > pageHeight - 30) {
      doc.addPage()
      cursorY = 30
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${index + 1}. ${item.infinitive ?? item.italian ?? '-'}`, 20, cursorY)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.text(`→ ${item.english ?? '-'}`, 90, cursorY)
    cursorY += lineHeight

    if (isVerbEntry(item) && Array.isArray(item.present)) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`Present: ${item.present.slice(0, 3).join(', ')}`, 25, cursorY)
      cursorY += lineHeight * 0.8
    }
    if (isVerbEntry(item) && Array.isArray(item.past)) {
      doc.setFontSize(8)
      doc.text(`Past: ${item.past.slice(0, 2).join(', ')}`, 25, cursorY)
      cursorY += lineHeight * 0.8
    }
    if (hasForms(item)) {
      doc.setFontSize(8)
      doc.text(`Forms: ${item.forms.join(', ')}`, 25, cursorY)
      cursorY += lineHeight * 0.8
    }

    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(item.category ?? '-', 25, cursorY)
    doc.setTextColor(0, 0, 0)
    cursorY += lineHeight
  })
}

function isVerbEntry(entry: ExportWord): entry is VerbEntry & { category: string } {
  return 'infinitive' in entry
}

function hasForms(entry: ExportWord): entry is WordEntry & { category: string; forms: string[] } {
  return Array.isArray((entry as WordEntry).forms)
}

function hasGender(entry: ExportWord): entry is WordEntry & { category: string; gender: string; plural?: string } {
  return typeof (entry as WordEntry).gender === 'string'
}

function wrapText(
  doc: JsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ')
  let line = ''
  let cursorY = y

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word
    const testWidth = doc.getTextWidth(testLine)
    if (testWidth > maxWidth && line) {
      doc.text(line, x, cursorY)
      line = word
      cursorY += lineHeight
    } else {
      line = testLine
    }
  })

  if (line) {
    doc.text(line, x, cursorY)
  }
}
