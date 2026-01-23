export const revalidate = 60

import Link from 'next/link'
import { getGroupsWithCounts } from '@/lib/actions/groups'
import { getUpcomingSetWithSongs, getUpcomingSets } from '@/lib/actions/sets'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateSetDialogClient } from '@/components/create-set-dialog-client'
import { AppLogo } from '@/components/app-logo'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  CalendarAdd01Icon,
  Layers01Icon,
  MusicNote03Icon,
} from '@hugeicons/core-free-icons'

export default async function HomePage() {
  const [groups, upcomingSets, upcomingSet] = await Promise.all([
    getGroupsWithCounts(),
    getUpcomingSets(5),
    getUpcomingSetWithSongs(),
  ])

  const totals = groups.reduce(
    (acc, group) => ({
      groups: acc.groups + 1,
      songs: acc.songs + group.songCount,
      sets: acc.sets + group.setCount,
    }),
    { groups: 0, songs: 0, sets: 0 }
  )

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <AppLogo aria-hidden className="mt-0.5 h-10 w-10 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">NCBF Music Manager</h1>
              <p className="text-muted-foreground mt-1">
                Plan Sunday sets, organize songs, and manage lyric slides for your music groups.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <section id="upcoming">
          <Card className="border-border/70">
            {upcomingSet ? (
              <>
                <CardHeader className="border-b border-border/60">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-2xl">
                        Upcoming Sunday: {formatDateLong(upcomingSet.service_date)}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        Music led by {upcomingSet.music_groups.name}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{upcomingSet.music_groups.name}</Badge>
                      <Link
                        href={`/groups/${upcomingSet.music_groups.slug}/sets/${upcomingSet.id}`}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        View set details
                        <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{upcomingSet.set_songs.length} songs selected</span>
                    </div>
                    {upcomingSet.set_songs.length === 0 ? (
                      <div className="rounded-none border border-dashed border-border/60 px-4 py-8 text-center">
                        <p className="text-muted-foreground">No songs have been added yet.</p>
                        <p className="text-muted-foreground text-sm mt-1">
                          Add songs to build this Sunday&apos;s setlist.
                        </p>
                      </div>
                    ) : (
                      <ol className="space-y-3">
                        {upcomingSet.set_songs.map((setSong, index) => {
                          const arrangementLabel = setSong.song_arrangements?.name ?? 'No arrangement'
                          return (
                            <li
                              key={setSong.id}
                              className="flex flex-col gap-2 rounded-none border border-border/60 px-3 py-3"
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-none border border-border/60 text-xs font-semibold">
                                  {index + 1}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{setSong.songs?.title ?? 'Untitled song'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 rounded-none border border-border/60 bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                                <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="h-4 w-4" />
                                {arrangementLabel}
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </div>
                  <div className="rounded-none border border-dashed border-border/60 bg-muted/20 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="h-5 w-5 text-muted-foreground" />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Arrangement notes</p>
                        <p className="text-sm text-muted-foreground">
                          Share chord charts, transitions, and any special cues for the team.
                        </p>
                        <Link
                          href={`/groups/${upcomingSet.music_groups.slug}/sets/${upcomingSet.id}`}
                          className={buttonVariants({ size: 'sm' })}
                        >
                          Open full set
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-2xl">No upcoming Sunday set yet</CardTitle>
                  <CardDescription>
                    Create the next Sunday set to start building and sharing the setlist.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <CreateSetDialogClient
                    groups={groups.map((group) => ({
                      id: group.id,
                      name: group.name,
                      slug: group.slug,
                    }))}
                    trigger={
                      <button type="button" className={buttonVariants({ size: 'lg' })}>
                        <HugeiconsIcon icon={CalendarAdd01Icon} strokeWidth={2} className="h-4 w-4" />
                        Create upcoming set
                      </button>
                    }
                  />
                </CardContent>
              </>
            )}
          </Card>
        </section>

        <section className="grid gap-8 lg:grid-cols-[2fr_1fr]" id="groups">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Groups</h2>
              </div>
            </div>

            {groups.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No worship groups yet.</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Create a group to get started.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {groups.map((group) => (
                  <Link key={group.id} href={`/groups/${group.slug}`}>
                    <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
                      <CardHeader className="space-y-2">
                        <CardTitle className="text-lg">{group.name}</CardTitle>
                        <CardDescription>
                          {formatCount(group.setCount, 'set')} · {formatCount(group.songCount, 'song')}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-6 print:hidden">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick links</CardTitle>
                <CardDescription>Jump to the most used views.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Link
                  href="/songs"
                  className="flex items-center justify-between gap-2 text-sm font-medium transition-colors hover:text-primary"
                >
                  <span className="flex items-center gap-2">
                    <HugeiconsIcon icon={MusicNote03Icon} strokeWidth={2} className="h-4 w-4" />
                    Song catalog
                  </span>
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="h-4 w-4" />
                </Link>
                <Link
                  href="/sets"
                  className="flex items-center justify-between gap-2 text-sm font-medium transition-colors hover:text-primary"
                >
                  <span className="flex items-center gap-2">
                    <HugeiconsIcon icon={CalendarAdd01Icon} strokeWidth={2} className="h-4 w-4" />
                    Set catalog
                  </span>
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total groups</CardDescription>
                  <CardTitle className="text-2xl">{totals.groups}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total sets</CardDescription>
                  <CardTitle className="text-2xl">{totals.sets}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total songs</CardDescription>
                  <CardTitle className="text-2xl">{totals.songs}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Upcoming services</CardDescription>
                  <CardTitle className="text-2xl">{upcomingSets.length}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

function formatDateLong(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`
}
