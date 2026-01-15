'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { SongArrangement, SongSlide, SongSlideGroupArrangementItem } from '@/lib/supabase/server'
import {
  createSongArrangement,
  duplicateSongArrangement,
  renameSongArrangement,
  updateSongArrangementSlides,
  deleteSongArrangement,
} from '@/lib/actions/song-arrangements'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  MoreHorizontalIcon,
  Edit01Icon,
  Copy01Icon,
  Delete02Icon,
  ChevronUp,
  ChevronDown,
  PlayIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Loading01Icon,
  Layers01Icon,
  DragDropVerticalIcon,
} from '@hugeicons/core-free-icons'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'


const SLIDE_LABELS: { value: SongSlide['label']; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'verse', label: 'Verse' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'pre-chorus', label: 'Pre-Chorus' },
  { value: 'intro', label: 'Intro' },
  { value: 'outro', label: 'Outro' },
  { value: 'tag', label: 'Tag' },
  { value: 'interlude', label: 'Interlude' },
]

const GROUP_STYLE_CLASSES: Record<
  SongSlide['label'],
  { bg: string; text: string; border: string; dot: string }
> = {
  title: { bg: 'bg-slate-800', text: 'text-white', border: 'border-slate-800', dot: 'text-slate-600' },
  verse: { bg: 'bg-emerald-800', text: 'text-white', border: 'border-emerald-800', dot: 'text-emerald-600' },
  chorus: { bg: 'bg-blue-800', text: 'text-white', border: 'border-blue-800', dot: 'text-blue-600' },
  bridge: { bg: 'bg-purple-800', text: 'text-white', border: 'border-purple-800', dot: 'text-purple-600' },
  'pre-chorus': { bg: 'bg-teal-800', text: 'text-white', border: 'border-teal-800', dot: 'text-teal-600' },
  intro: { bg: 'bg-amber-800', text: 'text-white', border: 'border-amber-800', dot: 'text-amber-600' },
  outro: { bg: 'bg-orange-800', text: 'text-white', border: 'border-orange-800', dot: 'text-orange-600' },
  tag: { bg: 'bg-yellow-800', text: 'text-black', border: 'border-yellow-800', dot: 'text-yellow-600' },
  interlude: { bg: 'bg-indigo-800', text: 'text-white', border: 'border-indigo-800', dot: 'text-indigo-600' },
  custom: { bg: 'bg-muted', text: 'text-foreground', border: 'border-border', dot: 'text-muted-foreground' },
}

/**
 * Get incrementing shade for numbered verse/chorus groups
 * Returns shades from lighter (500) to darker (900) based on number
 */
function getNumberedGroupColor(
  label: 'verse' | 'chorus',
  number: string | undefined
): { bg: string; text: string; border: string; dot: string } {
  if (!number) {
    return GROUP_STYLE_CLASSES[label]
  }

  const num = parseInt(number, 10)
  if (isNaN(num) || num < 1 || num > 6) {
    return GROUP_STYLE_CLASSES[label]
  }

  // Map numbers 1-6 to color shades
  const verseShades: Record<number, { bg: string; text: string; border: string; dot: string }> = {
    1: { bg: 'bg-emerald-700', text: 'text-white', border: 'border-emerald-700', dot: 'text-emerald-600' },
    2: { bg: 'bg-emerald-800', text: 'text-white', border: 'border-emerald-800', dot: 'text-emerald-700' },
    3: { bg: 'bg-emerald-900', text: 'text-white', border: 'border-emerald-900', dot: 'text-emerald-800' },
    4: { bg: 'bg-emerald-950', text: 'text-white', border: 'border-emerald-950', dot: 'text-emerald-900' },
    5: { bg: 'bg-emerald-950', text: 'text-white', border: 'border-emerald-950', dot: 'text-emerald-900' },
    6: { bg: 'bg-emerald-950', text: 'text-white', border: 'border-emerald-950', dot: 'text-emerald-900' },
  }

  const chorusShades: Record<number, { bg: string; text: string; border: string; dot: string }> = {
    1: { bg: 'bg-blue-700', text: 'text-white', border: 'border-blue-700', dot: 'text-blue-600' },
    2: { bg: 'bg-blue-800', text: 'text-white', border: 'border-blue-800', dot: 'text-blue-700' },
    3: { bg: 'bg-blue-900', text: 'text-white', border: 'border-blue-900', dot: 'text-blue-800' },
    4: { bg: 'bg-blue-950', text: 'text-white', border: 'border-blue-950', dot: 'text-blue-900' },
    5: { bg: 'bg-blue-950', text: 'text-white', border: 'border-blue-950', dot: 'text-blue-900' },
    6: { bg: 'bg-blue-950', text: 'text-white', border: 'border-blue-950', dot: 'text-blue-900' },
  }

  if (label === 'verse') {
    return verseShades[num] ?? GROUP_STYLE_CLASSES[label]
  } else {
    return chorusShades[num] ?? GROUP_STYLE_CLASSES[label]
  }
}

const NUMBERED_GROUPS: Array<{ value: 'verse' | 'chorus'; label: string }> = [
  { value: 'verse', label: 'Verse' },
  { value: 'chorus', label: 'Chorus' },
]

const NUMBERED_OPTIONS = ['1', '2', '3', '4', '5', '6']

function getSlideLabelDisplay(slide: SongSlide): string {
  const baseLabel = SLIDE_LABELS.find((item) => item.value === slide.label)?.label ?? 'Verse'
  if ((slide.label === 'verse' || slide.label === 'chorus') && slide.customLabel) {
    return `${baseLabel} ${slide.customLabel}`
  }
  return baseLabel
}

