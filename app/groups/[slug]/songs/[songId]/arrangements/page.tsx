export const dynamic = 'force-dynamic'

import SongPageContent from '../song-page-content'

interface SongArrangementsPageProps {
  params: Promise<{ slug: string; songId: string }>
}

export default async function SongArrangementsPage({ params }: SongArrangementsPageProps) {
  return <SongPageContent params={params} />
}
