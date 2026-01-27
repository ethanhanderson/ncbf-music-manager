export const dynamic = 'force-dynamic'

import SongPageContent from '../_components/song-page-content'

interface SongSlidesPageProps {
  params: Promise<{ slug: string; songId: string }>
}

export default async function SongSlidesPage({ params }: SongSlidesPageProps) {
  return <SongPageContent params={params} />
}
