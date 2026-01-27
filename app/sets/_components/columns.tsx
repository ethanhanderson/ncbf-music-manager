"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown04Icon, ArrowUp04Icon, ArrowUpDownIcon, MoreHorizontalIcon, Edit01Icon, Delete02Icon, MusicNote03Icon, CalendarAdd01Icon, Download01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"

import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
} from "@/components/ui/alert-dialog"
import { EditSetDialogContent } from "@/components/edit-set-dialog-content"
import { DeleteSetDialogContent } from "@/components/delete-set-dialog-content"
import { SetChartsExportDialog } from "@/components/set-charts-export-dialog"
import { cn } from "@/lib/utils"

export type SetRow = {
  id: string
  serviceDate: string
  createdAt: string
  groupName: string
  groupSlug: string
  songCount: number
  status: "upcoming" | "past"
  notes: string
}

function formatServiceDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00")
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function formatExportDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00")
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export const columns: ColumnDef<SetRow>[] = [
  {
    accessorKey: "serviceDate",
    header: ({ column }) => {
      const sort = column.getIsSorted()
      const icon = sort === "asc" ? ArrowUp04Icon : sort === "desc" ? ArrowDown04Icon : ArrowUpDownIcon

      return (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 px-2 text-xs uppercase tracking-wide text-muted-foreground"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Service date
          <HugeiconsIcon icon={icon} strokeWidth={2} className="h-4 w-4" />
        </button>
      )
    },
    cell: ({ row }) => {
      const dateLabel = formatServiceDate(row.original.serviceDate)
      return <div className="px-2 text-sm font-medium whitespace-nowrap">{dateLabel}</div>
    },
    filterFn: (row, id, value) => {
      const timeframe = value as "all" | "next-30" | "next-90" | "past-30" | "past-90"
      if (!timeframe || timeframe === "all") return true

      const date = new Date(row.getValue<string>(id) + "T00:00:00")
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const windowMs =
        timeframe === "next-30" || timeframe === "past-30"
          ? 1000 * 60 * 60 * 24 * 30
          : timeframe === "next-90" || timeframe === "past-90"
            ? 1000 * 60 * 60 * 24 * 90
            : null

      if (!windowMs) return true

      if (timeframe.startsWith("next")) {
        return date >= today && date.getTime() - today.getTime() <= windowMs
      }

      const diff = today.getTime() - date.getTime()
      return date < today && diff <= windowMs
    },
  },
  {
    accessorKey: "groupSlug",
    header: "Group",
    cell: ({ row }) => <div className="text-sm">{row.original.groupName}</div>,
    filterFn: (row, id, value) => {
      if (!value || value === "all") return true
      return row.getValue<string>(id) === value
    },
  },
  {
    accessorKey: "songCount",
    header: ({ column }) => {
      const sort = column.getIsSorted()
      const icon = sort === "asc" ? ArrowUp04Icon : sort === "desc" ? ArrowDown04Icon : ArrowUpDownIcon

      return (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 px-2 text-xs uppercase tracking-wide text-muted-foreground"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Songs
          <HugeiconsIcon icon={icon} strokeWidth={2} className="h-4 w-4" />
        </button>
      )
    },
    cell: ({ row }) => (
      <div className="px-2 text-sm text-muted-foreground">{row.original.songCount}</div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const isUpcoming = row.original.status === "upcoming"
      return (
        <div className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
          <HugeiconsIcon icon={isUpcoming ? CalendarAdd01Icon : CheckmarkCircle02Icon} strokeWidth={2} className="h-3.5 w-3.5" />
          <span>{isUpcoming ? "Upcoming" : "Past"}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      if (!value || value === "all") return true
      return row.getValue<string>(id) === value
    },
  },
  {
    accessorKey: "notes",
    header: "Notes",
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground line-clamp-2">
        {row.original.notes || "—"}
      </div>
    ),
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const set = row.original
      return <SetActionsCell set={set} />
    },
  },
]

function SetActionsCell({ set }: { set: SetRow }) {
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportSongs, setExportSongs] = useState<Array<{
    songId: string
    title: string
    arrangementId: string | null
    position: number
  }> | null>(null)
  const [exportSongsError, setExportSongsError] = useState<string | null>(null)
  const [isLoadingExportSongs, setIsLoadingExportSongs] = useState(false)

  const handleEditSuccess = () => {
    setEditDialogOpen(false)
    router.refresh()
  }

  const handleDeleteSuccess = () => {
    setDeleteDialogOpen(false)
    router.refresh()
  }

  const handleExportOpenChange = (nextOpen: boolean) => {
    setExportDialogOpen(nextOpen)
    if (!nextOpen) {
      setExportSongsError(null)
    }
  }

  const handleExportClick = async () => {
    if (isLoadingExportSongs) return
    if (exportSongs) {
      setExportDialogOpen(true)
      return
    }

    setIsLoadingExportSongs(true)
    setExportSongsError(null)
    try {
      const response = await fetch(`/api/sets/${set.id}/export-data`)
      if (!response.ok) {
        throw new Error('Failed to load set songs.')
      }
      const payload = await response.json()
      const nextSongs = Array.isArray(payload?.songs) ? payload.songs : []
      setExportSongs(nextSongs)
      setExportDialogOpen(true)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to load set songs.'
      setExportSongsError(message)
      setExportDialogOpen(true)
    } finally {
      setIsLoadingExportSongs(false)
    }
  }

  return (
    <>
      <SetChartsExportDialog
        setId={set.id}
        setTitle={formatExportDate(set.serviceDate)}
        open={exportDialogOpen}
        onOpenChange={handleExportOpenChange}
        songs={exportSongs ?? []}
        autoFetch={false}
        prefetchError={exportSongsError}
        hideTrigger={true}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          data-row-click-ignore
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "p-0")}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span className="sr-only">Open menu</span>
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          data-row-click-ignore
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuGroup onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel onClick={(e) => e.stopPropagation()}>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                void handleExportClick()
              }}
              disabled={isLoadingExportSongs}
            >
              <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
              {isLoadingExportSongs ? "Loading charts..." : "Export charts"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                setEditDialogOpen(true)
              }}
            >
              <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteDialogOpen(true)
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
            <DropdownMenuSeparator onClick={(e) => e.stopPropagation()} />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/groups/${set.groupSlug}`)
              }}
            >
              <HugeiconsIcon icon={MusicNote03Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
              View group
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <EditSetDialogContent
            setId={set.id}
            initialServiceDate={set.serviceDate}
            initialNotes={set.notes || null}
            onSuccess={handleEditSuccess}
            onCancel={() => setEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent size="sm">
          <DeleteSetDialogContent
            setId={set.id}
            onSuccess={handleDeleteSuccess}
            onCancel={() => setDeleteDialogOpen(false)}
          />
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
