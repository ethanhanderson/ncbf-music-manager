//! Legacy PPT (OLE/CFB) parser backend for PowerPoint text extraction.
//!
//! Parses .ppt files which use the Microsoft Compound File Binary (CFB) format.
//! This is a best-effort implementation focusing on extracting visible text.

pub mod parser;

pub use parser::PptParser;
