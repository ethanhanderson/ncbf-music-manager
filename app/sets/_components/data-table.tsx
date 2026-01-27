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
import { CalendarAdd01Icon, Layers01Icon, MusicNote03Icon } from "@hugeicons/core-free-icons"

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  groups?: { slug: string; name: string }[]
  initialSearch?: string
  initialGroup?: string
  initialStatus?: string
  initialRange?: string
  /**
   * Optional row navigation, built client-side from a serializable template.
   * Example: "/groups/:groupSlug/sets/:id"
   */
  rowHrefTemplate?: string
  /** Accessible label for the row link. Defaults to "Open row". */
  rowAriaLabel?: string
}

const SETS_TABLE_PAGE_SIZE_STORAGE_KEY = "ncbf:setsTable:pageSize"
const SETS_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const

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
  return Boolean(target.closest("a,button,input,textarea,select,option,[role='button'],[data-row-click-ignore]"))
}

function getInitialSetsTablePageSize(): number {
  try {
    const raw = localStorage.getItem(SETS_TABLE_PAGE_SIZE_STORAGE_KEY)
    const parsed = Number(raw)
    if (SETS_TABLE_PAGE_SIZE_OPTIONS.includes(parsed as (typeof SETS_TABLE_PAGE_SIZE_OPTIONS)[number])) {
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
  initialSearch = "",
  initialGroup = "all",
  initialStatus = "all",
  initialRange = "all",
  rowHrefTemplate,
  rowAriaLabel = "Open row",
}: DataTableProps<TData, TValue>) {
  const router = useRouter()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(() => [
    { id: "groupSlug", value: initialGroup },
    { id: "status", value: initialStatus },
    { id: "serviceDate", value: initialRange },
  ])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => ({
    groupSlug: true,
  }))
  const [globalFilter, setGlobalFilter] = React.useState(initialSearch)
  const [pagination, setPagination] = React.useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize: getInitialSetsTablePageSize(),
  }))

  React.useEffect(() => {
    try {
      localStorage.setItem(SETS_TABLE_PAGE_SIZE_STORAGE_KEY, String(pagination.pageSize))
    } catch {
      // Ignore storage errors
    }
  }, [pagination.pageSize])

  // TanStack Table currently relies on non-memoizable functions; opt out of this lint
  // until a compatible version is available.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      pagination,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const term = String(filterValue ?? "").trim().toLowerCase()
      if (!term) return true

      const original = row.original as Record<string, unknown>
      const groupName = String(original.groupName ?? "").toLowerCase()
      const notes = String(original.notes ?? "").toLowerCase()
      const serviceDate = String(original.serviceDate ?? "").toLowerCase()

      return groupName.includes(term) || notes.includes(term) || serviceDate.includes(term)
    },
  })

  const groupFilterValue = (table.getColumn("groupSlug")?.getFilterValue() as string) ?? "all"
  const statusValue = (table.getColumn("status")?.getFilterValue() as string) ?? "all"
  const rangeValue = (table.getColumn("serviceDate")?.getFilterValue() as string) ?? "all"

  const additionalColumnFilters = columnFilters.filter(
    (f) => !["groupSlug", "status", "serviceDate"].includes(f.id)
  ).length

  const filtersActive =
    (globalFilter ? 1 : 0) +
    (groupFilterValue !== "all" ? 1 : 0) +
    (statusValue !== "all" ? 1 : 0) +
    (rangeValue !== "all" ? 1 : 0) +
    additionalColumnFilters

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full items-center gap-2 sm:max-w-[520px]">
          <Input
            placeholder="Search sets..."
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

                <InputGroup className="h-10 w-full">
                  <InputGroupAddon className="border-r border-border pr-3 w-32 justify-start gap-2 whitespace-nowrap">
                    <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="text-muted-foreground size-4" />
                    <span>Status</span>
                  </InputGroupAddon>
                  <Select
                    value={statusValue}
                    onValueChange={(value) => table.getColumn("status")?.setFilterValue(value)}
                  >
                    <SelectTrigger
                      data-slot="input-group-control"
                      className="h-10 w-full border-0 bg-transparent px-2 shadow-none ring-0 focus-visible:ring-0 data-[size=default]:h-10"
                    >
                      <SelectValue placeholder="All status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All status</SelectItem>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="past">Past</SelectItem>
                    </SelectContent>
                  </Select>
                </InputGroup>

                <InputGroup className="h-10 w-full">
                  <InputGroupAddon className="border-r border-border pr-3 w-32 justify-start gap-2 whitespace-nowrap">
                    <HugeiconsIcon icon={CalendarAdd01Icon} strokeWidth={2} className="text-muted-foreground size-4" />
                    <span>Service date</span>
                  </InputGroupAddon>
                  <Select
                    value={rangeValue}
                    onValueChange={(value) => table.getColumn("serviceDate")?.setFilterValue(value)}
                  >
                    <SelectTrigger
                      data-slot="input-group-control"
                      className="h-10 w-full border-0 bg-transparent px-2 shadow-none ring-0 focus-visible:ring-0 data-[size=default]:h-10"
                    >
                      <SelectValue placeholder="All dates" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All dates</SelectItem>
                      <SelectItem value="next-30">Next 30 days</SelectItem>
                      <SelectItem value="next-90">Next 90 days</SelectItem>
                      <SelectItem value="past-30">Past 30 days</SelectItem>
                      <SelectItem value="past-90">Past 90 days</SelectItem>
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
        <div className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} set(s)
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
                {SETS_TABLE_PAGE_SIZE_OPTIONS.map((size) => (
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
