'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Play, Music2, Pause } from 'lucide-react';
import { Track, usePlayerStore } from '@/store/usePlayerStore';
import { resolvePlayableTrack, TrackItem } from '@/components/ui/TrackList';
import { TrackOptionsMenu } from '@/components/ui/TrackOptionsMenu';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ListPlus } from 'lucide-react';
import {
  mapSpotifyTrackToTrackItem,
  mapTrackItemToPlayerTrack,
  type SpotifyTrackLike,
} from '@/lib/track-mappers';
import { cn } from '@/lib/utils';

interface TrackCarouselProps {
  title: string;
  tracks: (SpotifyTrackLike | Track)[];
  onPlayAll?: () => void;
  className?: string;
}

export function TrackCarousel({
  title,
  tracks,
  onPlayAll,
  className,
}: TrackCarouselProps) {
  const playInContext = usePlayerStore((state) => state.playInContext);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const pause = usePlayerStore((state) => state.pause);
  const resume = usePlayerStore((state) => state.resume);

  const trackItems: TrackItem[] = useMemo(
    () =>
      (tracks || []).map((track) => {
        if ('artworkUrl' in track && 'title' in track) {
          return {
            id: track.id,
            identifier: track.identifier,
            title: track.title,
            artist: track.artist,
            artworkUrl: track.artworkUrl,
            duration: track.duration,
            album: track.title,
            encoded: track.url,
          };
        }
        return mapSpotifyTrackToTrackItem(track as SpotifyTrackLike);
      }),
    [tracks],
  );

  const contextTracks = useMemo(
    () => trackItems.map((track) => mapTrackItemToPlayerTrack(track)),
    [trackItems],
  );

  const handlePlay = useCallback(
    async (index: number) => {
      const item = trackItems.at(index);
      if (!item) return;

      if (currentTrack?.title === item.title) {
        if (isPlaying) {
          pause();
        } else {
          resume();
        }
        return;
      }

      const resolved = await resolvePlayableTrack(item);
      if (!resolved) {
        toast.error('Could not find a playable version of this track');
        return;
      }

      const nextContextTracks = [...contextTracks];
      nextContextTracks.splice(index, 1, resolved);
      playInContext(resolved, nextContextTracks);
    },
    [contextTracks, currentTrack?.title, isPlaying, pause, playInContext, resume, trackItems],
  );

  const addToQueue = usePlayerStore((state) => state.addToQueue);

  const handleAddToQueue = useCallback(
    async (index: number) => {
      const item = trackItems.at(index);
      if (!item) return;

      let trackToAdd = contextTracks.at(index);
      if (!trackToAdd) return;
      if (!trackToAdd.url) {
        const resolved = await resolvePlayableTrack(item);
        if (!resolved) {
          toast.error('Could not find a playable version of this track');
          return;
        }
        trackToAdd = resolved;
      }
      addToQueue(trackToAdd);
      
      toast('Added to Queue', {
        className: 'bg-primary text-primary-foreground border-none shadow-2xl',
        description: (
          <div className="flex items-center gap-2 mt-1">
            {trackToAdd.artworkUrl && (
              <img src={trackToAdd.artworkUrl} alt="" className="h-8 w-8 rounded-md object-cover shadow-md brightness-90" />
            )}
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs truncate opacity-90">{trackToAdd.title}</span>
            </div>
          </div>
        ),
        icon: <ListPlus className="h-4 w-4" />,
        duration: 2500,
      });
    },
    [contextTracks, trackItems, addToQueue]
  );

  if (!tracks || tracks.length === 0) return null;

  return (
    <section className={cn('mt-8', className)}>
      <div className='flex items-center justify-between mb-6'>
        <h3 className='text-3xl font-bold text-foreground flex items-center gap-2'>
          {title}
        </h3>
        {onPlayAll && (
          <Button
            variant='ghost'
            size='sm'
            className='text-primary hover:text-primary/80 flex items-center gap-2 group/playall'
            onClick={onPlayAll}
          >
            <Play className='h-4 w-4 fill-current group-hover/playall:scale-110 transition-transform' />
            <span className='text-xs font-bold'>
              Play All
            </span>
          </Button>
        )}
      </div>
      <div className='flex overflow-x-auto gap-2 pb-6 custom-scrollbar carousel-scrollbar scroll-smooth snap-x snap-mandatory'>
        {tracks.map((track, index) => {
          const trackItem = trackItems.at(index);
          const titleText = trackItem?.title || 'Unknown Title';
          const artistText = trackItem?.artist || 'Unknown Artist';
          const artworkUrl = trackItem?.artworkUrl || '';
          const isActive = currentTrack?.title === titleText && isPlaying;

          return (
            <motion.div
              key={(trackItem?.id || 'track') + index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileTap={{ scale: 0.98 }}
              className='flex flex-col gap-3.5 p-2.5 rounded-[1.75rem] bg-transparent hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all duration-300 group cursor-pointer snap-start min-w-[145px] w-[145px] sm:min-w-[165px] sm:w-[165px] md:min-w-[175px] md:w-[175px] shrink-0 shadow-lg'
              onClick={() => void handlePlay(index)}
            >
              <div className='aspect-square rounded-2xl bg-muted relative overflow-hidden shadow-md group-hover:shadow-primary/10 transition-all duration-500 border border-white/5'>
                <div className={cn('absolute bottom-3 right-3 z-20 transition-opacity duration-300', !isActive && 'opacity-0 group-hover:opacity-100')}>
                  <div className='w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-xl group-hover:scale-105 transition-transform'>
                    {isActive ? (
                      <Pause className='h-4 w-4 fill-current' />
                    ) : (
                      <Play className='h-4 w-4 fill-current ml-0.5' />
                    )}
                  </div>
                </div>
                <div className='absolute inset-0 bg-background/20 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none' />
                <div className='h-full w-full bg-linear-to-br from-muted to-background transition-transform duration-700 flex items-center justify-center'>
                  {artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt={titleText}
                      className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-500'
                    />
                  ) : (
                    <Music2 className='h-12 w-12 text-muted-foreground/40' />
                  )}
                </div>
              </div>
              <div className='flex items-start justify-between px-1 gap-2'>
                <div className='flex flex-col min-w-0'>
                  <p className='text-foreground font-bold truncate text-sm group-hover:text-primary transition-colors tracking-wide'>
                    {titleText}
                  </p>
                  <p className='text-muted-foreground text-[10px] truncate uppercase tracking-wider mt-1 font-semibold font-outfit'>
                    {artistText}
                  </p>
                </div>
                <div className='opacity-0 group-hover:opacity-100 transition-opacity shrink-0' onClick={(e) => e.stopPropagation()}>
                  <TrackOptionsMenu 
                    track={contextTracks.at(index)!} 
                    onAddToQueue={() => handleAddToQueue(index)} 
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
