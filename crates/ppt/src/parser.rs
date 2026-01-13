//! PPT file parser implementation.
//!
//! Parses legacy PowerPoint files using the OLE/CFB container format.
//! This implementation properly handles nested record structures and filters
//! master template text to extract only actual slide content.
//!
//! ## Compatibility
//!
//! This parser is designed for PowerPoint 97-2003 (.ppt) files, specifically
//! optimized for worship song slides. It validates files before extraction
//! and will return clear errors for incompatible formats.

use cfb::CompoundFile;
use ppt_core::{Error, ExtractedSlide, Presentation, PresentationFormat, Result};
use std::collections::HashSet;
use std::io::{Read, Seek};

/// Minimum stream size for a valid PPT file (bytes).
/// A valid PPT needs at least a document container with some content.
const MIN_STREAM_SIZE: usize = 512;

/// Maximum supported text type value.
/// Values beyond this are unsupported and may indicate an incompatible format.
const MAX_SUPPORTED_TEXT_TYPE: u32 = 8;

/// Record type constants for PPT file format.
mod record_types {
    pub const RT_DOCUMENT: u16 = 0x1388;
    pub const RT_SLIDE: u16 = 0x03E8;
    pub const RT_SLIDE_PERSIST_ATOM: u16 = 0x03F0;
    pub const RT_TEXT_HEADER_ATOM: u16 = 0x0F9F;
    pub const RT_TEXT_CHARS_ATOM: u16 = 0x0FA0;
    pub const RT_TEXT_BYTES_ATOM: u16 = 0x0FA8;
    pub const RT_CSTRING: u16 = 0x0FBA;
}

/// Information collected during file validation.
#[derive(Debug, Default)]
struct FileValidation {
    /// Size of the PowerPoint Document stream
    stream_size: usize,
    /// Whether RT_Document record was found
    has_document: bool,
    /// Whether any slide records were found
    has_slides: bool,
    /// Whether any text header atoms were found
    has_text_headers: bool,
    /// Whether any text content records were found
    has_text_content: bool,
    /// Count of text records found
    text_record_count: usize,
    /// Unknown/unsupported text types encountered
    unsupported_text_types: HashSet<u32>,
    /// Count of malformed records (bad lengths, etc.)
    malformed_records: usize,
}

/// Text types from RT_TextHeaderAtom.
/// These indicate what kind of text follows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TextType {
    Title = 0,
    Body = 1,
    Notes = 2,
    NotUsed = 3,
    Other = 4,
    CenterBody = 5,
    CenterTitle = 6,
    HalfBody = 7,
    QuarterBody = 8,
}

impl TextType {
    fn from_u32(value: u32) -> Self {
        match value {
            0 => TextType::Title,
            1 => TextType::Body,
            2 => TextType::Notes,
            3 => TextType::NotUsed,
            4 => TextType::Other,
            5 => TextType::CenterBody,
            6 => TextType::CenterTitle,
            7 => TextType::HalfBody,
            8 => TextType::QuarterBody,
            _ => TextType::Other,
        }
    }

    /// Check if this text type represents actual slide content (not notes or unused).
    fn is_slide_content(&self) -> bool {
        // Include most text types - only exclude Notes and NotUsed
        // TextType::Other (4) is commonly used for main content in worship slides
        !matches!(self, TextType::Notes | TextType::NotUsed)
    }
}

/// Parser for legacy PPT (OLE/CFB) files.
pub struct PptParser;

impl PptParser {
    /// Create a new PPT parser.
    pub fn new() -> Self {
        Self
    }