function getGroupKey(label: SongSlide['label'], customLabel?: string) {
  return `${label}::${customLabel ?? ''}`
}

function getGroupLabelDisplay(label: SongSlide['label'], customLabel?: string) {
  const baseLabel = SLIDE_LABELS.find((item) => item.value === label)?.label ?? 'Custom'
  if ((label === 'verse' || label === 'chorus') && customLabel) {
    return `${baseLabel} ${customLabel}`
  }
  if (label === 'custom' && customLabel) {
    return customLabel
  }
  return baseLabel
}

function getGroupLabelStyle(label: SongSlide['label'], customLabel?: string) {
  if ((label === 'verse' || label === 'chorus') && customLabel) {
    return getNumberedGroupColor(label, customLabel)
  }
  return GROUP_STYLE_CLASSES[label] ?? {
    bg: 'bg-muted',
    text: 'text-foreground',
    border: 'border-border',
    dot: 'text-muted-foreground',
  }
}

function createGroupArrangementItem(
  label: SongSlide['label'],
  customLabel?: string
): SongSlideGroupArrangementItem {
  return {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    label,
    customLabel,
  }
}

function parseGroupArrangement(value: SongArrangement['group_arrangement']): SongSlideGroupArrangementItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is SongSlideGroupArrangementItem => {
      if (!item || typeof item !== 'object') return false
      const record = item as unknown as Record<string, unknown>
      return typeof record.id === 'string' && typeof record.label === 'string'
    })
    .map((item) => ({
      id: item.id,
      label: item.label,
      customLabel: item.customLabel,
    }))
}

function buildGroupArrangementFromSlides(slides: SongSlide[]): SongSlideGroupArrangementItem[] {
  const arrangement: SongSlideGroupArrangementItem[] = []
  const seen = new Set<string>()

  slides.forEach((slide) => {
    const key = getGroupKey(slide.label, slide.customLabel)
    if (!seen.has(key)) {
      seen.add(key)
      arrangement.push({
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        label: slide.label,
        customLabel: slide.customLabel,
      })
    }
  })

  return arrangement
}

function buildDefaultGroupArrangement(
  slides: SongSlide[],
  masterArrangement: SongSlideGroupArrangementItem[]
): SongSlideGroupArrangementItem[] {
  if (masterArrangement.length > 0) {
    return masterArrangement.map((item) => ({
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      label: item.label,
      customLabel: item.customLabel,
    }))
  }
  return buildGroupArrangementFromSlides(slides)
}

function normalizeGroupArrangement(
  arrangement: SongSlideGroupArrangementItem[],
  masterArrangement: SongSlideGroupArrangementItem[]
): SongSlideGroupArrangementItem[] {
  const masterKeys = masterArrangement.map((item) => getGroupKey(item.label, item.customLabel))
  const masterKeySet = new Set(masterKeys)
  const keysInArrangement = new Set<string>()

  const filtered = arrangement
    .filter((item) => {
      const key = getGroupKey(item.label, item.customLabel)
      if (!masterKeySet.has(key)) return false
      keysInArrangement.add(key)
      return true
    })
    .map((item) => ({
      id: item.id,
      label: item.label,
      customLabel: item.customLabel,
    }))

  masterArrangement.forEach((item) => {
    const key = getGroupKey(item.label, item.customLabel)
    if (!keysInArrangement.has(key)) {
      keysInArrangement.add(key)
      filtered.push({
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        label: item.label,
        customLabel: item.customLabel,
      })
    }
  })

  return filtered
}

interface SlideGroupDefinition {
  key: string
  label: SongSlide['label']
  customLabel?: string
  slides: SongSlide[]
  firstIndex: number
}

interface SongSlideArrangementsProps {
  songId: string
  groupId: string
  groupSlug: string
  arrangements: SongArrangement[]
}

