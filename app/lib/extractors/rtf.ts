/**
 * Extract plain text from RTF files
 * Uses a simple parser that strips RTF control words and groups
 */
export async function extractFromRtf(buffer: Buffer): Promise<{ text: string; warning?: string }> {
  const rtfContent = buffer.toString('utf-8')
  
  try {
    const text = parseRtf(rtfContent)
    return { text: text.trim() }
  } catch {
    // Fallback to basic stripping if parsing fails
    const fallbackText = basicRtfStrip(rtfContent)
    return { 
      text: fallbackText.trim(),
      warning: 'RTF parsing was incomplete, some formatting may be lost'
    }
  }
}

/**
 * Parse RTF content and extract plain text
 */
function parseRtf(rtf: string): string {
  // Remove BOM if present
  if (rtf.charCodeAt(0) === 0xFEFF) {
    rtf = rtf.slice(1)
  }
  
  const output: string[] = []
  let i = 0
  let depth = 0
  let skipGroup = 0
  
  // Groups to skip (they contain metadata, not content)
  const skipKeywords = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'listtable', 'listoverridetable',
    'info', 'generator', 'header', 'footer', 'headerl', 'headerr', 'headerf',
    'footerl', 'footerr', 'footerf', 'pict', 'object', 'shp', 'shpinst',
    'fldinst', 'themedata', 'colorschememapping', 'datastore'
  ])
  
  while (i < rtf.length) {
    const char = rtf[i]
    
    if (char === '{') {
      depth++
      i++
      continue
    }
    
    if (char === '}') {
      if (skipGroup > 0 && depth === skipGroup) {
        skipGroup = 0
      }
      depth--
      i++
      continue
    }
    
    // Skip content in marked groups
    if (skipGroup > 0 && depth >= skipGroup) {
      i++
      continue
    }
    
    if (char === '\\') {
      // Parse control word
      i++
      if (i >= rtf.length) break
      
      const nextChar = rtf[i]
      
      // Escaped characters
      if (nextChar === '\\' || nextChar === '{' || nextChar === '}') {
        output.push(nextChar)
        i++
        continue
      }
      
      // Line break
      if (nextChar === '\n' || nextChar === '\r') {
        i++
        continue
      }
      
      // Hex character
      if (nextChar === "'") {
        i++
        const hex = rtf.slice(i, i + 2)
        const charCode = parseInt(hex, 16)
        if (!isNaN(charCode)) {
          output.push(String.fromCharCode(charCode))
        }
        i += 2
        continue
      }
      
      // Control word
      let word = ''
      while (i < rtf.length && /[a-zA-Z]/.test(rtf[i])) {
        word += rtf[i]
        i++
      }
      
      // Skip optional numeric parameter
      let param = ''
      if (i < rtf.length && (rtf[i] === '-' || /[0-9]/.test(rtf[i]))) {
        if (rtf[i] === '-') {
          param += '-'
          i++
        }
        while (i < rtf.length && /[0-9]/.test(rtf[i])) {
          param += rtf[i]
          i++
        }
      }
      
      // Skip optional space delimiter
      if (i < rtf.length && rtf[i] === ' ') {
        i++
      }
      
      // Handle specific control words
      if (skipKeywords.has(word)) {
        skipGroup = depth
        continue
      }
      
      // Paragraph/line control words that should add whitespace
      if (word === 'par' || word === 'line') {
        output.push('\n')
        continue
      }
      
      if (word === 'tab') {
        output.push('\t')
        continue
      }
      
      // Unicode character
      if (word === 'u') {
        const unicodeValue = parseInt(param)
        if (!isNaN(unicodeValue)) {
          // Handle negative values (values > 32767 are stored as negative)
          const charCode = unicodeValue < 0 ? unicodeValue + 65536 : unicodeValue
          output.push(String.fromCharCode(charCode))
        }
        // Skip the fallback character(s) after \uN
        continue
      }
      
      continue
    }
    
    // Regular character
    if (char !== '\n' && char !== '\r') {
      output.push(char)
    }
    i++
  }
  
  // Clean up the output
  let text = output.join('')
  
  // Normalize multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n')
  
  // Remove leading/trailing whitespace from lines
  text = text.split('\n').map(line => line.trim()).join('\n')
  
  return text
}

/**
 * Fallback: basic RTF stripping for when parsing fails
 */
function basicRtfStrip(rtf: string): string {
  // Remove RTF header
  let text = rtf.replace(/^\{\\rtf1[^}]*\}/i, '')
  
  // Remove control words with parameters
  text = text.replace(/\\[a-z]+(-?\d+)? ?/gi, ' ')
  
  // Remove groups
  text = text.replace(/\{[^{}]*\}/g, '')
  
  // Clean up braces
  text = text.replace(/[{}]/g, '')
  
  // Decode hex characters
  text = text.replace(/\\'([0-9a-f]{2})/gi, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16))
  })
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ')
  
  return text.trim()
}
