"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"

import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpDownIcon, MusicNote03Icon, MoreHorizontalIcon, Loading01Icon, Layers01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createDefaultArrangementsForSongs } from "@/lib/actions/song-arrangements"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  groups?: { slug: string; name: string }[]
  showGroupFilter?: boolean
  initialSearch?: string
  /**
   * Optional row navigation, built client-side from a serializable template.
   * Example: "/groups/:groupSlug/songs/:id"
   */
  rowHrefTemplate?: string
  /** Accessible label for the row link. Defaults to "Open row". */
  rowAriaLabel?: string
}

const SONGS_TABLE_PAGE_SIZE_STORAGE_KEY = "ncbf:songsTable:pageSize"
const SONGS_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const

function buildHrefFromTemplate<T extends Record<string, unknown>>(template: string, row: T): string | null {
  let missing = false
  const href = template.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
    const value = row[key]
    if (value === undefined || value === null) {
      missing = true
      return ""
    }
    return encodeURIComponent(String(value))
  })

  return missing ? null : href
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest("a,button,input,textarea,select,option,[role='button'],[data-row-click-ignore='true']"))
}

function getInitialSongsTablePageSize(): number {
  try {
    const raw = localStorage.getItem(SONGS_TABLE_PAGE_SIZE_STORAGE_KEY)
    const parsed = Number(raw)
    if (SONGS_TABLE_PAGE_SIZE_OPTIONS.includes(parsed as (typeof SONGS_TABLE_PAGE_SIZE_OPTIONS)[number])) {
      return parsed
    }
  } catch {
    // Ignore storage errors (private mode, blocked storage, etc.)
  }

  return 10
}

