'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

const SetSongList = dynamic(
  () => import('@/components/set-song-list').then((mod) => ({ default: mod.SetSongList })),
  { ssr: false }
)

type SetSongListProps = ComponentProps<typeof import('@/components/set-song-list').SetSongList>

export function SetSongListClient(props: SetSongListProps) {
  return <SetSongList {...props} />
}
