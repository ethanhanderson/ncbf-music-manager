import mammoth from 'mammoth'

/**
 * Extract plain text from DOCX files using mammoth
 */
export async function extractFromDocx(buffer: Buffer): Promise<{ text: string; warning?: string }> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    
    let warning: string | undefined
    if (result.messages && result.messages.length > 0) {
      const warnings = result.messages
        .filter(m => m.type === 'warning')
        .map(m => m.message)
      if (warnings.length > 0) {
        warning = warnings.join('; ')
      }
    }
    
    // Clean up the extracted text
    let text = result.value
    
    // Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    
    // Remove excessive blank lines (keep max 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n')
    
    return { text: text.trim(), warning }
  } catch (error) {
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
