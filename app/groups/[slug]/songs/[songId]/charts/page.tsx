export const dynamic = 'force-dynamic'

import SongPageContent from '../_components/song-page-content'

interface SongChartsPageProps {
  params: Promise<{ slug: string; songId: string }>
}

export default async function SongChartsPage({ params }: SongChartsPageProps) {
  return <SongPageContent params={params} />
}
