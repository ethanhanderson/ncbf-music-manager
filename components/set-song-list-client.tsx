'use client'

import { useEffect, useState, type ComponentType } from 'react'
import type { SetSongListProps } from '@/components/set-song-list'

export function SetSongListClient(props: SetSongListProps) {
  const [Component, setComponent] = useState<ComponentType<SetSongListProps> | null>(null)

  useEffect(() => {
    let isMounted = true
    void import('@/components/set-song-list').then((mod) => {
      if (isMounted) {
        setComponent(() => mod.SetSongList)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  if (!Component) {
    return null
  }

  return <Component {...props} />
}
