//! ProPresenter text format output.
//!
//! Generates plain text files where each slide is separated by a blank line,
//! with configurable lines per slide (default: 2).

/// Formatter for ProPresenter-compatible text output.
#[derive(Debug, Clone)]
pub struct ProPresenterFormatter {
    /// Number of lyric lines per slide.
    lines_per_slide: usize,
}

impl Default for ProPresenterFormatter {
    fn default() -> Self {
        Self { lines_per_slide: 2 }
    }
}

impl ProPresenterFormatter {
    /// Create a new formatter with the default 2 lines per slide.
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a formatter with a custom number of lines per slide.
    pub fn with_lines_per_slide(mut self, lines: usize) -> Self {
        self.lines_per_slide = lines.max(1); // At least 1 line per slide
        self
    }

    /// Format normalized lines into ProPresenter-compatible text.
    ///
    /// Groups lines into slides (default 2 lines each), separated by blank lines.
    ///
    /// # Example output
    /// ```text
    /// Amazing grace how sweet the sound
    /// That saved a wretch like me
    ///
    /// I once was lost but now am found
    /// Was blind but now I see
    /// ```
    pub fn format(&self, lines: &[String]) -> String {
        if lines.is_empty() {
            return String::new();
        }

        let slides: Vec<String> = lines
            .chunks(self.lines_per_slide)
            .map(|chunk| chunk.join("\n"))
            .collect();

        slides.join("\n\n")
    }

    /// Format and write to a string, adding a trailing newline.
    pub fn format_with_newline(&self, lines: &[String]) -> String {
        let formatted = self.format(lines);
        if formatted.is_empty() {
            formatted
        } else {
            format!("{}\n", formatted)
        }
    }
}

/// Represents a formatted slide ready for output.
#[derive(Debug, Clone)]
pub struct FormattedSlide {
    /// The lines in this slide.
    pub lines: Vec<String>,
}

impl FormattedSlide {
    /// Create a new formatted slide.
    pub fn new(lines: Vec<String>) -> Self {
        Self { lines }
    }

    /// Get the slide as a single string with newlines.
    pub fn to_string(&self) -> String {
        self.lines.join("\n")
    }
}

/// Split lines into formatted slides.
pub fn split_into_slides(lines: &[String], lines_per_slide: usize) -> Vec<FormattedSlide> {
    let lps = lines_per_slide.max(1);

    lines
        .chunks(lps)
        .map(|chunk| FormattedSlide::new(chunk.to_vec()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_empty() {
        let formatter = ProPresenterFormatter::new();
        assert_eq!(formatter.format(&[]), "");
    }

    #[test]
    fn test_format_single_line() {
        let formatter = ProPresenterFormatter::new();
        let lines = vec!["Amazing grace".to_string()];
        assert_eq!(formatter.format(&lines), "Amazing grace");
    }

    #[test]
    fn test_format_two_lines_one_slide() {
        let formatter = ProPresenterFormatter::new();
        let lines = vec![
            "Amazing grace how sweet the sound".to_string(),
            "That saved a wretch like me".to_string(),
        ];
        let expected = "Amazing grace how sweet the sound\nThat saved a wretch like me";
        assert_eq!(formatter.format(&lines), expected);
    }

    #[test]
    fn test_format_four_lines_two_slides() {
        let formatter = ProPresenterFormatter::new();
        let lines = vec![
            "Line one".to_string(),
            "Line two".to_string(),
            "Line three".to_string(),
            "Line four".to_string(),
        ];
        let expected = "Line one\nLine two\n\nLine three\nLine four";
        assert_eq!(formatter.format(&lines), expected);
    }

    #[test]
    fn test_format_odd_number_of_lines() {
        let formatter = ProPresenterFormatter::new();
        let lines = vec![
            "Line one".to_string(),
            "Line two".to_string(),
            "Line three".to_string(),
        ];
        let expected = "Line one\nLine two\n\nLine three";
        assert_eq!(formatter.format(&lines), expected);
    }

    #[test]
    fn test_format_custom_lines_per_slide() {
        let formatter = ProPresenterFormatter::new().with_lines_per_slide(3);
        let lines = vec![
            "Line one".to_string(),
            "Line two".to_string(),
            "Line three".to_string(),
            "Line four".to_string(),
        ];
        let expected = "Line one\nLine two\nLine three\n\nLine four";
        assert_eq!(formatter.format(&lines), expected);
    }

    #[test]
    fn test_format_with_trailing_newline() {
        let formatter = ProPresenterFormatter::new();
        let lines = vec!["Line one".to_string(), "Line two".to_string()];
        let result = formatter.format_with_newline(&lines);
        assert!(result.ends_with('\n'));
    }

    #[test]
    fn test_split_into_slides() {
        let lines = vec![
            "A".to_string(),
            "B".to_string(),
            "C".to_string(),
            "D".to_string(),
            "E".to_string(),
        ];
        let slides = split_into_slides(&lines, 2);

        assert_eq!(slides.len(), 3);
        assert_eq!(slides[0].lines, vec!["A", "B"]);
        assert_eq!(slides[1].lines, vec!["C", "D"]);
        assert_eq!(slides[2].lines, vec!["E"]);
    }

    #[test]
    fn test_formatted_slide_to_string() {
        let slide = FormattedSlide::new(vec!["Line A".to_string(), "Line B".to_string()]);
        assert_eq!(slide.to_string(), "Line A\nLine B");
    }
}
