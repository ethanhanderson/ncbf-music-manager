'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { SetSongListProps } from '@/components/set-song-list'

const SetSongList = dynamic(
  () => import('@/components/set-song-list').then((mod) => ({ default: mod.SetSongList })),
  { ssr: false }
)

export function SetSongListClient(props: SetSongListProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return <SetSongList {...props} />
}
