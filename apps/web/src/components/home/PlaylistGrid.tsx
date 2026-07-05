'use client';
/* eslint-disable @next/next/no-img-element */

import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Disc, Play, Plus } from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { resolvePlayableTrack, TrackItem } from '@/components/ui/TrackList';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { mapTrackItemToPlayerTrack } from '@/lib/track-mappers';
import { cn } from '@/lib/utils';

interface PlaylistGridItem {
  id: string;
  name?: string;
  identifier?: string;
  duration_ms?: number;
  encoded?: string;
  description?: string;
  images?: Array<{ url?: string }>;
  artists?: Array<{ name?: string }>;
  owner?: { display_name?: string };
  tracks?: { total?: number };
  type?: string;
}

interface PlaylistGridProps {
  title: string;
  items: PlaylistGridItem[];
  isAlbum?: boolean;
  isCarousel?: boolean;
  onPlayPlaylist?: (playlist: PlaylistGridItem) => void;
  onImport?: (playlist: PlaylistGridItem) => void;
  className?: string;
}

export function PlaylistGrid({
  title,
  items,
  isAlbum = false,
  isCarousel = false,
  onPlayPlaylist,
  onImport,
  className,
}: PlaylistGridProps) {
  const playInContext = usePlayerStore((state) => state.playInContext);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);
  const router = useRouter();

  const albumContextTracks = useMemo(
    () =>
      (items || []).map((item) => {
        const trackItem: TrackItem = {
          id: item.id,
          identifier: item.identifier,
          title: item.name || 'Unknown Title',
          artist: item.artists?.[0]?.name || 'Unknown',
          artworkUrl: item.images?.[0]?.url || '',
          duration: item.duration_ms || 0,
          album: item.name || 'Unknown Album',
          encoded: item.encoded || '',
        };

        return mapTrackItemToPlayerTrack(trackItem);
      }),
    [items],
  );

  const handlePlayItem = useCallback(
    async (item: PlaylistGridItem, index: number) => {
      if (onPlayPlaylist) {
        onPlayPlaylist(item);
        return;
      }

      if (!isAlbum) return;

      const trackTitle = item.name;
      if (currentTrack?.title === trackTitle) {
        if (isPlaying) {
          pause();
        } else {
          resume();
        }
        return;
      }

      const trackItem: TrackItem = {
        id: item.id,
        title: item.name || 'Unknown Title',
        artist: item.artists?.[0]?.name || 'Unknown',
        artworkUrl: item.images?.[0]?.url || '',
        duration: item.duration_ms || 0,
        album: item.name || 'Unknown Album',
      };

      const resolved = await resolvePlayableTrack(trackItem);
      if (!resolved) {
        toast.error('Could not find a playable version of this track');
        return;
      }

      const nextContextTracks = [...albumContextTracks];
      if (index >= 0 && index < nextContextTracks.length) {
        nextContextTracks.splice(index, 1, resolved);
      }

      playInContext(resolved, nextContextTracks);
    },
    [albumContextTracks, currentTrack?.title, isAlbum, isPlaying, onPlayPlaylist, pause, playInContext, resume],
  );

  if (!items || items.length === 0) return null;

  return (
    <section className={cn('mt-8', className)}>
      <div className='flex items-center justify-between mb-6'>
        <h3 className='text-3xl font-bold text-foreground flex items-center gap-2'>
          {title}
        </h3>
        {onPlayPlaylist && items.length > 0 && (
          <Button
            variant='ghost'
            size='sm'
            className='text-primary hover:text-primary/80 flex items-center gap-2 group/playall'
            onClick={() => onPlayPlaylist(items[0])}
          >
            <Play className='h-4 w-4 fill-current group-hover/playall:scale-110 transition-transform' />
            <span className='text-xs font-bold'>
              Play Featured
            </span>
          </Button>
        )}
      </div>
      <div
        className={
          isCarousel
            ? 'flex overflow-x-auto gap-2 pb-4 custom-scrollbar carousel-scrollbar snap-x snap-mandatory scroll-smooth'
            : 'grid grid-cols-[repeat(auto-fill,minmax(145px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(175px,1fr))] gap-2'
        }
      >
        {items.map((item, index) => {
          const isAlbumType = item.type === 'album' || item.id.startsWith('deezer:album:');
          const isArtistType = item.type === 'artist' || item.id.startsWith('deezer:artist:');
          
          let cardHref = `/playlist/${item.id}`;
          if (isAlbumType) {
            cardHref = `/album/${item.id.replace('deezer:album:', '')}`;
          } else if (isArtistType) {
            cardHref = `/artist/${item.id.replace('deezer:artist:', '')}`;
          }

          return (
            <motion.div
              key={item.id + index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'flex flex-col gap-3.5 p-2.5 rounded-[1.75rem] bg-transparent hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all duration-300 group cursor-pointer shadow-lg',
                isCarousel && 'min-w-[145px] w-[145px] sm:min-w-[165px] sm:w-[165px] md:min-w-[175px] md:w-[175px] snap-start shrink-0'
              )}
              onClick={() => router.push(cardHref)}
            >
              <div className='aspect-square rounded-2xl bg-muted relative overflow-hidden shadow-md group-hover:shadow-primary/10 transition-all duration-500 border border-white/5'>
                <div className='absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10'>
                  <Button
                    size='icon'
                    className='h-11 w-11 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground active:scale-95 transition-all shadow-xl'
                    onClick={(event) => {
                      event.stopPropagation();
                      void handlePlayItem(item, index);
                    }}
                  >
                    <Play className='h-5 w-5 fill-current transition-colors ml-0.5' />
                  </Button>
                  {onImport && (
                    <Button
                      size='icon'
                      variant='outline'
                      className='h-11 w-11 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white active:scale-95 transition-all shadow-xl'
                      onClick={(event) => {
                        event.stopPropagation();
                        onImport(item);
                      }}
                    >
                      <Plus className='h-5 w-5' />
                    </Button>
                  )}
                </div>

                <div className='h-full w-full bg-linear-to-br from-muted to-background transition-transform duration-700 flex items-center justify-center'>
                  {item.images?.[0]?.url ? (
                    <img
                      src={item.images[0].url}
                      alt={item.name}
                      className='h-full w-full object-cover group-hover:scale-105 transition-transform duration-500'
                    />
                  ) : (
                    <Disc className='h-12 w-12 text-muted-foreground/40' />
                  )}
                </div>

                <div className='absolute bottom-3 right-3 bg-background/60 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/5 z-20'>
                  <p className='text-[9px] text-foreground font-bold uppercase tracking-wider'>
                    {isArtistType
                      ? 'Artist'
                      : isAlbumType
                        ? 'Album'
                        : item.tracks?.total
                          ? `${item.tracks.total} Tracks`
                          : 'Playlist'}
                  </p>
                </div>
              </div>
              <div className='flex flex-col px-1'>
                <p className='text-foreground font-bold truncate text-sm group-hover:text-primary transition-colors tracking-wide'>
                  {item.name}
                </p>
                <p className='text-muted-foreground text-[10px] truncate uppercase tracking-wider mt-1 font-semibold font-outfit'>
                  {isAlbumType
                    ? 'Saved Album'
                    : isArtistType
                      ? 'Saved Artist'
                      : item.type === 'custom'
                        ? 'Melofy Playlist'
                        : item.type === 'spotify'
                          ? 'Spotify Import'
                          : item.type === 'youtube'
                            ? 'YouTube Playlist'
                            : item.owner?.display_name ||
                              item.description ||
                              'Playlist'}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  );
}
