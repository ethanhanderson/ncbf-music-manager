//! Domain types for representing extracted presentation content.

use serde::{Deserialize, Serialize};

/// Represents an entire presentation with its extracted content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Presentation {
    /// Original filename (without path).
    pub filename: String,

    /// Detected format of the source file.
    pub format: PresentationFormat,

    /// Slides in presentation order.
    pub slides: Vec<ExtractedSlide>,

    /// Optional speaker notes (if extraction was requested).
    pub notes: Option<Vec<String>>,
}

impl Presentation {
    /// Create a new presentation with the given filename and format.
    pub fn new(filename: impl Into<String>, format: PresentationFormat) -> Self {
        Self {
            filename: filename.into(),
            format,
            slides: Vec::new(),
            notes: None,
        }
    }

    /// Add a slide to the presentation.
    pub fn add_slide(&mut self, slide: ExtractedSlide) {
        self.slides.push(slide);
    }

    /// Get all text lines from all slides, flattened.
    pub fn all_lines(&self) -> Vec<&str> {
        self.slides
            .iter()
            .flat_map(|s| s.lines.iter().map(|l| l.text.as_str()))
            .collect()
    }
}

/// The format of the source presentation file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PresentationFormat {
    /// Modern PPTX (Office Open XML).
    Pptx,
    /// Legacy PPT (OLE/CFB binary).
    Ppt,
}

impl PresentationFormat {
    /// Detect format from file extension.
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "pptx" => Some(Self::Pptx),
            "ppt" => Some(Self::Ppt),
            _ => None,
        }
    }

    /// Detect format from file magic bytes.
    pub fn from_magic(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 4 {
            return None;
        }

        // PPTX is a ZIP file (PK\x03\x04)
        if bytes.starts_with(&[0x50, 0x4B, 0x03, 0x04]) {
            return Some(Self::Pptx);
        }

        // PPT is an OLE/CFB file (D0 CF 11 E0 A1 B1 1A E1)
        if bytes.len() >= 8
            && bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
        {
            return Some(Self::Ppt);
        }

        None
    }
}

/// A single extracted slide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedSlide {
    /// 1-based slide number.
    pub number: usize,

    /// Text lines extracted from this slide, in reading order.
    pub lines: Vec<SlideText>,

    /// Optional speaker notes for this slide.
    pub notes: Option<String>,
}

impl ExtractedSlide {
    /// Create a new slide with the given number.
    pub fn new(number: usize) -> Self {
        Self {
            number,
            lines: Vec::new(),
            notes: None,
        }
    }

    /// Add a text line to this slide.
    pub fn add_line(&mut self, text: impl Into<String>) {
        self.lines.push(SlideText::new(text));
    }

    /// Add a text line with position information.
    pub fn add_line_with_position(&mut self, text: impl Into<String>, y: f64, x: f64) {
        self.lines.push(SlideText::with_position(text, y, x));
    }

    /// Sort lines by position (top-to-bottom, then left-to-right).
    pub fn sort_by_position(&mut self) {
        self.lines.sort_by(|a, b| {
            let y_cmp = a
                .y_position
                .partial_cmp(&b.y_position)
                .unwrap_or(std::cmp::Ordering::Equal);
            if y_cmp == std::cmp::Ordering::Equal {
                a.x_position
                    .partial_cmp(&b.x_position)
                    .unwrap_or(std::cmp::Ordering::Equal)
            } else {
                y_cmp
            }
        });
    }

    /// Get non-empty text lines.
    pub fn non_empty_lines(&self) -> Vec<&str> {
        self.lines
            .iter()
            .map(|l| l.text.as_str())
            .filter(|s| !s.trim().is_empty())
            .collect()
    }
}

/// Text content from a shape or text frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideText {
    /// The actual text content.
    pub text: String,

    /// Y position for ordering (top-to-bottom). None if unknown.
    pub y_position: Option<f64>,

    /// X position for ordering (left-to-right). None if unknown.
    pub x_position: Option<f64>,
}

impl SlideText {
    /// Create new slide text without position info.
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            y_position: None,
            x_position: None,
        }
    }

    /// Create new slide text with position info.
    pub fn with_position(text: impl Into<String>, y: f64, x: f64) -> Self {
        Self {
            text: text.into(),
            y_position: Some(y),
            x_position: Some(x),
        }
    }
}
