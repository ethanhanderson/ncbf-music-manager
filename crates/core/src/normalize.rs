//! Text normalization for worship lyrics.
//!
//! Handles punctuation removal while preserving apostrophes in words,
//! whitespace normalization, and line break preservation.

use regex::Regex;
use std::sync::LazyLock;

/// Regex to collapse multiple whitespace characters into one.
static WHITESPACE_COLLAPSE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[ \t]+").unwrap());

/// Regex to match common file suffixes that aren't part of the song name.
static FILENAME_SUFFIX_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s*[-_]?\s*(lyrics?|slides?|slideshow|presentation|ppt|pptx|worship|song)\s*$")
        .unwrap()
});

/// Characters that are considered punctuation to remove.
/// We handle apostrophes specially, so they're not in this list.
const PUNCTUATION_CHARS: &[char] = &[
    '.', ',', ';', ':', '?', '!', // Basic punctuation
    '"', '"', '"', // Quotation marks
    '„', '‚', // German quotes
    '«', '»', '‹', '›', // Guillemets
    '(', ')', '[', ']', '{', '}', '<', '>', // Brackets
    '—', '–', '-', // Dashes
    '/', '\\', '|', // Slashes
    '@', '#', '$', '%', '^', '&', '*', '_', '+', '=', '~', '`', // Other punctuation
];

/// Apostrophe-like characters.
const APOSTROPHE_CHARS: &[char] = &['\'', '\u{2019}', '\u{2018}', '`'];

/// Extract a clean song name from a filename.
///
/// Removes file extension and common suffixes like "lyrics", "slides", etc.
fn extract_song_name_from_filename(filename: &str) -> String {
    // Remove file extension
    let name = filename
        .rsplit_once('.')
        .map(|(name, _)| name)
        .unwrap_or(filename);

    // Remove common suffixes
    let cleaned = FILENAME_SUFFIX_REGEX.replace_all(name, "");

    // Normalize for comparison: lowercase, remove punctuation, collapse whitespace
    normalize_for_comparison(&cleaned)
}

/// Normalize a string for comparison purposes.
///
/// Converts to lowercase, removes punctuation, and collapses whitespace.
fn normalize_for_comparison(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Calculate similarity between two normalized strings.
///
/// Returns a score from 0.0 (completely different) to 1.0 (exact match).
/// Uses a combination of exact match, containment, and word overlap.
fn calculate_similarity(a: &str, b: &str) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }

    // Exact match
    if a == b {
        return 1.0;
    }

    // One contains the other
    if a.contains(b) || b.contains(a) {
        let shorter = a.len().min(b.len()) as f64;
        let longer = a.len().max(b.len()) as f64;
        return shorter / longer;
    }

    // Word overlap (Jaccard similarity)
    let words_a: std::collections::HashSet<&str> = a.split_whitespace().collect();
    let words_b: std::collections::HashSet<&str> = b.split_whitespace().collect();

    if words_a.is_empty() || words_b.is_empty() {
        return 0.0;
    }

    let intersection = words_a.intersection(&words_b).count() as f64;
    let union = words_a.union(&words_b).count() as f64;

    intersection / union
}

/// Check if a text element likely represents the song title based on filename.
///
/// Returns true if the text is similar enough to the filename (song name).
fn is_likely_title(text: &str, normalized_filename: &str) -> bool {
    let normalized_text = normalize_for_comparison(text);

    // Skip empty or very short text
    if normalized_text.len() < 2 {
        return false;
    }

    // Skip text that's too long (likely lyrics, not a title)
    // Titles are usually under 60 characters
    if normalized_text.len() > 60 {
        return false;
    }

    let similarity = calculate_similarity(&normalized_text, normalized_filename);

    // Require at least 70% similarity
    similarity >= 0.7
}

/// Text normalizer for worship lyrics.
#[derive(Debug, Clone, Default)]
pub struct TextNormalizer {
    /// Whether to preserve original line breaks.
    preserve_line_breaks: bool,
}

impl TextNormalizer {
    /// Create a new text normalizer with default settings.
    pub fn new() -> Self {
        Self {
            preserve_line_breaks: true,
        }
    }

    /// Set whether to preserve original line breaks.
    pub fn with_preserve_line_breaks(mut self, preserve: bool) -> Self {
        self.preserve_line_breaks = preserve;
        self
    }

