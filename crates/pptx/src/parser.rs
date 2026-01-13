//! PPTX file parser implementation.

use ppt_core::{Error, ExtractedSlide, Presentation, PresentationFormat, Result};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::{Read, Seek};
use zip::ZipArchive;

/// Parser for PPTX (Office Open XML) files.
pub struct PptxParser;

impl PptxParser {
    /// Create a new PPTX parser.
    pub fn new() -> Self {
        Self
    }

    /// Parse a PPTX file from a reader.
    pub fn parse<R: Read + Seek>(&self, reader: R, filename: &str) -> Result<Presentation> {
        let mut archive =
            ZipArchive::new(reader).map_err(|e| Error::ZipError(format!("Failed to open ZIP: {}", e)))?;

        let mut presentation = Presentation::new(filename, PresentationFormat::Pptx);

        // Get the slide order from presentation.xml.rels
        let slide_order = self.get_slide_order(&mut archive)?;

        // Parse each slide in order
        for (idx, slide_path) in slide_order.iter().enumerate() {
            let slide = self.parse_slide(&mut archive, slide_path, idx + 1)?;
            presentation.add_slide(slide);
        }

        Ok(presentation)
    }

    /// Get the ordered list of slide paths from the presentation relationships.
    fn get_slide_order<R: Read + Seek>(&self, archive: &mut ZipArchive<R>) -> Result<Vec<String>> {
        // First try to get slide order from [Content_Types].xml and ppt/_rels/presentation.xml.rels
        let rels_path = "ppt/_rels/presentation.xml.rels";

        let rels_content = self.read_file_from_archive(archive, rels_path)?;
        let mut slides: Vec<(String, Option<usize>)> = Vec::new();

        let mut reader = Reader::from_str(&rels_content);
        reader.trim_text(true);

        loop {
            match reader.read_event() {
                Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) if e.name().as_ref() == b"Relationship" => {
                    let mut rel_type = String::new();
                    let mut target = String::new();
                    let mut id = String::new();

                    for attr in e.attributes().flatten() {
                        match attr.key.as_ref() {
                            b"Type" => {
                                rel_type = String::from_utf8_lossy(&attr.value).to_string();
                            }
                            b"Target" => {
                                target = String::from_utf8_lossy(&attr.value).to_string();
                            }
                            b"Id" => {
                                id = String::from_utf8_lossy(&attr.value).to_string();
                            }
                            _ => {}
                        }
                    }

                    // Check if this is a slide relationship
                    if rel_type.contains("/slide") && !rel_type.contains("slideLayout") && !rel_type.contains("slideMaster") {
                        // Extract slide number from rId or target for ordering
                        let order_num = extract_slide_number(&id).or_else(|| extract_slide_number(&target));
                        let full_path = if target.starts_with('/') {
                            target[1..].to_string()
                        } else {
                            format!("ppt/{}", target)
                        };
                        slides.push((full_path, order_num));
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    return Err(Error::XmlError(format!(
                        "Error parsing relationships: {}",
                        e
                    )));
                }
                _ => {}
            }
        }

        // Sort slides by their number
        slides.sort_by(|a, b| {
            match (a.1, b.1) {
                (Some(na), Some(nb)) => na.cmp(&nb),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => a.0.cmp(&b.0),
            }
        });

        Ok(slides.into_iter().map(|(path, _)| path).collect())
    }

    /// Parse a single slide from the archive.
    fn parse_slide<R: Read + Seek>(
        &self,
        archive: &mut ZipArchive<R>,
        slide_path: &str,
        slide_number: usize,
    ) -> Result<ExtractedSlide> {
        let content = self.read_file_from_archive(archive, slide_path)?;
        let mut slide = ExtractedSlide::new(slide_number);

        // Collect shapes with their text and positions
        let shapes = self.extract_shapes_from_xml(&content)?;

        // Add shapes to slide (they'll be sorted by position)
        for shape in shapes {
            if !shape.text.trim().is_empty() {
                slide.add_line_with_position(&shape.text, shape.y, shape.x);
            }
        }

        // Sort by position (top-to-bottom, left-to-right)
        slide.sort_by_position();

        Ok(slide)
    }

