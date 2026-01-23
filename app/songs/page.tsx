export const revalidate = 60

import Link from 'next/link'
import { SongCatalogActions } from '@/components/song-catalog-actions'
import { getGroups } from '@/lib/actions/groups'
import { getAllSongsWithGroupsWithStats } from '@/lib/actions/songs'
import { columns, type SongRow } from './columns'
import { SongsCatalogTable } from './songs-catalog-table'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface SongsCatalogPageProps {
  searchParams: Promise<{ q?: string; group?: string }>
}

export default async function SongsCatalogPage({ searchParams }: SongsCatalogPageProps) {
  const { q, group } = await searchParams

  const groups = await getGroups()
  const targetGroup = groups.find((g) => g.slug === group)
  const songsWithGroups = await getAllSongsWithGroupsWithStats({
    search: q,
    groupIds: targetGroup ? [targetGroup.id] : undefined,
  })

  const songRows: SongRow[] = songsWithGroups.map((song) => ({
    id: song.id,
    title: song.title,
    defaultKey: song.default_key,
    ccliId: song.ccli_id,
    artist: song.artist,
    linkUrl: song.link_url,
    groupName: song.music_groups?.name ?? 'Unknown Group',
    groupSlug: song.music_groups?.slug ?? song.group_id,
    groupId: song.group_id,
    createdAt: song.created_at,
    arrangementCount: song.arrangementCount,
    lastUsedDate: song.lastUsedDate,
  }))

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card print:hidden">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/">Home</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Songs Catalog</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">All Songs</h1>
              <p className="text-sm text-muted-foreground">
                Browse every song across your worship groups with fast filters and search.
              </p>
            </div>
            {groups.length > 0 && <SongCatalogActions groups={groups} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <SongsCatalogTable
          columns={columns}
          data={songRows}
          groups={groups.map((g) => ({ slug: g.slug, name: g.name }))}
          rowHrefTemplate="/groups/:groupSlug/songs/:id"
          rowAriaLabel="Open song"
        />
      </main>
    </div>
  )
}
