export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGroupBySlug } from '@/lib/actions/groups'
import { getSongById, getSongAssets, getSongUsageInfo } from '@/lib/actions/songs'
import { getSongArrangements } from '@/lib/actions/song-arrangements'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EditSongDialog } from '@/components/edit-song-dialog'
import { DeleteSongButton } from '@/components/delete-song-button'
import { SongSlideArrangements } from '@/components/song-slide-arrangements'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CalendarAdd01Icon,
  CheckmarkCircle02Icon,
  Layers01Icon,
  MusicNote03Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'

interface SongPageProps {
  params: Promise<{ slug: string; songId: string }>
}

export default async function SongPage({ params }: SongPageProps) {
  const { slug, songId } = await params
  const group = await getGroupBySlug(slug)
  if (!group) {
    notFound()
  }

  const [song, assets, arrangements, usage] = await Promise.all([
    getSongById(songId, group.id),
    getSongAssets(songId),
    getSongArrangements(songId, group.id),
    getSongUsageInfo(songId, group.id),
  ])

  if (!song || song.group_id !== group.id) {
    notFound()
  }

  const defaultArrangement =
    arrangements.find((arrangement) => arrangement.name.toLowerCase() === 'default') ?? arrangements[0]
  const slidesCount = defaultArrangement?.slides?.length ?? 0
  const topArrangements = usage.arrangementCounts
    .map((entry) => {
      const arrangement = entry.arrangementId
        ? arrangements.find((item) => item.id === entry.arrangementId)
        : null
      return {
        arrangementId: entry.arrangementId,
        name: arrangement?.name ?? (entry.arrangementId ? 'Unknown arrangement' : 'No arrangement'),
        count: entry.count,
      }
    })
    .slice(0, 5)

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
                <BreadcrumbLink render={<Link href={`/groups/${slug}`}>{group.name}</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/groups/${slug}/songs`}>Songs</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate max-w-48">{song.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          
          <div className="flex items-start justify-between mt-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">{song.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-none gap-1.5">
                  <HugeiconsIcon icon={CalendarAdd01Icon} strokeWidth={2} className="h-3.5 w-3.5" />
                  Created {formatDateShort(song.created_at)}
                </Badge>
                {usage.lastUsedDate && (
                  <Badge variant="outline" className="rounded-none gap-1.5">
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="h-3.5 w-3.5" />
                    Last used {formatDateShort(usage.lastUsedDate)}
                  </Badge>
                )}
                {usage.upcomingUses > 0 && (
                  <Badge variant="outline" className="rounded-none gap-1.5">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="h-3.5 w-3.5" />
                    Upcoming set{usage.upcomingUses !== 1 ? 's' : ''} ({usage.upcomingUses})
                  </Badge>
                )}
                <Badge variant="outline" className="rounded-none gap-1.5">
                  <HugeiconsIcon icon={MusicNote03Icon} strokeWidth={2} className="h-3.5 w-3.5" />
                  {slidesCount} slide{slidesCount !== 1 ? 's' : ''}
                </Badge>
                <Badge variant="outline" className="rounded-none gap-1.5">
                  <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="h-3.5 w-3.5" />
                  {arrangements.length} arrangement{arrangements.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <EditSongDialog song={song} groupSlug={slug} />
              <DeleteSongButton songId={song.id} groupId={group.id} groupSlug={slug} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <section className="space-y-6 lg:col-span-2">
            <SongSlideArrangements
              songId={song.id}
              groupId={group.id}
              groupSlug={slug}
              arrangements={arrangements}
            />
          </section>

          <aside className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total uses</span>
                  <span className="font-medium">{usage.totalUses}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Upcoming sets</span>
                  <span className="font-medium">{usage.upcomingUses}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">First used</span>
                  <span className="font-medium">
                    {usage.firstUsedDate ? formatDate(usage.firstUsedDate) : 'Not yet used'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last used</span>
                  <span className="font-medium">
                    {usage.lastUsedDate ? formatDate(usage.lastUsedDate) : 'Not yet used'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top arrangements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {topArrangements.length === 0 ? (
                  <p className="text-muted-foreground">No set usage yet.</p>
                ) : (
                  topArrangements.map((entry) => (
                    <div key={entry.arrangementId ?? entry.name} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-medium">{entry.count}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  )
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateShort(dateString: string): string {
  const base = dateString.includes('T') ? dateString : `${dateString}T00:00:00`
  const date = new Date(base)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
