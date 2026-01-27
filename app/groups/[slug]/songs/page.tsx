export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGroupBySlug } from '@/lib/actions/groups'
import { getSongsWithStats } from '@/lib/actions/songs'
import { CreateSongDialog } from '@/components/create-song-dialog'
import { BulkUploadDialog } from '@/components/bulk-upload-dialog'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { columns, type SongRow } from '@/app/songs/_components/columns'
import { SongsCatalogTable } from '@/app/songs/_components/songs-catalog-table'

interface SongsPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string }>
}

export default async function GroupSongsPage({ params, searchParams }: SongsPageProps) {
  const { slug } = await params
  const { q } = await searchParams

  const group = await getGroupBySlug(slug)
  if (!group) {
    notFound()
  }

  const songs = await getSongsWithStats(group.id, q)
  const songRows: SongRow[] = songs.map((song) => ({
    id: song.id,
    title: song.title,
    defaultKey: song.default_key,
    ccliId: song.ccli_id,
    artist: song.artist,
    linkUrl: song.link_url,
    groupName: group.name,
    groupSlug: group.slug,
    groupId: group.id,
    createdAt: song.created_at ?? '',
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
                <BreadcrumbLink render={<Link href={`/groups/${slug}`}>{group.name}</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Songs</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">{group.name} Songs</h1>
            <div className="flex gap-2">
              <BulkUploadDialog groupId={group.id} groupSlug={group.slug} />
              <CreateSongDialog groupId={group.id} groupSlug={group.slug} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <SongsCatalogTable
          columns={columns}
          data={songRows}
          initialSearch={q ?? ''}
          showGroupFilter={false}
          rowHrefTemplate="/groups/:groupSlug/songs/:id"
          rowAriaLabel="Open song"
        />

        {songs.length === 0 && (
          <p className="text-sm text-muted-foreground mt-6 text-center">
            No songs for {group.name} yet. Add a song to get started.
          </p>
        )}
      </main>
    </div>
  )
}
