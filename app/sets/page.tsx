export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getGroups } from '@/lib/actions/groups'
import { getAllSetsWithGroups } from '@/lib/actions/sets'
import { columns, type SetRow } from './columns'
import { DataTable } from './data-table'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface SetsCatalogPageProps {
  searchParams: Promise<{ q?: string; group?: string; status?: string; range?: string }>
}

export default async function SetsCatalogPage({ searchParams }: SetsCatalogPageProps) {
  const { q, group, status, range } = await searchParams

  const groups = await getGroups()
  const targetGroup = groups.find((g) => g.slug === group)
  const setsWithGroups = await getAllSetsWithGroups({
    groupIds: targetGroup ? [targetGroup.id] : undefined,
  })
  const today = new Date().toISOString().split('T')[0]

  const setRows: SetRow[] = setsWithGroups.map((set) => ({
    id: set.id,
    serviceDate: set.service_date,
    createdAt: set.created_at,
    groupName: set.music_groups?.name ?? 'Unknown Group',
    groupSlug: set.music_groups?.slug ?? set.group_id,
    songCount: set.songCount,
    status: set.service_date >= today ? 'upcoming' : 'past',
    notes: set.notes ?? '',
  }))

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/">Home</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Sets Catalog</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="mt-3">
            <h1 className="text-2xl font-bold tracking-tight">All Sets</h1>
            <p className="text-sm text-muted-foreground">
              Review every scheduled set and filter by group, status, or timeframe.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <DataTable
          columns={columns}
          data={setRows}
          groups={groups.map((g) => ({ slug: g.slug, name: g.name }))}
          initialSearch={q ?? ''}
          initialGroup={group ?? 'all'}
          initialStatus={status ?? 'all'}
          initialRange={range ?? 'all'}
          rowHrefTemplate="/groups/:groupSlug/sets/:id"
          rowAriaLabel="Open set"
        />
      </main>
    </div>
  )
}
