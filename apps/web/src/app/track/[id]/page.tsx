import type { Metadata } from 'next';
import TrackPageClient from './TrackPageClient';

interface TrackPageProps {
  params: Promise<{ id: string }>;
}

async function getTrackInfo(id: string) {
  const backendUrl = (process.env.BACKEND_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  try {
    const res = await fetch(`${backendUrl}/api/player/track/${id}`, {
      next: { revalidate: 3600 } // cache metadata for 1 hour
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.error('[TrackShareServer] Error pre-fetching track metadata on server:', err);
  }
  return null;
}

export async function generateMetadata({ params }: TrackPageProps): Promise<Metadata> {
  const unwrappedParams = await params;
  const trackId = unwrappedParams.id;
  const data = await getTrackInfo(trackId);

  const title = data?.info?.title 
    ? `Stream "${data.info.title}" by ${data.info.author || 'Artist'} - Melofy` 
    : 'Listen on Melofy';
  const description = data?.info?.title
    ? `Stream "${data.info.title}" in high-fidelity with friends on Melofy.`
    : 'Import Spotify playlists instantly, sync with friends, and stream high-fidelity audio.';
  const artworkUrl = data?.info?.artworkUrl || `https://img.youtube.com/vi/${trackId}/maxresdefault.jpg`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: artworkUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      type: 'music.song',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [artworkUrl],
    },
  };
}

export default async function Page({ params }: TrackPageProps) {
  const unwrappedParams = await params;
  return <TrackPageClient id={unwrappedParams.id} />;
}
