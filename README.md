# NCBF Music Manager

A web application for extracting text from PowerPoint presentations and formatting them for ProPresenter import. Built with Next.js 16, Supabase, and Cloudflare Workers.

## Overview

This application allows worship teams to:
1. Upload `.ppt` or `.pptx` worship song slides
2. Automatically extract and clean the lyric text
3. Download formatted output ready for ProPresenter import

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User's Browser                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Next.js App (Vercel)                                              │  │
│  │  - Upload UI                                                       │  │
│  │  - Dashboard                                                       │  │
│  │  - Real-time progress updates                                      │  │
│  │  - Download/copy results                                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                       │
         │ Auth               │ Upload                │ Subscribe
         ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Supabase                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐│
│  │    Auth     │  │   Storage   │  │  PostgreSQL │  │    Realtime     ││
│  │  (OAuth)    │  │   (Files)   │  │   (Data)    │  │   (Updates)     ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘│
│                                           │                             │
│                                    ┌──────┴──────┐                      │
│                                    │   Queues    │                      │
│                                    │   (pgmq)    │                      │
│                                    └──────┬──────┘                      │
└───────────────────────────────────────────┼─────────────────────────────┘
                                            │
                                            │ Dequeue
                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Cloudflare Worker (Cron)                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  WASM Extraction Module (Rust)                                     │  │
│  │  - PPT/PPTX parsing                                                │  │
│  │  - Text normalization                                              │  │
│  │  - ProPresenter formatting                                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
ncbf-music-manager/
├── app/                    # Next.js 16 web application
│   ├── app/               # App Router pages
│   │   ├── (app)/         # Protected routes
│   │   │   ├── dashboard/ # Main dashboard
│   │   │   ├── upload/    # File upload
│   │   │   └── documents/ # Document details
│   │   ├── login/         # Authentication
│   │   └── auth/          # Auth callbacks
│   ├── components/        # React components
│   └── lib/               # Utilities & Supabase clients
│
├── crates/                 # Rust crates
│   ├── core/              # Domain types & text processing
│   ├── pptx/              # PPTX parser (Office Open XML)
│   ├── ppt/               # PPT parser (OLE/CFB)
│   ├── cli/               # CLI tool
│   ├── desktop/           # Tauri desktop app
│   └── worker-wasm/       # WASM module for Cloudflare
│
└── workers/
    └── extract-worker/    # Cloudflare Worker
```

## Setup

### Prerequisites

- [bun](https://bun.sh/) - JavaScript runtime & package manager
- [Rust](https://rustup.rs/) - For building the extraction engine
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) - For building WASM
- [Supabase account](https://supabase.com/) - Backend services
- [Cloudflare account](https://cloudflare.com/) - Worker hosting

### 1. Clone and Install

```bash
git clone <repo-url>
cd ncbf-music-manager

# Install Next.js dependencies
cd app
bun install
```

### 2. Configure Environment

Copy the example environment file:
```bash
cp .env.example .env.local
```

Fill in your Supabase credentials:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-only)

### 3. Database Setup

The Supabase project has already been configured with:
- `documents` table - Uploaded file metadata
- `extraction_jobs` table - Processing status & results
- `presentations` storage bucket - File storage
- Row Level Security policies
- Queue functions for job processing
- Realtime subscriptions

### 4. Run the Development Server

```bash
cd app
bun dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy the Worker (Production)

```bash
cd workers/extract-worker
bun install

# Build WASM module
bun run build

# Set secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Deploy
bun run deploy
```

## Features

### For Users

- **Upload**: Drag & drop or click to upload PPT/PPTX files (up to 50MB)
- **Processing**: Automatic text extraction with real-time progress
- **Output**: ProPresenter-ready text with configurable lines per slide
- **Copy/Download**: Easy export of formatted lyrics

### Technical

- **Authentication**: Email/password and OAuth (Google, GitHub)
- **Row Level Security**: Users can only access their own documents
- **Real-time Updates**: Live progress via Supabase Realtime
- **Background Processing**: Async extraction via job queue
- **WASM Extraction**: Rust extraction engine compiled to WebAssembly

## Development

### Running the CLI

For local testing without the web interface:

```bash
cargo run --bin ppt-extract -- --help
cargo run --bin ppt-extract -- "path/to/file.pptx" --print
```

### Building WASM

```bash
cd crates/worker-wasm
wasm-pack build --target web
```

### Running Tests

```bash
# Rust tests
cargo test

# Next.js lint
cd app && bun run lint
```

## License

MIT
