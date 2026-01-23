import { redirect } from 'next/navigation'

interface SongPageProps {
  params: Promise<{ slug: string; songId: string }>
}

export default async function SongPage({ params }: SongPageProps) {
  const { slug, songId } = await params
  redirect(`/groups/${slug}/songs/${songId}/slides`)
}
