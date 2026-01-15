'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getSongs } from '@/lib/actions/songs'
import { addSongToSet } from '@/lib/actions/sets'
import type { Song } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, CheckmarkCircle02Icon, Loading01Icon } from '@hugeicons/core-free-icons'

interface AddSongToSetProps {
  setId: string
  groupId: string
  groupSlug: string
  existingSongIds?: string[]
}

export function AddSongToSet({ setId, groupId, groupSlug, existingSongIds = [] }: AddSongToSetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [songs, setSongs] = useState<Song[]>([])
  const [selectedSongs, setSelectedSongs] = useState<Song[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [isPending, startTransition] = useTransition()

  const existingSongIdSet = useMemo(() => new Set(existingSongIds), [existingSongIds])

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      setSelectedSongs([])
      return
    }
    startTransition(async () => {
      const results = await getSongs(groupId)
      setSongs(results)
    })
  }, [groupId, isOpen])

  function handleSearch(value: string) {
    setSearch(value)
    startTransition(async () => {
      const results = await getSongs(groupId, value || undefined)
      setSongs(results)
    })
  }

  function handleToggleSong(song: Song) {
    if (existingSongIdSet.has(song.id)) return
    setSelectedSongs((prev) => {
      if (prev.some((item) => item.id === song.id)) {
        return prev.filter((item) => item.id !== song.id)
      }
      return [...prev, song]
    })
  }

  async function handleAddSelected() {
    if (selectedSongs.length === 0) return
    setIsAdding(true)
    await Promise.all(
      selectedSongs.map((song) => addSongToSet(setId, song.id, groupId, groupSlug))
    )
    setIsAdding(false)
    setSelectedSongs([])
    setSearch('')
    setIsOpen(false)
  }

  const selectedCountLabel =
    selectedSongs.length === 0
      ? 'Add songs'
      : `Add ${selectedSongs.length} song${selectedSongs.length === 1 ? '' : 's'}`

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button size="sm">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Add songs
          </Button>
        }
      />
      <PopoverContent className="w-[320px] p-0" align="end">
        <div className="border-b border-border/60 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{selectedSongs.length} selected</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setSelectedSongs([])}
              disabled={selectedSongs.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
        <Command>
          <CommandInput
            placeholder="Search songs..."
            value={search}
            onValueChange={handleSearch}
          />
          <CommandList className="max-h-72">
            {isPending ? (
              <div className="flex items-center justify-center py-8">
                <HugeiconsIcon icon={Loading01Icon} strokeWidth={2} className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : songs.length === 0 ? (
              <CommandEmpty>No songs found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {songs.map((song) => {
                  const isSelected = selectedSongs.some((item) => item.id === song.id)
                  const isInSet = existingSongIdSet.has(song.id)
                  return (
                    <CommandItem
                      key={song.id}
                      value={song.title}
                      onSelect={() => handleToggleSong(song)}
                      disabled={isInSet}
                      className="cursor-pointer transition-colors data-[selected=true]:bg-muted/70 hover:bg-muted/50 data-[disabled=true]:bg-muted/20"
                    >
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className={isInSet ? 'text-muted-foreground' : 'truncate'}>
                          {song.title}
                        </span>
                        {isInSet ? (
                          <Button type="button" size="xs" variant="secondary" disabled className="h-6 px-2 text-[11px]">
                            In set
                          </Button>
                        ) : isSelected ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            className="h-6 px-2 text-[11px]"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleToggleSong(song)
                            }}
                          >
                            Selected
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleToggleSong(song)
                            }}
                          >
                            Add
                          </Button>
                        )}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        <div className="border-t border-border/60 p-3">
          <Button
            type="button"
            className="w-full"
            onClick={handleAddSelected}
            disabled={selectedSongs.length === 0 || isAdding}
          >
            {isAdding ? 'Adding...' : selectedCountLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