export function DataTable<TData, TValue>({
  columns,
  data,
  groups = [],
  showGroupFilter = true,
  initialSearch = "",
  rowHrefTemplate,
  rowAriaLabel = "Open row",
}: DataTableProps<TData, TValue>) {
  const router = useRouter()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => ({
    groupSlug: showGroupFilter,
  }))
  const [rowSelection, setRowSelection] = React.useState({})
  const [globalFilter, setGlobalFilter] = React.useState(initialSearch)
  const [isBulkActionLoading, setIsBulkActionLoading] = React.useState(false)
  const [bulkActionResult, setBulkActionResult] = React.useState<{ created: number; skipped: number } | null>(null)
  const [pagination, setPagination] = React.useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize: getInitialSongsTablePageSize(),
  }))

  React.useEffect(() => {
    try {
      localStorage.setItem(SONGS_TABLE_PAGE_SIZE_STORAGE_KEY, String(pagination.pageSize))
    } catch {
      // Ignore storage errors
    }
  }, [pagination.pageSize])

  // Clear bulk action result after a delay
  React.useEffect(() => {
    if (bulkActionResult) {
      const timer = setTimeout(() => setBulkActionResult(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [bulkActionResult])

  // TanStack Table currently relies on non-memoizable functions; opt out of this lint
  // until a compatible version is available.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const term = String(filterValue ?? "").trim().toLowerCase()
      if (!term) return true

      // Try to match across the key song fields we render in the catalog
      const title = String(row.getValue("title") ?? "").toLowerCase()
      const groupSlug = String(row.getValue("groupSlug") ?? "").toLowerCase()
      // Note: artist/groupName are not guaranteed accessor keys on generic rows,
      // so we just match what we can without risking runtime errors.
      return title.includes(term) || groupSlug.includes(term)
    },
  })

  const groupFilterValue = (table.getColumn("groupSlug")?.getFilterValue() as string) ?? "all"
  const timeframeValue = (table.getColumn("createdAt")?.getFilterValue() as string) ?? "all"
  const usageValue = (table.getColumn("lastUsedDate")?.getFilterValue() as string) ?? "all"

  const additionalColumnFilters = columnFilters.filter(
    (f) => f.id !== "groupSlug" && f.id !== "createdAt" && f.id !== "lastUsedDate"
  ).length

  const filtersActive =
    (globalFilter ? 1 : 0) +
    (showGroupFilter && groupFilterValue !== "all" ? 1 : 0) +
    (timeframeValue !== "all" ? 1 : 0) +
    (usageValue !== "all" ? 1 : 0) +
    additionalColumnFilters

  // Get selected song IDs
  const getSelectedSongIds = (): string[] => {
    return table.getFilteredSelectedRowModel().rows
      .map(row => {
        const original = row.original as Record<string, unknown>
        return original.id as string
      })
      .filter(Boolean)
  }

  // Get group slug for revalidation (use first selected row's groupSlug)
  const getSelectedGroupSlug = (): string => {
    const firstSelected = table.getFilteredSelectedRowModel().rows[0]
    if (firstSelected) {
      const original = firstSelected.original as Record<string, unknown>
      return (original.groupSlug as string) || ''
    }
    return ''
  }

  // Handle bulk create default arrangements
  const handleBulkCreateArrangements = async () => {
    const songIds = getSelectedSongIds()
    if (songIds.length === 0) return

    setIsBulkActionLoading(true)
    setBulkActionResult(null)

    try {
      const groupSlug = getSelectedGroupSlug()
      const result = await createDefaultArrangementsForSongs(songIds, groupSlug)
      
      if (result.success) {
        setBulkActionResult({ created: result.created, skipped: result.skipped })
        setRowSelection({})
        router.refresh()
      }
    } catch (error) {
      console.error('Bulk action failed:', error)
    } finally {
      setIsBulkActionLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full items-center gap-2 sm:max-w-[520px]">
          <Input
            placeholder="Search songs..."
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="h-10"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" className="h-10 px-3">
                  <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                  Filters
                  {filtersActive > 0 && (
                    <span className="ml-2 rounded-none bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {filtersActive}
                    </span>
                  )}
                </Button>
              }
            />
            <PopoverContent align="end" className="w-[340px]">
              <div className="flex flex-col gap-3">
                {showGroupFilter && (
                  <InputGroup className="h-10 w-full">
                    <InputGroupAddon className="border-r border-border pr-3 w-32 justify-start gap-2 whitespace-nowrap">
                      <HugeiconsIcon icon={MusicNote03Icon} strokeWidth={2} className="text-muted-foreground size-4" />
                      <span>Group</span>
                    </InputGroupAddon>
                    <Select
                      value={groupFilterValue}
                      onValueChange={(value) => table.getColumn("groupSlug")?.setFilterValue(value)}
                    >
                      <SelectTrigger
                        data-slot="input-group-control"
                        className="h-10 w-full border-0 bg-transparent px-2 shadow-none ring-0 focus-visible:ring-0 data-[size=default]:h-10"
                      >
                        <SelectValue placeholder="All groups" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All groups</SelectItem>
                        {groups.map((g) => (
                          <SelectItem key={g.slug} value={g.slug}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InputGroup>
                )}

                <InputGroup className="h-10 w-full">
                  <InputGroupAddon className="border-r border-border pr-3 w-32 justify-start gap-2 whitespace-nowrap">
                    <HugeiconsIcon icon={ArrowUpDownIcon} strokeWidth={2} className="text-muted-foreground size-4" />
                    <span>Added</span>
                  </InputGroupAddon>
                  <Select
                    value={timeframeValue}
                    onValueChange={(value) => table.getColumn("createdAt")?.setFilterValue(value)}
                  >
                    <SelectTrigger
                      data-slot="input-group-control"
                      className="h-10 w-full border-0 bg-transparent px-2 shadow-none ring-0 focus-visible:ring-0 data-[size=default]:h-10"
                    >
                      <SelectValue placeholder="All time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                    </SelectContent>
                  </Select>
                </InputGroup>

                <InputGroup className="h-10 w-full">
                  <InputGroupAddon className="border-r border-border pr-3 w-32 justify-start gap-2 whitespace-nowrap">
                    <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="text-muted-foreground size-4" />
                    <span>Usage</span>
                  </InputGroupAddon>
                  <Select
                    value={usageValue}
                    onValueChange={(value) => table.getColumn("lastUsedDate")?.setFilterValue(value)}
                  >
                    <SelectTrigger
                      data-slot="input-group-control"
                      className="h-10 w-full border-0 bg-transparent px-2 shadow-none ring-0 focus-visible:ring-0 data-[size=default]:h-10"
                    >
                      <SelectValue placeholder="All usage" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All usage</SelectItem>
                      <SelectItem value="recent-30">Used in last 30 days</SelectItem>
                      <SelectItem value="recent-90">Used in last 90 days</SelectItem>
                      <SelectItem value="never">Never used</SelectItem>
                    </SelectContent>
                  </Select>
                </InputGroup>

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    className="h-9 px-3"
                    disabled={filtersActive === 0}
                    onClick={() => {
                      setGlobalFilter("")
                      table.resetColumnFilters()
                      table.resetSorting()
                      table.resetRowSelection()
                    }}
                  >
                    Reset filters
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className="px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const href =
                  rowHrefTemplate && typeof row.original === "object" && row.original !== null
                    ? buildHrefFromTemplate(rowHrefTemplate, row.original as Record<string, unknown>)
                    : null

                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={[
                      "border-b transition-colors hover:bg-muted/40",
                      href ? "cursor-pointer" : "",
                    ].join(" ")}
                    role={href ? "link" : undefined}
                    tabIndex={href ? 0 : undefined}
                    aria-label={href ? rowAriaLabel : undefined}
                    onClick={(e) => {
                      if (!href) return
                      if (isInteractiveTarget(e.target)) return

                      if (e.metaKey || e.ctrlKey) {
                        window.open(href, "_blank", "noopener,noreferrer")
                        return
                      }

                      router.push(href)
                    }}
                    onKeyDown={(e) => {
                      if (!href) return
                      if (e.key !== "Enter" && e.key !== " ") return
                      e.preventDefault()
                      router.push(href)
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-4 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-muted-foreground text-sm">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </span>
          
          {/* Bulk Actions */}
          {table.getFilteredSelectedRowModel().rows.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isBulkActionLoading}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 rounded-none px-3"
              >
                {isBulkActionLoading ? (
                  <>
                    <HugeiconsIcon icon={Loading01Icon} strokeWidth={2} className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="h-4 w-4" />
                    Bulk Actions
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {table.getFilteredSelectedRowModel().rows.length} song(s) selected
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBulkCreateArrangements}>
                  <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                  Create Default Arrangements
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Bulk action result feedback */}
          {bulkActionResult && (
            <span className="text-sm text-muted-foreground">
              Created {bulkActionResult.created}, skipped {bulkActionResult.skipped}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => {
                const nextSize = Number(value)
                if (!Number.isFinite(nextSize)) return
                setPagination((prev) => ({ ...prev, pageIndex: 0, pageSize: nextSize }))
              }}
            >
              <SelectTrigger className="h-9 w-[90px] data-[size=default]:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SONGS_TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

