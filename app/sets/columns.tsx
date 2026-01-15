"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpDownIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
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

export const columns: ColumnDef<SetRow>[] = [
  {
    accessorKey: "serviceDate",
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 px-2 text-xs uppercase tracking-wide text-muted-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Service date
        <HugeiconsIcon icon={ArrowUpDownIcon} strokeWidth={2} className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const dateLabel = formatServiceDate(row.original.serviceDate)
      return <div className="text-sm font-medium whitespace-nowrap">{dateLabel}</div>
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
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 px-2 text-xs uppercase tracking-wide text-muted-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Songs
        <HugeiconsIcon icon={ArrowUpDownIcon} strokeWidth={2} className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground">{row.original.songCount}</div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.status === "upcoming" ? "default" : "secondary"}>
        {row.original.status === "upcoming" ? "Upcoming" : "Past"}
      </Badge>
    ),
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
      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "p-0")}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <span className="sr-only">Open menu</span>
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  navigator.clipboard.writeText(
                    `/groups/${set.groupSlug}/sets/${set.id}`
                  )
                }
              >
                Copy link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => (window.location.href = `/groups/${set.groupSlug}/sets/${set.id}`)}
              >
                View set
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => (window.location.href = `/groups/${set.groupSlug}`)}>
                View group
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
