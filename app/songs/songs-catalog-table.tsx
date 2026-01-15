"use client"

import { useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "./data-table"
import type { SongRow } from "./columns"

interface SongsCatalogTableProps {
  columns: ColumnDef<SongRow, unknown>[]
  data: SongRow[]
  groups?: { slug: string; name: string }[]
  showGroupFilter?: boolean
  initialSearch?: string
  rowHrefTemplate?: string
  rowAriaLabel?: string
}

export function SongsCatalogTable(props: SongsCatalogTableProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return <DataTable {...props} />
}
