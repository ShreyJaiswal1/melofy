'use client';

import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Loader2, Music2, Play } from 'lucide-react';
import { TrackList, TrackItem } from '@/components/ui/TrackList';
import { BackButton } from '@/components/ui/BackButton';
import { usePlayerStore } from '@/store/usePlayerStore';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/firebase/auth-context';
import { getFirebaseAuthHeaders } from '@/lib/firebase/client-auth';
import {
  mapSpotifyTrackToTrackItem,
  mapTrackItemToPlayerTrack,
  type SpotifyTrackLike,
} from '@/lib/track-mappers';

interface SpotifyTrendingItem {
  track?: SpotifyTrackLike;
}

export default function TrendingPage() {
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const playPlaylist = usePlayerStore((state) => state.playPlaylist);
  const { user } = useAuth();

  const tracksToPlay = useMemo(
    () => tracks.map((track) => mapTrackItemToPlayerTrack(track)),
    [tracks],
  );

  useEffect(() => {
    const fetchTrending = async () => {
      if (!user) {
        setTracks([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const authHeaders = await getFirebaseAuthHeaders(user);
        const res = await fetch('/api/spotify/trending', {
          headers: authHeaders,
        });

        if (!res.ok) {
          setTracks([]);
          return;
        }

        const data = (await res.json()) as SpotifyTrendingItem[];
        const mapped: TrackItem[] = data
          .filter((item): item is { track: SpotifyTrackLike } => Boolean(item?.track))
          .map((item) => mapSpotifyTrackToTrackItem(item.track));

        setTracks(mapped);
      } catch (error) {
        console.error('Failed to fetch trending:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTrending();
  }, [user]);

  return (
    <div className='flex flex-col min-h-full overflow-x-hidden custom-scrollbar p-4 md:p-8 pb-8 md:pb-8 relative'>
      {/* Back Button */}
      <BackButton label="Trending" />

      {/* Ambient background blur */}
      <div
        className='absolute top-0 left-0 right-0 h-[50vh] opacity-20 blur-[120px] pointer-events-none z-10 bg-linear-to-br from-primary/30 to-blue-500/25'
      />

      <header className='flex flex-col md:flex-row items-center md:items-center justify-between gap-6 mb-8 mt-12 md:mt-16 w-full z-10'>
        <div className='flex flex-col md:flex-row items-center md:items-center gap-6 text-center md:text-left w-full md:w-auto'>
          <div className='h-48 w-48 md:h-60 md:w-60 rounded-[2rem] bg-linear-to-br from-primary/30 to-blue-500/20 shadow-2xl shrink-0 flex items-center justify-center border border-white/5'>
            <TrendingUp className='h-24 w-24 text-primary' />
          </div>

          <div className='flex flex-col gap-2'>
            <h1 className='text-5xl md:text-7xl font-bold text-foreground tracking-tighter mb-2'>
              Top 50 Global
            </h1>
            <div className='flex items-center flex-wrap justify-center md:justify-start gap-1.5 text-muted-foreground text-sm font-light mt-2'>
              <span className='font-semibold text-foreground'>Spotify</span>
              <span>&middot;</span>
              <span>
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
              </span>
              <span>&middot;</span>
              <span>Updated daily</span>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-3 shrink-0 self-center md:self-end'>
          <Button
            size='lg'
            onClick={() => playPlaylist(tracksToPlay)}
            disabled={tracksToPlay.length === 0}
            className="h-16 px-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold shadow-lg active:scale-[0.98] transition-all flex items-center gap-3 cursor-pointer"
          >
            <Play className="h-6 w-6 fill-current" />
            <span>Play</span>
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className='flex flex-col items-center justify-center py-32 gap-4'>
          <Loader2 className='h-10 w-10 text-primary animate-spin' />
          <p className='text-muted-foreground animate-pulse'>
            Loading global charts...
          </p>
        </div>
      ) : tracks.length > 0 ? (
        <TrackList tracks={tracks} />
      ) : (
        <div className='flex flex-col items-center justify-center py-32 gap-4'>
          <Music2 className='h-16 w-16 text-muted-foreground' />
          <p className='text-xl text-muted-foreground'>
            No trending tracks available
          </p>
        </div>
      )}
    </div>
  );
}
