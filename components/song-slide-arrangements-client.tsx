'use client'

import { useEffect, useState, type ComponentType } from 'react'
import type { SongSlideArrangementsProps } from '@/components/song-slide-arrangements'

export function SongSlideArrangementsClient(props: SongSlideArrangementsProps) {
  const [Component, setComponent] = useState<ComponentType<SongSlideArrangementsProps> | null>(null)

  useEffect(() => {
    let isMounted = true
    void import('@/components/song-slide-arrangements').then((mod) => {
      if (isMounted) {
        setComponent(() => mod.SongSlideArrangements)
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
