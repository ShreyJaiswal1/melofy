'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Play, Music2, Loader2, ChevronLeft, Heart, Check, Disc } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getFirebaseAuthHeaders } from '@/lib/firebase/client-auth';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { Button } from '@/components/ui/button';
import { TrackList, TrackItem } from '@/components/ui/TrackList';
import { BackButton } from '@/components/ui/BackButton';
import Link from 'next/link';
import { mapTrackItemToPlayerTrack } from '@/lib/track-mappers';
import Image from 'next/image';

interface DeezerAlbumTrack {
  id: number;
  title: string;
  duration: number;
  artist: { name: string };
}

interface DeezerAlbumData {
  id: number;
  title: string;
  cover_xl?: string;
  cover_medium?: string;
  release_date?: string;
  artist?: { id: number; name: string };
  duration?: number;
  tracks: {
    data: DeezerAlbumTrack[];
  };
}

export default function AlbumPage() {
  const params = useParams();
  const rawId = params.id as string;
  const id = decodeURIComponent(rawId);
  const { user } = useAuth();
  const playPlaylist = usePlayerStore((state) => state.playPlaylist);
  const savedPlaylists = useLibraryStore((state) => state.savedPlaylists);
  const addPlaylist = useLibraryStore((state) => state.addPlaylist);
  const removePlaylist = useLibraryStore((state) => state.removePlaylist);
  const addRecentPlaylist = useLibraryStore((state) => state.addRecentPlaylist);

  const [album, setAlbum] = useState<DeezerAlbumData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const albumKey = `deezer:album:${id}`;
  const saved = useMemo(
    () => savedPlaylists.some((entry) => entry.id === albumKey),
    [albumKey, savedPlaylists],
  );

  useEffect(() => {
    async function fetchAlbum() {
      if (!id) return;
      setIsLoading(true);

      try {
        const authHeaders = await getFirebaseAuthHeaders(user);
        const res = await fetch(`/api/deezer/album/${id}`, {
          headers: authHeaders,
        });

        if (res.ok) {
          const data = await res.json();
          setAlbum(data);
        } else {
          setAlbum(null);
        }
      } catch (error) {
        console.error('Error fetching album details:', error);
        setAlbum(null);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchAlbum();
  }, [id, user]);

  const trackItems: TrackItem[] = useMemo(() => {
    if (!album?.tracks?.data) return [];
    return album.tracks.data.map((track) => ({
      id: track.id.toString(),
      identifier: track.id.toString(),
      title: track.title,
      artist: track.artist?.name || album.artist?.name || 'Unknown',
      artworkUrl: album.cover_medium || album.cover_xl || '',
      duration: track.duration * 1000, // Deezer duration is in seconds
      album: album.title,
      encoded: '', // play playlist/radio logic will resolve playable URL dynamically
    }));
  }, [album]);

  const totalDurationMs = useMemo(() => {
    if (album?.duration) return album.duration * 1000;
    return trackItems.reduce((acc, track) => acc + (track.duration || 0), 0);
  }, [album, trackItems]);

  const formattedDuration = useMemo(() => {
    const totalSeconds = Math.floor(totalDurationMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    }
    return `${minutes} min`;
  }, [totalDurationMs]);

  const tracksToPlay = useMemo(
    () => trackItems.map((track) => mapTrackItemToPlayerTrack(track)),
    [trackItems],
  );

  const handlePlayAlbum = useCallback(() => {
    if (!album) return;
    playPlaylist(tracksToPlay, albumKey, 'custom');
    addRecentPlaylist({
      id: albumKey,
      name: album.title,
      artworkUrl: album.cover_medium || album.cover_xl || '',
      type: 'album',
      trackCount: trackItems.length,
    });
  }, [album, albumKey, playPlaylist, tracksToPlay, addRecentPlaylist, trackItems]);

  const handleToggleSave = useCallback(() => {
    if (!album) return;

    if (saved) {
      removePlaylist(albumKey);
      return;
    }

    addPlaylist({
      id: albumKey,
      name: album.title,
      artworkUrl: album.cover_medium || album.cover_xl || '',
      type: 'custom',
      trackCount: trackItems.length,
    });
  }, [addPlaylist, album, albumKey, removePlaylist, saved, trackItems]);

  if (isLoading) {
    return <AlbumPageSkeleton />;
  }

  if (!album) {
    return (
      <div className='flex flex-col items-center justify-center h-full gap-4'>
        <Disc className='h-16 w-16 text-zinc-700' />
        <h1 className='text-2xl font-bold text-foreground'>
          Album not found
        </h1>
        <Link href='/search'>
          <Button variant='outline' className='rounded-full'>
            <ChevronLeft className='mr-2 h-4 w-4' />
            Back to Search
          </Button>
        </Link>
      </div>
    );
  }

  const bgImageUrl = album.cover_medium || album.cover_xl || '';

  return (
    <div className='flex flex-col min-h-full overflow-x-hidden custom-scrollbar p-4 md:p-8 pb-8 md:pb-8 relative'>
      {/* Back Button */}
      <BackButton label="Album" />
      {bgImageUrl && (
        <div
          className='absolute top-0 left-0 right-0 h-[50vh] opacity-30 blur-[120px] pointer-events-none z-10'
          style={{
            backgroundImage: `url(${bgImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      <header className='flex flex-col md:flex-row items-center md:items-center justify-between gap-6 mb-8 mt-12 md:mt-16 w-full z-10'>
        <div className='flex flex-col md:flex-row items-center md:items-center gap-6 text-center md:text-left w-full md:w-auto'>
          <div className='h-48 w-48 md:h-60 md:w-60 rounded-[2rem] bg-muted shadow-2xl shrink-0 overflow-hidden relative border border-white/5'>
            {album.cover_xl || album.cover_medium ? (
              <Image
                src={album.cover_xl || album.cover_medium || ''}
                alt={album.title}
                width={300}
                height={300}
                className='h-full w-full object-cover'
              />
            ) : (
              <div className='h-full w-full flex items-center justify-center'>
                <Music2 className='h-24 w-24 text-muted-foreground' />
              </div>
            )}
          </div>

          <div className='flex flex-col gap-2'>
            <h1 className='text-5xl md:text-7xl font-bold text-foreground tracking-tighter mb-2 line-clamp-2'>
              {album.title}
            </h1>
            <div className='flex items-center flex-wrap justify-center md:justify-start gap-1.5 text-muted-foreground text-sm font-light mt-2'>
              {album.artist && (
                <Link href={`/artist/${encodeURIComponent(album.artist.name)}`} className='font-semibold text-foreground hover:underline'>
                  {album.artist.name}
                </Link>
              )}
              <span>&middot;</span>
              {album.release_date && (
                <>
                  <span>{new Date(album.release_date).getFullYear()}</span>
                  <span>&middot;</span>
                </>
              )}
              <span>
                {trackItems.length} {trackItems.length === 1 ? 'song' : 'songs'}
                {formattedDuration && `, ${formattedDuration}`}
              </span>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-3 shrink-0 self-center md:self-end'>
          <Button
            size='lg'
            onClick={handlePlayAlbum}
            className="h-16 px-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold shadow-lg active:scale-[0.98] transition-all flex items-center gap-3 cursor-pointer"
          >
            <Play className="h-6 w-6 fill-current" />
            <span>Play</span>
          </Button>
          <Button
            variant='outline'
            size='icon'
            className={`h-16 w-16 rounded-full border-2 transition-all flex items-center justify-center shrink-0 ${
              saved
                ? 'border-primary text-primary hover:bg-primary/10'
                : 'border-muted-foreground/30 text-muted-foreground hover:border-foreground hover:text-foreground'
            }`}
            onClick={handleToggleSave}
            title={saved ? 'Remove from Library' : 'Save to Library'}
          >
            {saved ? (
              <Check className='h-6 w-6' strokeWidth={3} />
            ) : (
              <Heart className='h-6 w-6' />
            )}
          </Button>
        </div>
      </header>

      <div className='z-10'>
        <TrackList tracks={trackItems} showHeader={true} />
      </div>
    </div>
  );
}

function AlbumPageSkeleton() {
  return (
    <div className='flex flex-col min-h-full overflow-x-hidden p-4 md:p-8 pb-8 md:pb-8 relative animate-pulse'>
      {/* Back Button */}
      <BackButton label="Album" />

      {/* Header Skeleton */}
      <header className='flex flex-col md:flex-row items-center md:items-center justify-between gap-6 mb-8 mt-12 md:mt-16 w-full z-10'>
        <div className='flex flex-col md:flex-row items-center md:items-center gap-6 text-center md:text-left w-full md:w-auto'>
          {/* Cover Art Skeleton */}
          <div className='h-48 w-48 md:h-60 md:w-60 rounded-[2rem] bg-zinc-200 dark:bg-zinc-800/60 shadow-2xl shrink-0' />

          {/* Metadata Details Skeleton */}
          <div className='flex flex-col gap-2 w-full md:w-auto md:min-w-[300px]'>
            {/* Title */}
            <div className='h-12 md:h-16 w-3/4 md:w-[450px] bg-zinc-200 dark:bg-zinc-800/60 rounded-2xl my-2 mx-auto md:mx-0' />
            
            {/* Bottom stats row */}
            <div className='flex items-center justify-center md:justify-start gap-1.5 mt-2'>
              <div className='h-4 w-16 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
              <span className='text-zinc-300 dark:text-zinc-700'>&middot;</span>
              <div className='h-4 w-28 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
            </div>
          </div>
        </div>

        {/* Action Bar Skeleton */}
        <div className='flex items-center gap-3 shrink-0 self-center md:self-end'>
          {/* Play Button Skeleton */}
          <div className='h-16 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800/60 shadow-lg' />
          {/* Heart Button Skeleton */}
          <div className='h-16 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800/60' />
        </div>
      </header>

      <div className='flex flex-col gap-1'>
        <div className='grid grid-cols-[2rem_1fr_auto_5rem] md:grid-cols-[2rem_1fr_minmax(0,200px)_auto_5rem] gap-4 px-4 py-2 border-b border-border text-muted-foreground text-[10px] font-bold tracking-wider uppercase mb-2'>
          <span className='text-center'>#</span>
          <span>Title</span>
          <span className='hidden md:block'>Album</span>
          <span className='flex items-center justify-end'></span>
          <span></span>
        </div>

        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className='grid grid-cols-[2rem_1fr_auto_5rem] md:grid-cols-[2rem_1fr_minmax(0,200px)_auto_5rem] gap-4 px-4 py-3 rounded-xl items-center'
          >
            <span className='text-center text-sm font-medium text-muted-foreground/30 tabular-nums'>
              {index + 1}
            </span>
            <div className='flex items-center gap-3 min-w-0'>
              <div className='h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800/60 shrink-0' />
              <div className='flex flex-col gap-1.5 min-w-0'>
                <div className='h-4 w-40 md:w-60 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
                <div className='h-3 w-24 md:w-36 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
              </div>
            </div>
            <span className='hidden md:block'>
              <div className='h-4 w-32 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
            </span>
            <span className='flex justify-end items-center'>
              <div className='h-4 w-8 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