    /// Parse a PPT file from a reader.
    ///
    /// This method first validates the file structure to ensure compatibility,
    /// then extracts text content. It will return an error if the file format
    /// is not compatible with this parser.
    pub fn parse<R: Read + Seek>(&self, reader: R, filename: &str) -> Result<Presentation> {
        let mut cfb = CompoundFile::open(reader)
            .map_err(|e| Error::CfbError(format!("Failed to open CFB container: {}", e)))?;

        // Validate CFB structure has required streams
        self.validate_cfb_structure(&cfb)?;

        let mut presentation = Presentation::new(filename, PresentationFormat::Ppt);

        // Read the PowerPoint Document stream
        let stream_data = self.read_powerpoint_stream(&mut cfb)?;

        // Validate the stream content before extraction
        let validation = self.validate_stream(&stream_data)?;

        // Log validation info
        log::debug!(
            "PPT validation: stream_size={}, has_document={}, has_slides={}, \
             has_text_headers={}, has_text_content={}, text_records={}, malformed={}",
            validation.stream_size,
            validation.has_document,
            validation.has_slides,
            validation.has_text_headers,
            validation.has_text_content,
            validation.text_record_count,
            validation.malformed_records
        );

        // Extract text from the stream
        let slides = self.extract_text_from_stream(&stream_data)?;

        // Warn if no text was extracted despite passing validation
        if slides.is_empty() || slides.iter().all(|s| s.lines.is_empty()) {
            log::warn!(
                "No text content extracted from '{}'. The file may use an unsupported \
                 text storage format or contain only images/graphics.",
                filename
            );
        }

        for slide in slides {
            presentation.add_slide(slide);
        }

        Ok(presentation)
    }

    /// Validate the CFB container has required PowerPoint streams.
    fn validate_cfb_structure<R: Read + Seek>(&self, cfb: &CompoundFile<R>) -> Result<()> {
        // Check for PowerPoint Document stream (required)
        let has_ppt_doc = cfb
            .walk()
            .any(|entry| entry.path().to_string_lossy() == "/PowerPoint Document");

        if !has_ppt_doc {
            return Err(Error::UnsupportedFormat(
                "Missing 'PowerPoint Document' stream. This may not be a valid PPT file \
                 or may be a different Office format."
                    .to_string(),
            ));
        }

        // Check for Current User stream (indicates proper PPT format)
        let has_current_user = cfb
            .walk()
            .any(|entry| entry.path().to_string_lossy() == "/Current User");

        if !has_current_user {
            log::warn!(
                "Missing 'Current User' stream. File may be an older PPT format variant."
            );
        }

        Ok(())
    }

    /// Validate the PowerPoint Document stream content.
    ///
    /// This performs a quick scan of the stream to check:
    /// - Minimum size requirements
    /// - Presence of required record types
    /// - Basic record structure integrity
    fn validate_stream(&self, data: &[u8]) -> Result<FileValidation> {
        let mut validation = FileValidation {
            stream_size: data.len(),
            ..Default::default()
        };

        // Check minimum size
        if data.len() < MIN_STREAM_SIZE {
            return Err(Error::CorruptedFile(format!(
                "PowerPoint Document stream too small ({} bytes). \
                 Minimum expected: {} bytes. File may be corrupted or truncated.",
                data.len(),
                MIN_STREAM_SIZE
            )));
        }

        // Scan records to validate structure
        self.scan_records_for_validation(data, 0, data.len(), &mut validation);

        // Check for required elements
        if !validation.has_document {
            return Err(Error::UnsupportedFormat(
                "No RT_Document record found. This file may use an unsupported \
                 PowerPoint format version (pre-97) or be corrupted."
                    .to_string(),
            ));
        }

        if !validation.has_text_content && !validation.has_text_headers {
            return Err(Error::UnsupportedFormat(
                "No text records found in file. This presentation may contain only \
                 images/graphics, or uses an unsupported text storage format."
                    .to_string(),
            ));
        }

        // Warn about unsupported text types
        if !validation.unsupported_text_types.is_empty() {
            log::warn!(
                "File contains unsupported text types: {:?}. Some text may not be extracted.",
                validation.unsupported_text_types
            );
        }

        // Check for excessive malformed records (indicates corruption)
        if validation.malformed_records > 10 {
            return Err(Error::CorruptedFile(format!(
                "Too many malformed records ({}) detected. File may be corrupted.",
                validation.malformed_records
            )));
        }

        Ok(validation)
    }

