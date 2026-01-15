/**
 * Extract text from plain text files
 * Handles UTF-8 with fallback to latin1 for older files
 */
export async function extractFromTxt(buffer: Buffer): Promise<{ text: string; warning?: string }> {
  // Try UTF-8 first
  let text = buffer.toString('utf-8')
  
  // Check for BOM and remove if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1)
  }
  
  // Check for replacement character which indicates encoding issues
  if (text.includes('\uFFFD')) {
    // Try latin1 as fallback
    text = buffer.toString('latin1')
    return { 
      text: normalizeLineEndings(text),
      warning: 'File was decoded as Latin-1 (may have encoding issues)'
    }
  }
  
  return { text: normalizeLineEndings(text) }
}

function normalizeLineEndings(text: string): string {
  // Normalize all line endings to \n
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}
