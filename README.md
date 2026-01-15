# NCBF Music Manager

A web app for church worship teams to plan services, manage songs, and export lyrics for ProPresenter.

## Features

- **Worship Groups**: Create and manage multiple worship teams
- **Song Library**: Songs are group-specific (each song belongs to one worship group)
- **Set Planning**: Build weekly setlists with song ordering and notes
- **File Upload**: Upload lyrics from TXT, RTF, DOCX, and PDF files
- **Text Extraction**: Automatic plain text extraction from uploaded files
- **ProPresenter Export**: Download sets as a ZIP of .txt files for ProPresenter import

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, shadcn/ui, Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Deployment**: Vercel

## Setup

### 1. Environment Variables

Create a `.env.local` file in this directory with:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://mpvvlpnrxsgwwrukmyar.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<your-publishable-key>
```

Get the publishable key from:
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select the `ncbf-music-manager` project
3. Click the "Connect" button or go to Settings > API
4. Copy the publishable key (format: `sb_publishable_...`)

**Note**: This app uses Row Level Security (RLS) policies that allow public access, so the publishable key is sufficient for all operations. No service role key is needed.

### 2. Install Dependencies

```bash
bun install
```

### 3. Run Development Server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment on Vercel

1. Push this repository to GitHub
2. Import the project on [Vercel](https://vercel.com)
3. Set the root directory to `app`
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
5. Deploy

## Project Structure

```
app/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── sets/          # ProPresenter export
│   │   └── song-assets/   # File upload & extraction
│   ├── groups/            # Group pages
│   │   └── [slug]/        # Group detail & sets
│   └── songs/             # Song library
├── components/            # React components
│   └── ui/                # shadcn/ui components
└── lib/
    ├── actions/           # Server actions
    ├── extractors/        # File text extraction
    └── supabase/          # Database client
```

## Database Schema

- `music_groups`: Worship teams/bands
- `songs`: Global song library
- `song_arrangements`: Group-specific arrangements
- `song_assets`: Uploaded files with extracted text
- `sets`: Weekly service setlists
- `set_songs`: Songs in a set with ordering

## Supported File Formats

For lyrics upload:
- `.txt` - Plain text
- `.rtf` - Rich Text Format
- `.docx` - Microsoft Word (modern)
- `.pdf` - PDF documents

Note: Legacy `.doc` and PowerPoint files are not currently supported.

## Usage

### Creating a Set

1. Go to a worship group page
2. Click "New Set"
3. Select the service date
4. Add songs from the library
5. Reorder and add notes as needed

### Uploading Lyrics

1. Go to the song library
2. Create or select a song
3. Upload a file with lyrics
4. Text is automatically extracted
5. Edit extracted text if needed

### Exporting for ProPresenter

1. Open a set
2. Click "Download for ProPresenter"
3. A ZIP file downloads with:
   - `_README.txt` - Set info and song list
   - `01 - Song Name.txt` - Lyrics for each song