    /// Scan records to collect validation information.
    fn scan_records_for_validation(
        &self,
        data: &[u8],
        start: usize,
        end: usize,
        validation: &mut FileValidation,
    ) {
        let mut pos = start;

        while pos + 8 <= end {
            let rec_ver_instance = read_u16_le(data, pos);
            let rec_type = read_u16_le(data, pos + 2);
            let rec_len = read_u32_le(data, pos + 4) as usize;

            let rec_ver = rec_ver_instance & 0x0F;
            let content_start = pos + 8;
            let content_end = content_start + rec_len;

            // Check for malformed records
            if content_end > end || content_end > data.len() {
                validation.malformed_records += 1;
                break;
            }

            // Track record types
            match rec_type {
                record_types::RT_DOCUMENT => {
                    validation.has_document = true;
                }
                record_types::RT_SLIDE => {
                    validation.has_slides = true;
                }
                record_types::RT_TEXT_HEADER_ATOM => {
                    validation.has_text_headers = true;
                    // Check text type value
                    if rec_len >= 4 && content_start + 4 <= data.len() {
                        let text_type = read_u32_le(data, content_start);
                        if text_type > MAX_SUPPORTED_TEXT_TYPE {
                            validation.unsupported_text_types.insert(text_type);
                        }
                    }
                }
                record_types::RT_TEXT_CHARS_ATOM | record_types::RT_TEXT_BYTES_ATOM => {
                    validation.has_text_content = true;
                    validation.text_record_count += 1;
                }
                _ => {}
            }

            // Recurse into containers
            if rec_ver == 0x0F {
                self.scan_records_for_validation(data, content_start, content_end, validation);
            }

            pos = content_end;
        }
    }

    /// Read the PowerPoint Document stream from the CFB container.
    fn read_powerpoint_stream<R: Read + Seek>(
        &self,
        cfb: &mut CompoundFile<R>,
    ) -> Result<Vec<u8>> {
        // The main PowerPoint content is in "PowerPoint Document" stream
        let stream_path = "/PowerPoint Document";

        let mut stream = cfb.open_stream(stream_path).map_err(|e| {
            Error::CfbError(format!(
                "Failed to open PowerPoint Document stream: {}",
                e
            ))
        })?;

        let mut data = Vec::new();
        stream
            .read_to_end(&mut data)
            .map_err(|e| Error::CfbError(format!("Failed to read stream: {}", e)))?;

        Ok(data)
    }

    /// Extract text from the PowerPoint Document stream.
    ///
    /// This implementation:
    /// 1. Properly handles nested container records
    /// 2. Uses RT_TextHeaderAtom to determine text type
    /// 3. Filters out master template text
    /// 4. Groups text by slide using RT_SlidePersistAtom boundaries
    fn extract_text_from_stream(&self, data: &[u8]) -> Result<Vec<ExtractedSlide>> {
        // First pass: collect all text with metadata
        let text_entries = self.collect_text_entries(data);

        // Filter out master template text and group by slide
        let slides = self.organize_into_slides(text_entries);

        Ok(slides)
    }

    /// Collect all text entries from the stream with their metadata.
    fn collect_text_entries(&self, data: &[u8]) -> Vec<TextEntry> {
        let mut entries = Vec::new();
        let mut current_text_type = TextType::Body;
        let mut slide_persist_count = 0;

        self.parse_records_recursive(
            data,
            0,
            data.len(),
            &mut entries,
            &mut current_text_type,
            &mut slide_persist_count,
        );

        entries
    }

