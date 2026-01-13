//! Core domain types, text normalization, and ProPresenter formatting
//! for PowerPoint text extraction.

pub mod error;
pub mod normalize;
pub mod propresenter;
pub mod types;

pub use error::{Error, Result};
pub use normalize::TextNormalizer;
pub use propresenter::ProPresenterFormatter;
pub use types::{ExtractedSlide, Presentation, PresentationFormat, SlideText};
