//! PPTX (Office Open XML) parser backend for PowerPoint text extraction.
//!
//! Parses .pptx files which are ZIP archives containing XML documents.

pub mod parser;

pub use parser::PptxParser;
