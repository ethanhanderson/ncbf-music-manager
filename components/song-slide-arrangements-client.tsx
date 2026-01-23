'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { SongSlideArrangementsProps } from '@/components/song-slide-arrangements'

const SongSlideArrangements = dynamic(
  () => import('@/components/song-slide-arrangements').then((mod) => ({ default: mod.SongSlideArrangements })),
  { ssr: false }
)

export function SongSlideArrangementsClient(props: SongSlideArrangementsProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return <SongSlideArrangements {...props} />
}
