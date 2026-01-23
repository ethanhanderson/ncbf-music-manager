'use server'

import { revalidatePath } from 'next/cache'
import { cache } from 'react'
import { createServerSupabaseClient, type MusicGroup } from '@/lib/supabase/server'

export type MusicGroupWithCounts = MusicGroup & {
  setCount: number
  songCount: number
}

export const getGroups = cache(async (): Promise<MusicGroup[]> => {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('music_groups')
    .select('*')
    .order('name')
  
  if (error) {
    console.error('Error fetching groups:', error)
    return []
  }
  
  return data || []
})

export const getGroupsWithCounts = cache(async (): Promise<MusicGroupWithCounts[]> => {
  const supabase = createServerSupabaseClient()
  const { data: groups, error } = await supabase
    .from('music_groups')
    .select('*')
    .order('name')

  if (error || !groups) {
    console.error('Error fetching groups:', error)
    return []
  }

  if (groups.length === 0) {
    return []
  }

  const groupIds = groups.map((group) => group.id)

  const [{ data: sets }, { data: songs }] = await Promise.all([
    supabase.from('sets').select('group_id').in('group_id', groupIds),
    supabase.from('songs').select('group_id').in('group_id', groupIds),
  ])

  const setCounts = new Map<string, number>()
  for (const set of sets || []) {
    if (!set.group_id) continue
    setCounts.set(set.group_id, (setCounts.get(set.group_id) ?? 0) + 1)
  }

  const songCounts = new Map<string, number>()
  for (const song of songs || []) {
    if (!song.group_id) continue
    songCounts.set(song.group_id, (songCounts.get(song.group_id) ?? 0) + 1)
  }

  return groups.map((group) => ({
    ...group,
    setCount: setCounts.get(group.id) ?? 0,
    songCount: songCounts.get(group.id) ?? 0,
  }))
})

export const getGroupBySlug = cache(async (slug: string): Promise<MusicGroup | null> => {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('music_groups')
    .select('*')
    .eq('slug', slug)
    .single()
  
  if (error) {
    return null
  }
  
  return data
})

export async function createGroup(formData: FormData): Promise<{ success: boolean; error?: string; group?: MusicGroup }> {
  const name = formData.get('name') as string
  
  if (!name?.trim()) {
    return { success: false, error: 'Name is required' }
  }
  
  // Generate slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('music_groups')
    .insert({ name: name.trim(), slug })
    .select()
    .single()
  
  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A group with this name already exists' }
    }
    return { success: false, error: 'Failed to create group' }
  }
  
  revalidatePath('/')
  return { success: true, group: data }
}

export async function updateGroup(id: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const name = formData.get('name') as string
  
  if (!name?.trim()) {
    return { success: false, error: 'Name is required' }
  }
  
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('music_groups')
    .update({ name: name.trim() })
    .eq('id', id)
  
  if (error) {
    return { success: false, error: 'Failed to update group' }
  }
  
  revalidatePath('/')
  return { success: true }
}

export async function deleteGroup(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('music_groups')
    .delete()
    .eq('id', id)
  
  if (error) {
    return { success: false, error: 'Failed to delete group' }
  }
  
  revalidatePath('/')
  return { success: true }
}
