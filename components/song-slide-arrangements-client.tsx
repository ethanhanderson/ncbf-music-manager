'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

const SongSlideArrangements = dynamic(
  () => import('@/components/song-slide-arrangements').then((mod) => ({ default: mod.SongSlideArrangements })),
  { ssr: false }
)

type SongSlideArrangementsProps =
  ComponentProps<typeof import('@/components/song-slide-arrangements').SongSlideArrangements>

export function SongSlideArrangementsClient(props: SongSlideArrangementsProps) {
  return <SongSlideArrangements {...props} />
}
