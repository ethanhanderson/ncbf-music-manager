import Link from 'next/link'
import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import { getGroupBySlug } from '@/lib/actions/groups'
import { getSongById, getSongUsageInfo } from '@/lib/actions/songs'
import { getSongRevisions } from '@/lib/actions/song-revisions'
import { getSongArrangements, getSongSlides } from '@/lib/actions/song-arrangements'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EditSongDialog } from '@/components/edit-song-dialog'
import { DeleteSongButton } from '@/components/delete-song-button'
const SongSlideArrangements = dynamic(
  () =>
    import('@/components/song-slide-arrangements').then((mod) => ({
      default: mod.SongSlideArrangements,
    })),
  { ssr: false }
)
import { SongRevisionHistoryCard } from '@/components/song-revision-history-card'
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

interface SongPageContentProps {
  params: Promise<{ slug: string; songId: string }>
}

export default async function SongPageContent({ params }: SongPageContentProps) {
  const { slug, songId } = await params
  const group = await getGroupBySlug(slug)
  if (!group) {
    notFound()
  }

  const [song, arrangements, usage, { slides, slideGroups }, revisions] = await Promise.all([
    getSongById(songId, group.id),
    getSongArrangements(songId, group.id),
    getSongUsageInfo(songId, group.id),
    getSongSlides(songId, group.id),
    getSongRevisions(songId, group.id),
  ])

  if (!song || song.group_id !== group.id) {
    notFound()
  }

  const slidesCount = slides.length
  const topArrangements = usage.arrangementCounts
    .map((entry) => {
      const arrangement = entry.arrangementId
        ? arrangements.find((item) => item.id === entry.arrangementId)
        : null
      if (!arrangement) {
        return null
      }
      return {
        arrangementId: entry.arrangementId,
        name: arrangement.name,
        count: entry.count,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 5)

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
              <DeleteSongButton songId={song.id} groupId={group.id} groupSlug={slug} songTitle={song.title} />
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
              songTitle={song.title}
              songDefaultKey={song.default_key}
              arrangements={arrangements}
              slides={slides}
              slideGroups={slideGroups}
            />
          </section>

          <aside className="space-y-6 print:hidden">
            <SongRevisionHistoryCard
              revisions={revisions}
              currentSlides={slides}
              groupId={group.id}
              groupSlug={slug}
            />
            {(song.default_key || song.ccli_id || song.artist || song.link_url) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Song info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {song.default_key && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Key</span>
                      <span className="font-medium">{song.default_key}</span>
                    </div>
                  )}
                  {song.ccli_id && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">CCLI ID</span>
                      <span className="font-medium">{song.ccli_id}</span>
                    </div>
                  )}
                  {song.artist && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Artist / Author</span>
                      <span className="font-medium">{song.artist}</span>
                    </div>
                  )}
                  {song.link_url && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Link</span>
                      <a
                        href={song.link_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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

            {topArrangements.length > 0 && (
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
            )}
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
