export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSetById } from '@/lib/actions/sets'
import { getGroupBySlug } from '@/lib/actions/groups'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SetSongListClient } from '@/components/set-song-list-client'
import { AddSongToSet } from '@/components/add-song-to-set'
import { EditSetDialog } from '@/components/edit-set-dialog'
import { DeleteSetButton } from '@/components/delete-set-button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { HugeiconsIcon } from '@hugeicons/react'
import { Download01Icon } from '@hugeicons/core-free-icons'

interface SetPageProps {
  params: Promise<{ slug: string; setId: string }>
}

export default async function SetPage({ params }: SetPageProps) {
  const { slug, setId } = await params
  const [group, set] = await Promise.all([
    getGroupBySlug(slug),
    getSetById(setId),
  ])

  if (!group || !set) {
    notFound()
  }

  const today = new Date().toISOString().split('T')[0]
  const isUpcoming = set.service_date >= today

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
                <BreadcrumbPage>Set</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">
                  {formatDate(set.service_date)}
                </h1>
                <Badge variant={isUpcoming ? 'default' : 'secondary'}>
                  {isUpcoming ? 'Upcoming' : 'Past'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <EditSetDialog set={set} />
              <DeleteSetButton setId={set.id} groupSlug={slug} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content - Song List */}
          <section className="lg:col-span-2 space-y-6">
            {set.notes && (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Set notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{set.notes}</p>
                </CardContent>
              </Card>
            )}
            <Card className="border-border/70">
              <CardHeader className="border-b border-border/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Setlist editor</CardTitle>
                    <CardDescription>
                      Drag to reorder, then adjust arrangements and notes.
                    </CardDescription>
                  </div>
                  <CardAction>
                    <AddSongToSet
                      setId={set.id}
                      groupId={set.group_id}
                      groupSlug={slug}
                      existingSongIds={set.set_songs.map((song) => song.song_id)}
                    />
                  </CardAction>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{set.set_songs.length} songs</span>
                </div>
                {set.set_songs.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-muted-foreground">No songs in this set yet.</p>
                    <p className="text-muted-foreground text-sm mt-1">Add songs to build your setlist.</p>
                  </div>
                ) : (
                  <SetSongListClient
                    setSongs={set.set_songs}
                    setId={set.id}
                    groupId={set.group_id}
                    groupSlug={slug}
                  />
                )}
              </CardContent>
            </Card>
          </section>

          {/* Sidebar */}
          <aside className="space-y-6 print:hidden">
            {/* Export */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Export</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <a 
                  href={`/api/sets/${set.id}/propresenter.zip`} 
                  download
                  className="inline-flex items-center justify-start w-full h-8 px-2.5 text-xs font-medium border border-border bg-background hover:bg-muted rounded-none transition-all"
                >
                  <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="mr-2 h-4 w-4" />
                  Download for ProPresenter
                </a>
                <p className="text-xs text-muted-foreground">
                  Downloads a .zip file with .txt lyrics for each song
                </p>
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
