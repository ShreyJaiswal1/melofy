import { Metadata } from 'next';
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolvedParams = await params;
  const sessionCode = resolvedParams.id?.toUpperCase() || '';
  
  let hostName = 'Host';
  let currentTrackName = '';
  
  try {
    // Determine the backend API URL (resolves properly inside client container rewrites/server lookups)
    const backendApiUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    const res = await fetch(`${backendApiUrl}/api/jam/info/${sessionCode}`, {
      next: { revalidate: 5 } // Cache for 5 seconds to stay fresh
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.hostName) {
        hostName = data.hostName;
      }
      if (data.currentTrack?.title) {
        currentTrackName = ` (playing: ${data.currentTrack.title} by ${data.currentTrack.artist})`;
      }
    }
  } catch (err) {
    console.error('[ListenMetadata] Failed to pre-resolve party details for metadata:', err);
  }

  const title = `Join ${hostName} to Listen Along | Melofy`;
  const description = `You've been invited to join ${hostName}'s real-time synchronized music session on Melofy${currentTrackName}. Tap to sync your queue and jam together!`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://melofy.app/listen/${resolvedParams.id}`,
      siteName: 'Melofy',
      images: [
        {
          url: '/logo.png',
          width: 512,
          height: 512,
          alt: 'Melofy Logo',
        },
      ],
      type: 'music.playlist',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: ['/logo.png'],
    },
  };
}

export default function ListenLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
