//! CLI tool for extracting text from PowerPoint files.

use anyhow::{Context, Result};
use clap::Parser;
use ppt_core::{PresentationFormat, ProPresenterFormatter, TextNormalizer};
use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};

/// Extract text from PowerPoint files for ProPresenter import.
#[derive(Parser, Debug)]
#[command(name = "ppt-extract")]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Input PowerPoint file(s) (.ppt or .pptx)
    #[arg(required = true)]
    input: Vec<PathBuf>,

    /// Output directory (default: same as input file)
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Print output to stdout instead of writing to file
    #[arg(short, long)]
    print: bool,

    /// Number of lines per slide (default: 2)
    #[arg(short = 'l', long, default_value = "2")]
    lines_per_slide: usize,

    /// Include speaker notes in output
    #[arg(short, long)]
    notes: bool,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize logging
    if args.verbose {
        env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("debug")).init();
    } else {
        env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();
    }

    let normalizer = TextNormalizer::new();
    let formatter = ProPresenterFormatter::new().with_lines_per_slide(args.lines_per_slide);

    for input_path in &args.input {
        if args.verbose {
            eprintln!("Processing: {}", input_path.display());
        }

        match process_file(input_path, &args, &normalizer, &formatter) {
            Ok(output) => {
                if args.print {
                    print!("{}", output);
                } else {
                    let output_path = get_output_path(input_path, args.output.as_ref())?;
                    write_output(&output_path, &output)?;
                    if args.verbose {
                        eprintln!("Written to: {}", output_path.display());
                    }
                }
            }
            Err(e) => {
                eprintln!("Error processing {}: {}", input_path.display(), e);
            }
        }
    }

    Ok(())
}

/// Process a single PowerPoint file.
fn process_file(
    input_path: &Path,
    args: &Args,
    normalizer: &TextNormalizer,
    formatter: &ProPresenterFormatter,
) -> Result<String> {
    // Read file and detect format
    let file = File::open(input_path)
        .with_context(|| format!("Failed to open {}", input_path.display()))?;
    let mut reader = BufReader::new(file);

    // Read magic bytes to detect format
    let mut magic = [0u8; 8];
    reader
        .read_exact(&mut magic)
        .with_context(|| "Failed to read file header")?;

    // Re-open file for parsing (readers are not seekable after initial read in some cases)
    let file = File::open(input_path)?;
    let reader = BufReader::new(file);

    let format = PresentationFormat::from_magic(&magic)
        .or_else(|| {
            input_path
                .extension()
                .and_then(|e| e.to_str())
                .and_then(PresentationFormat::from_extension)
        })
        .ok_or_else(|| anyhow::anyhow!("Could not detect file format"))?;

    let filename = input_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    let presentation = match format {
        PresentationFormat::Pptx => {
            log::debug!("Parsing as PPTX");
            let parser = ppt_pptx::PptxParser::new();
            parser
                .parse(reader, filename)
                .map_err(|e| anyhow::anyhow!("{}", e))?
        }
        PresentationFormat::Ppt => {
            log::debug!("Parsing as legacy PPT");
            let parser = ppt_ppt::PptParser::new();
            parser
                .parse(reader, filename)
                .map_err(|e| anyhow::anyhow!("{}", e))?
        }
    };

    if args.verbose {
        eprintln!(
            "  Found {} slides",
            presentation.slides.len()
        );
    }

    // Normalize and format
    let lines = normalizer.normalize_presentation(&presentation.slides);

    if args.verbose {
        eprintln!("  Extracted {} lines", lines.len());
    }

    let output = formatter.format_with_newline(&lines);

    Ok(output)
}

/// Determine the output path for a processed file.
fn get_output_path(input_path: &Path, output_dir: Option<&PathBuf>) -> Result<PathBuf> {
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");

    let output_filename = format!("{}.txt", stem);

    let output_path = match output_dir {
        Some(dir) => {
            std::fs::create_dir_all(dir)
                .with_context(|| format!("Failed to create output directory: {}", dir.display()))?;
            dir.join(output_filename)
        }
        None => {
            if let Some(parent) = input_path.parent() {
                parent.join(output_filename)
            } else {
                PathBuf::from(output_filename)
            }
        }
    };

    Ok(output_path)
}

/// Write output to a file.
fn write_output(path: &Path, content: &str) -> Result<()> {
    let mut file =
        File::create(path).with_context(|| format!("Failed to create {}", path.display()))?;

    file.write_all(content.as_bytes())
        .with_context(|| format!("Failed to write to {}", path.display()))?;

    Ok(())
}
