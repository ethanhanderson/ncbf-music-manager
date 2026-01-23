'use client'

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type FocusEvent,
  type Ref,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { SlideViewToggle, type SlideViewMode } from '@/components/slide-view-toggle'
import type { SongArrangement, SongSlide, SongSlideGroup, SongSlideGroupArrangementItem } from '@/lib/supabase/server'
import {
  createSongArrangement,
  duplicateSongArrangement,
  renameSongArrangement,
  updateSongArrangementSlides,
  updateSongArrangementOrder,
  deleteSongArrangement,
} from '@/lib/actions/song-arrangements'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  MoreHorizontalIcon,
  Edit01Icon,
  Copy01Icon,
  Delete02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Loading01Icon,
  Layers01Icon,
  DragDropVerticalIcon,
  MusicNote03Icon,
  ListViewIcon,
} from '@hugeicons/core-free-icons'
import { SongChartsManager } from '@/components/song-charts-manager'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
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
  title: { bg: 'bg-primary', text: 'text-primary-foreground', border: 'border-primary', dot: 'text-primary-foreground/70' },
  verse: { bg: 'bg-secondary', text: 'text-secondary-foreground', border: 'border-secondary', dot: 'text-secondary-foreground/70' },
  chorus: { bg: 'bg-accent', text: 'text-accent-foreground', border: 'border-accent', dot: 'text-accent-foreground/70' },
  bridge: { bg: 'bg-destructive', text: 'text-destructive-foreground', border: 'border-destructive', dot: 'text-destructive-foreground/70' },
  'pre-chorus': { bg: 'bg-muted', text: 'text-foreground', border: 'border-border', dot: 'text-muted-foreground' },
  intro: { bg: 'bg-card', text: 'text-card-foreground', border: 'border-border', dot: 'text-muted-foreground' },
  outro: { bg: 'bg-card', text: 'text-card-foreground', border: 'border-border', dot: 'text-muted-foreground' },
  tag: { bg: 'bg-popover', text: 'text-popover-foreground', border: 'border-border', dot: 'text-muted-foreground' },
  interlude: { bg: 'bg-muted/70', text: 'text-foreground', border: 'border-border', dot: 'text-muted-foreground' },
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
    1: { bg: 'bg-secondary', text: 'text-secondary-foreground', border: 'border-secondary', dot: 'text-secondary-foreground/70' },
    2: { bg: 'bg-secondary/90', text: 'text-secondary-foreground', border: 'border-secondary/90', dot: 'text-secondary-foreground/70' },
    3: { bg: 'bg-secondary/80', text: 'text-secondary-foreground', border: 'border-secondary/80', dot: 'text-secondary-foreground/70' },
    4: { bg: 'bg-secondary/70', text: 'text-secondary-foreground', border: 'border-secondary/70', dot: 'text-secondary-foreground/70' },
    5: { bg: 'bg-secondary/60', text: 'text-secondary-foreground', border: 'border-secondary/60', dot: 'text-secondary-foreground/70' },
    6: { bg: 'bg-secondary/50', text: 'text-secondary-foreground', border: 'border-secondary/50', dot: 'text-secondary-foreground/70' },
  }

  const chorusShades: Record<number, { bg: string; text: string; border: string; dot: string }> = {
    1: { bg: 'bg-primary', text: 'text-primary-foreground', border: 'border-primary', dot: 'text-primary-foreground/70' },
    2: { bg: 'bg-primary/90', text: 'text-primary-foreground', border: 'border-primary/90', dot: 'text-primary-foreground/70' },
    3: { bg: 'bg-primary/80', text: 'text-primary-foreground', border: 'border-primary/80', dot: 'text-primary-foreground/70' },
    4: { bg: 'bg-primary/70', text: 'text-primary-foreground', border: 'border-primary/70', dot: 'text-primary-foreground/70' },
    5: { bg: 'bg-primary/60', text: 'text-primary-foreground', border: 'border-primary/60', dot: 'text-primary-foreground/70' },
    6: { bg: 'bg-primary/50', text: 'text-primary-foreground', border: 'border-primary/50', dot: 'text-primary-foreground/70' },
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
  if (slide.label === 'custom' && !slide.customLabel) {
    return ''
  }
  const baseLabel = SLIDE_LABELS.find((item) => item.value === slide.label)?.label ?? 'Verse'
  if ((slide.label === 'verse' || slide.label === 'chorus') && slide.customLabel) {
    return `${baseLabel} ${slide.customLabel}`
  }
  return baseLabel
}

function getGroupKey(label: SongSlide['label'], customLabel?: string, uniqueId?: string) {
  // Keep "Ungrouped" slides distinct (each slide its own group)
  if (label === 'custom' && !customLabel) {
    return `${label}::${uniqueId ?? ''}`
  }
  return `${label}::${customLabel ?? ''}`
}

