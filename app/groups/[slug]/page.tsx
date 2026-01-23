export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGroupBySlug } from '@/lib/actions/groups'
import { getGroupSets, getUpcomingSetSongIds } from '@/lib/actions/sets'
import { getRecentSongs, getSongsWithArrangements } from '@/lib/actions/songs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CreateSetDialog } from '@/components/create-set-dialog'
import { CreateSongDialog } from '@/components/create-song-dialog'
import { BulkUploadDialog } from '@/components/bulk-upload-dialog'
import { RenameGroupPopover } from '@/components/rename-group-popover'
import { HugeiconsIcon } from '@hugeicons/react'
import { 
  CalendarAdd01Icon, 
  MusicNote03Icon, 
  Add01Icon,
  Search01Icon,
  Upload02Icon,
  ArrowRight01Icon
} from '@hugeicons/core-free-icons'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface GroupPageProps {
  params: Promise<{ slug: string }>
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { slug } = await params
  const group = await getGroupBySlug(slug)

  if (!group) {
    notFound()
  }

  const [{ songs, arrangements }, sets, recentSongs, upcomingSetSongIds] = await Promise.all([
    getSongsWithArrangements(group.id),
    getGroupSets(group.id),
    getRecentSongs(group.id, 5),
    getUpcomingSetSongIds(group.id),
  ])
  const today = new Date().toISOString().split('T')[0]

  // Separate upcoming and past sets
  const upcomingSets = sets.filter(s => s.service_date >= today)
  const pastSets = sets.filter(s => s.service_date < today)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card print:hidden">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink render={<Link href="/">Home</Link>} />
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{group.name}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <h1 className="text-2xl font-bold tracking-tight mt-2">{group.name}</h1>
            </div>
            <RenameGroupPopover groupId={group.id} groupName={group.name} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        
        {/* Quick Actions */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
            <BulkUploadDialog
              groupId={group.id}
              groupSlug={group.slug}
              trigger={
                <Button variant="secondary" size="sm">
                  <HugeiconsIcon icon={Upload02Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                  Bulk Upload
                </Button>
              }
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Create Set */}
            <CreateSetDialog 
              groupId={group.id} 
              groupSlug={group.slug} 
              songs={songs}
              arrangements={arrangements}
              upcomingSetSongIds={upcomingSetSongIds}
              lastSetDate={sets[0]?.service_date}
              existingSetDates={sets.map((s) => s.service_date)}
              trigger={
                <Card className="hover:bg-muted/60 cursor-pointer transition-colors border-dashed hover:border-solid h-full">
                  <CardContent className="flex flex-col items-center justify-center py-6 gap-3 text-center h-full">
                    <HugeiconsIcon icon={CalendarAdd01Icon} className="w-8 h-8 text-primary" />
                    <span className="font-medium">New Set</span>
                  </CardContent>
                </Card>
              }
            />
            
            {/* Add Song */}
             <CreateSongDialog 
              groupId={group.id} 
              groupSlug={group.slug} 
              trigger={
                 <Card className="hover:bg-muted/60 cursor-pointer transition-colors border-dashed hover:border-solid h-full">
                  <CardContent className="flex flex-col items-center justify-center py-6 gap-3 text-center h-full">
                    <HugeiconsIcon icon={Add01Icon} className="w-8 h-8 text-primary" />
                    <span className="font-medium">Add Song</span>
                  </CardContent>
                </Card>
              }
            />

            {/* Browse Songs */}
            <Link href={`/groups/${group.slug}/songs`} className="contents">
               <Card className="hover:bg-muted/60 cursor-pointer transition-colors h-full">
                  <CardContent className="flex flex-col items-center justify-center py-6 gap-3 text-center h-full">
                    <HugeiconsIcon icon={Search01Icon} className="w-8 h-8 text-primary" />
                    <span className="font-medium">Browse Songs</span>
                  </CardContent>
                </Card>
            </Link>
          </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                 {/* Upcoming Sets */}
                <section>
                  <h2 className="text-lg font-semibold mb-4">Upcoming Services</h2>
                  {upcomingSets.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <p className="text-muted-foreground">No upcoming services scheduled.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {upcomingSets.map((set) => (
                        <Link key={set.id} href={`/groups/${group.slug}/sets/${set.id}`}>
                          <Card className="transition-colors hover:bg-muted/50 cursor-pointer h-full">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div>
                                  <CardTitle className="text-base">
                                    {formatDate(set.service_date)}
                                  </CardTitle>
                                </div>
                                <Badge variant="secondary">Upcoming</Badge>
                              </div>
                            </CardHeader>
                            {set.notes && (
                              <CardContent>
                                <p className="text-sm text-muted-foreground line-clamp-2">{set.notes}</p>
                              </CardContent>
                            )}
                          </Card>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>

                 {/* Past Sets */}
                 {pastSets.length > 0 && (
                  <section>
                    <h2 className="text-lg font-semibold mb-4">Past Services</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {pastSets.slice(0, 6).map((set) => (
                        <Link key={set.id} href={`/groups/${group.slug}/sets/${set.id}`}>
                          <Card className="transition-colors hover:bg-muted/50 cursor-pointer h-full opacity-75">
                            <CardHeader>
                              <CardTitle className="text-base">
                                {formatDate(set.service_date)}
                              </CardTitle>
                            </CardHeader>
                          </Card>
                        </Link>
                      ))}
                    </div>
                    {pastSets.length > 6 && (
                      <p className="text-sm text-muted-foreground mt-4 text-center">
                        Showing 6 of {pastSets.length} past services
                      </p>
                    )}
                  </section>
                )}
            </div>

            <div className="space-y-8">
                 {/* Recent Songs */}
                 <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">Recent Songs</h2>
                        <Button
                          variant="secondary"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={`/groups/${group.slug}/songs`} />}
                        >
                          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
                          View All
                        </Button>
                    </div>
                    <div className="space-y-3">
                        {recentSongs.map(song => (
                            <Link key={song.id} href={`/groups/${group.slug}/songs/${song.id}`} className="block">
                                <Card className="hover:bg-muted/60 transition-colors">
                                    <CardContent className="p-3 flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-none bg-muted flex items-center justify-center shrink-0">
                                            <HugeiconsIcon icon={MusicNote03Icon} className="w-4 h-4 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium truncate text-sm">{song.title}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                         {recentSongs.length === 0 && (
                            <p className="text-sm text-muted-foreground">No songs added yet.</p>
                        )}
                    </div>
                 </section>
            </div>
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