    /// Recursively parse records, handling container nesting.
    fn parse_records_recursive(
        &self,
        data: &[u8],
        start: usize,
        end: usize,
        entries: &mut Vec<TextEntry>,
        current_text_type: &mut TextType,
        slide_persist_count: &mut usize,
    ) {
        let mut pos = start;

        while pos + 8 <= end {
            // PPT records have an 8-byte header:
            // - 2 bytes: recVer (4 bits) + recInstance (12 bits)
            // - 2 bytes: recType
            // - 4 bytes: recLen
            let rec_ver_instance = read_u16_le(data, pos);
            let rec_type = read_u16_le(data, pos + 2);
            let rec_len = read_u32_le(data, pos + 4) as usize;

            let rec_ver = rec_ver_instance & 0x0F;
            let _rec_instance = rec_ver_instance >> 4;

            let content_start = pos + 8;
            let content_end = content_start + rec_len;

            if content_end > end || content_end > data.len() {
                // Record extends past boundary, stop parsing
                break;
            }

            match rec_type {
                record_types::RT_SLIDE_PERSIST_ATOM => {
                    // This marks slide persistence info - useful for tracking slides
                    *slide_persist_count += 1;
                }

                record_types::RT_TEXT_HEADER_ATOM => {
                    // This tells us the type of text that follows
                    if rec_len >= 4 && content_start + 4 <= data.len() {
                        let text_type_val = read_u32_le(data, content_start);
                        *current_text_type = TextType::from_u32(text_type_val);
                    }
                }

                record_types::RT_TEXT_CHARS_ATOM => {
                    // Unicode (UTF-16LE) text
                    if let Some(text) = self.extract_unicode_text(data, content_start, rec_len) {
                        if self.is_valid_slide_text(&text, *current_text_type) {
                            entries.push(TextEntry {
                                text,
                                text_type: *current_text_type,
                                position: pos,
                                slide_hint: *slide_persist_count,
                            });
                        }
                    }
                }

                record_types::RT_TEXT_BYTES_ATOM => {
                    // ANSI text
                    if let Some(text) = self.extract_ansi_text(data, content_start, rec_len) {
                        if self.is_valid_slide_text(&text, *current_text_type) {
                            entries.push(TextEntry {
                                text,
                                text_type: *current_text_type,
                                position: pos,
                                slide_hint: *slide_persist_count,
                            });
                        }
                    }
                }

                record_types::RT_CSTRING => {
                    // CStrings usually contain metadata, not actual slide content
                    // Skip them entirely - actual text comes from TextCharsAtom/TextBytesAtom
                }

                _ => {}
            }

            // If this is a container record (recVer == 0xF), parse its children
            if rec_ver == 0x0F {
                self.parse_records_recursive(
                    data,
                    content_start,
                    content_end,
                    entries,
                    current_text_type,
                    slide_persist_count,
                );
            }

            // Move to the next record
            pos = content_end;
        }
    }

    /// Check if text is valid slide content (not template or junk).
    fn is_valid_slide_text(&self, text: &str, text_type: TextType) -> bool {
        let trimmed = text.trim();

        // Skip empty text
        if trimmed.is_empty() {
            return false;
        }

        // Only include slide content text types (not notes)
        if !text_type.is_slide_content() {
            return false;
        }

        // Skip common template placeholders
        let template_patterns = [
            "Click to edit",
            "click to edit",
            "Edit Master",
            "edit master",
            "Master title",
            "master title",
            "Master text",
            "master text",
            "Second level",
            "Third level",
            "Fourth level",
            "Fifth level",
        ];

        for pattern in &template_patterns {
            if trimmed.contains(pattern) {
                return false;
            }
        }

        // Skip single character placeholders (often bullets)
        if trimmed.len() == 1 && !trimmed.chars().next().unwrap().is_alphanumeric() {
            return false;
        }

        true
    }

