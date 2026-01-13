# NCBF Extract Worker

Cloudflare Worker that processes PowerPoint extraction jobs from the Supabase queue.

## Prerequisites

- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) - for building Rust to WASM
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) - Cloudflare Workers CLI
- [bun](https://bun.sh/) - JavaScript runtime/package manager

## Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Build the WASM module:**
   ```bash
   bun run build
   ```
   This compiles the Rust extraction code to WebAssembly.

3. **Configure secrets:**
   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```

## Development

Run locally with:
```bash
bun run dev
```

This starts a local worker. You can test with:
- `GET /health` - Health check
- `POST /trigger` - Manually trigger job processing

## Deployment

Deploy to Cloudflare:
```bash
bun run deploy
```

## How It Works

1. **Cron Trigger**: Every minute, the worker wakes up
2. **Dequeue**: Fetches pending jobs from Supabase Queues (pgmq)
3. **Download**: Gets the PPT/PPTX file from Supabase Storage
4. **Extract**: Uses WASM module to extract text from slides
5. **Format**: Formats output for ProPresenter
6. **Update**: Writes results back to the database
7. **Acknowledge**: Removes the processed message from the queue

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for privileged operations |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name (default: `presentations`) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker                          │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  Cron    │───▶│  Dequeue     │───▶│  Process Jobs        │  │
│  │  Trigger │    │  Messages    │    │  (WASM extraction)   │  │
│  └──────────┘    └──────────────┘    └──────────────────────┘  │
│                         │                       │               │
└─────────────────────────┼───────────────────────┼───────────────┘
                          │                       │
                          ▼                       ▼
                  ┌───────────────────────────────────────┐
                  │              Supabase                 │
                  │  ┌─────────┐  ┌─────────┐  ┌───────┐ │
                  │  │ Queues  │  │ Storage │  │  DB   │ │
                  │  │ (pgmq)  │  │ (files) │  │(jobs) │ │
                  │  └─────────┘  └─────────┘  └───────┘ │
                  └───────────────────────────────────────┘
```
