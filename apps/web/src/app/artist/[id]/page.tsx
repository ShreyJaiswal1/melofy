'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { usePlayerStore, Track } from '@/store/usePlayerStore';
import { getFirebaseAuthHeaders } from '@/lib/firebase/client-auth';
import { motion } from 'framer-motion';
import { Loader2, Play, Pause, Disc, User, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TrackList, TrackItem } from '@/components/ui/TrackList';
import { BackButton } from '@/components/ui/BackButton';
import { useLibraryStore } from '@/store/useLibraryStore';

interface ArtistPageProps {
  params: Promise<{ id: string }>;
}

export default function ArtistPage({ params }: ArtistPageProps) {
  const router = useRouter();
  const { user } = useAuth();
  const unwrappedParams = React.use(params);
  const artistQueryName = decodeURIComponent(unwrappedParams.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [deezerArtist, setDeezerArtist] = useState<any>(null);
  const [topTracks, setTopTracks] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [related, setRelated] = useState<any[]>([]);
  const [bio, setBio] = useState<any>(null);
  
  const [showFullBio, setShowFullBio] = useState(false);
  const [artistArtwork, setArtistArtwork] = useState<{ artworkUrl: string; animatedUrl: string } | null>(null);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playPlaylist = usePlayerStore((state) => state.playPlaylist);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);
  const addRecentPlaylist = useLibraryStore((state) => state.addRecentPlaylist);

  // Fetch all artist data
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchArtistData = async () => {
      try {
        setLoading(true);
        setError(null);
        const headers = await getFirebaseAuthHeaders(user);
        
        // 1. Search Deezer for the artist to resolve Name to ID
        const searchRes = await fetch(`/api/deezer/search-artist?name=${encodeURIComponent(artistQueryName)}`, { headers });
        if (!searchRes.ok) throw new Error('Artist not found');
        const resolvedArtist = await searchRes.json();
        
        if (cancelled) return;
        if (!resolvedArtist?.id) {
          setError(`Could not resolve details for "${artistQueryName}"`);
          setLoading(false);
          return;
        }

        setDeezerArtist(resolvedArtist);
        const artistId = resolvedArtist.id;

        // 2. Fetch tracks, albums, related, and Last.fm bio in parallel
        const [tracksRes, albumsRes, relatedRes, bioRes] = await Promise.all([
          fetch(`/api/deezer/artist/${artistId}/top`, { headers }),
          fetch(`/api/deezer/artist/${artistId}/albums`, { headers }),
          fetch(`/api/deezer/artist/${artistId}/related`, { headers }),
          fetch(`/api/deezer/artist-bio?name=${encodeURIComponent(resolvedArtist.name)}`, { headers }),
        ]);

        if (cancelled) return;

        if (tracksRes.ok) {
          const trackData = await tracksRes.json();
          setTopTracks(trackData.data || []);
        }
        if (albumsRes.ok) {
          const albumData = await albumsRes.json();
          setAlbums(albumData.data || []);
        }
        if (relatedRes.ok) {
          const relatedData = await relatedRes.json();
          setRelated(relatedData.data || []);
        }
        if (bioRes.ok) {
          const bioData = await bioRes.json();
          setBio(bioData);
        }

        // Fetch custom high-resolution & animated artwork
        fetch(`/api/deezer/artist-artwork?name=${encodeURIComponent(resolvedArtist.name)}`, { headers })
          .then(res => res.json())
          .then(data => {
            if (!cancelled && (data?.artworkUrl || data?.animatedUrl)) {
              setArtistArtwork(data);
            }
          })
          .catch(err => console.error('[ArtistPage] Error loading custom artwork:', err));
      } catch (err: any) {
        console.error('[ArtistPage] Error loading data:', err);
        setError(err.message || 'Failed to load artist details');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchArtistData();
    return () => { cancelled = true; };
  }, [artistQueryName, user]);

  // Map Deezer top tracks to TrackItem and Player Track format
  const trackItems = useMemo<TrackItem[]>(() => {
    return topTracks.map((track) => ({
      id: `deezer:${track.id}`,
      title: track.title,
      artist: track.artist.name,
      artworkUrl: track.album?.cover_medium || deezerArtist?.picture_medium || '',
      duration: track.duration * 1000,
      album: track.album?.title || '',
      encoded: '',
      source: 'deezer'
    }));
  }, [topTracks, deezerArtist]);

  const playableTracks = useMemo<Track[]>(() => {
    return trackItems.map(item => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      artworkUrl: item.artworkUrl,
      duration: item.duration,
      url: '',
    }));
  }, [trackItems]);

  const handlePlayArtist = useCallback(() => {
    if (playableTracks.length === 0) return;
    const isCurrentArtistActive = playableTracks.some(t => t.title === currentTrack?.title);
    
    if (isCurrentArtistActive) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      playPlaylist(playableTracks);
      if (deezerArtist) {
        addRecentPlaylist({
          id: `deezer:artist:${deezerArtist.id}`,
          name: deezerArtist.name,
          artworkUrl: deezerArtist.picture_medium || deezerArtist.picture_xl || '',
          type: 'artist',
          trackCount: playableTracks.length,
        });
      }
    }
  }, [playableTracks, currentTrack, isPlaying, playPlaylist, pause, resume, deezerArtist, addRecentPlaylist]);

  const bioText = useMemo(() => {
    if (!bio?.bio?.content) return '';
    // Strip HTML links (Last.fm adds "User-contributed text is available under...")
    return bio.bio.content.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '').trim();
  }, [bio]);

  if (loading) {
    return <ArtistPageSkeleton />;
  }

  if (error || !deezerArtist) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error || 'Artist not found'}</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const isArtistPlaying = playableTracks.some(t => t.title === currentTrack?.title) && isPlaying;

  return (
    <div className="flex flex-col gap-8 pb-12 overflow-x-hidden">
      {/* Immersive Header Banner */}
      <div 
        onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
        className={`relative w-full overflow-hidden rounded-t-[2rem] rounded-b-none bg-zinc-900 shadow-2xl cursor-pointer transition-all duration-500 ease-in-out ${
          isHeaderExpanded ? 'h-[65vh]' : 'h-[40vh] min-h-[300px]'
        }`}
      >
        {artistArtwork?.animatedUrl ? (
          <video
            src={artistArtwork.animatedUrl}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover brightness-[0.4] scale-105"
          />
        ) : (
          <img
            src={artistArtwork?.artworkUrl || deezerArtist.picture_xl || deezerArtist.picture_big}
            alt={deezerArtist.name}
            className="h-full w-full object-cover brightness-[0.4] scale-105 blur-[2px]"
          />
        )}
        
        {/* Back Button */}
        <BackButton label="Artist" />

        {/* Text Details & Play controls Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/25 flex flex-col justify-end p-8 md:p-12 z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-primary text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Verified Artist
              </span>
              <h1 className="text-5xl md:text-7xl font-extrabold text-foreground tracking-tight">
                {deezerArtist.name}
              </h1>
              {deezerArtist.nb_fan && (
                <p className="text-zinc-400 text-sm font-medium">
                  {deezerArtist.nb_fan.toLocaleString()} fans on Deezer
                </p>
              )}
            </div>

            {playableTracks.length > 0 && (
              <Button
                size="lg"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayArtist();
                }}
                className="h-16 px-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg active:scale-[0.98] transition-all flex items-center gap-3 shrink-0 cursor-pointer"
              >
                {isArtistPlaying ? (
                  <>
                    <Pause className="h-6 w-6 fill-current" />
                    <span>Pause Radio</span>
                  </>
                ) : (
                  <>
                    <Play className="h-6 w-6 fill-current" />
                    <span>Play Radio</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Stacking Layout */}
      <div className="flex flex-col gap-12 px-8 md:px-12">
        
        {/* 1. Popular Tracks: Full Width */}
        <section className="flex flex-col gap-5">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Popular Tracks</h2>
          <div className="rounded-2xl bg-white/[0.01] border border-white/5 p-4 shadow-2xl backdrop-blur-md">
            <TrackList tracks={trackItems} showHeader={true} />
          </div>
        </section>

        {/* 2. Discography (Albums): Full Width */}
        {albums.length > 0 && (
          <section className="flex flex-col gap-5">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Discography</h2>
            <div className="flex overflow-x-auto gap-2 pb-4 custom-scrollbar carousel-scrollbar snap-x snap-mandatory">
              {albums.slice(0, 12).map((album) => (
                <Link key={album.id} href={`/album/${album.id}`} className="no-underline">
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="flex flex-col gap-3.5 p-2.5 rounded-[1.75rem] bg-transparent hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all duration-300 w-[145px] sm:w-[165px] md:w-[175px] snap-start shrink-0 group shadow-lg"
                  >
                    <div className="aspect-square rounded-2xl bg-muted overflow-hidden relative shadow-md border border-white/5">
                      <img
                        src={album.cover_medium}
                        alt={album.title}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="min-w-0 flex flex-col gap-1 px-1">
                      <p className="font-bold text-xs truncate text-foreground tracking-wide group-hover:text-primary transition-colors">
                        {album.title}
                      </p>
                      {album.release_date && (
                        <p className="text-[10px] text-zinc-500 font-semibold tracking-wider">
                          {new Date(album.release_date).getFullYear()} • Album
                        </p>
                      )}
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 3. Biography & Fans Also Like: Side-by-Side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Biography: Takes 2 Columns */}
          {bioText && (
            <div className="md:col-span-2">
              <section className="flex flex-col gap-4 rounded-[2rem] bg-white/[0.01] border border-white/5 p-8 backdrop-blur-md shadow-2xl h-full">
                <h2 className="text-lg font-bold text-foreground tracking-tight">Biography</h2>
                <div className="relative text-sm text-zinc-400 leading-relaxed font-normal">
                  <p className={showFullBio ? '' : 'line-clamp-4'}>
                    {bioText}
                  </p>
                  
                  {bioText.length > 200 && (
                    <button
                      onClick={() => setShowFullBio(!showFullBio)}
                      className="text-primary hover:text-primary/80 font-bold text-xs mt-4 block transition-colors select-none"
                    >
                      {showFullBio ? 'Show Less' : 'Read Full Biography'}
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* Related Artists: Takes 1 Column */}
          {related.length > 0 && (
            <div>
              <section className="flex flex-col gap-5 h-full">
                <h2 className="text-lg font-bold text-foreground tracking-tight">Fans Also Like</h2>
                <div className="grid grid-cols-2 gap-4">
                  {related.slice(0, 4).map((art) => (
                    <Link
                      key={art.id}
                      href={`/artist/${encodeURIComponent(art.name)}`}
                      className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] hover:border-white/10 text-center transition-all duration-300 group shadow-lg"
                    >
                      <div className="h-16 w-16 rounded-full overflow-hidden shadow-md border border-white/5 relative">
                        <img
                          src={art.picture_medium || art.picture_small}
                          alt={art.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                      <span className="font-bold text-xs truncate max-w-full text-foreground group-hover:text-primary transition-colors tracking-wide">
                        {art.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function ArtistPageSkeleton() {
  return (
    <div className='flex flex-col min-h-full overflow-x-hidden relative animate-pulse'>
      {/* Back Button */}
      <BackButton label="Artist" />

      {/* Hero Banner Skeleton */}
      <div className='relative h-[40vh] w-full bg-zinc-200 dark:bg-zinc-800/40 shrink-0' />

      {/* Content Stacking Layout */}
      <div className='flex flex-col gap-12 px-8 md:px-12 mt-8 pb-12'>
        {/* Popular Tracks Skeleton */}
        <section className='flex flex-col gap-5'>
          <div className='h-8 w-48 bg-zinc-200 dark:bg-zinc-800/60 rounded-xl' />
          <div className='rounded-2xl border border-white/5 p-4 flex flex-col gap-1'>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className='flex items-center justify-between py-3 px-4 rounded-xl'>
                <div className='flex items-center gap-3 min-w-0 flex-1'>
                  <span className='w-4 text-center text-muted-foreground/30 font-medium'>{index + 1}</span>
                  <div className='h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800/60 shrink-0' />
                  <div className='flex flex-col gap-1.5 min-w-0'>
                    <div className='h-4 w-40 md:w-60 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
                    <div className='h-3 w-24 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
                  </div>
                </div>
                <div className='h-4 w-8 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
              </div>
            ))}
          </div>
        </section>

        {/* Discography Skeleton */}
        <section className='flex flex-col gap-5'>
          <div className='h-8 w-40 bg-zinc-200 dark:bg-zinc-800/60 rounded-xl' />
          <div className='flex overflow-x-auto gap-2 pb-4'>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className='flex flex-col gap-3.5 p-2.5 rounded-[1.75rem] bg-transparent border border-transparent w-[145px] sm:w-[165px] md:w-[175px] shrink-0'>
                <div className='aspect-square rounded-2xl bg-zinc-200 dark:bg-zinc-800/60 w-full' />
                <div className='flex flex-col gap-1.5 px-1'>
                  <div className='h-4 w-full bg-zinc-200 dark:bg-zinc-800/60 rounded' />
                  <div className='h-3 w-16 bg-zinc-200 dark:bg-zinc-800/60 rounded' />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
