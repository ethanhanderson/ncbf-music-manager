"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpDownIcon, MoreHorizontalIcon, Edit01Icon, Delete02Icon, MusicNote03Icon, Download01Icon } from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { EditSongDialogContent } from "@/components/edit-song-dialog-content"
import { DeleteSongDialogContent } from "@/components/delete-song-dialog-content"
import { SongChartsExportDialog } from "@/components/song-charts-export-dialog"
import { cn } from "@/lib/utils"

export type SongRow = {
  id: string
  title: string
  defaultKey?: string | null
  ccliId?: string | null
  artist?: string | null
  linkUrl?: string | null
  groupName: string
  groupSlug: string
  groupId: string
  createdAt: string
  arrangementCount: number
  lastUsedDate: string | null
}

export const columns: ColumnDef<SongRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        aria-checked={
          table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
            ? "mixed"
            : table.getIsAllPageRowsSelected()
        }
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 32,
  },
  {
    accessorKey: "title",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Song
          <HugeiconsIcon
            icon={ArrowUpDownIcon}
            strokeWidth={2}
            className="ml-2 h-4 w-4"
          />
        </Button>
      )
    },
    cell: ({ row }) => {
      const song = row.original
      return (
        <div className="flex items-center gap-2 min-w-0 py-1">
          <span
            className="truncate text-sm font-semibold leading-tight max-w-[220px] sm:max-w-[320px] lg:max-w-[420px]"
            title={song.title}
          >
            {song.title}
          </span>
        </div>
      )
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
    accessorKey: "arrangementCount",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Arrangements
          <HugeiconsIcon
            icon={ArrowUpDownIcon}
            strokeWidth={2}
            className="ml-2 h-4 w-4"
          />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground">
        {row.original.arrangementCount}
      </div>
    ),
  },
  {
    accessorKey: "lastUsedDate",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Last used
          <HugeiconsIcon
            icon={ArrowUpDownIcon}
            strokeWidth={2}
            className="ml-2 h-4 w-4"
          />
        </Button>
      )
    },
    cell: ({ row }) => {
      const lastUsed = row.original.lastUsedDate
      return (
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {lastUsed ? new Date(lastUsed).toLocaleDateString() : "Never"}
        </div>
      )
    },
    filterFn: (row, id, value) => {
      const filter = value as "all" | "recent-30" | "recent-90" | "never"
      if (!filter || filter === "all") return true

      const lastUsed = row.getValue<string | null>(id)
      if (filter === "never") {
        return !lastUsed
      }
      if (!lastUsed) return false

      const now = Date.now()
      const windowMs = filter === "recent-30"
        ? 1000 * 60 * 60 * 24 * 30
        : 1000 * 60 * 60 * 24 * 90
      const usedAt = new Date(lastUsed).getTime()
      return now - usedAt <= windowMs
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Added
          <HugeiconsIcon
            icon={ArrowUpDownIcon}
            strokeWidth={2}
            className="ml-2 h-4 w-4"
          />
        </Button>
      )
    },
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground whitespace-nowrap">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </div>
    ),
    filterFn: (row, id, value) => {
      const timeframe = value as "all" | "7d" | "30d"
      if (!timeframe || timeframe === "all") return true

      const now = Date.now()
      const windowMs =
        timeframe === "7d"
          ? 1000 * 60 * 60 * 24 * 7
          : timeframe === "30d"
            ? 1000 * 60 * 60 * 24 * 30
            : null
      if (!windowMs) return true

      const created = new Date(row.getValue<string>(id)).getTime()
      return now - created <= windowMs
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const song = row.original
      return <SongActionsCell song={song} />
    },
  },
]

function SongActionsCell({ song }: { song: SongRow }) {
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  const handleEditSuccess = () => {
    setEditDialogOpen(false)
    router.refresh()
  }

  const handleDeleteSuccess = () => {
    setDeleteDialogOpen(false)
    router.refresh()
  }

  return (
    <>
      <SongChartsExportDialog
        songIds={[song.id]}
        label={`${song.title} charts`}
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
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
                setExportDialogOpen(true)
              }}
            >
              <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
              Export charts
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
                router.push(`/groups/${song.groupSlug}`)
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
          <EditSongDialogContent
            songId={song.id}
            groupId={song.groupId}
            groupSlug={song.groupSlug}
            initialTitle={song.title}
            initialDefaultKey={song.defaultKey}
            initialCcliId={song.ccliId}
            initialArtist={song.artist}
            initialLinkUrl={song.linkUrl}
            onSuccess={handleEditSuccess}
            onCancel={() => setEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent size="sm">
          <DeleteSongDialogContent
            songId={song.id}
            groupId={song.groupId}
            groupSlug={song.groupSlug}
            songTitle={song.title}
            onSuccess={handleDeleteSuccess}
            onCancel={() => setDeleteDialogOpen(false)}
          />
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