    /// Organize text entries into slides.
    fn organize_into_slides(&self, entries: Vec<TextEntry>) -> Vec<ExtractedSlide> {
        if entries.is_empty() {
            return Vec::new();
        }

        // Group entries by their slide hint
        let mut slide_groups: Vec<Vec<&TextEntry>> = Vec::new();
        let mut current_slide: Vec<&TextEntry> = Vec::new();
        let mut last_slide_hint = 0;

        for entry in &entries {
            // If slide hint changes significantly, start a new slide
            if entry.slide_hint != last_slide_hint && !current_slide.is_empty() {
                slide_groups.push(current_slide);
                current_slide = Vec::new();
            }
            current_slide.push(entry);
            last_slide_hint = entry.slide_hint;
        }

        if !current_slide.is_empty() {
            slide_groups.push(current_slide);
        }

        // If we only got one group, try to split by title detection
        if slide_groups.len() == 1 && slide_groups[0].len() > 1 {
            slide_groups = self.split_by_titles(&entries);
        }

        // Convert groups to ExtractedSlides
        let mut slides = Vec::new();
        for (i, group) in slide_groups.iter().enumerate() {
            let mut slide = ExtractedSlide::new(i + 1);

            // Sort by position to maintain order, then add title first if present
            let mut sorted: Vec<_> = group.iter().collect();
            sorted.sort_by_key(|e| e.position);

            // Find title entries and add them first
            for entry in sorted.iter() {
                if entry.text_type == TextType::Title || entry.text_type == TextType::CenterTitle {
                    slide.add_line(entry.text.clone());
                }
            }

            // Then add body entries
            for entry in sorted.iter() {
                if entry.text_type != TextType::Title && entry.text_type != TextType::CenterTitle {
                    slide.add_line(entry.text.clone());
                }
            }

            if !slide.lines.is_empty() {
                slides.push(slide);
            }
        }

        slides
    }

    /// Split entries by detecting title text types.
    fn split_by_titles<'a>(&self, entries: &'a [TextEntry]) -> Vec<Vec<&'a TextEntry>> {
        let mut groups = Vec::new();
        let mut current_group: Vec<&TextEntry> = Vec::new();

        for entry in entries {
            // Start new slide on title
            if (entry.text_type == TextType::Title || entry.text_type == TextType::CenterTitle)
                && !current_group.is_empty()
            {
                groups.push(current_group);
                current_group = Vec::new();
            }
            current_group.push(entry);
        }

        if !current_group.is_empty() {
            groups.push(current_group);
        }

        groups
    }

    /// Extract Unicode (UTF-16LE) text from a record.
    fn extract_unicode_text(&self, data: &[u8], start: usize, len: usize) -> Option<String> {
        if len == 0 || start + len > data.len() || len % 2 != 0 {
            return None;
        }

        let slice = &data[start..start + len];
        let u16_chars: Vec<u16> = slice
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();

        // Decode UTF-16, stopping at null terminator if present
        let text: String = char::decode_utf16(u16_chars.iter().copied())
            .take_while(|r| r.as_ref().map(|&c| c != '\0').unwrap_or(false))
            .filter_map(|r| r.ok())
            .collect();

        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    }

    /// Extract ANSI text from a record (Windows-1252 encoding assumed).
    fn extract_ansi_text(&self, data: &[u8], start: usize, len: usize) -> Option<String> {
        if len == 0 || start + len > data.len() {
            return None;
        }

        let slice = &data[start..start + len];

        // Find null terminator if present
        let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
        let slice = &slice[..end];

        // Decode as Windows-1252 (similar to Latin-1 for most chars)
        let text: String = slice
            .iter()
            .map(|&b| {
                // Windows-1252 is mostly compatible with Unicode for printable chars
                // For simplicity, we treat bytes 0x80-0x9F specially
                match b {
                    0x00..=0x7F => b as char,
                    0x80 => '€',
                    0x82 => '‚',
                    0x83 => 'ƒ',
                    0x84 => '„',
                    0x85 => '…',
                    0x86 => '†',
                    0x87 => '‡',
                    0x88 => 'ˆ',
                    0x89 => '‰',
                    0x8A => 'Š',
                    0x8B => '‹',
                    0x8C => 'Œ',
                    0x8E => 'Ž',
                    0x91 => '\u{2018}', // '
                    0x92 => '\u{2019}', // '
                    0x93 => '\u{201C}', // "
                    0x94 => '\u{201D}', // "
                    0x95 => '•',
                    0x96 => '–',
                    0x97 => '—',
                    0x98 => '˜',
                    0x99 => '™',
                    0x9A => 'š',
                    0x9B => '›',
                    0x9C => 'œ',
                    0x9E => 'ž',
                    0x9F => 'Ÿ',
                    0xA0..=0xFF => char::from_u32(b as u32).unwrap_or('?'),
                    _ => '?',
                }
            })
            .collect();

        if text.trim().is_empty() {
            None
        } else {
            Some(text)
        }
    }
}