function getGroupLabelDisplay(label: SongSlide['label'], customLabel?: string) {
  if (label === 'custom' && !customLabel) {
    return 'Ungrouped'
  }
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

function parseGroupKey(key: string): { label: SongSlide['label']; customLabel?: string } {
  const [label, customLabel] = key.split('::')
  return {
    label: (label as SongSlide['label']) ?? 'verse',
    customLabel: customLabel ? customLabel : undefined,
  }
}

function buildArrangementItemsFromKeys(
  keys: string[],
  groupDefinitionMap: Map<string, SlideGroupDefinition>,
  arrangementId: string,
  existingItems: SongSlideGroupArrangementItem[] = []
): SongSlideGroupArrangementItem[] {
  const existingByKey = new Map<string, SongSlideGroupArrangementItem[]>()
  existingItems.forEach((item) => {
    const list = existingByKey.get(item.key) ?? []
    list.push(item)
    existingByKey.set(item.key, list)
  })

  return keys.map((key) => {
    const reused = existingByKey.get(key)?.shift()
    if (reused) return reused
    const group = groupDefinitionMap.get(key)
    const parsed = parseGroupKey(key)
    return {
      id: `arranged-${arrangementId}-${crypto.randomUUID()}`,
      key,
      label: group?.label ?? parsed.label,
      customLabel: group?.customLabel ?? parsed.customLabel,
    }
  })
}

function normalizeGroupArrangementItems(
  arrangement: SongSlideGroupArrangementItem[],
  groupKeys: string[],
  groupDefinitionMap: Map<string, SlideGroupDefinition>,
  arrangementId: string,
  isLocked: boolean
): SongSlideGroupArrangementItem[] {
  const groupKeySet = new Set(groupKeys)
  const filtered = arrangement.filter((item) => groupKeySet.has(item.key))
  const present = new Set(filtered.map((item) => item.key))
  const missingKeys = groupKeys.filter((key) => !present.has(key))
  const next = isLocked
    ? buildArrangementItemsFromKeys(groupKeys, groupDefinitionMap, arrangementId, arrangement)
    : [...filtered, ...buildArrangementItemsFromKeys(missingKeys, groupDefinitionMap, arrangementId)]

  return next
}

interface SlideGroupDefinition {
  key: string
  label: SongSlide['label']
  customLabel?: string
  slides: SongSlide[]
  firstIndex: number
}

type GroupDragData = {
  type: 'group' | 'arranged'
  key: string
  label: SongSlide['label']
  customLabel?: string
}

export interface SongSlideArrangementsProps {
  songId: string
  groupId: string
  groupSlug: string
  songTitle: string
  songDefaultKey: string | null
  arrangements: SongArrangement[]
  slides: SongSlide[]
  slideGroups: SongSlideGroup[]
}

export function SongSlideArrangements({
  songId,
  groupId,
  groupSlug,
  songTitle,
  songDefaultKey,
  arrangements,
  slides: initialSlides,
  slideGroups,
}: SongSlideArrangementsProps) {
  const router = useRouter()
  const [selectedArrangementId, setSelectedArrangementId] = useState<string | null>(
    arrangements.find((arrangement) => arrangement.is_locked)?.id ?? arrangements[0]?.id ?? null
  )
  const [slides, setSlides] = useState<SongSlide[]>(initialSlides)
  const [slideViewMode, setSlideViewMode] = useState<SlideViewMode>('list')
  const [slideHasChanges, setSlideHasChanges] = useState(false)
  const [arrangementHasChanges, setArrangementHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDraggingGroups, setIsDraggingGroups] = useState(false)
  const [activeGroupDrag, setActiveGroupDrag] = useState<GroupDragData | null>(null)
  const [arrangedOverId, setArrangedOverId] = useState<string | null>(null)
  const [activeGroupType, setActiveGroupType] = useState<'group' | 'arranged' | null>(null)
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([])
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [arrangementOrders, setArrangementOrders] = useState<Record<string, SongSlideGroupArrangementItem[]>>({})
  const pathname = usePathname()
  const activeTab = useMemo(() => {
    const match = pathname.match(/\/(slides|arrangements|charts)$/)
    return match?.[1] ?? 'slides'
  }, [pathname])
  const basePath = useMemo(() => pathname.replace(/\/(slides|arrangements|charts)$/, ''), [pathname])
  const [focusedSlideId, setFocusedSlideId] = useState<string | null>(null)
  const initialSlidesSignatureRef = useRef<string>('')
  const initialArrangementSignatureRef = useRef<string>('')

  // Dialog states
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [dialogName, setDialogName] = useState('')
  const [dialogLoading, setDialogLoading] = useState(false)
  const [createArrangementName, setCreateArrangementName] = useState('')
  const [isCreatePopoverOpen, setIsCreatePopoverOpen] = useState(false)

  const selectedArrangement = arrangements.find(a => a.id === selectedArrangementId)
  const defaultArrangement = arrangements.find(arrangement => arrangement.is_locked)
  const isArrangementLocked = Boolean(selectedArrangement?.is_locked)
  const hasUnlockedArrangements = arrangements.some((arrangement) => !arrangement.is_locked)
  const lockedArrangementIds = useMemo(
    () => new Set(arrangements.filter((arrangement) => arrangement.is_locked).map((arrangement) => arrangement.id)),
    [arrangements]
  )
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

  useEffect(() => {
    setSlides(initialSlides)
    setSlideHasChanges(false)
    setSelectedSlideIds([])
    setLastSelectedIndex(null)
    initialSlidesSignatureRef.current = JSON.stringify(
      initialSlides.map((slide) => ({
        id: slide.id,
        label: slide.label,
        customLabel: slide.customLabel ?? null,
        lines: slide.lines ?? [],
      }))
    )
  }, [initialSlides])

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
      if (target.closest('[data-slot="context-menu-sub-content"]')) return
      if (target.closest('[data-slot="dropdown-menu-content"]')) return
      if (target.closest('[data-slot="dropdown-menu-sub-content"]')) return
      setSelectedSlideIds([])
      setLastSelectedIndex(null)
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    return () => document.removeEventListener('mousedown', handlePointerDown, true)
  }, [])

  // Generate unique ID for new slides
  const generateSlideId = useCallback(() => {
    return crypto.randomUUID()
  }, [])

  // Save changes
  const handleSave = async () => {
    if (activeTab === 'arrangements') {
      setIsSaving(true)
      const results = await Promise.all(
        arrangements.map((arrangement) => {
          if (arrangement.is_locked) return Promise.resolve({ success: true })
          const order = arrangementOrders[arrangement.id] ?? []
          const keys = order.map((item) => item.key)
          return updateSongArrangementOrder(arrangement.id, songId, keys, groupSlug)
        })
      )
      if (results.every((result) => result.success)) {
        setArrangementHasChanges(false)
        router.refresh()
      }
      setIsSaving(false)
      return
    }

    const arrangementId = defaultArrangement?.id ?? selectedArrangementId
    if (!arrangementId) return

    setIsSaving(true)
    const result = await updateSongArrangementSlides(
      arrangementId,
      slides,
      groupSlug,
      songId,
      groupId,
      defaultGroupKeys
    )

    if (result.success) {
      setSlideHasChanges(false)
      router.refresh()
    }
    setIsSaving(false)
  }

  // Create new arrangement
  const handleCreateArrangement = async () => {
    if (!createArrangementName.trim()) return

    setDialogLoading(true)
    const result = await createSongArrangement(
      songId,
      groupId,
      groupSlug,
      createArrangementName.trim()
    )

    if (result.success && result.arrangement) {
      setSelectedArrangementId(result.arrangement.id)
      router.refresh()
    }

    setDialogLoading(false)
    setCreateArrangementName('')
    setIsCreatePopoverOpen(false)
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
    if (!selectedArrangementId || !dialogName.trim() || isArrangementLocked) return

    setDialogLoading(true)
    await renameSongArrangement(selectedArrangementId, dialogName.trim(), groupSlug, songId)
    
    setDialogLoading(false)
    setShowRenameDialog(false)
    setDialogName('')
    router.refresh()
  }

  // Delete arrangement
  const handleDeleteArrangement = async () => {
    if (!selectedArrangementId || isArrangementLocked) return

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
    setSlideHasChanges(true)
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
    setSlideHasChanges(true)
  }

  const handleGroupChange = (
    slideId: string,
    slideIndex: number,
    label: SongSlide['label'],
    customLabel?: string
  ) => {
    const selectedSet = new Set(selectedSlideIds)
    if (selectedSet.size > 0 && selectedSet.has(slideId)) {
      applyGroupToSelection(label, customLabel)
      return
    }
    updateSlide(slideIndex, { label, customLabel: customLabel ?? undefined })
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
    const allowMultiSelect = isSelectionMode || event.metaKey || event.ctrlKey

    if (event.shiftKey) {
      const anchorIndex = lastSelectedIndex ?? focusedSlideIndex
      if (anchorIndex !== null && anchorIndex >= 0) {
        selectSlideRange(anchorIndex, index)
        setLastSelectedIndex(anchorIndex)
        return
      }
      setSelectedSlideIds([slideId])
      setLastSelectedIndex(index)
      return
    }

    if (allowMultiSelect) {
      setSelectedSlideIds((prev) => {
        const next = new Set(prev)
        if (next.has(slideId)) {
          next.delete(slideId)
        } else {
          next.add(slideId)
        }
        return Array.from(next)
      })
      setLastSelectedIndex(index)
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
    if (event.shiftKey) {
      const anchorIndex = lastSelectedIndex ?? focusedSlideIndex
      if (anchorIndex !== null && anchorIndex >= 0) {
        selectSlideRange(anchorIndex, index)
        setLastSelectedIndex(anchorIndex)
        return
      }
    }

    if (!selectedSlideIds.includes(slideId)) {
      setSelectedSlideIds([slideId])
      setLastSelectedIndex(index)
    }
  }

  const deleteSlide = (index: number) => {
    setSlides(prev => prev.filter((_, i) => i !== index))
    setSlideHasChanges(true)
  }

  const addSlide = () => {
    setSlides(prev => [
      ...prev,
      {
        id: generateSlideId(),
        label: 'custom',
        lines: [''],
      },
    ])
    setSlideHasChanges(true)
  }

  const addSlideAfter = (index: number) => {
    const newId = generateSlideId()
    setSlides(prev => {
      const next = [...prev]
      next.splice(index + 1, 0, {
        id: newId,
        label: 'custom',
        lines: [''],
      })
      return next
    })
    setSlideHasChanges(true)
    setPendingFocusId(newId)
  }

  const addSlideBefore = (index: number) => {
    const newId = generateSlideId()
    setSlides(prev => {
      const next = [...prev]
      next.splice(index, 0, {
        id: newId,
        label: 'custom',
        lines: [''],
      })
      return next
    })
    setSlideHasChanges(true)
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

  const groupSensors = useSensors(
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
      const key = getGroupKey(slide.label, slide.customLabel, slide.id)
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

  const defaultGroupKeys = useMemo(
    () => groupDefinitions.map((group) => group.key),
    [groupDefinitions]
  )

  useEffect(() => {
    setArrangementOrders((prev) => {
      const next: Record<string, SongSlideGroupArrangementItem[]> = {}
      arrangements.forEach((arrangement) => {
        const arrangementKeys = (arrangement.group_order ?? [])
          .map((id: string) => slideGroupKeyById.get(id))
          .filter((value: string | undefined): value is string => Boolean(value))
        const baseKeys = arrangementKeys.length > 0 ? arrangementKeys : defaultGroupKeys
        const existing = prev[arrangement.id] ?? []
        const built = buildArrangementItemsFromKeys(baseKeys, groupDefinitionMap, arrangement.id, existing)
        next[arrangement.id] = normalizeGroupArrangementItems(
          built,
          defaultGroupKeys,
          groupDefinitionMap,
          arrangement.id,
          arrangement.is_locked
        )
      })
      return next
    })

    const initialArrangementKeys = arrangements
      .map((arrangement) => {
        const arrangementKeys = (arrangement.group_order ?? [])
          .map((id: string) => slideGroupKeyById.get(id))
          .filter((value: string | undefined): value is string => Boolean(value))
        const baseKeys = arrangementKeys.length > 0 ? arrangementKeys : defaultGroupKeys
        return [arrangement.id, baseKeys] as const
      })
      .sort(([a], [b]) => a.localeCompare(b))

    initialArrangementSignatureRef.current = JSON.stringify(
      initialArrangementKeys.map(([arrangementId, keys]) => ({
        arrangementId,
        keys,
      }))
    )
  }, [arrangements, defaultGroupKeys, groupDefinitionMap, slideGroupKeyById])

  const currentSlidesSignature = useMemo(
    () =>
      JSON.stringify(
        slides.map((slide) => ({
          id: slide.id,
          label: slide.label,
          customLabel: slide.customLabel ?? null,
          lines: slide.lines ?? [],
        }))
      ),
    [slides]
  )

  const currentArrangementSignature = useMemo(() => {
    const normalized = arrangements
      .map((arrangement) => {
        const order = arrangementOrders[arrangement.id] ?? []
        const keys = order.map((item) => item.key)
        return [arrangement.id, keys] as const
      })
      .sort(([a], [b]) => a.localeCompare(b))

    return JSON.stringify(
      normalized.map(([arrangementId, keys]) => ({
        arrangementId,
        keys,
      }))
    )
  }, [arrangements, arrangementOrders])

  useEffect(() => {
    if (!initialSlidesSignatureRef.current) return
    setSlideHasChanges(currentSlidesSignature !== initialSlidesSignatureRef.current)
  }, [currentSlidesSignature])

  useEffect(() => {
    if (!initialArrangementSignatureRef.current) return
    setArrangementHasChanges(currentArrangementSignature !== initialArrangementSignatureRef.current)
  }, [currentArrangementSignature])

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

  const selectedSlideIndices = useMemo(() => {
    const indices = selectedSlideIds
      .map((id) => slides.findIndex((slide) => slide.id === id))
      .filter((index) => index >= 0)
    return indices.sort((a, b) => a - b)
  }, [selectedSlideIds, slides])
  const showSelectionIndicators = isSelectionMode || selectedSlideIds.length > 0
  const focusedSlideIndex = focusedSlideId
    ? slides.findIndex((slide) => slide.id === focusedSlideId)
    : -1
  const shouldShowInlineButtons = selectedSlideIndices.length > 0 || focusedSlideIndex !== -1
  const inlineButtonStartIndex =
    selectedSlideIndices.length > 0 ? selectedSlideIndices[0] : focusedSlideIndex
  const inlineButtonEndIndex =
    selectedSlideIndices.length > 0
      ? selectedSlideIndices[selectedSlideIndices.length - 1]
      : focusedSlideIndex


  const gridCardMetaBySlideId = useMemo(() => {
    const map = new Map<
      string,
      { isFirstInGroup: boolean; groupLabel: string; colorClass: { bg: string; text: string; border: string; dot: string } }
    >()
    groupedSlides.forEach((group) => {
      group.items.forEach(({ slide }, index) => {
        map.set(slide.id, {
          isFirstInGroup: index === 0,
          groupLabel: group.label,
          colorClass: group.colorClass,
        })
      })
    })
    return map
  }, [groupedSlides])

  const handleGroupDragStart = (event: DragStartEvent) => {
    setIsDraggingGroups(true)
    const payload = event.active.data.current as GroupDragData | undefined
    if (payload?.key) {
      setActiveGroupDrag(payload)
    }
    setActiveGroupType(payload?.type ?? null)
  }

  const handleGroupDragOver = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) {
      setArrangedOverId(null)
      return
    }
    const activeType = active.data.current?.type as 'group' | 'arranged' | undefined
    if (!activeType) {
      setArrangedOverId(null)
      return
    }
    const overRole = over.data.current?.role as 'arranged' | 'arranged-item' | undefined
    const overArrangementId = over.data.current?.arrangementId as string | undefined
    if (overArrangementId && lockedArrangementIds.has(overArrangementId)) {
      setArrangedOverId(null)
      return
    }
    if (overRole) {
      setArrangedOverId(over.id.toString())
      return
    }
    setArrangedOverId(null)
  }

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setIsDraggingGroups(false)
    setActiveGroupDrag(null)
    setArrangedOverId(null)
    setActiveGroupType(null)
    if (!over) return

    const activeType = active.data.current?.type as 'group' | 'arranged' | undefined
    if (!activeType) {
      return
    }

    const overRole = over.data.current?.role as 'arranged' | 'arranged-item' | undefined
    const overArrangementId = over.data.current?.arrangementId as string | undefined
    if (!overRole || !overArrangementId) {
      return
    }
    if (lockedArrangementIds.has(overArrangementId)) {
      return
    }

    if (activeType === 'group' && (overRole === 'arranged' || overRole === 'arranged-item')) {
      const payload = active.data.current as {
        type: 'group'
        key: string
        label: SongSlide['label']
        customLabel?: string
      }
      setArrangementOrders((prev) => {
        const items = prev[overArrangementId] ?? []
        const newItem = {
          id: `arranged-${overArrangementId}-${crypto.randomUUID()}`,
          key: payload.key,
          label: payload.label,
          customLabel: payload.customLabel,
        }
        if (overRole === 'arranged') {
          return { ...prev, [overArrangementId]: [...items, newItem] }
        }
        const overIndex = items.findIndex((item) => item.id === over.id)
        if (overIndex === -1) {
          return { ...prev, [overArrangementId]: [...items, newItem] }
        }
        const next = [...items]
        next.splice(overIndex, 0, newItem)
        return { ...prev, [overArrangementId]: next }
      })
      setArrangementHasChanges(true)
      return
    }

    if (activeType === 'arranged' && overRole === 'arranged-item') {
      const sourceArrangementId = active.data.current?.arrangementId as string | undefined
      if (!sourceArrangementId || sourceArrangementId !== overArrangementId) {
        return
      }
      if (active.id === over.id) return
      setArrangementOrders((prev) => {
        const items = [...(prev[sourceArrangementId] ?? [])]
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        return { ...prev, [sourceArrangementId]: arrayMove(items, oldIndex, newIndex) }
      })
      setArrangementHasChanges(true)
      return
    }

    if (activeType === 'arranged' && overRole === 'arranged') {
      const sourceArrangementId = active.data.current?.arrangementId as string | undefined
      if (!sourceArrangementId || sourceArrangementId !== overArrangementId) {
        return
      }
      setArrangementOrders((prev) => {
        const items = [...(prev[sourceArrangementId] ?? [])]
        const oldIndex = items.findIndex((item) => item.id === active.id)
        if (oldIndex === -1) return prev
        const next = [...items]
        const [moved] = next.splice(oldIndex, 1)
        next.push(moved)
        return { ...prev, [sourceArrangementId]: next }
      })
      setArrangementHasChanges(true)
    }
  }

  const handleGroupDragCancel = () => {
    setIsDraggingGroups(false)
    setActiveGroupDrag(null)
    setArrangedOverId(null)
    setActiveGroupType(null)
  }

  const showEmptyArrangementState = !selectedArrangement && arrangements.length === 0

  const activeHasChanges = activeTab === 'arrangements' ? arrangementHasChanges : slideHasChanges

  const actionButtons = (
    <div className="flex items-center gap-2">
      {activeHasChanges && (
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
      {showEmptyArrangementState ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              Upload a lyrics file to generate slides, or create an empty arrangement to start from scratch.
            </p>
            <Popover
              open={isCreatePopoverOpen}
              onOpenChange={(open) => {
                setIsCreatePopoverOpen(open)
                if (!open) {
                  setCreateArrangementName('')
                }
              }}
            >
              <PopoverTrigger
                render={
                  <Button>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                    Create Arrangement
                  </Button>
                }
              />
              <PopoverContent align="center" className="w-72 space-y-3 rounded-none">
                <div className="space-y-1">
                  <Label htmlFor="arrangement-name-empty">Arrangement name</Label>
                  <Input
                    id="arrangement-name-empty"
                    value={createArrangementName}
                    onChange={(e) => setCreateArrangementName(e.target.value)}
                    placeholder="e.g., Default, Acoustic"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreatePopoverOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateArrangement} disabled={!createArrangementName.trim() || dialogLoading}>
                    {dialogLoading ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>
      ) : (
        selectedArrangement && (
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (!value || value === activeTab) return
              router.push(`${basePath}/${value}`)
            }}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="slides" className="gap-2 px-4 py-2 text-sm">
                  <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="h-4 w-4" />
                  Slides
                </TabsTrigger>
                <TabsTrigger value="arrangements" className="gap-2 px-4 py-2 text-sm">
                  <HugeiconsIcon icon={ListViewIcon} strokeWidth={2} className="h-4 w-4" />
                  Arrangements
                </TabsTrigger>
                <TabsTrigger value="charts" className="gap-2 px-4 py-2 text-sm">
                  <HugeiconsIcon icon={MusicNote03Icon} strokeWidth={2} className="h-4 w-4" />
                  Charts
                </TabsTrigger>
              </TabsList>
              {actionButtons}
            </div>

            <TabsContent value="slides" className="space-y-4">
              {slides.length > 0 ? (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant={isSelectionMode ? 'secondary' : 'outline'}
                    onClick={() => setIsSelectionMode((prev) => !prev)}
                    aria-pressed={isSelectionMode}
                  >
                    {isSelectionMode ? 'Exit selection' : 'Select multiple'}
                  </Button>
                  <SlideViewToggle value={slideViewMode} onValueChange={setSlideViewMode} />
                </div>
              ) : (
                <div />
              )}
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
              <div className="space-y-4">
                {slideViewMode === 'grid' ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {slides.flatMap((slide, index) => {
                      const nodes: ReactNode[] = []
                      if (shouldShowInlineButtons && index === inlineButtonStartIndex) {
                        nodes.push(
                          <AddSlideInlineButton
                            key={`add-before-${slide.id}`}
                            label="Add slide before"
                            onClick={() => addSlideBefore(index)}
                          />
                        )
                      }
                      nodes.push(
                        <GridSlideCard
                          key={slide.id}
                          slide={slide}
                          slideIndex={index}
                          isSelected={selectedSlideIds.includes(slide.id)}
                          showSelectionIndicator={showSelectionIndicators}
                          meta={gridCardMetaBySlideId.get(slide.id)}
                          onUpdate={(updates) => updateSlide(index, updates)}
                          onDelete={() => deleteSlide(index)}
                          onInsertBefore={() => addSlideBefore(index)}
                          onInsertAfter={() => addSlideAfter(index)}
                          onGroupChange={(label, customLabel) =>
                            handleGroupChange(slide.id, index, label, customLabel)
                          }
                          onSelectAll={() => setSelectedSlideIds(slides.map((item) => item.id))}
                          onClearSelection={() => setSelectedSlideIds([])}
                          onFocus={() => setFocusedSlideId(slide.id)}
                          onBlur={(event) => {
                            const nextTarget = event.relatedTarget as HTMLElement | null
                            if (nextTarget?.closest('[data-add-slide-button="true"]')) return
                            setFocusedSlideId(null)
                          }}
                        />
                      )
                      if (shouldShowInlineButtons && index === inlineButtonEndIndex) {
                        nodes.push(
                          <AddSlideInlineButton
                            key={`add-after-${slide.id}`}
                            label="Add slide after"
                            onClick={() => addSlideAfter(index)}
                          />
                        )
                      }
                      return nodes
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {slides.flatMap((slide, index) => {
                      const nodes: ReactNode[] = []
                      if (shouldShowInlineButtons && index === inlineButtonStartIndex) {
                        nodes.push(
                          <AddSlideInlineButton
                            key={`add-before-${slide.id}`}
                            label="Add slide before"
                            onClick={() => addSlideBefore(index)}
                          />
                        )
                      }
                      nodes.push(
                        <SlideBlock
                          key={slide.id}
                          slide={slide}
                          slideIndex={index}
                          isSelected={selectedSlideIds.includes(slide.id)}
                          showSelectionIndicator={showSelectionIndicators}
                          meta={gridCardMetaBySlideId.get(slide.id)}
                          onUpdate={(updates) => updateSlide(index, updates)}
                          onDelete={() => deleteSlide(index)}
                          onInsertBefore={() => addSlideBefore(index)}
                          onInsertAfter={() => addSlideAfter(index)}
                          onSelect={(event) => handleSlideSelect(event, index, slide.id)}
                          onContextSelect={(event) => handleContextMenuSelect(event, index, slide.id)}
                          onNavigate={focusAdjacentSlide}
                          onGroupChange={(label, customLabel) =>
                            handleGroupChange(slide.id, index, label, customLabel)
                          }
                          onSelectAll={() => setSelectedSlideIds(slides.map((item) => item.id))}
                          onClearSelection={() => setSelectedSlideIds([])}
                          onFocus={() => setFocusedSlideId(slide.id)}
                          onBlur={(event) => {
                            const nextTarget = event.relatedTarget as HTMLElement | null
                            if (nextTarget?.closest('[data-add-slide-button="true"]')) return
                            setFocusedSlideId(null)
                          }}
                          textareaRef={(node) => {
                            if (node) {
                              textareaRefs.current.set(slide.id, node)
                            } else {
                              textareaRefs.current.delete(slide.id)
                            }
                          }}
                        />
                      )
                      if (shouldShowInlineButtons && index === inlineButtonEndIndex) {
                        nodes.push(
                          <AddSlideInlineButton
                            key={`add-after-${slide.id}`}
                            label="Add slide after"
                            onClick={() => addSlideAfter(index)}
                          />
                        )
                      }
                      return nodes
                    })}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="arrangements" className="space-y-4 **:rounded-none">
            <DndContext
              sensors={groupSensors}
              collisionDetection={closestCenter}
              onDragStart={handleGroupDragStart}
              onDragOver={handleGroupDragOver}
              onDragEnd={handleGroupDragEnd}
              onDragCancel={handleGroupDragCancel}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">Arrangements overview</h3>
                    <p className="text-xs text-muted-foreground">
                      See the full list of slide groups, then compare how each arrangement orders those groups. Use the
                      menu on each arrangement to rename or remove it, and drag groups in the selected arrangement to
                      reorder.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Slide groups
                  </h4>
                  {groupDefinitions.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Slides are needed to generate groups.</div>
                  ) : (
                    <div className={`flex flex-wrap items-center gap-2 ${isDraggingGroups ? 'select-none' : ''}`}>
                    {groupDefinitions.map((group) => (
                      <DraggableGroupChip key={group.key} group={group} disabled={!hasUnlockedArrangements} />
                    ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Arrangement orders
                  </h4>
                  <div className="space-y-3">
                    {arrangements.map((arrangement) => {
                      const arrangementKeys = (arrangement.group_order ?? [])
                        .map((id: string) => slideGroupKeyById.get(id))
                        .filter((value: string | undefined): value is string => Boolean(value))
                      const baseKeys = arrangementKeys.length > 0 ? arrangementKeys : defaultGroupKeys
                      const arrangementItems = arrangementOrders[arrangement.id] ?? buildArrangementItemsFromKeys(
                        baseKeys,
                        groupDefinitionMap,
                        arrangement.id
                      )

                      return (
                        <ArrangementOrderRow
                          key={arrangement.id}
                          arrangement={arrangement}
                          items={arrangementItems}
                          arrangedOverId={arrangedOverId}
                          activeGroupType={activeGroupType}
                          activeGroupDrag={activeGroupDrag}
                          groupDefinitionMap={groupDefinitionMap}
                          isLocked={arrangement.is_locked}
                          onRemoveItem={(id) => {
                            setArrangementOrders((prev) => ({
                              ...prev,
                              [arrangement.id]: (prev[arrangement.id] ?? []).filter((entry) => entry.id !== id),
                            }))
                            setArrangementHasChanges(true)
                          }}
                          onRename={() => {
                            setSelectedArrangementId(arrangement.id)
                            setDialogName(arrangement.name)
                            setShowRenameDialog(true)
                          }}
                          onRemove={() => {
                            setSelectedArrangementId(arrangement.id)
                            setShowDeleteDialog(true)
                          }}
                        />
                      )
                    })}
                  </div>
                  <Popover
                    open={isCreatePopoverOpen}
                    onOpenChange={(open) => {
                      setIsCreatePopoverOpen(open)
                      if (!open) {
                        setCreateArrangementName('')
                      }
                    }}
                  >
                    <PopoverTrigger
                      render={
                        <Button variant="outline" className="w-full">
                          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                          Add arrangement
                        </Button>
                      }
                    />
                    <PopoverContent align="center" className="w-72 space-y-3 rounded-none">
                      <div className="space-y-1">
                        <Label htmlFor="arrangement-name">Arrangement name</Label>
                        <Input
                          id="arrangement-name"
                          value={createArrangementName}
                          onChange={(e) => setCreateArrangementName(e.target.value)}
                          placeholder="e.g., Acoustic, Christmas"
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsCreatePopoverOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateArrangement}
                          disabled={!createArrangementName.trim() || dialogLoading}
                        >
                          {dialogLoading ? 'Creating...' : 'Create'}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <DragOverlay>
                {activeGroupDrag && activeGroupType === 'group' ? (
                  <GroupChipPreview
                    label={activeGroupDrag.label}
                    customLabel={activeGroupDrag.customLabel}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </TabsContent>

          <TabsContent value="charts" className="space-y-4">
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
          </TabsContent>
          </Tabs>
        )
      )}

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
              Create a copy of "{selectedArrangement?.name}" with its group order.
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
  arrangementId: string
  group?: SlideGroupDefinition
  onRemove?: () => void
  disabled?: boolean
}

interface RenderArrangedChipsProps {
  items: SongSlideGroupArrangementItem[]
  arrangementId: string
  arrangedDropzoneId: string
  arrangedOverId: string | null
  activeGroupType: 'group' | 'arranged' | null
  activeGroupDrag: GroupDragData | null
  groupDefinitionMap: Map<string, SlideGroupDefinition>
  onRemove: (id: string) => void
  isLocked: boolean
}

function renderArrangedChips({
  items,
  arrangementId,
  arrangedDropzoneId,
  arrangedOverId,
  activeGroupType,
  activeGroupDrag,
  groupDefinitionMap,
  onRemove,
  isLocked,
}: RenderArrangedChipsProps) {
  if (!activeGroupDrag || !activeGroupType) {
    return items.map((item) => {
      const key = item.key
      return (
        <SortableGroupItem
          key={item.id}
          item={item}
          arrangementId={arrangementId}
          group={groupDefinitionMap.get(key)}
          onRemove={isLocked ? undefined : () => onRemove(item.id)}
          disabled={isLocked}
        />
      )
    })
  }

  const indicatorIndex = (() => {
    if (!arrangedOverId || !activeGroupType) return -1
    if (arrangedOverId === arrangedDropzoneId) return items.length
    const index = items.findIndex((item) => item.id === arrangedOverId)
    return index === -1 ? -1 : index
  })()

  const nodes: ReactNode[] = []
  if (indicatorIndex === 0) {
    nodes.push(
      activeGroupType === 'group' ? (
        <ArrangedDropIndicator key="arranged-indicator-start" dragData={activeGroupDrag} />
      ) : (
        <ArrangedMoveIndicator key="arranged-move-indicator-start" />
      )
    )
  }

  items.forEach((item, index) => {
    nodes.push(
      <SortableGroupItem
        key={item.id}
        item={item}
        arrangementId={arrangementId}
        group={groupDefinitionMap.get(item.key)}
        onRemove={isLocked ? undefined : () => onRemove(item.id)}
        disabled={isLocked}
      />
    )
    if (indicatorIndex === index + 1) {
      nodes.push(
        activeGroupType === 'group' ? (
          <ArrangedDropIndicator key={`arranged-indicator-${item.id}`} dragData={activeGroupDrag} />
        ) : (
          <ArrangedMoveIndicator key={`arranged-move-indicator-${item.id}`} />
        )
      )
    }
  })

  return nodes
}

function ArrangedDropIndicator({ dragData }: { dragData: GroupDragData }) {
  return (
    <div className="opacity-60">
      <GroupChipPreview label={dragData.label} customLabel={dragData.customLabel} />
    </div>
  )
}

function ArrangedMoveIndicator() {
  return (
    <div className="h-8 w-1 rounded-none bg-primary/30" aria-hidden="true" />
  )
}

interface ArrangementOrderRowProps {
  arrangement: SongArrangement
  items: SongSlideGroupArrangementItem[]
  arrangedOverId: string | null
  activeGroupType: 'group' | 'arranged' | null
  activeGroupDrag: GroupDragData | null
  groupDefinitionMap: Map<string, SlideGroupDefinition>
  isLocked: boolean
  onRemoveItem: (id: string) => void
  onRename: () => void
  onRemove: () => void
}

function ArrangementOrderRow({
  arrangement,
  items,
  arrangedOverId,
  activeGroupType,
  activeGroupDrag,
  groupDefinitionMap,
  isLocked,
  onRemoveItem,
  onRename,
  onRemove,
}: ArrangementOrderRowProps) {
  const arrangedDropzoneId = `arranged-dropzone-${arrangement.id}`
  const arrangedDropzone = useDroppable({
    id: arrangedDropzoneId,
    disabled: isLocked,
    data: {
      role: 'arranged',
      arrangementId: arrangement.id,
      accepts: isLocked ? [] : ['group', 'arranged'],
    },
  })

  return (
    <div className="space-y-2 border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{arrangement.name}</span>
        {!isLocked ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename}>
                <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="h-8 w-8" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0">
        <div ref={arrangedDropzone.setNodeRef} className="min-h-10 w-full">
          {items.length === 0 ? (
            <div className="text-xs text-muted-foreground">Drag groups here to build the arrangement flow.</div>
          ) : (
            <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap items-center gap-2">
                {renderArrangedChips({
                  items,
                  arrangementId: arrangement.id,
                  arrangedDropzoneId,
                  arrangedOverId,
                  activeGroupType,
                  activeGroupDrag,
                  groupDefinitionMap,
                  isLocked,
                  onRemove: onRemoveItem,
                })}
              </div>
            </SortableContext>
          )}
        </div>
      </div>
    </div>
  )
}

function SortableGroupItem({ item, arrangementId, group, onRemove, disabled = false }: SortableGroupItemProps) {
  const labelStyle = getGroupLabelStyle(item.label, item.customLabel)
  const labelDisplay = getGroupLabelDisplay(item.label, item.customLabel)
  const isMissing = !group
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      disabled,
      data: {
        type: 'arranged',
        role: 'arranged-item',
        arrangementId,
        key: item.key,
        label: item.label,
        customLabel: item.customLabel,
      },
    })

  const normalizedTransform = transform ? { ...transform, scaleX: 1, scaleY: 1 } : null
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(normalizedTransform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`group flex items-center gap-2 border px-3 py-2 text-xs font-medium transition-colors ${
        labelStyle.bg
      } ${labelStyle.text} ${isMissing ? 'border-destructive/60' : labelStyle.border} ${
        isDragging ? 'relative z-40 opacity-70' : ''
      }`}
    >
      <GroupChip
        label={item.label}
        customLabel={item.customLabel}
        showHandle={!disabled}
        handleRef={setActivatorNodeRef}
        handleProps={listeners}
      />
      {isMissing ? (
        <Badge variant="destructive" className="rounded-none text-[10px] uppercase tracking-wide">
          Missing
        </Badge>
      ) : null}
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Remove ${labelDisplay} from arranged list`}
          className="h-4 w-4 p-0 text-current opacity-0 transition-opacity group-hover:opacity-100"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}

interface DraggableGroupChipProps {
  group: SlideGroupDefinition
  disabled?: boolean
}

function DraggableGroupChip({ group, disabled = false }: DraggableGroupChipProps) {
  const labelStyle = getGroupLabelStyle(group.label, group.customLabel)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `group-${group.key}`,
    disabled,
    data: {
      type: 'group',
      key: group.key,
      label: group.label,
      customLabel: group.customLabel,
    },
  })

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 border px-3 py-2 text-xs font-medium transition-colors ${
        labelStyle.bg
      } ${labelStyle.text} ${labelStyle.border} ${isDragging ? 'opacity-70' : ''}`}
    >
      <GroupChip label={group.label} customLabel={group.customLabel} />
    </button>
  )
}

interface GroupChipProps {
  label: SongSlide['label']
  customLabel?: string
  showHandle?: boolean
  handleProps?: HTMLAttributes<HTMLSpanElement>
  handleRef?: Ref<HTMLSpanElement>
}

function GroupChip({ label, customLabel, showHandle = false, handleProps, handleRef }: GroupChipProps) {
  const labelDisplay = getGroupLabelDisplay(label, customLabel)

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {showHandle ? (
        <span
          ref={handleRef}
          {...handleProps}
          aria-label="Drag handle"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center cursor-grab active:cursor-grabbing"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="h-4 w-4" />
        </span>
      ) : null}
      <span>{labelDisplay}</span>
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

type GridSlideCardMeta = {
  isFirstInGroup: boolean
  groupLabel: string
  colorClass: { bg: string; text: string; border: string; dot: string }
}

interface GridSlideCardProps {
  slide: SongSlide
  slideIndex: number
  isSelected: boolean
  showSelectionIndicator: boolean
  meta?: GridSlideCardMeta
  onUpdate: (updates: Partial<SongSlide>) => void
  onDelete: () => void
  onInsertBefore: () => void
  onInsertAfter: () => void
  onGroupChange: (label: SongSlide['label'], customLabel?: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onFocus: () => void
  onBlur: (event: FocusEvent<HTMLTextAreaElement>) => void
}

function GridSlideCard({
  slide,
  slideIndex,
  isSelected,
  showSelectionIndicator,
  meta,
  onUpdate,
  onDelete,
  onInsertBefore,
  onInsertAfter,
  onGroupChange,
  onSelectAll,
  onClearSelection,
  onFocus,
  onBlur,
}: GridSlideCardProps) {
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  const labelStyle = meta?.colorClass ?? getGroupLabelStyle(slide.label, slide.customLabel)
  const groupLabel = meta?.isFirstInGroup ? meta.groupLabel : ''

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={`rounded-none border bg-card ${labelStyle.border}`}
          data-slide-item="true"
        >
          <div className="relative flex min-h-40 items-center justify-center px-4 py-6 text-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="absolute right-2 top-2 h-8 w-8 rounded-none" />}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuGroup>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Group</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="p-0">
                      <DropdownMenuItem
                        onClick={() => onGroupChange('custom', undefined)}
                        className="py-1.5"
                      >
                        <span className="flex items-center gap-2">
                          <span className={`text-xs ${GROUP_STYLE_CLASSES.custom.dot}`}>●</span>
                          Ungrouped
                        </span>
                      </DropdownMenuItem>
                      {SLIDE_LABELS.map((label) => (
                        <DropdownMenuItem
                          key={label.value}
                          onClick={() => onGroupChange(label.value, undefined)}
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
                              onClick={() => onGroupChange(group.value, count)}
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
                <DropdownMenuItem onClick={onInsertBefore} className="whitespace-nowrap">
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                  Insert slide before
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onInsertAfter} className="whitespace-nowrap">
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                  Insert slide after
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="whitespace-nowrap text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                  Delete slide
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Textarea
              ref={(node) => {
                localTextareaRef.current = node
              }}
              onFocus={onFocus}
              onBlur={onBlur}
              value={(slide.lines ?? []).join('\n')}
              onChange={(event) => {
                updateText(event.target.value)
                resizeTextarea(event.currentTarget)
              }}
              className="min-h-0 h-auto w-full resize-none border-0 bg-transparent p-0 text-center font-mono text-base leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${labelStyle.bg} ${labelStyle.text}`}>
            <span className="inline-flex items-center gap-2 tabular-nums">
              {showSelectionIndicator ? <SelectionIndicator isSelected={isSelected} /> : null}
              {slideIndex + 1}
            </span>
            <span className="ml-auto truncate">{groupLabel}</span>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent align="start">
        <ContextMenuSub>
          <ContextMenuSubTrigger>Group</ContextMenuSubTrigger>
          <ContextMenuSubContent className="p-0">
            <ContextMenuItem
              onClick={() => onGroupChange('custom', undefined)}
              className="py-1.5"
            >
              <span className="flex items-center gap-2">
                <span className={`text-xs ${GROUP_STYLE_CLASSES.custom.dot}`}>●</span>
                Ungrouped
              </span>
            </ContextMenuItem>
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
        <ContextMenuItem onClick={onInsertBefore}>Insert slide before</ContextMenuItem>
        <ContextMenuItem onClick={onInsertAfter}>Insert slide after</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          Delete slide
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onSelectAll}>Select all</ContextMenuItem>
        <ContextMenuItem onClick={onClearSelection}>Clear selection</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SlideGridDragPreview({ slide, slideIndex, meta }: { slide: SongSlide; slideIndex: number; meta?: GridSlideCardMeta }) {
  const labelStyle = meta?.colorClass ?? getGroupLabelStyle(slide.label, slide.customLabel)
  const groupLabel = meta?.isFirstInGroup ? meta.groupLabel : ''
  const preview = (slide.lines ?? []).join('\n')

  return (
    <div
      className={`pointer-events-none w-72 rounded-none border bg-card ${labelStyle.border}`}
    >
      <div className="flex min-h-40 items-center justify-center px-4 py-6 text-center">
        <div className="w-full whitespace-pre-wrap font-mono text-base leading-relaxed text-foreground/90">
          {preview.trim().length > 0 ? preview : '\u00A0'}
        </div>
      </div>
      <div className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${labelStyle.bg} ${labelStyle.text}`}>
        <span className="tabular-nums">{slideIndex + 1}</span>
        <span className="ml-auto truncate">{groupLabel}</span>
      </div>
    </div>
  )
}

function SlideListDragPreview({ slide }: { slide: SongSlide }) {
  const labelStyle =
    (slide.label === 'verse' || slide.label === 'chorus') && slide.customLabel
      ? getNumberedGroupColor(slide.label, slide.customLabel)
      : GROUP_STYLE_CLASSES[slide.label] ?? {
          bg: 'bg-muted',
          text: 'text-foreground',
          border: 'border-border',
          dot: 'text-muted-foreground',
        }
  const labelDisplay = getSlideLabelDisplay(slide)

  return (
    <div className={`pointer-events-none w-full max-w-xl border ${labelStyle.border} bg-card`}>
      {labelDisplay ? (
        <div className={`border-b border-border/10 ${labelStyle.bg} ${labelStyle.text} px-3 py-1 text-xs font-medium`}>
          {labelDisplay}
        </div>
      ) : null}
      <div className="px-3 py-2 font-mono text-sm whitespace-pre-wrap text-foreground/90">
        {(slide.lines ?? []).join('\n') || '\u00A0'}
      </div>
    </div>
  )
}

function AddSlideInlineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      className="w-full"
      data-add-slide-button="true"
    >
      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  )
}

function SelectionIndicator({ isSelected }: { isSelected: boolean }) {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center">
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={2}
        className={`h-4 w-4 ${isSelected ? 'text-current' : 'text-current/40'}`}
        aria-hidden="true"
      />
    </span>
  )
}

// Individual slide block component
interface SlideBlockProps {
  slide: SongSlide
  slideIndex: number
  isSelected: boolean
  showSelectionIndicator: boolean
  meta?: GridSlideCardMeta
  onUpdate: (updates: Partial<SongSlide>) => void
  onDelete: () => void
  onInsertBefore: () => void
  onInsertAfter: () => void
  onSelect: (event: React.MouseEvent<HTMLDivElement>) => void
  onContextSelect: (event: React.MouseEvent<HTMLDivElement>) => void
  onNavigate: (direction: 'up' | 'down', slideId: string, column: number) => void
  onGroupChange: (label: SongSlide['label'], customLabel?: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onFocus: () => void
  onBlur: (event: FocusEvent<HTMLTextAreaElement>) => void
  textareaRef: (node: HTMLTextAreaElement | null) => void
}

function SlideBlock({
  slide,
  slideIndex,
  isSelected,
  showSelectionIndicator,
  meta,
  onUpdate,
  onDelete,
  onInsertBefore,
  onInsertAfter,
  onSelect,
  onContextSelect,
  onNavigate,
  onGroupChange,
  onSelectAll,
  onClearSelection,
  onFocus,
  onBlur,
  textareaRef,
}: SlideBlockProps) {
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null)

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
          data-slide-item="true"
          className={`${isSelected ? 'relative z-10 outline-3 outline-offset-2 outline-primary/80' : ''}`}
          onMouseDown={onSelect}
          onContextMenu={onContextSelect}
        >
          <div className={`rounded-none border ${labelStyle.border} bg-card`}>
            <InputGroup className="border-0 rounded-none focus-within:ring-0">
              <InputGroupTextarea
                ref={(node) => {
                  localTextareaRef.current = node
                  textareaRef(node)
                }}
              onFocus={onFocus}
              onBlur={onBlur}
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
                className="font-mono text-sm min-h-0 h-auto bg-transparent px-3 py-2 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent focus-visible:outline-none"
              />

              <InputGroupAddon align="inline-end" className="items-start self-start pt-2 pr-2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <InputGroupButton
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Slide settings"
                      />
                    }
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="h-4 w-4" />
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px]">
                    <DropdownMenuGroup>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Group</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="p-0">
                        <DropdownMenuItem
                          onClick={() => onGroupChange('custom', undefined)}
                          className="py-1.5"
                        >
                          <span className="flex items-center gap-2">
                            <span className={`text-xs ${GROUP_STYLE_CLASSES.custom.dot}`}>●</span>
                            Ungrouped
                          </span>
                        </DropdownMenuItem>
                          {SLIDE_LABELS.map((label) => (
                            <DropdownMenuItem
                              key={label.value}
                              onClick={() => onGroupChange(label.value, undefined)}
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
                                  onClick={() => onGroupChange(group.value, count)}
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
                    <DropdownMenuItem onClick={onInsertBefore} className="whitespace-nowrap">
                      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                      Insert slide before
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onInsertAfter} className="whitespace-nowrap">
                      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                      Insert slide after
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="whitespace-nowrap text-destructive focus:text-destructive"
                      onClick={onDelete}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                      Delete slide
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </InputGroupAddon>
            </InputGroup>

            <div className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${labelStyle.bg} ${labelStyle.text} border-t border-border/10`}>
              <span className="inline-flex items-center gap-2 tabular-nums">
                {showSelectionIndicator ? <SelectionIndicator isSelected={isSelected} /> : null}
                {slideIndex + 1}
              </span>
              <span className="ml-auto truncate">{meta?.isFirstInGroup ? meta.groupLabel : ''}</span>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent align="start">
        <ContextMenuSub>
          <ContextMenuSubTrigger>Group</ContextMenuSubTrigger>
          <ContextMenuSubContent className="p-0">
            <ContextMenuItem
              onClick={() => onGroupChange('custom', undefined)}
              className="py-1.5"
            >
              <span className="flex items-center gap-2">
                <span className={`text-xs ${GROUP_STYLE_CLASSES.custom.dot}`}>●</span>
                Ungrouped
              </span>
            </ContextMenuItem>
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
        <ContextMenuItem onClick={onInsertBefore}>Insert slide before</ContextMenuItem>
        <ContextMenuItem onClick={onInsertAfter}>Insert slide after</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          Delete slide
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onSelectAll}>Select all</ContextMenuItem>
        <ContextMenuItem onClick={onClearSelection}>Clear selection</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
