//! WASM-compatible wrapper for PPT text extraction.
//!
//! This crate exposes the text extraction functionality to JavaScript
//! for use in Cloudflare Workers.

use ppt_core::{PresentationFormat, ProPresenterFormatter, TextNormalizer};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    // Set up better panic messages in the console
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Result of extracting a presentation.
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractionResult {
    /// Detected format of the source file.
    pub format: String,
    /// Number of slides found in the source.
    pub slide_count: usize,
    /// Detected song title (if found matching filename on first slide).
    pub detected_title: Option<String>,
    /// All extracted and normalized lines (excluding title if detected).
    pub lines: Vec<String>,
    /// Warning message if extraction partially failed.
    pub warning: Option<String>,
}

/// Result of formatting for ProPresenter.
#[derive(Debug, Serialize, Deserialize)]
pub struct FormatResult {
    /// The formatted text ready for ProPresenter.
    pub text: String,
    /// Number of output slides.
    pub slide_count: usize,
}

/// Extract text from a PowerPoint file.
///
/// # Arguments
/// * `data` - The raw bytes of the PPT or PPTX file
/// * `filename` - The original filename (used for format detection and title matching)
///
/// # Returns
/// A JavaScript object with the extraction result, or throws on error.
#[wasm_bindgen]
pub fn extract_presentation(data: &[u8], filename: &str) -> Result<JsValue, JsValue> {
    let result = extract_presentation_impl(data, filename)
        .map_err(|e| JsValue::from_str(&e))?;
    
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

fn extract_presentation_impl(data: &[u8], filename: &str) -> Result<ExtractionResult, String> {
    // Need at least 8 bytes for magic detection
    if data.len() < 8 {
        return Err("File too small to be a valid presentation".to_string());
    }

    // Detect format from magic bytes
    let format = PresentationFormat::from_magic(&data[..8])
        .or_else(|| {
            filename
                .rsplit('.')
                .next()
                .and_then(PresentationFormat::from_extension)
        })
        .ok_or_else(|| "Could not detect file format".to_string())?;

    let cursor = Cursor::new(data);

    let presentation = match format {
        PresentationFormat::Pptx => {
            let parser = ppt_pptx::PptxParser::new();
            parser
                .parse(cursor, filename)
                .map_err(|e| format!("PPTX parsing error: {}", e))?
        }
        PresentationFormat::Ppt => {
            let parser = ppt_ppt::PptParser::new();
            parser
                .parse(cursor, filename)
                .map_err(|e| format!("PPT parsing error: {}", e))?
        }
    };

    let normalizer = TextNormalizer::new();
    let (detected_title, lines) =
        normalizer.normalize_presentation_with_title(&presentation.slides, filename);

    Ok(ExtractionResult {
        format: match format {
            PresentationFormat::Pptx => "pptx".to_string(),
            PresentationFormat::Ppt => "ppt".to_string(),
        },
        slide_count: presentation.slides.len(),
        detected_title,
        lines,
        warning: None,
    })
}

/// Format extracted lines for ProPresenter output.
///
/// # Arguments
/// * `lines` - Array of extracted text lines
/// * `lines_per_slide` - Number of lines to group per slide (default: 2)
/// * `title` - Optional title to include as the first slide
///
/// # Returns
/// A JavaScript object with the format result.
#[wasm_bindgen]
pub fn format_for_propresenter(
    lines: JsValue,
    lines_per_slide: usize,
    title: Option<String>,
) -> Result<JsValue, JsValue> {
    let lines: Vec<String> = serde_wasm_bindgen::from_value(lines)
        .map_err(|e| JsValue::from_str(&format!("Invalid lines array: {}", e)))?;

    let result = format_for_propresenter_impl(&lines, lines_per_slide, title.as_deref());
    
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

fn format_for_propresenter_impl(
    lines: &[String],
    lines_per_slide: usize,
    title: Option<&str>,
) -> FormatResult {
    let formatter = ProPresenterFormatter::new().with_lines_per_slide(lines_per_slide);
    let lyrics_text = formatter.format(lines);

    // Check if we have a non-empty title
    let has_title = title.map(|t| !t.is_empty()).unwrap_or(false);

    // Build final output: title slide (if present) + lyrics slides
    let text = match title {
        Some(title_text) if !title_text.is_empty() => {
            if lyrics_text.is_empty() {
                format!("{}\n", title_text)
            } else {
                format!("{}\n\n{}\n", title_text, lyrics_text)
            }
        }
        _ => {
            if lyrics_text.is_empty() {
                String::new()
            } else {
                format!("{}\n", lyrics_text)
            }
        }
    };

    // Count output slides: 1 for title (if present) + lyric slides
    let lyric_slide_count = if lines.is_empty() {
        0
    } else {
        (lines.len() + lines_per_slide - 1) / lines_per_slide
    };
    let title_slide_count = if has_title { 1 } else { 0 };
    let slide_count = title_slide_count + lyric_slide_count;

    FormatResult { text, slide_count }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_for_propresenter() {
        let lines = vec![
            "Line one".to_string(),
            "Line two".to_string(),
            "Line three".to_string(),
            "Line four".to_string(),
        ];

        let result = format_for_propresenter_impl(&lines, 2, Some("Test Title"));

        assert_eq!(result.slide_count, 3); // 1 title + 2 lyric slides
        assert!(result.text.starts_with("Test Title\n\n"));
        assert!(result.text.contains("Line one\nLine two"));
        assert!(result.text.contains("Line three\nLine four"));
    }

    #[test]
    fn test_format_without_title() {
        let lines = vec!["Only line".to_string()];

        let result = format_for_propresenter_impl(&lines, 2, None);

        assert_eq!(result.slide_count, 1);
        assert_eq!(result.text, "Only line\n");
    }
}
