'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { usePlayerStore, Track } from '@/store/usePlayerStore';
import { Button } from '@/components/ui/button';
import { Play, Pause, Share2, Music2, Loader2, ListPlus, ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BackButton } from '@/components/ui/BackButton';
import { getFirebaseAuthHeaders } from '@/lib/firebase/client-auth';
import { useAuth } from '@/lib/firebase/auth-context';

interface TrackPageClientProps {
  id: string;
}

export default function TrackPageClient({ id }: TrackPageClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const play = usePlayerStore((state) => state.play);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

  const [trackInfo, setTrackInfo] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if this shared track is currently active in the player
  const isCurrentActive = currentTrack?.identifier === id || currentTrack?.id === id;

  // Fetch track metadata
  useEffect(() => {
    async function fetchTrack() {
      if (authLoading) return;

      try {
        setIsLoading(true);
        const headers: Record<string, string> = {};
        if (user) {
          const authHeaders = await getFirebaseAuthHeaders(user);
          Object.assign(headers, authHeaders);
        }
        const res = await fetch(`/api/player/track/${id}`, {
          headers,
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.info) {
            const resolvedTrack: Track = {
              id: data.info.identifier,
              identifier: data.info.identifier,
              title: data.info.title,
              artist: data.info.author,
              artworkUrl: data.info.artworkUrl || `https://img.youtube.com/vi/${data.info.identifier}/maxresdefault.jpg`,
              duration: data.info.length || data.info.duration || 0,
              url: data.encoded || '',
            };
            setTrackInfo(resolvedTrack);
          } else {
            setError('Could not parse track details');
          }
        } else {
          setError('Shared track not found or unavailable');
        }
      } catch (err) {
        console.error('Error fetching shared track:', err);
        setError('Failed to connect to track server');
      } finally {
        setIsLoading(false);
      }
    }

    void fetchTrack();
  }, [id, user, authLoading]);

  const handlePlayToggle = useCallback(() => {
    if (!trackInfo) return;

    if (!user) {
      toast.info('Sign in to play track');
      router.push(`/login?callbackUrl=${encodeURIComponent(`/track/${id}`)}`);
      return;
    }

    if (isCurrentActive) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      play(trackInfo, true);
      toast.success(`Playing shared track: ${trackInfo.title}`);
    }
  }, [isCurrentActive, isPlaying, play, pause, resume, trackInfo, user, router, id]);

  const handleAddToQueue = useCallback(() => {
    if (!trackInfo) return;

    if (!user) {
      toast.info('Sign in to add track to queue');
      router.push(`/login?callbackUrl=${encodeURIComponent(`/track/${id}`)}`);
      return;
    }

    addToQueue(trackInfo);
    toast.success(`Added "${trackInfo.title}" to queue`);
  }, [trackInfo, user, addToQueue, router, id]);

  const handleShare = useCallback(() => {
    if (!trackInfo) return;
    const shareUrl = `${window.location.origin}/track/${id}`;
    
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        toast.success('Melofy share link copied to clipboard!');
      })
      .catch((err) => {
        console.error('Copy failed:', err);
        toast.error('Failed to copy share link');
      });
  }, [id, trackInfo]);

  if (isLoading || authLoading) {
    return (
      <div className='flex h-screen w-full flex-col items-center justify-center bg-background text-foreground gap-4'>
        <Loader2 className='h-10 w-10 text-primary animate-spin' />
        <p className='text-sm text-muted-foreground font-medium tracking-wide animate-pulse'>
          Resolving shared track...
        </p>
      </div>
    );
  }

  if (error || !trackInfo) {
    return (
      <div className='flex h-screen w-full flex-col items-center justify-center bg-background text-foreground gap-4 px-6 text-center'>
        <Music2 className='h-16 w-16 text-zinc-600' />
        <h1 className='text-2xl font-bold tracking-tight'>Track not found</h1>
        <p className='text-muted-foreground text-sm max-w-sm'>{error || 'We could not find the shared track you are looking for.'}</p>
        <Button variant='outline' className='rounded-full mt-2' onClick={() => router.push('/')}>
          <ChevronLeft className='mr-2 h-4 w-4' />
          Go to Melofy
        </Button>
      </div>
    );
  }

  return (
    <div className='relative flex-1 h-full w-full overflow-hidden bg-background flex flex-col px-6 pt-6 md:px-12 md:pt-8'>
      {/* Background Cinematic Blur */}
      {trackInfo.artworkUrl && (
        <div className='absolute inset-0 pointer-events-none z-0'>
          <div
            className='absolute inset-0 blur-[80px] scale-125 opacity-40 saturate-150 transition-all duration-700'
            style={{
              backgroundImage: `url(${trackInfo.artworkUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div className='absolute inset-0 bg-background/70 dark:bg-black/75' />
        </div>
      )}

      {/* Back Button */}
      <BackButton label="Shared Track" />

      {/* Main Content Area: Horizontal split on desktop */}
      <div className='relative z-10 w-full flex-1 flex flex-col items-center justify-center max-w-5xl mx-auto'>
        <div className='flex flex-col md:flex-row items-center justify-center gap-10 md:gap-16 w-full px-4'>
          
          {/* Left: Artwork Card */}
          <div className='relative group shrink-0 w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] md:w-[340px] md:h-[340px] rounded-[2.5rem] overflow-hidden shadow-2xl border border-foreground/10 bg-secondary/30 backdrop-blur-2xl animate-fade-in'>
            <Image
              src={trackInfo.artworkUrl}
              alt={trackInfo.title}
              fill
              className='object-cover'
              priority
            />
          </div>

          {/* Right: Details & Playback Controls */}
          <div className='flex flex-col items-center md:items-start text-center md:text-left min-w-0 flex-1 max-w-lg'>
            <span className='text-primary font-bold text-xs uppercase tracking-widest mb-3.5 select-none'>
              Shared Track
            </span>
            <h1 className='text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground leading-tight line-clamp-2 w-full'>
              {trackInfo.title}
            </h1>
            <p className='text-zinc-400 font-semibold text-base sm:text-lg mt-2 truncate w-full'>
              {trackInfo.artist}
            </p>

            {/* Simple Horizontal Controls */}
            <div className='flex flex-col sm:flex-row items-center gap-4 mt-8 w-full justify-center md:justify-start'>
              {/* Play Button */}
              <Button
                onClick={handlePlayToggle}
                className='h-14 px-8.5 rounded-full bg-foreground text-background hover:bg-foreground/90 font-black shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2.5 cursor-pointer w-full sm:w-auto'
              >
                {isCurrentActive && isPlaying ? (
                  <>
                    <Pause className='h-5 w-5 fill-current' />
                    <span>PAUSE</span>
                  </>
                ) : (
                  <>
                    <Play className='h-5 w-5 fill-current translate-x-0.5' />
                    <span>PLAY NOW</span>
                  </>
                )}
              </Button>

              {/* Add to Queue Button */}
              <Button
                variant='outline'
                onClick={handleAddToQueue}
                className='h-14 px-7.5 rounded-full border-foreground/10 bg-foreground/5 hover:bg-foreground/10 font-bold active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer text-foreground w-full sm:w-auto'
                title="Add to queue"
              >
                <ListPlus className='h-5 w-5 text-foreground/80' />
                <span>ADD TO QUEUE</span>
              </Button>

              {/* Share Button */}
              <Button
                variant='outline'
                size='icon'
                onClick={handleShare}
                className='h-14 w-14 rounded-full border-foreground/10 bg-foreground/5 hover:bg-foreground/10 active:scale-95 transition-all cursor-pointer shadow-sm shrink-0 hidden sm:flex items-center justify-center'
                title="Copy share link"
              >
                <Share2 className='h-5 w-5 text-foreground/80' />
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