export function SongSlideArrangements({
  songId,
  groupId,
  groupSlug,
  arrangements,
}: SongSlideArrangementsProps) {
  const router = useRouter()
  const [selectedArrangementId, setSelectedArrangementId] = useState<string | null>(
    arrangements[0]?.id ?? null
  )
  const [slides, setSlides] = useState<SongSlide[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0)
  const [isDraggingList, setIsDraggingList] = useState(false)
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([])
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [openGroupValues, setOpenGroupValues] = useState<string[]>([])
  const hasInitializedGroups = useRef(false)
  const [groupArrangement, setGroupArrangement] = useState<SongSlideGroupArrangementItem[]>([])
  const [activeTab, setActiveTab] = useState('slides')

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [dialogName, setDialogName] = useState('')
  const [dialogLoading, setDialogLoading] = useState(false)

  const selectedArrangement = arrangements.find(a => a.id === selectedArrangementId)

  // Load slides when arrangement changes
  useEffect(() => {
    if (selectedArrangement?.slides) {
      setSlides(selectedArrangement.slides)
    } else {
      setSlides([])
    }
    setHasChanges(false)
    setSelectedSlideIds([])
    setLastSelectedIndex(null)
  }, [selectedArrangement])

  useEffect(() => {
    setActiveTab('slides')
  }, [selectedArrangementId])

  useEffect(() => {
    if (!selectedArrangement) {
      setGroupArrangement([])
      return
    }
    const masterArrangement = parseGroupArrangement(selectedArrangement.master_group_arrangement)
    const existingArrangement = parseGroupArrangement(selectedArrangement.group_arrangement)
    const baseArrangement = buildDefaultGroupArrangement(selectedArrangement.slides ?? [], masterArrangement)
    const nextArrangement =
      existingArrangement.length > 0
        ? normalizeGroupArrangement(existingArrangement, baseArrangement)
        : baseArrangement
    setGroupArrangement(nextArrangement)
  }, [
    selectedArrangementId,
    selectedArrangement?.group_arrangement,
    selectedArrangement?.master_group_arrangement,
  ])


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedSlideIds([])
        setLastSelectedIndex(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-slide-item="true"]')) return
      if (target.closest('[data-slot="context-menu-content"]')) return
      setSelectedSlideIds([])
      setLastSelectedIndex(null)
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    return () => document.removeEventListener('mousedown', handlePointerDown, true)
  }, [])

  // Generate unique ID for new slides
  const generateSlideId = useCallback(() => {
    return `slide-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }, [])

  // Save changes
  const handleSave = async () => {
    if (!selectedArrangementId) return
    
    setIsSaving(true)
    const result = await updateSongArrangementSlides(
      selectedArrangementId,
      slides,
      groupSlug,
      songId,
      groupArrangement
    )
    
    if (result.success) {
      setHasChanges(false)
      router.refresh()
    }
    setIsSaving(false)
  }

  // Create new arrangement
  const handleCreateArrangement = async () => {
    if (!dialogName.trim()) return

    setDialogLoading(true)
    const result = await createSongArrangement(
      songId,
      groupId,
      groupSlug,
      dialogName.trim(),
      []
    )

    if (result.success && result.arrangement) {
      setSelectedArrangementId(result.arrangement.id)
      router.refresh()
    }

    setDialogLoading(false)
    setShowCreateDialog(false)
    setDialogName('')
  }

  // Duplicate arrangement
  const handleDuplicateArrangement = async () => {
    if (!selectedArrangementId || !dialogName.trim()) return

    setDialogLoading(true)
    const result = await duplicateSongArrangement(
      selectedArrangementId,
      dialogName.trim(),
      groupSlug
    )

    if (result.success && result.arrangement) {
      setSelectedArrangementId(result.arrangement.id)
      router.refresh()
    }

    setDialogLoading(false)
    setShowDuplicateDialog(false)
    setDialogName('')
  }

  // Rename arrangement
  const handleRenameArrangement = async () => {
    if (!selectedArrangementId || !dialogName.trim()) return

    setDialogLoading(true)
    await renameSongArrangement(selectedArrangementId, dialogName.trim(), groupSlug, songId)
    
    setDialogLoading(false)
    setShowRenameDialog(false)
    setDialogName('')
    router.refresh()
  }

  // Delete arrangement
  const handleDeleteArrangement = async () => {
    if (!selectedArrangementId) return

    setDialogLoading(true)
    await deleteSongArrangement(selectedArrangementId, groupSlug, songId)

    const remainingArrangements = arrangements.filter(a => a.id !== selectedArrangementId)
    setSelectedArrangementId(remainingArrangements[0]?.id ?? null)
    
    setDialogLoading(false)
    setShowDeleteDialog(false)
    router.refresh()
  }

  // Slide operations
  const updateSlide = (index: number, updates: Partial<SongSlide>) => {
    setSlides(prev => {
      const newSlides = [...prev]
      newSlides[index] = { ...newSlides[index], ...updates }
      return newSlides
    })
    setHasChanges(true)
  }

  const applyGroupToSelection = (label: SongSlide['label'], customLabel?: string) => {
    const selectedSet = new Set(selectedSlideIds)
    if (selectedSet.size === 0) {
      return
    }
    setSlides(prev =>
      prev.map((slide) =>
        selectedSet.has(slide.id)
          ? { ...slide, label, customLabel: customLabel ?? undefined }
          : slide
      )
    )
    setHasChanges(true)
  }

  const selectSlideRange = (startIndex: number, endIndex: number) => {
    const [start, end] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
    const ids = slides.slice(start, end + 1).map((slide) => slide.id)
    setSelectedSlideIds(ids)
  }

  const handleSlideSelect = (
    event: React.MouseEvent<HTMLDivElement>,
    index: number,
    slideId: string
  ) => {
    if (event.button !== 0) return
    if (!event.shiftKey) return
    if (lastSelectedIndex !== null) {
      selectSlideRange(lastSelectedIndex, index)
      return
    }
    setSelectedSlideIds([slideId])
    setLastSelectedIndex(index)
  }

  const handleContextMenuSelect = (
    event: React.MouseEvent<HTMLDivElement>,
    index: number,
    slideId: string
  ) => {
    if (!event.shiftKey) return
    if (!selectedSlideIds.includes(slideId)) {
      setSelectedSlideIds([slideId])
      setLastSelectedIndex(index)
    }
  }

  const deleteSlide = (index: number) => {
    setSlides(prev => prev.filter((_, i) => i !== index))
    setHasChanges(true)
  }

  const addSlide = () => {
    setSlides(prev => [
      ...prev,
      {
        id: generateSlideId(),
        label: 'verse',
        lines: [''],
      },
    ])
    setHasChanges(true)
  }

  const addSlideAfter = (index: number) => {
    const newId = generateSlideId()
    setSlides(prev => {
      const next = [...prev]
      next.splice(index + 1, 0, {
        id: newId,
        label: 'verse',
        lines: [''],
      })
      return next
    })
    setHasChanges(true)
    setPendingFocusId(newId)
  }

  useEffect(() => {
    if (!pendingFocusId) return
    const node = textareaRefs.current.get(pendingFocusId)
    if (node) {
      node.focus()
      setPendingFocusId(null)
    }
  }, [pendingFocusId, slides])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const focusAdjacentSlide = useCallback(
    (direction: 'up' | 'down', slideId: string, column: number) => {
      const currentIndex = slides.findIndex((slide) => slide.id === slideId)
      if (currentIndex === -1) return
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      const nextSlide = slides[nextIndex]
      if (!nextSlide) return
      const node = textareaRefs.current.get(nextSlide.id)
      if (!node) return

      const value = node.value ?? ''
      const lineBreaks = value.split('\n')
      const targetLineIndex = direction === 'up' ? Math.max(lineBreaks.length - 1, 0) : 0
      const targetLineStart = lineBreaks.slice(0, targetLineIndex).join('\n').length + (targetLineIndex > 0 ? 1 : 0)
      const targetLineLength = lineBreaks[targetLineIndex]?.length ?? 0
      const targetOffset = targetLineStart + Math.min(column, targetLineLength)

      node.focus()
      node.setSelectionRange(targetOffset, targetOffset)
    },
    [slides]
  )

  const groupDefinitions = useMemo<SlideGroupDefinition[]>(() => {
    const map = new Map<string, SlideGroupDefinition>()
    const ordered: SlideGroupDefinition[] = []

    slides.forEach((slide, index) => {
      const key = getGroupKey(slide.label, slide.customLabel)
      const existing = map.get(key)
      if (existing) {
        existing.slides.push(slide)
      } else {
        const entry: SlideGroupDefinition = {
          key,
          label: slide.label,
          customLabel: slide.customLabel,
          slides: [slide],
          firstIndex: index,
        }
        map.set(key, entry)
        ordered.push(entry)
      }
    })

    return ordered
  }, [slides])

  const groupDefinitionMap = useMemo(
    () => new Map(groupDefinitions.map((group) => [group.key, group])),
    [groupDefinitions]
  )

  const groupDefinitionKeys = useMemo(
    () => new Set(groupDefinitions.map((group) => group.key)),
    [groupDefinitions]
  )

  useEffect(() => {
    setGroupArrangement((prev) => {
      if (prev.length === 0) {
        return prev
      }
      const masterArrangement = buildGroupArrangementFromSlides(slides)
      const next = normalizeGroupArrangement(prev, masterArrangement)
      if (
        next.length !== prev.length ||
        next.some((item, index) => item.id !== prev[index]?.id)
      ) {
        setHasChanges(true)
      }
      return next
    })
  }, [groupDefinitionKeys, slides])

  const presentationSlides = useMemo(() => {
    if (groupArrangement.length === 0) {
      return slides
    }
    const ordered: SongSlide[] = []
    groupArrangement.forEach((item) => {
      const group = groupDefinitionMap.get(getGroupKey(item.label, item.customLabel))
      if (group) {
        ordered.push(...group.slides)
      }
    })
    return ordered.length > 0 ? ordered : slides
  }, [groupArrangement, groupDefinitionMap, slides])

  const groupedSlides = useMemo(() => {
    const groups: Array<{
      key: string
      label: string
      colorClass: { bg: string; text: string; border: string; dot: string }
      startIndex: number
      items: Array<{ slide: SongSlide; index: number }>
    }> = []

    slides.forEach((item, index) => {
      const groupLabel = getSlideLabelDisplay(item)
      const groupKey = `${item.label}-${item.customLabel ?? ''}`
      
      // Use incrementing shades for numbered verse/chorus groups
      let groupColor: { bg: string; text: string; border: string; dot: string }
      if ((item.label === 'verse' || item.label === 'chorus') && item.customLabel) {
        groupColor = getNumberedGroupColor(item.label, item.customLabel)
      } else {
        groupColor = GROUP_STYLE_CLASSES[item.label] ?? {
          bg: 'bg-muted',
          text: 'text-foreground',
          border: 'border-border',
          dot: 'text-muted-foreground',
        }
      }
      
      const lastGroup = groups[groups.length - 1]

      if (lastGroup && lastGroup.key === groupKey) {
        lastGroup.items.push({ slide: item, index })
      } else {
        groups.push({
          key: groupKey,
          label: groupLabel,
          colorClass: groupColor,
          startIndex: index,
          items: [{ slide: item, index }],
        })
      }
    })

    return groups
  }, [slides])

  useEffect(() => {
    const nextValues = groupedSlides.map((group) => `${group.key}-${group.startIndex}`)
    setOpenGroupValues((prev) => {
      if (!hasInitializedGroups.current) {
        hasInitializedGroups.current = true
        return nextValues
      }
      if (prev.length === 0) {
        return nextValues
      }
      const nextSet = new Set(nextValues)
      const merged = prev.filter((value) => nextSet.has(value))
      nextValues.forEach((value) => {
        if (!merged.includes(value)) {
          merged.push(value)
        }
      })
      return merged
    })
  }, [groupedSlides])

  const handleSlideDragEnd = (event: DragEndEvent) => {
    setIsDraggingList(false)
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    setSlides((prev) => {
      const oldIndex = prev.findIndex((slide) => slide.id === active.id)
      const newIndex = prev.findIndex((slide) => slide.id === over.id)
      if (oldIndex === -1 || newIndex === -1) {
        return prev
      }
      setHasChanges(true)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeType = active.data.current?.type as 'group' | 'arranged' | undefined
    const overAccepts = (over.data.current?.accepts as string[] | undefined) ?? []
    const isOverArrangedItem = groupArrangement.some((item) => item.id === over.id)
    const isOverArrangedDropzone = over.id === 'arranged-dropzone'
    const isOverArrangedTarget = isOverArrangedItem || isOverArrangedDropzone
    const effectiveAccepts =
      overAccepts.length > 0 ? overAccepts : isOverArrangedTarget ? ['group', 'arranged'] : []
    if (!activeType || !effectiveAccepts.includes(activeType)) {
      return
    }
    const rawOverRole = (over.data.current?.role as 'arranged' | 'available' | 'arranged-item' | undefined) ?? (
      isOverArrangedTarget ? 'arranged' : undefined
    )
    const overRole = rawOverRole === 'arranged-item' ? 'arranged' : rawOverRole

    if (overRole === 'available' && activeType === 'arranged') {
      setGroupArrangement((prev) => prev.filter((entry) => entry.id !== active.id))
      setHasChanges(true)
      return
    }

    if (overRole === 'arranged' && activeType === 'group') {
      const payload = active.data.current as { type: 'group'; label: SongSlide['label']; customLabel?: string }
      setGroupArrangement((prev) => {
        const nextItem = createGroupArrangementItem(payload.label, payload.customLabel)
        const overIndex = prev.findIndex((item) => item.id === over.id)
        if (over.id === 'arranged-dropzone' || overIndex === -1) {
          return [...prev, nextItem]
        }
        const next = [...prev]
        next.splice(overIndex, 0, nextItem)
        return next
      })
      setHasChanges(true)
      return
    }

    if (overRole === 'arranged' && activeType === 'arranged') {
      if (active.id === over.id) return
      setGroupArrangement((prev) => {
        const oldIndex = prev.findIndex((item) => item.id === active.id)
        if (oldIndex === -1) return prev
        if (over.id === 'arranged-dropzone') {
          if (oldIndex === prev.length - 1) return prev
          const next = [...prev]
          const [moved] = next.splice(oldIndex, 1)
          next.push(moved)
          return next
        }
        const newIndex = prev.findIndex((item) => item.id === over.id)
        if (newIndex === -1) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
      setHasChanges(true)
    }
  }

  // Preview mode navigation
  const nextPreviewSlide = () => {
    if (previewSlideIndex < presentationSlides.length - 1) {
      setPreviewSlideIndex(prev => prev + 1)
    }
  }

  const prevPreviewSlide = () => {
    if (previewSlideIndex > 0) {
      setPreviewSlideIndex(prev => prev - 1)
    }
  }

  useEffect(() => {
    if (previewSlideIndex >= presentationSlides.length) {
      setPreviewSlideIndex(0)
    }
  }, [presentationSlides.length, previewSlideIndex])

  // Preview mode component
  if (isPreviewMode && presentationSlides.length > 0) {
    const currentSlide = presentationSlides[previewSlideIndex]
    const labelDisplay = currentSlide.label === 'custom' && currentSlide.customLabel
      ? currentSlide.customLabel
      : SLIDE_LABELS.find(l => l.value === currentSlide.label)?.label || 'Verse'

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-black/80 border-b border-white/10">
          <div className="text-white/60 text-sm">
            {selectedArrangement?.name} - Slide {previewSlideIndex + 1} of {presentationSlides.length}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10"
            onClick={() => {
              setIsPreviewMode(false)
              setPreviewSlideIndex(0)
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Exit Preview
          </Button>
        </div>

        {/* Slide Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <Badge variant="secondary" className="mb-6 text-lg px-4 py-1 rounded-none">
            {labelDisplay}
          </Badge>
          <div className="text-white text-center space-y-4 max-w-4xl">
            {currentSlide.lines.map((line, i) => (
              <p key={i} className="text-4xl lg:text-5xl font-medium leading-relaxed">
                {line || '\u00A0'}
              </p>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-center gap-4 px-6 py-4 bg-black/80 border-t border-white/10">
          <Button
            variant="ghost"
            size="lg"
            className="text-white hover:bg-white/10"
            onClick={prevPreviewSlide}
            disabled={previewSlideIndex === 0}
          >
            <HugeiconsIcon icon={ChevronUp} strokeWidth={2} className="mr-2 h-5 w-5 -rotate-90" />
            Previous
          </Button>
          <div className="text-white/60 px-4">
            {previewSlideIndex + 1} / {presentationSlides.length}
          </div>
          <Button
            variant="ghost"
            size="lg"
            className="text-white hover:bg-white/10"
            onClick={nextPreviewSlide}
            disabled={previewSlideIndex === presentationSlides.length - 1}
          >
            Next
            <HugeiconsIcon icon={ChevronDown} strokeWidth={2} className="ml-2 h-5 w-5 -rotate-90" />
          </Button>
        </div>

        {/* Slide thumbnails */}
        <div className="flex items-center gap-2 px-6 py-3 bg-black/90 overflow-x-auto">
          {presentationSlides.map((slide, i) => (
            <button
              key={slide.id}
              onClick={() => setPreviewSlideIndex(i)}
              className={`shrink-0 w-20 h-14 rounded border text-xs p-1 transition-colors ${
                i === previewSlideIndex
                  ? 'border-white bg-white/20 text-white'
                  : 'border-white/20 bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              <div className="truncate font-medium">
                {slide.label === 'custom' ? slide.customLabel : slide.label}
              </div>
              <div className="truncate opacity-60">{slide.lines[0]}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // No arrangement selected state
  if (!selectedArrangement && arrangements.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground mb-4">
            Upload a lyrics file to generate slides, or create an empty arrangement to start from scratch.
          </p>
          <Button
            onClick={() => {
              setDialogName('Default')
              setShowCreateDialog(true)
            }}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Create Arrangement
          </Button>
        </CardContent>
      </Card>
    )
  }

  const arrangementPicker = (
    <div className="flex items-center gap-2">
      <Select
        value={selectedArrangementId ?? ''}
        onValueChange={setSelectedArrangementId}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue>{selectedArrangement?.name ?? 'Select arrangement'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {arrangements.map(arr => (
            <SelectItem key={arr.id} value={arr.id}>
              {arr.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(selectedArrangement || arrangements.length > 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Arrangement</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setDialogName('')
                  setShowCreateDialog(true)
                }}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                New Arrangement
              </DropdownMenuItem>
              {selectedArrangement && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setDialogName(selectedArrangement.name)
                      setShowRenameDialog(true)
                    }}
                  >
                    <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setDialogName(`${selectedArrangement.name} (Copy)`)
                      setShowDuplicateDialog(true)
                    }}
                  >
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )

  const actionButtons = (
    <div className="flex items-center gap-2">
      {presentationSlides.length > 0 && (
        <Button
          variant="outline"
          onClick={() => {
            setPreviewSlideIndex(0)
            setIsPreviewMode(true)
          }}
        >
          <HugeiconsIcon icon={PlayIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
          Preview
        </Button>
      )}

      {hasChanges && (
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <HugeiconsIcon icon={Loading01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {selectedArrangement && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="slides" className="gap-2 px-4 py-2 text-sm">
              <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="h-4 w-4" />
              Slides
            </TabsTrigger>
            <TabsTrigger value="arrangements" className="gap-2 px-4 py-2 text-sm">
              <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="h-4 w-4" />
              Arrangements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="slides" className="space-y-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {actionButtons}
            </div>
            {slides.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground mb-4">
                    No slides yet. Add your first slide to get started.
                  </p>
                  <Button onClick={addSlide}>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                    Add Slide
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={() => setIsDraggingList(true)}
                  onDragCancel={() => setIsDraggingList(false)}
                  onDragEnd={handleSlideDragEnd}
                >
                  <SortableContext items={slides.map((slide) => slide.id)} strategy={verticalListSortingStrategy}>
                    <Accordion
                      multiple
                      value={openGroupValues}
                      onValueChange={setOpenGroupValues}
                      className={`flex flex-col gap-4 ${isDraggingList ? 'select-none' : ''}`}
                    >
                      {groupedSlides.map((group) => (
                        <AccordionItem
                          key={`${group.key}-${group.startIndex}`}
                          value={`${group.key}-${group.startIndex}`}
                          className="border-b-0"
                        >
                          <AccordionTrigger
                            className={`${group.colorClass.bg} ${group.colorClass.text} px-3 py-2 hover:no-underline **:data-[slot=accordion-trigger-icon]:text-current **:data-[slot=accordion-trigger-icon]:opacity-90`}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span className="text-xs font-semibold capitalize">
                                {group.label}
                                <span className="ml-2 text-[11px] font-medium opacity-80">
                                  {group.items.length}
                                </span>
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="overflow-visible">
                            <div className="flex flex-col gap-2 mt-2">
                              {group.items.map(({ slide, index }) => (
                                <SortableSlideBlock
                                  key={slide.id}
                                  slide={slide}
                                  slideIndex={index}
                                  isSelected={selectedSlideIds.includes(slide.id)}
                                  onUpdate={(updates) => updateSlide(index, updates)}
                                  onDelete={() => deleteSlide(index)}
                                  onInsertAfter={() => addSlideAfter(index)}
                                  onSelect={(event) => handleSlideSelect(event, index, slide.id)}
                                  onContextSelect={(event) => handleContextMenuSelect(event, index, slide.id)}
                                  onNavigate={focusAdjacentSlide}
                                  onGroupChange={(label, customLabel) => applyGroupToSelection(label, customLabel)}
                                  onSelectAll={() => setSelectedSlideIds(slides.map((item) => item.id))}
                                  onClearSelection={() => setSelectedSlideIds([])}
                                  textareaRef={(node) => {
                                    if (node) {
                                      textareaRefs.current.set(slide.id, node)
                                    } else {
                                      textareaRefs.current.delete(slide.id)
                                    }
                                  }}
                                />
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </SortableContext>
                </DndContext>

                <Button variant="outline" onClick={addSlide} className="w-full">
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                  Add Slide
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="arrangements" className="space-y-4 **:rounded-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {arrangementPicker}
              {actionButtons}
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold">Slide groups</h3>
                  <p className="text-xs text-muted-foreground">
                    Drag a group into the arranged list to build the order. Groups can be added multiple times.
                  </p>
                </div>
                {groupDefinitions.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Slides are needed to generate groups.
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 border border-dashed border-border px-2 py-2">
                    {groupDefinitions.map((group) => (
                      <DraggableGroupChip key={group.key} group={group} />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2">
                  <h3 className="text-sm font-semibold">Arranged list</h3>
                  <p className="text-xs text-muted-foreground">
                    Reorder the list or drag more groups into it.
                  </p>
                </div>
                <div className="min-h-24 border border-dashed border-border px-3 py-3">
                  {groupArrangement.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Drag a group here to start arranging the slides.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {groupArrangement.map((item) => {
                        const key = getGroupKey(item.label, item.customLabel)
                        return (
                          <SortableGroupItem
                            key={item.id}
                            item={item}
                            group={groupDefinitionMap.get(key)}
                            onRemove={() => {
                              setGroupArrangement((prev) => prev.filter((entry) => entry.id !== item.id))
                              setHasChanges(true)
                            }}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Arrangement</DialogTitle>
            <DialogDescription>
            Create an empty arrangement to start adding slides.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={dialogName}
              onChange={e => setDialogName(e.target.value)}
              placeholder="e.g., Default, Acoustic, Christmas"
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose nativeButton render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleCreateArrangement} disabled={!dialogName.trim() || dialogLoading}>
              {dialogLoading ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Arrangement</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename">Name</Label>
            <Input
              id="rename"
              value={dialogName}
              onChange={e => setDialogName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose nativeButton render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleRenameArrangement} disabled={!dialogName.trim() || dialogLoading}>
              {dialogLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate Arrangement</DialogTitle>
            <DialogDescription>
              Create a copy of "{selectedArrangement?.name}" with all its slides.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="duplicate-name">Name for copy</Label>
            <Input
              id="duplicate-name"
              value={dialogName}
              onChange={e => setDialogName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose nativeButton render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleDuplicateArrangement} disabled={!dialogName.trim() || dialogLoading}>
              {dialogLoading ? 'Duplicating...' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Arrangement</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedArrangement?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose nativeButton render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleDeleteArrangement} disabled={dialogLoading}>
              {dialogLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface SortableGroupItemProps {
  item: SongSlideGroupArrangementItem
  group?: SlideGroupDefinition
  onRemove?: () => void
}

function SortableGroupItem({ item, group, onRemove }: SortableGroupItemProps) {
  const labelStyle = getGroupLabelStyle(item.label, item.customLabel)
  const labelDisplay = getGroupLabelDisplay(item.label, item.customLabel)
  const slideCount = group?.slides.length ?? 0
  const isMissing = !group

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-none border px-3 py-2 ${
        'bg-background'
      } ${isMissing ? 'border-destructive/40' : labelStyle.border}`}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground"
          aria-label="Drag handle"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="h-4 w-4" />
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-xs ${labelStyle.dot}`}>●</span>
          <span className="text-sm font-medium">{labelDisplay}</span>
        </span>
        <Badge variant="outline" className="rounded-none text-xs">
          {slideCount} slide{slideCount === 1 ? '' : 's'}
        </Badge>
        {isMissing && (
          <Badge variant="destructive" className="rounded-none text-xs">
            Missing
          </Badge>
        )}
      </div>
      {onRemove && (
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove from arranged list">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

interface DraggableGroupChipProps {
  group: SlideGroupDefinition
}

function DraggableGroupChip({ group }: DraggableGroupChipProps) {
  const labelStyle = getGroupLabelStyle(group.label, group.customLabel)

  return (
    <button
      type="button"
      className={`flex items-center gap-2 border px-3 py-2 text-xs font-medium transition-colors ${
        labelStyle.bg
      } ${labelStyle.text} ${labelStyle.border}`}
    >
      <GroupChip
        label={group.label}
        customLabel={group.customLabel}
        count={group.slides.length}
        showHandle
      />
    </button>
  )
}

interface GroupChipProps {
  label: SongSlide['label']
  customLabel?: string
  count?: number
  showHandle?: boolean
}

function GroupChip({ label, customLabel, count, showHandle = false }: GroupChipProps) {
  const labelDisplay = getGroupLabelDisplay(label, customLabel)

  return (
    <span className="flex items-center gap-2">
      {showHandle ? (
        <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="h-4 w-4" />
      ) : null}
      <span>{labelDisplay}</span>
      {typeof count === 'number' ? <span className="opacity-80">{count}</span> : null}
    </span>
  )
}

interface GroupChipPreviewProps {
  label: SongSlide['label']
  customLabel?: string
}

function GroupChipPreview({ label, customLabel }: GroupChipPreviewProps) {
  const labelStyle = getGroupLabelStyle(label, customLabel)

  return (
    <div
      className={`flex items-center gap-2 border px-3 py-2 text-xs font-medium ${labelStyle.bg} ${labelStyle.text} ${labelStyle.border}`}
    >
      <GroupChip label={label} customLabel={customLabel} showHandle />
    </div>
  )
}

// Individual slide block component
interface SlideBlockProps {
  slide: SongSlide
  slideIndex: number
  isSelected: boolean
  onUpdate: (updates: Partial<SongSlide>) => void
  onDelete: () => void
  onInsertAfter: () => void
  onSelect: (event: React.MouseEvent<HTMLDivElement>) => void
  onContextSelect: (event: React.MouseEvent<HTMLDivElement>) => void
  onNavigate: (direction: 'up' | 'down', slideId: string, column: number) => void
  onGroupChange: (label: SongSlide['label'], customLabel?: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  textareaRef: (node: HTMLTextAreaElement | null) => void
}

function SortableSlideBlock({
  slide,
  slideIndex,
  isSelected,
  onUpdate,
  onDelete,
  onInsertAfter,
  onSelect,
  onContextSelect,
  onNavigate,
  onGroupChange,
  onSelectAll,
  onClearSelection,
  textareaRef,
}: SlideBlockProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id })
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const updateText = (value: string) => {
    const lines = value.split('\n')
    onUpdate({ lines: lines.length > 0 ? lines : [''] })
  }

  const resizeTextarea = (node: HTMLTextAreaElement | null) => {
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  useEffect(() => {
    resizeTextarea(localTextareaRef.current)
  }, [slide.lines])

  // Use incrementing shades for numbered verse/chorus groups
  const labelStyle =
    (slide.label === 'verse' || slide.label === 'chorus') && slide.customLabel
      ? getNumberedGroupColor(slide.label, slide.customLabel)
      : GROUP_STYLE_CLASSES[slide.label] ?? {
          bg: 'bg-muted',
          text: 'text-foreground',
          border: 'border-border',
          dot: 'text-muted-foreground',
        }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          ref={setNodeRef}
          style={style}
          data-slide-item="true"
          className={`${isDragging ? 'bg-muted/40' : ''} ${isSelected ? 'relative z-10 outline-3 outline-offset-2 outline-primary/80' : ''}`}
          onMouseDown={onSelect}
          onContextMenu={onContextSelect}
        >
          <InputGroup className={`${labelStyle.border} focus-within:ring-0 focus-within:border-transparent`}>
            <InputGroupAddon
              align="block-start"
              className={`border-b border-border/10 ${labelStyle.bg} ${labelStyle.text} py-1`}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    {...attributes}
                    {...listeners}
                    ref={setActivatorNodeRef}
                    type="button"
                    className={`inline-flex h-5 w-5 items-center justify-center transition-colors cursor-ns-resize active:cursor-grabbing ${labelStyle.text}`}
                    aria-label="Drag to reorder"
                  >
                    <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="h-4 w-4" />
                  </button>
                  <InputGroupText className={`${labelStyle.text} text-[11px]`}>Slide {slideIndex + 1}</InputGroupText>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <InputGroupButton
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Slide settings"
                        className={labelStyle.text}
                      />
                    }
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Group</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="p-0">
                          {SLIDE_LABELS.map((label) => (
                            <DropdownMenuItem
                              key={label.value}
                              onClick={() => onUpdate({ label: label.value, customLabel: undefined })}
                              className="py-1.5"
                            >
                              <span className="flex items-center gap-2">
                                <span className={`text-xs ${GROUP_STYLE_CLASSES[label.value].dot}`}>●</span>
                                {label.label}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Numbered</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="p-0">
                          {NUMBERED_GROUPS.map((group) =>
                            NUMBERED_OPTIONS.map((count) => {
                              const numberedColor = getNumberedGroupColor(group.value, count)
                              return (
                                <DropdownMenuItem
                                  key={`${group.value}-${count}`}
                                  onClick={() => onUpdate({ label: group.value, customLabel: count })}
                                  className="py-1.5"
                                >
                                  <span className="flex items-center gap-2">
                                    <span className={`text-xs ${numberedColor.dot}`}>●</span>
                                    {group.label} {count}
                                  </span>
                                </DropdownMenuItem>
                              )
                            })
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={onDelete}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                      Delete slide
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </InputGroupAddon>

            <InputGroupTextarea
              ref={(node) => {
                localTextareaRef.current = node
                textareaRef(node)
              }}
              value={slide.lines.join('\n')}
              onChange={(event) => {
                updateText(event.target.value)
                resizeTextarea(event.currentTarget)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  const target = event.currentTarget
                  const value = target.value
                  const selectionStart = target.selectionStart ?? 0
                  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
                  const lineEnd = value.indexOf('\n', selectionStart)
                  const currentLineIndex = value.slice(0, selectionStart).split('\n').length - 1
                  const totalLines = value.split('\n').length

                  if (event.key === 'ArrowUp' && currentLineIndex === 0) {
                    event.preventDefault()
                    onNavigate('up', slide.id, selectionStart - lineStart)
                    return
                  }

                  if (event.key === 'ArrowDown' && currentLineIndex === totalLines - 1) {
                    event.preventDefault()
                    const lineLength = (lineEnd === -1 ? value.length : lineEnd) - lineStart
                    onNavigate('down', slide.id, Math.min(selectionStart - lineStart, lineLength))
                    return
                  }
                }
                if (event.key === 'Enter' && event.altKey) {
                  event.preventDefault()
                  onInsertAfter()
                }
              }}
              className="font-mono text-sm min-h-0 h-auto overflow-hidden py-1.5 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent focus-visible:outline-none"
            />

          </InputGroup>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent align="start">
        <ContextMenuSub>
          <ContextMenuSubTrigger>Group</ContextMenuSubTrigger>
          <ContextMenuSubContent className="p-0">
            {SLIDE_LABELS.map((label) => (
              <ContextMenuItem
                key={label.value}
                onClick={() => onGroupChange(label.value, undefined)}
                className="py-1.5"
              >
                <span className="flex items-center gap-2">
                  <span className={`text-xs ${GROUP_STYLE_CLASSES[label.value].dot}`}>●</span>
                  {label.label}
                </span>
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Numbered</ContextMenuSubTrigger>
          <ContextMenuSubContent className="p-0">
            {NUMBERED_GROUPS.map((group) =>
              NUMBERED_OPTIONS.map((count) => {
                const numberedColor = getNumberedGroupColor(group.value, count)
                return (
                  <ContextMenuItem
                    key={`${group.value}-${count}`}
                    onClick={() => onGroupChange(group.value, count)}
                    className="py-1.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`text-xs ${numberedColor.dot}`}>●</span>
                      {group.label} {count}
                    </span>
                  </ContextMenuItem>
                )
              })
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onSelectAll}>Select all</ContextMenuItem>
        <ContextMenuItem onClick={onClearSelection}>Clear selection</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
