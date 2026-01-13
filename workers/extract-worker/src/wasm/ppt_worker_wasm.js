// Placeholder for the WASM module
// This file will be replaced when running `bun run build`
// which invokes wasm-pack to compile the Rust code

let wasmModule = null

export default async function init() {
  if (wasmModule) return wasmModule
  
  // In production, this is replaced with actual WASM loading
  throw new Error(
    'WASM module not built. Run `bun run build` in workers/extract-worker to compile the Rust extraction code.'
  )
}

export function extract_presentation(data, filename) {
  throw new Error('WASM module not initialized. Call init() first.')
}

export function format_for_propresenter(lines, lines_per_slide, title) {
  throw new Error('WASM module not initialized. Call init() first.')
}
