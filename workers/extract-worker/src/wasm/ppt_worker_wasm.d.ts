// Type declarations for the WASM module
// These types correspond to the Rust exports from crates/worker-wasm

export interface ExtractionResult {
  format: string
  slide_count: number
  detected_title: string | null
  lines: string[]
  warning: string | null
}

export interface FormatResult {
  text: string
  slide_count: number
}

/**
 * Initialize the WASM module. Must be called before other functions.
 */
export default function init(): Promise<void>

/**
 * Extract text from a PowerPoint file.
 * @param data - Raw bytes of the PPT or PPTX file
 * @param filename - Original filename for format detection and title matching
 * @returns Extraction result with lines and metadata
 * @throws Error if extraction fails
 */
export function extract_presentation(data: Uint8Array, filename: string): ExtractionResult

/**
 * Format extracted lines for ProPresenter output.
 * @param lines - Array of extracted text lines
 * @param lines_per_slide - Number of lines per slide (default: 2)
 * @param title - Optional title for the first slide
 * @returns Formatted text result
 */
export function format_for_propresenter(
  lines: string[],
  lines_per_slide: number,
  title: string | null
): FormatResult
