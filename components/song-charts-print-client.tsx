"use client"

import { useMemo } from 'react'
import type { SongArrangement, SongSlide, SongSlideGroup, SongSlideGroupArrangementItem } from '@/lib/supabase/server'
import { SongChartsManager } from '@/components/song-charts-manager'

interface SongChartsPrintClientProps {
  songId: string
  groupId: string
  groupSlug: string
  songTitle: string
  songDefaultKey: string | null
  arrangements: SongArrangement[]
  selectedArrangementId: string | null
  slides: SongSlide[]
  slideGroups: SongSlideGroup[]
}

type SlideGroupDefinition = {
  key: string
  label: SongSlide['label']
  customLabel?: string
  slides: SongSlide[]
  firstIndex: number
}

function getGroupKey(label: SongSlide['label'], customLabel?: string, uniqueId?: string) {
  if (label === 'custom' && !customLabel) {
    return `${label}::${uniqueId ?? ''}`
  }
  return `${label}::${customLabel ?? ''}`
}

function parseGroupKey(key: string): { label: SongSlide['label']; customLabel?: string } {
  const [label, customLabel] = key.split('::')
  return {
    label: (label as SongSlide['label']) ?? 'verse',
    customLabel: customLabel ? customLabel : undefined,
  }
}

function buildSlideGroups(slides: SongSlide[]): SlideGroupDefinition[] {
  const map = new Map<string, SlideGroupDefinition>()
  const ordered: SlideGroupDefinition[] = []

  slides.forEach((slide, index) => {
    const key = getGroupKey(slide.label, slide.customLabel, slide.id)
    const existing = map.get(key)
    if (existing) {
      existing.slides.push(slide)
      return
    }
    const entry: SlideGroupDefinition = {
      key,
      label: slide.label,
      customLabel: slide.customLabel,
      slides: [slide],
      firstIndex: index,
    }
    map.set(key, entry)
    ordered.push(entry)
  })

  return ordered
}

export function SongChartsPrintClient({
  songId,
  groupId,
  groupSlug,
  songTitle,
  songDefaultKey,
  arrangements,
  selectedArrangementId,
  slides,
  slideGroups,
}: SongChartsPrintClientProps) {
  const groupDefinitions = useMemo(() => buildSlideGroups(slides), [slides])

  const slideGroupKeyById = useMemo(
    () =>
      new Map(
        slideGroups.map((group) => [
          group.id,
          getGroupKey(group.label, group.customLabel ?? undefined, group.id),
        ])
      ),
    [slideGroups]
  )

  const groupDefinitionMap = useMemo(
    () => new Map(groupDefinitions.map((group) => [group.key, group])),
    [groupDefinitions]
  )

  const defaultGroupKeys = useMemo(
    () => groupDefinitions.map((group) => group.key),
    [groupDefinitions]
  )

  const arrangementOrders = useMemo(() => {
    const next: Record<string, SongSlideGroupArrangementItem[]> = {}
    arrangements.forEach((arrangement) => {
      const arrangementKeys = (arrangement.group_order ?? [])
        .map((id: string) => slideGroupKeyById.get(id))
        .filter((value: string | undefined): value is string => Boolean(value))
      const baseKeys = arrangementKeys.length > 0 ? arrangementKeys : defaultGroupKeys
      const present = new Set(baseKeys)
      const orderedKeys = arrangement.is_locked
        ? defaultGroupKeys
        : [...baseKeys, ...defaultGroupKeys.filter((key) => !present.has(key))]

      next[arrangement.id] = orderedKeys.map((key, index) => {
        const group = groupDefinitionMap.get(key)
        const parsed = parseGroupKey(key)
        return {
          id: `arranged-${arrangement.id}-${index}`,
          key,
          label: group?.label ?? parsed.label,
          customLabel: group?.customLabel ?? parsed.customLabel,
        }
      })
    })
    return next
  }, [arrangements, defaultGroupKeys, groupDefinitionMap, slideGroupKeyById])

  return (
    <SongChartsManager
      songId={songId}
      groupId={groupId}
      groupSlug={groupSlug}
      songTitle={songTitle}
      songDefaultKey={songDefaultKey}
      arrangements={arrangements}
      selectedArrangementId={selectedArrangementId}
      slides={slides}
      groupDefinitions={groupDefinitions}
      arrangementOrders={arrangementOrders}
    />
  )
}