    /// Extract shapes with text and position from slide XML.
    fn extract_shapes_from_xml(&self, xml_content: &str) -> Result<Vec<ShapeInfo>> {
        let mut shapes = Vec::new();
        let mut reader = Reader::from_str(xml_content);
        reader.trim_text(true);

        let mut current_shape: Option<ShapeInfo> = None;
        let mut in_text_body = false;
        let mut in_paragraph = false;
        let mut current_text = String::new();

        loop {
            match reader.read_event() {
                Ok(Event::Start(ref e)) => {
                    let name = e.name();
                    let local_name = local_name(name.as_ref());

                    match local_name {
                        b"sp" | b"pic" => {
                            // Start of a shape
                            current_shape = Some(ShapeInfo::default());
                        }
                        b"xfrm" => {
                            // Transform element - contains position
                            // Position will be in child 'off' element
                        }
                        b"off" => {
                            // Offset element with x and y attributes
                            if let Some(ref mut shape) = current_shape {
                                for attr in e.attributes().flatten() {
                                    match attr.key.as_ref() {
                                        b"x" => {
                                            if let Ok(x) = String::from_utf8_lossy(&attr.value).parse::<f64>() {
                                                shape.x = x;
                                            }
                                        }
                                        b"y" => {
                                            if let Ok(y) = String::from_utf8_lossy(&attr.value).parse::<f64>() {
                                                shape.y = y;
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                        b"txBody" => {
                            in_text_body = true;
                        }
                        b"p" if in_text_body => {
                            in_paragraph = true;
                            if !current_text.is_empty() {
                                current_text.push('\n');
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Empty(ref e)) => {
                    let name = e.name();
                    let local_name = local_name(name.as_ref());

                    if local_name == b"off" {
                        // Offset element with x and y attributes
                        if let Some(ref mut shape) = current_shape {
                            for attr in e.attributes().flatten() {
                                match attr.key.as_ref() {
                                    b"x" => {
                                        if let Ok(x) = String::from_utf8_lossy(&attr.value).parse::<f64>() {
                                            shape.x = x;
                                        }
                                    }
                                    b"y" => {
                                        if let Ok(y) = String::from_utf8_lossy(&attr.value).parse::<f64>() {
                                            shape.y = y;
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                Ok(Event::Text(ref e)) => {
                    if in_paragraph {
                        let text = e.unescape().unwrap_or_default();
                        current_text.push_str(&text);
                    }
                }
                Ok(Event::End(ref e)) => {
                    let name = e.name();
                    let local_name = local_name(name.as_ref());

                    match local_name {
                        b"sp" | b"pic" => {
                            // End of shape - save it
                            if let Some(mut shape) = current_shape.take() {
                                shape.text = current_text.trim().to_string();
                                if !shape.text.is_empty() {
                                    shapes.push(shape);
                                }
                            }
                            current_text.clear();
                            in_text_body = false;
                            in_paragraph = false;
                        }
                        b"txBody" => {
                            in_text_body = false;
                        }
                        b"p" => {
                            in_paragraph = false;
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    log::warn!("XML parsing error (continuing): {}", e);
                    // Continue parsing despite errors
                }
                _ => {}
            }
        }

        Ok(shapes)
    }

    /// Read a file from the ZIP archive.
    fn read_file_from_archive<R: Read + Seek>(
        &self,
        archive: &mut ZipArchive<R>,
        path: &str,
    ) -> Result<String> {
        let mut file = archive
            .by_name(path)
            .map_err(|e| Error::ZipError(format!("File not found in archive '{}': {}", path, e)))?;

        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| Error::ZipError(format!("Failed to read '{}': {}", path, e)))?;

        Ok(content)
    }
}

impl Default for PptxParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Information about a shape extracted from XML.
#[derive(Debug, Default)]
struct ShapeInfo {
    text: String,
    x: f64,
    y: f64,
}

/// Extract the local name from a potentially namespaced XML element name.
fn local_name(name: &[u8]) -> &[u8] {
    if let Some(pos) = name.iter().position(|&b| b == b':') {
        &name[pos + 1..]
    } else {
        name
    }
}

/// Extract a slide number from a string like "rId2" or "slide3.xml".
fn extract_slide_number(s: &str) -> Option<usize> {
    // Remove common extensions first
    let s = s.trim_end_matches(".xml").trim_end_matches(".rels");

    // Try to find digits at the end
    let digits: String = s.chars().rev().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    let digits: String = digits.chars().rev().collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_slide_number() {
        assert_eq!(extract_slide_number("rId1"), Some(1));
        assert_eq!(extract_slide_number("rId12"), Some(12));
        assert_eq!(extract_slide_number("slide1.xml"), Some(1));
        assert_eq!(extract_slide_number("slide123.xml"), Some(123));
        assert_eq!(extract_slide_number("nodigits"), None);
    }

    #[test]
    fn test_local_name() {
        assert_eq!(local_name(b"p:sp"), b"sp");
        assert_eq!(local_name(b"a:t"), b"t");
        assert_eq!(local_name(b"sp"), b"sp");
    }
}