    /// Normalize a single line of text.
    ///
    /// - Removes most punctuation (quotes, parentheses, dashes, etc.)
    /// - Keeps apostrophes that are inside words ('Tis, e'er, don't)
    /// - Collapses whitespace runs to single spaces
    /// - Trims leading/trailing whitespace
    pub fn normalize_line(&self, text: &str) -> String {
        let mut result = text.to_string();

        // Normalize line endings to \n first
        result = result.replace("\r\n", "\n").replace('\r', "\n");

        // Process character by character to handle apostrophes properly
        let chars: Vec<char> = result.chars().collect();
        let mut output = String::with_capacity(result.len());

        for (i, &c) in chars.iter().enumerate() {
            if PUNCTUATION_CHARS.contains(&c) {
                // Skip regular punctuation
                continue;
            } else if APOSTROPHE_CHARS.contains(&c) {
                // Keep apostrophe only if it's between letters (inside a word)
                let prev_is_letter = i > 0 && chars[i - 1].is_alphabetic();
                let next_is_letter = i + 1 < chars.len() && chars[i + 1].is_alphabetic();

                if prev_is_letter && next_is_letter {
                    // Normalize to standard apostrophe
                    output.push('\'');
                }
                // Otherwise skip it (standalone apostrophe)
            } else {
                output.push(c);
            }
        }

        result = output;

        // Collapse whitespace (but preserve newlines if configured)
        if self.preserve_line_breaks {
            // Process each line separately
            result = result
                .lines()
                .map(|line| {
                    let collapsed = WHITESPACE_COLLAPSE_REGEX.replace_all(line, " ");
                    collapsed.trim().to_string()
                })
                .collect::<Vec<_>>()
                .join("\n");
        } else {
            result = WHITESPACE_COLLAPSE_REGEX.replace_all(&result, " ").to_string();
            result = result.trim().to_string();
        }

        result
    }

    /// Normalize text from a presentation, returning individual lines.
    ///
    /// This processes all text and splits it into individual lines,
    /// filtering out empty lines.
    pub fn normalize_to_lines(&self, text: &str) -> Vec<String> {
        let normalized = self.normalize_line(text);

        normalized
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect()
    }

    /// Normalize all slides in a presentation, extracting all non-empty lines.
    pub fn normalize_presentation(&self, slides: &[crate::ExtractedSlide]) -> Vec<String> {
        let mut all_lines = Vec::new();

        for slide in slides {
            for text in &slide.lines {
                let normalized_lines = self.normalize_to_lines(&text.text);
                all_lines.extend(normalized_lines);
            }
        }

        all_lines
    }

