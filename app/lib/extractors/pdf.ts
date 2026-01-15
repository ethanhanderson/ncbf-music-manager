import { PDFParse } from 'pdf-parse'

/**
 * Extract plain text from PDF files
 */
export async function extractFromPdf(buffer: Buffer): Promise<{ text: string; warning?: string }> {
  try {
    // Create PDFParse instance with buffer data
    const parser = new PDFParse({
      data: new Uint8Array(buffer),
    })
    
    // Extract text
    const textResult = await parser.getText()
    
    let warning: string | undefined
    
    // Check if PDF seems to be scanned/image-based (very little text extracted)
    const textLength = textResult.text.trim().length
    const pageCount = textResult.pages.length
    
    if (pageCount > 0 && textLength < pageCount * 50) {
      // Less than 50 characters per page average suggests scanned content
      warning = 'This PDF may contain scanned images. Text extraction may be incomplete.'
    }
    
    // Clean up the extracted text
    let text = textResult.text
    
    // Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    
    // Remove excessive blank lines (keep max 2 consecutive)
    text = text.replace(/\n{3,}/g, '\n\n')
    
    // Remove page break artifacts
    text = text.replace(/\f/g, '\n\n')
    
    // Clean up the parser
    await parser.destroy()
    
    return { text: text.trim(), warning }
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
