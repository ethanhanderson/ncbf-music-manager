import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// Server-side Supabase client
// Since we have RLS policies that allow public access to the anon role,
// we can use the publishable key for all operations (no service_role needed)
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY environment variables')
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Database types for our tables
export type MusicGroup = Database['public']['Tables']['music_groups']['Row']
export type Song = Database['public']['Tables']['songs']['Row']

export interface SongSlide {
  id: string
  label: 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'outro' | 'intro' | 'tag' | 'interlude' | 'title' | 'custom'
  customLabel?: string
  lines: string[]
}

export interface SongSlideGroupArrangementItem {
  id: string
  label: SongSlide['label']
  customLabel?: string
}

export type SongArrangement = Omit<
  Database['public']['Tables']['song_arrangements']['Row'],
  'slides' | 'group_arrangement' | 'master_group_arrangement'
> & {
  slides: SongSlide[] | null
  group_arrangement: SongSlideGroupArrangementItem[] | null
  master_group_arrangement: SongSlideGroupArrangementItem[] | null
}

export type SongAsset = Database['public']['Tables']['song_assets']['Row']

export type Set = Database['public']['Tables']['sets']['Row']

export type SetSong = Database['public']['Tables']['set_songs']['Row']

// Extended types for joins
export interface SetSongWithDetails extends SetSong {
  songs: Song
  song_arrangements: SongArrangement | null
}

export interface SetWithSongs extends Set {
  set_songs: SetSongWithDetails[]
  music_groups: MusicGroup
}
