//! Error types for PowerPoint text extraction.

use thiserror::Error;

/// Result type alias using our Error type.
pub type Result<T> = std::result::Result<T, Error>;

/// Errors that can occur during PowerPoint text extraction.
#[derive(Error, Debug)]
pub enum Error {
    /// Failed to open or read the input file.
    #[error("Failed to read file: {0}")]
    IoError(#[from] std::io::Error),

    /// The file format is not supported or could not be detected.
    #[error("Unsupported or unrecognized file format: {0}")]
    UnsupportedFormat(String),

    /// Failed to parse the PPTX file structure.
    #[error("PPTX parsing error: {0}")]
    PptxParseError(String),

    /// Failed to parse the legacy PPT file structure.
    #[error("PPT parsing error: {0}")]
    PptParseError(String),

    /// Failed to extract text from a slide.
    #[error("Text extraction error: {0}")]
    ExtractionError(String),

    /// Invalid or corrupted file.
    #[error("Invalid or corrupted file: {0}")]
    CorruptedFile(String),

    /// ZIP archive error (for PPTX).
    #[error("ZIP error: {0}")]
    ZipError(String),

    /// XML parsing error (for PPTX).
    #[error("XML parsing error: {0}")]
    XmlError(String),

    /// OLE/CFB container error (for PPT).
    #[error("OLE/CFB error: {0}")]
    CfbError(String),
}