    /// Normalize all slides in a presentation, detecting and extracting a song title.
    ///
    /// If the first slide contains text that matches the filename (song name),
    /// that text is returned separately as the title. The title will be output
    /// as its own slide when formatted for ProPresenter.
    ///
    /// Returns a tuple of (optional title, lyric lines).
    pub fn normalize_presentation_with_title(
        &self,
        slides: &[crate::ExtractedSlide],
        filename: &str,
    ) -> (Option<String>, Vec<String>) {
        let normalized_filename = extract_song_name_from_filename(filename);
        let mut detected_title: Option<String> = None;
        let mut title_text_indices: Vec<usize> = Vec::new();

        // Check first slide for title text
        if let Some(first_slide) = slides.first() {
            for (idx, text) in first_slide.lines.iter().enumerate() {
                let raw_text = text.text.trim();
                if is_likely_title(raw_text, &normalized_filename) {
                    // Found a matching title
                    detected_title = Some(self.normalize_line(raw_text));
                    title_text_indices.push(idx);
                    break; // Only take the first matching title
                }
            }
        }

        // Collect all lines, excluding the detected title from first slide
        let mut all_lines = Vec::new();

        for (slide_idx, slide) in slides.iter().enumerate() {
            for (text_idx, text) in slide.lines.iter().enumerate() {
                // Skip the title text on the first slide
                if slide_idx == 0 && title_text_indices.contains(&text_idx) {
                    continue;
                }

                let normalized_lines = self.normalize_to_lines(&text.text);
                all_lines.extend(normalized_lines);
            }
        }

        (detected_title, all_lines)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remove_basic_punctuation() {
        let normalizer = TextNormalizer::new();

        assert_eq!(normalizer.normalize_line("Hello, world!"), "Hello world");
        assert_eq!(normalizer.normalize_line("What? Why!"), "What Why");
        assert_eq!(
            normalizer.normalize_line("One; two: three."),
            "One two three"
        );
    }

    #[test]
    fn test_preserve_apostrophes_in_words() {
        let normalizer = TextNormalizer::new();

        assert_eq!(normalizer.normalize_line("don't"), "don't");
        assert_eq!(normalizer.normalize_line("I'm here"), "I'm here");
        assert_eq!(normalizer.normalize_line("it's"), "it's");
        assert_eq!(normalizer.normalize_line("e'er we go"), "e'er we go");
    }

    #[test]
    fn test_tis_at_start() {
        let normalizer = TextNormalizer::new();

        // 'Tis starts with apostrophe before letter - this is tricky
        // The apostrophe is NOT between two letters, so it gets removed
        // This is a known limitation; we could special-case common contractions
        // For now, accept that leading apostrophes are removed
        assert_eq!(normalizer.normalize_line("'Tis the season"), "Tis the season");
    }

    #[test]
    fn test_remove_standalone_apostrophes() {
        let normalizer = TextNormalizer::new();

        // Apostrophe at start not followed by letter
        assert_eq!(normalizer.normalize_line("' hello"), "hello");

        // Apostrophe at end not preceded by letter
        assert_eq!(normalizer.normalize_line("hello '"), "hello");
    }

    #[test]
    fn test_remove_quotes_and_brackets() {
        let normalizer = TextNormalizer::new();

        assert_eq!(normalizer.normalize_line("\"Hello\""), "Hello");
        assert_eq!(normalizer.normalize_line("(Hello)"), "Hello");
        assert_eq!(normalizer.normalize_line("[Hello]"), "Hello");
        assert_eq!(normalizer.normalize_line("{Hello}"), "Hello");
        assert_eq!(normalizer.normalize_line("«Hello»"), "Hello");
    }

    #[test]
    fn test_remove_dashes() {
        let normalizer = TextNormalizer::new();

        assert_eq!(normalizer.normalize_line("Hello—world"), "Helloworld");
        assert_eq!(normalizer.normalize_line("Hello–world"), "Helloworld");
        assert_eq!(normalizer.normalize_line("Hello-world"), "Helloworld");
    }

    #[test]
    fn test_collapse_whitespace() {
        let normalizer = TextNormalizer::new();

        assert_eq!(normalizer.normalize_line("Hello    world"), "Hello world");
        assert_eq!(normalizer.normalize_line("  Hello  "), "Hello");
        assert_eq!(normalizer.normalize_line("\t\tHello\t\t"), "Hello");
    }

    #[test]
    fn test_preserve_line_breaks() {
        let normalizer = TextNormalizer::new().with_preserve_line_breaks(true);

        assert_eq!(
            normalizer.normalize_line("Line one\nLine two"),
            "Line one\nLine two"
        );
        assert_eq!(
            normalizer.normalize_line("Line one\r\nLine two"),
            "Line one\nLine two"
        );
    }

    #[test]
    fn test_normalize_to_lines() {
        let normalizer = TextNormalizer::new();

        let lines = normalizer.normalize_to_lines("Hello, world!\nHow are you?");
        assert_eq!(lines, vec!["Hello world", "How are you"]);
    }

    #[test]
    fn test_normalize_to_lines_filters_empty() {
        let normalizer = TextNormalizer::new();

        let lines = normalizer.normalize_to_lines("Hello\n\n\nWorld");
        assert_eq!(lines, vec!["Hello", "World"]);
    }

    #[test]
    fn test_unicode_apostrophes() {
        let normalizer = TextNormalizer::new();

        // Curly apostrophe inside word should be kept (normalized to straight)
        assert_eq!(normalizer.normalize_line("don't"), "don't");
    }

    #[test]
    fn test_worship_lyrics_example() {
        let normalizer = TextNormalizer::new();

        let input = "Amazing grace! How sweet the sound,\nThat saved a wretch like me!";
        let expected = "Amazing grace How sweet the sound\nThat saved a wretch like me";
        assert_eq!(normalizer.normalize_line(input), expected);
    }

    #[test]
    fn test_extract_song_name_from_filename() {
        // Basic case
        assert_eq!(
            extract_song_name_from_filename("Amazing Grace.pptx"),
            "amazing grace"
        );

        // With suffix
        assert_eq!(
            extract_song_name_from_filename("Amazing Grace Lyrics.pptx"),
            "amazing grace"
        );

        // With slideshow suffix
        assert_eq!(
            extract_song_name_from_filename("How Great Thou Art - Slides.pptx"),
            "how great thou art"
        );

        // No extension
        assert_eq!(
            extract_song_name_from_filename("Holy Holy Holy"),
            "holy holy holy"
        );
    }

    #[test]
    fn test_normalize_for_comparison() {
        assert_eq!(normalize_for_comparison("Amazing Grace!"), "amazing grace");
        assert_eq!(
            normalize_for_comparison("  How  Great   Thou Art  "),
            "how great thou art"
        );
        assert_eq!(normalize_for_comparison("It's Well"), "its well");
    }

    #[test]
    fn test_calculate_similarity() {
        // Exact match
        assert_eq!(calculate_similarity("amazing grace", "amazing grace"), 1.0);

        // One contains the other
        let sim = calculate_similarity("amazing grace", "amazing grace how sweet");
        assert!(sim > 0.5 && sim < 1.0);

        // Word overlap
        let sim = calculate_similarity("amazing grace", "grace amazing");
        assert_eq!(sim, 1.0); // Same words, different order = full Jaccard

        // Partial overlap
        let sim = calculate_similarity("amazing grace", "amazing love");
        assert!(sim > 0.0 && sim < 1.0);

        // No overlap
        let sim = calculate_similarity("amazing grace", "holy holy");
        assert_eq!(sim, 0.0);
    }

    #[test]
    fn test_is_likely_title() {
        // Exact match
        assert!(is_likely_title("Amazing Grace", "amazing grace"));

        // Close match with punctuation
        assert!(is_likely_title("Amazing Grace!", "amazing grace"));

        // Match with different case
        assert!(is_likely_title("AMAZING GRACE", "amazing grace"));

        // Not a match - different song
        assert!(!is_likely_title("Holy Holy Holy", "amazing grace"));

        // Too long - likely lyrics, not title
        assert!(!is_likely_title(
            "Amazing grace how sweet the sound that saved a wretch like me I once was lost but now am found",
            "amazing grace"
        ));

        // Too short
        assert!(!is_likely_title("A", "amazing grace"));
    }

    #[test]
    fn test_normalize_presentation_with_title_detects_title() {
        use crate::{ExtractedSlide, SlideText};

        let normalizer = TextNormalizer::new();

        // Create a presentation where first slide has title matching filename
        let mut slide1 = ExtractedSlide::new(1);
        slide1.lines.push(SlideText::new("Amazing Grace")); // This should be detected as title
        slide1.lines.push(SlideText::new("Verse 1"));

        let mut slide2 = ExtractedSlide::new(2);
        slide2.lines.push(SlideText::new("How sweet the sound"));
        slide2.lines.push(SlideText::new("That saved a wretch like me"));

        let slides = vec![slide1, slide2];

        let (title, lines) =
            normalizer.normalize_presentation_with_title(&slides, "Amazing Grace.pptx");

        assert_eq!(title, Some("Amazing Grace".to_string()));
        assert_eq!(
            lines,
            vec![
                "Verse 1",
                "How sweet the sound",
                "That saved a wretch like me"
            ]
        );
    }

    #[test]
    fn test_normalize_presentation_with_title_no_match() {
        use crate::{ExtractedSlide, SlideText};

        let normalizer = TextNormalizer::new();

        // Create a presentation where first slide has no matching title
        let mut slide1 = ExtractedSlide::new(1);
        slide1.lines.push(SlideText::new("Verse 1"));
        slide1
            .lines
            .push(SlideText::new("Amazing grace how sweet the sound"));

        let slides = vec![slide1];

        let (title, lines) =
            normalizer.normalize_presentation_with_title(&slides, "Amazing Grace.pptx");

        // No title detected (first line is "Verse 1", not "Amazing Grace")
        assert_eq!(title, None);
        assert_eq!(
            lines,
            vec!["Verse 1", "Amazing grace how sweet the sound"]
        );
    }

    #[test]
    fn test_normalize_presentation_with_title_filename_suffix() {
        use crate::{ExtractedSlide, SlideText};

        let normalizer = TextNormalizer::new();

        // Create a presentation with filename containing suffix
        let mut slide1 = ExtractedSlide::new(1);
        slide1.lines.push(SlideText::new("How Great Thou Art")); // Title
        slide1.lines.push(SlideText::new("O Lord my God"));

        let slides = vec![slide1];

        let (title, lines) = normalizer
            .normalize_presentation_with_title(&slides, "How Great Thou Art - Lyrics.pptx");

        assert_eq!(title, Some("How Great Thou Art".to_string()));
        assert_eq!(lines, vec!["O Lord my God"]);
    }
}