impl Default for PptParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Internal structure to hold text with metadata during parsing.
#[derive(Debug)]
struct TextEntry {
    text: String,
    text_type: TextType,
    position: usize,
    slide_hint: usize,
}

/// Read a little-endian u16 from a byte slice.
fn read_u16_le(data: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([data[offset], data[offset + 1]])
}

/// Read a little-endian u32 from a byte slice.
fn read_u32_le(data: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_u16_le() {
        let data = [0x01, 0x02, 0x03, 0x04];
        assert_eq!(read_u16_le(&data, 0), 0x0201);
        assert_eq!(read_u16_le(&data, 2), 0x0403);
    }

    #[test]
    fn test_read_u32_le() {
        let data = [0x01, 0x02, 0x03, 0x04];
        assert_eq!(read_u32_le(&data, 0), 0x04030201);
    }

    #[test]
    fn test_extract_ansi_text() {
        let parser = PptParser::new();
        let data = b"Hello World\0garbage";
        let result = parser.extract_ansi_text(data, 0, data.len());
        assert_eq!(result, Some("Hello World".to_string()));
    }

    #[test]
    fn test_extract_unicode_text() {
        let parser = PptParser::new();
        // "Hi" in UTF-16LE
        let data = [0x48, 0x00, 0x69, 0x00];
        let result = parser.extract_unicode_text(&data, 0, 4);
        assert_eq!(result, Some("Hi".to_string()));
    }

    #[test]
    fn test_text_type_conversion() {
        assert_eq!(TextType::from_u32(0), TextType::Title);
        assert_eq!(TextType::from_u32(1), TextType::Body);
        assert_eq!(TextType::from_u32(2), TextType::Notes);
        assert_eq!(TextType::from_u32(4), TextType::Other);

        assert!(TextType::Title.is_slide_content());
        assert!(TextType::Body.is_slide_content());
        assert!(TextType::Other.is_slide_content()); // Common in worship slides
        assert!(!TextType::Notes.is_slide_content());
        assert!(!TextType::NotUsed.is_slide_content());
    }

    #[test]
    fn test_template_filtering() {
        let parser = PptParser::new();

        // Should reject template text
        assert!(!parser.is_valid_slide_text("Click to edit Master title style", TextType::Title));
        assert!(!parser.is_valid_slide_text("Edit Master text styles", TextType::Body));

        // Should accept actual content
        assert!(parser.is_valid_slide_text("Hello World", TextType::Title));
        assert!(parser.is_valid_slide_text("Song lyrics here", TextType::Body));
        assert!(parser.is_valid_slide_text("A Mighty Fortress Is Our God", TextType::Other));

        // Should reject notes
        assert!(!parser.is_valid_slide_text("Speaker notes", TextType::Notes));

        // Should reject single non-alphanumeric characters
        assert!(!parser.is_valid_slide_text("*", TextType::Body));
        assert!(!parser.is_valid_slide_text("*", TextType::Other));
    }

    #[test]
    fn test_validate_stream_too_small() {
        let parser = PptParser::new();
        let small_data = vec![0u8; 100]; // Too small

        let result = parser.validate_stream(&small_data);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert!(matches!(err, Error::CorruptedFile(_)));
    }

    #[test]
    fn test_validate_stream_no_document() {
        let parser = PptParser::new();
        // Create data large enough but with no RT_Document record
        let mut data = vec![0u8; 1024];

        // Add a random record that's not RT_Document
        // recVer=0, recInstance=0, recType=0x0001, recLen=8
        data[0] = 0x00;
        data[1] = 0x00;
        data[2] = 0x01;
        data[3] = 0x00;
        data[4] = 0x08;
        data[5] = 0x00;
        data[6] = 0x00;
        data[7] = 0x00;

        let result = parser.validate_stream(&data);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert!(matches!(err, Error::UnsupportedFormat(_)));
    }

    #[test]
    fn test_validate_stream_valid_structure() {
        let parser = PptParser::new();
        let mut data = vec![0u8; 1024];

        // Add RT_Document container (recVer=0xF for container)
        // recVer=0xF, recInstance=0, recType=0x1388, recLen=100
        data[0] = 0x0F;
        data[1] = 0x00;
        data[2] = 0x88;
        data[3] = 0x13;
        data[4] = 0x64; // 100 bytes
        data[5] = 0x00;
        data[6] = 0x00;
        data[7] = 0x00;

        // Inside document: Add RT_TextHeaderAtom
        // recVer=0, recInstance=0, recType=0x0F9F, recLen=4
        data[8] = 0x00;
        data[9] = 0x00;
        data[10] = 0x9F;
        data[11] = 0x0F;
        data[12] = 0x04;
        data[13] = 0x00;
        data[14] = 0x00;
        data[15] = 0x00;
        // Text type = 1 (Body)
        data[16] = 0x01;
        data[17] = 0x00;
        data[18] = 0x00;
        data[19] = 0x00;

        // Add RT_TextBytesAtom with "Test"
        // recVer=0, recInstance=0, recType=0x0FA8, recLen=4
        data[20] = 0x00;
        data[21] = 0x00;
        data[22] = 0xA8;
        data[23] = 0x0F;
        data[24] = 0x04;
        data[25] = 0x00;
        data[26] = 0x00;
        data[27] = 0x00;
        // "Test"
        data[28] = b'T';
        data[29] = b'e';
        data[30] = b's';
        data[31] = b't';

        let result = parser.validate_stream(&data);
        assert!(result.is_ok());

        let validation = result.unwrap();
        assert!(validation.has_document);
        assert!(validation.has_text_headers);
        assert!(validation.has_text_content);
        assert_eq!(validation.text_record_count, 1);
        assert_eq!(validation.malformed_records, 0);
    }

    #[test]
    fn test_validate_detects_unsupported_text_type() {
        let parser = PptParser::new();
        let mut data = vec![0u8; 1024];

        // Add RT_Document container
        data[0] = 0x0F;
        data[1] = 0x00;
        data[2] = 0x88;
        data[3] = 0x13;
        data[4] = 0x64;
        data[5] = 0x00;
        data[6] = 0x00;
        data[7] = 0x00;

        // Add RT_TextHeaderAtom with unsupported type (99)
        data[8] = 0x00;
        data[9] = 0x00;
        data[10] = 0x9F;
        data[11] = 0x0F;
        data[12] = 0x04;
        data[13] = 0x00;
        data[14] = 0x00;
        data[15] = 0x00;
        data[16] = 99; // Unsupported text type
        data[17] = 0x00;
        data[18] = 0x00;
        data[19] = 0x00;

        // Add RT_TextBytesAtom
        data[20] = 0x00;
        data[21] = 0x00;
        data[22] = 0xA8;
        data[23] = 0x0F;
        data[24] = 0x04;
        data[25] = 0x00;
        data[26] = 0x00;
        data[27] = 0x00;
        data[28] = b'T';
        data[29] = b'e';
        data[30] = b's';
        data[31] = b't';

        let result = parser.validate_stream(&data);
        assert!(result.is_ok());

        let validation = result.unwrap();
        assert!(validation.unsupported_text_types.contains(&99));
    }
}
