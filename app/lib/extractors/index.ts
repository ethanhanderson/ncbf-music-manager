import { extractFromTxt } from './txt'
import { extractFromRtf } from './rtf'
import { extractFromDocx } from './docx'
import { extractFromPdf } from './pdf'

export interface ExtractionResult {
  text: string
  warning?: string
}

/**
 * Extract plain text from a file buffer based on its MIME type
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractionResult> {
  // Normalize mime type
  const mime = mimeType.toLowerCase()
  const ext = filename.toLowerCase().split('.').pop() || ''
  
  // Plain text
  if (mime === 'text/plain' || ext === 'txt') {
    return extractFromTxt(buffer)
  }
  
  // RTF
  if (mime === 'text/rtf' || mime === 'application/rtf' || ext === 'rtf') {
    return extractFromRtf(buffer)
  }
  
  // DOCX
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return extractFromDocx(buffer)
  }
  
  // PDF
  if (mime === 'application/pdf' || ext === 'pdf') {
    return extractFromPdf(buffer)
  }
  
  // DOC (legacy Word) - not supported, provide helpful message
  if (mime === 'application/msword' || ext === 'doc') {
    throw new Error(
      'Legacy .doc files are not supported. Please convert to .docx or .pdf format.'
    )
  }
  
  // PPT/PPTX - not supported yet
  if (
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    ext === 'ppt' ||
    ext === 'pptx'
  ) {
    throw new Error(
      'PowerPoint files are not yet supported. Please convert to .pdf or .txt format.'
    )
  }
  
  throw new Error(`Unsupported file type: ${mimeType} (${filename})`)
}

/**
 * Get supported file extensions for upload UI
 */
export function getSupportedExtensions(): string[] {
  return ['.txt', '.rtf', '.docx', '.pdf']
}

/**
 * Get supported MIME types for upload validation
 */
export function getSupportedMimeTypes(): string[] {
  return [
    'text/plain',
    'text/rtf',
    'application/rtf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
  ]
}
