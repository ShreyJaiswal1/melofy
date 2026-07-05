import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore, Track } from '@/store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuth } from '@/lib/firebase/auth-context';
import { toast } from 'sonner';
import { useRegion } from '@/hooks/useRegion';

export function useTrackDiscovery() {
  const { user } = useAuth();
  const [isBuffering, setIsBuffering] = useState(false);
  const [isFetchingAutoplay, setIsFetchingAutoplay] = useState(false);
  const pendingTrackResolutionRef = useRef<Map<string, Promise<void>>>(new Map());
  const { country } = useRegion();
  const autoplayBufferRef = useRef<Track[]>([]);
  const isFetchingQueueRef = useRef(false);

  const {
    currentTrack,
    isAutoplay,
    play,
    updateTrackUrl,
  } = usePlayerStore(useShallow((state) => ({
    currentTrack: state.currentTrack,
    isAutoplay: state.isAutoplay,
    play: state.play,
    updateTrackUrl: state.updateTrackUrl,
  })));

  const getAuthHeader = useCallback(async () => {
    if (!user) return null;
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  // URL resolution for Spotify/Metatracks
  useEffect(() => {
    let cancelled = false;
    const resolveMissingUrl = async () => {
      if (!currentTrack || currentTrack.url) return;
      const activeResolution = pendingTrackResolutionRef.current.get(currentTrack.id);
      if (activeResolution) return;

      const resolutionPromise = (async () => {
        setIsBuffering(true);
        let success = false;
        try {
          const searchQuery = `${currentTrack.title} ${currentTrack.artist}`;
          const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
            headers: (await getAuthHeader()) || {},
          });
          const data = await res.json();
          if (cancelled) return;
          if (data?.tracks?.length > 0) {
            const found = data.tracks[0];
            if (found?.encoded) {
              updateTrackUrl(
                currentTrack.id,
                found.encoded,
                found.info.identifier,
                found.info.length,
                currentTrack.artworkUrl || found.info.artworkUrl || undefined
              );
              success = true;
            }
          }
        } catch (error) {
          console.error('[TrackResolution] Failed:', error);
        } finally {
          pendingTrackResolutionRef.current.delete(currentTrack.id);
          if (!cancelled) {
            setIsBuffering(false);
            if (!success) {
              const partyState = usePlayerStore.getState();
              if (partyState.partyId && !partyState.isPartyHost) {
                toast.error(`Track "${currentTrack.title}" is unavailable. Waiting for host sync...`);
                usePlayerStore.getState().pause(true);
                return;
              }
              toast.error(`Track "${currentTrack.title}" is unavailable. Skipping...`);
              usePlayerStore.getState().playNext(true, true);
            }
          }
        }
      })();
      pendingTrackResolutionRef.current.set(currentTrack.id, resolutionPromise);
    };
    void resolveMissingUrl();
    return () => { cancelled = true; };
  }, [currentTrack, getAuthHeader, updateTrackUrl]);

  const prefetchAutoplayQueue = useCallback(async (seedTrack: Track) => {
    if (isFetchingQueueRef.current) return;
    isFetchingQueueRef.current = true;
    console.log(`[Autoplay] Background pre-fetching radio queue for seed: "${seedTrack.title}" by ${seedTrack.artist}`);
    try {
      const params = new URLSearchParams();
      if (seedTrack.id) params.append('spotifyId', seedTrack.id);
      if (seedTrack.identifier) params.append('videoId', seedTrack.identifier);
      params.append('artist', seedTrack.artist);
      params.append('title', seedTrack.title);
      params.append('region', country);

      const res = await fetch(`/api/radio?${params.toString()}`, {
        headers: (await getAuthHeader()) || {},
      });
      if (!res.ok) throw new Error('Failed to fetch radio candidates');
      const data = await res.json() as { tracks?: any[] };
      
      if (data?.tracks) {
        const mapped = data.tracks.map((t) => ({
          id: t.id,
          identifier: t.id.startsWith('lastfm:') ? undefined : t.id,
          title: t.title,
          artist: t.artist,
          artworkUrl: t.artworkUrl,
          duration: t.duration,
          url: t.url || undefined,
        }));
        
        // Filter out existing tracks in the buffer to prevent duplicates
        const existingKeys = new Set(autoplayBufferRef.current.map(item => `${item.title.toLowerCase()} - ${item.artist.toLowerCase()}`));
        const newTracks = mapped.filter(t => !existingKeys.has(`${t.title.toLowerCase()} - ${t.artist.toLowerCase()}`));
        
        autoplayBufferRef.current.push(...newTracks);
        console.log(`[Autoplay] Refilled pre-fetch buffer. Current buffer size: ${autoplayBufferRef.current.length} tracks.`);
      }
    } catch (error) {
      console.error('[Autoplay Prefetch] Failed:', error);
    } finally {
      isFetchingQueueRef.current = false;
    }
  }, [getAuthHeader, country]);

  // Pre-fetch autoplay buffer when current track changes (manual play or auto-advance)
  useEffect(() => {
    if (!currentTrack) {
      console.log('[Autoplay] No active track. Cleared buffer.');
      autoplayBufferRef.current = [];
      return;
    }
    console.log(`[Autoplay] Current track changed to: "${currentTrack.title}". Resetting buffer and initiating pre-fetch...`);
    // Reset buffer and pre-fetch recommendations for the new song
    autoplayBufferRef.current = [];
    void prefetchAutoplayQueue(currentTrack);
  }, [currentTrack?.id, prefetchAutoplayQueue]);

  // Autoplay Trigger
  const triggerAutoplay = useCallback(async () => {
    console.log(`[Autoplay] triggerAutoplay requested. isAutoplay: ${isAutoplay}, currentTrack: "${currentTrack?.title}", isFetching: ${isFetchingAutoplay}, buffer size: ${autoplayBufferRef.current.length}`);
    if (!isAutoplay || !currentTrack || isFetchingAutoplay) return;
    
    // Check if buffer has items
    if (autoplayBufferRef.current.length > 0) {
      const nextTrack = autoplayBufferRef.current.shift()!;
      console.log(`[Autoplay] Advancing to next track from buffer: "${nextTrack.title}" by ${nextTrack.artist}`);
      play(nextTrack);
      
      // Trigger background pre-fetch if buffer runs low
      if (autoplayBufferRef.current.length < 5) {
        void prefetchAutoplayQueue(nextTrack);
      }
      return;
    }

    setIsFetchingAutoplay(true);
    try {
      // Blocking fetch on empty buffer
      const params = new URLSearchParams();
      if (currentTrack.id) params.append('spotifyId', currentTrack.id);
      if (currentTrack.identifier) params.append('videoId', currentTrack.identifier);
      params.append('artist', currentTrack.artist);
      params.append('title', currentTrack.title);
      params.append('region', country);

      const res = await fetch(`/api/radio?${params.toString()}`, {
        headers: (await getAuthHeader()) || {},
      });
      if (!res.ok) throw new Error('Radio endpoint request failed');

      const data = await res.json() as { tracks?: any[] };
      if (!data?.tracks?.length) return;

      const mapped = data.tracks.map((t) => ({
        id: t.id,
        identifier: t.id.startsWith('lastfm:') ? undefined : t.id,
        title: t.title,
        artist: t.artist,
        artworkUrl: t.artworkUrl,
        duration: t.duration,
        url: t.url || undefined,
      }));

      const nextTrack = mapped[0];
      play(nextTrack);

      // Save rest to buffer
      autoplayBufferRef.current = mapped.slice(1);
      
      // Refill in background if needed
      if (autoplayBufferRef.current.length < 5) {
        void prefetchAutoplayQueue(nextTrack);
      }
    } catch (error) {
      console.error('[Autoplay] Failed:', error);
      
      // Fallback to legacy recommendations if new radio fails
      try {
        const legacyParams = new URLSearchParams();
        if (currentTrack.id) legacyParams.append('spotifyId', currentTrack.id);
        if (currentTrack.identifier) legacyParams.append('videoId', currentTrack.identifier);
        legacyParams.append('query', `${currentTrack.title} ${currentTrack.artist}`);

        const legacyRes = await fetch(`/api/recommendations?${legacyParams.toString()}`, {
          headers: (await getAuthHeader()) || {},
        });
        const legacyData = await legacyRes.json() as { tracks?: { id: string; title: string; encoded: string; artist: string; artwork: string; duration: number }[] };
        if (legacyData?.tracks?.length) {
          const fallbackTrack = legacyData.tracks[0];
          play({
            id: fallbackTrack.id,
            identifier: fallbackTrack.id,
            title: fallbackTrack.title,
            artist: fallbackTrack.artist,
            artworkUrl: fallbackTrack.artwork,
            duration: fallbackTrack.duration,
            url: fallbackTrack.encoded,
          });
        }
      } catch (fallbackError) {
        console.error('[Autoplay Fallback] Failed:', fallbackError);
      }
    } finally {
      setIsFetchingAutoplay(false);
    }
  }, [currentTrack, getAuthHeader, isAutoplay, isFetchingAutoplay, play, country, prefetchAutoplayQueue]);

  return { isBuffering, setIsBuffering, triggerAutoplay };
}
