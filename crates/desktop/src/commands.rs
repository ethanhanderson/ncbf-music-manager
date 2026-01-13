//! Tauri commands for PowerPoint text extraction.

use ppt_core::{PresentationFormat, ProPresenterFormatter, TextNormalizer};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::Path;

/// Result of extracting a presentation.
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractionResult {
    /// Original filename.
    pub filename: String,
    /// Detected format.
    pub format: String,
    /// Number of slides found.
    pub slide_count: usize,
    /// Detected song title (if found matching filename on first slide).
    pub detected_title: Option<String>,
    /// All extracted and normalized lines (excluding title if detected).
    pub lines: Vec<String>,
    /// Error message if extraction partially failed.
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
#[tauri::command]
pub async fn extract_presentation(file_path: String) -> Result<ExtractionResult, String> {
    let path = Path::new(&file_path);

    // Read file and detect format
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = BufReader::new(file);

    // Read magic bytes
    let mut magic = [0u8; 8];
    reader
        .read_exact(&mut magic)
        .map_err(|e| format!("Failed to read file header: {}", e))?;

    // Re-open for parsing
    let file = File::open(path).map_err(|e| format!("Failed to reopen file: {}", e))?;
    let reader = BufReader::new(file);

    let format = PresentationFormat::from_magic(&magic)
        .or_else(|| {
            path.extension()
                .and_then(|e| e.to_str())
                .and_then(PresentationFormat::from_extension)
        })
        .ok_or_else(|| "Could not detect file format".to_string())?;

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let presentation = match format {
        PresentationFormat::Pptx => {
            let parser = ppt_pptx::PptxParser::new();
            parser
                .parse(reader, &filename)
                .map_err(|e| format!("PPTX parsing error: {}", e))?
        }
        PresentationFormat::Ppt => {
            let parser = ppt_ppt::PptParser::new();
            parser
                .parse(reader, &filename)
                .map_err(|e| format!("PPT parsing error: {}", e))?
        }
    };

    let normalizer = TextNormalizer::new();
    let (detected_title, lines) =
        normalizer.normalize_presentation_with_title(&presentation.slides, &filename);

    Ok(ExtractionResult {
        filename,
        format: match format {
            PresentationFormat::Pptx => "PPTX".to_string(),
            PresentationFormat::Ppt => "PPT".to_string(),
        },
        slide_count: presentation.slides.len(),
        detected_title,
        lines,
        warning: None,
    })
}

/// Format extracted lines for ProPresenter output.
#[tauri::command]
pub async fn format_for_propresenter(
    lines: Vec<String>,
    lines_per_slide: usize,
    title: Option<String>,
) -> Result<FormatResult, String> {
    let formatter = ProPresenterFormatter::new().with_lines_per_slide(lines_per_slide);
    let lyrics_text = formatter.format(&lines);

    // Check if we have a non-empty title
    let has_title = title
        .as_ref()
        .map(|t| !t.is_empty())
        .unwrap_or(false);

    // Build final output: title slide (if present) + lyrics slides
    let text = match &title {
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

    Ok(FormatResult { text, slide_count })
}

/// Save formatted text to a file.
#[tauri::command]
pub async fn save_to_file(file_path: String, content: String) -> Result<(), String> {
    let mut file =
        File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write to file: {}", e))?;

    Ok(())
}
