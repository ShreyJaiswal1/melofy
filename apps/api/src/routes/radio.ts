import { Router, Request, Response } from 'express';
import { requireFirebaseAuth } from '../lib/firebaseAuth';
import { getSimilarTracks } from '../lib/lastfm';
import { getYoutubeRecommendations } from '../lib/innertube';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../lib/firebase-admin';
import { redis } from '../lib/redis';
import { searchSpotifyTrack } from '../lib/spotify';
import { searchDeezerTrack } from '../lib/deezer';
import * as indexModule from '../index';

const router = Router();

interface CandidateTrack {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  duration: number;
  url: string;
}

function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\(official\s*(video|audio|lyric)?\)/gi, '')
    .replace(/\[official\s*(video|audio|lyric)?\]/gi, '')
    .replace(/\(video\)/gi, '')
    .replace(/\(audio\)/gi, '')
    .replace(/ft\.|feat\./gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .trim();
}

async function searchYoutubeArtwork(query: string): Promise<string> {
  try {
    const lavalink = indexModule.lavalink;
    if (!lavalink) return '';

    const node = lavalink.nodeManager.leastUsedNodes()[0];
    if (!node) return '';

    const result = await node.search(
      { query: `ytsearch:${query}` },
      { id: 'MelofyFallback' },
    );

    if (result.loadType === 'empty' || result.loadType === 'error') {
      return '';
    }

    const rawTracks = (result as any).tracks || (result as any).data || [];
    const firstTrack = rawTracks[0];
    if (firstTrack) {
      return firstTrack.info.artworkUrl || `https://img.youtube.com/vi/${firstTrack.info.identifier}/mqdefault.jpg`;
    }
  } catch (err) {
    console.error(`[Youtube Artwork Search] Failed for query "${query}":`, err);
  }
  return '';
}

async function searchAppleMusicArtwork(title: string, artist: string): Promise<string> {
  try {
    const query = `${artist} - ${title}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json() as any;
      const results = data?.results;
      if (Array.isArray(results) && results.length > 0) {
        const rawUrl = results[0].artworkUrl100 || results[0].artworkUrl60;
        if (rawUrl) {
          return rawUrl.replace(/\/\d+x\d+bb\.jpg$/, '/600x600bb.jpg');
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Apple Music Artwork] Failed for "${artist} - ${title}":`, err.message || err);
  }
  return '';
}

async function resolveTrackArtwork(title: string, artist: string): Promise<string> {
  const cacheKey = `artwork:resolve:${normalizeString(title)}:${normalizeString(artist)}`;
  try {
    const cached = await redis.get(cacheKey);
    if (typeof cached === 'string') return cached;
  } catch {}

  const searchQuery = `${artist} - ${title}`;
  
  // 1. Try Spotify
  try {
    const spotifyResult = await searchSpotifyTrack(searchQuery);
    if (spotifyResult && spotifyResult.artworkUrl) {
      await redis.set(cacheKey, spotifyResult.artworkUrl, { ex: 604800 }); // 7 days TTL
      return spotifyResult.artworkUrl;
    }
  } catch (err) {
    console.warn(`[Artwork Resolve] Spotify failed for "${searchQuery}":`, err);
  }

  // 2. Try Apple Music
  try {
    const appleArtwork = await searchAppleMusicArtwork(title, artist);
    if (appleArtwork) {
      await redis.set(cacheKey, appleArtwork, { ex: 604800 }); // 7 days TTL
      return appleArtwork;
    }
  } catch (err) {
    console.warn(`[Artwork Resolve] Apple Music failed for "${searchQuery}":`, err);
  }

  // 3. Try Deezer (fallback)
  try {
    const deezerResult = await searchDeezerTrack(searchQuery);
    if (deezerResult && deezerResult.artworkUrl) {
      await redis.set(cacheKey, deezerResult.artworkUrl, { ex: 604800 }); // 7 days TTL
      return deezerResult.artworkUrl;
    }
  } catch (err) {
    console.warn(`[Artwork Resolve] Deezer failed for "${searchQuery}":`, err);
  }

  // 4. Try YouTube (fallback)
  try {
    const ytArtwork = await searchYoutubeArtwork(searchQuery);
    if (ytArtwork) {
      await redis.set(cacheKey, ytArtwork, { ex: 604800 }); // 7 days TTL
      return ytArtwork;
    }
  } catch (err) {
    console.warn(`[Artwork Resolve] YouTube failed for "${searchQuery}":`, err);
  }

  // Cache empty string to prevent hitting APIs again immediately
  try {
    await redis.set(cacheKey, '', { ex: 86400 }); // 1 day TTL for empty matches
  } catch {}
  
  return '';
}

const CLEAN_PATTERNS = [
  /\s*\([^)]*(?:official|lyrics?|video|audio|mv|visualizer|color\s*coded|hd|4k|prod\.)[^)]*\)/gi,
  /\s*\[[^\]]*(?:official|lyrics?|video|audio|mv|visualizer|color\s*coded|hd|4k|prod\.)[^\]]*\]/gi,
  /\s*-\s*Topic$/i,
  /VEVO$/i,
] as const;

function cleanMetadata(text: string): string {
  let result = text;
  for (const pattern of CLEAN_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

function primaryArtist(artistName: string): string {
  return artistName.split(/,|&|\/|;|\b(?:feat\.|ft\.|and|with)\b/i)[0].trim();
}

function cleanTitleAndArtist(title: string, artist: string) {
  let cleanTitle = cleanMetadata(title);
  let cleanArtist = cleanMetadata(primaryArtist(artist));

  if (cleanArtist && cleanTitle.toLowerCase().startsWith(cleanArtist.toLowerCase())) {
    const withoutArtist = cleanTitle.substring(cleanArtist.length).replace(/^\s*[-:]\s*/, '');
    if (withoutArtist.length > 0) {
      cleanTitle = withoutArtist;
    }
  }

  return { cleanTitle, cleanArtist };
}

// GET /api/radio - Build a personalized recommendation queue
router.get('/', requireFirebaseAuth, async (req: Request, res: Response) => {
  const { videoId, spotifyId, artist, title, region } = req.query as {
    videoId?: string;
    spotifyId?: string;
    artist?: string;
    title?: string;
    region?: string;
  };

  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 1. Fetch user's play history from Firestore to filter out already played tracks
  const playedKeys = new Set<string>();
  try {
    const db = getFirestore(getAdminApp());
    const snapshot = await db
      .collection(`users/${userId}/plays`)
      .orderBy('playedAt', 'desc')
      .limit(50)
      .get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.title && data.artist) {
        playedKeys.add(`${normalizeString(data.title)} - ${normalizeString(data.artist)}`);
      }
    });
  } catch (err) {
    console.error('[Radio] Play history retrieval failed (proceeding without filter):', err);
  }

  try {
    const { cleanTitle, cleanArtist } = artist && title 
      ? cleanTitleAndArtist(title, artist) 
      : { cleanTitle: '', cleanArtist: '' };

    // 2. Fetch candidates from Last.fm (with primary artist fallback) and YouTube NodeLink
    const youtubePromise = videoId ? getYoutubeRecommendations(videoId, userId) : Promise.resolve([]);

    let lastfmTracks: any[] = [];
    if (cleanArtist && cleanTitle) {
      try {
        console.log(`[Radio] Querying Last.fm with: "${cleanArtist}" - "${cleanTitle}"`);
        lastfmTracks = await getSimilarTracks(cleanArtist, cleanTitle);
      } catch (err: any) {
        console.warn(`[Radio] Last.fm query failed for "${cleanArtist}":`, err.message || err);
      }

      // If no tracks returned, fall back to the primary artist name
      if (!lastfmTracks || lastfmTracks.length === 0) {
        const primArtist = primaryArtist(cleanArtist);
        if (primArtist && primArtist !== cleanArtist) {
          try {
            console.log(`[Radio] Fallback: Querying Last.fm with primary artist: "${primArtist}" - "${cleanTitle}"`);
            lastfmTracks = await getSimilarTracks(primArtist, cleanTitle);
          } catch (err: any) {
            console.warn(`[Radio] Last.fm fallback failed for "${primArtist}":`, err.message || err);
          }
        }
      }
    }

    const youtubeTracks = await youtubePromise;

    const candidates = new Map<string, CandidateTrack>();

    // Add YouTube recommendation candidates
    youtubeTracks.forEach((track: any) => {
      const key = `${normalizeString(track.title)} - ${normalizeString(track.artist)}`;
      candidates.set(key, {
        id: track.id,
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artworkUrl,
        duration: track.duration,
        url: track.url || '',
      });
    });

    // Add Last.fm similarity candidates (mapped to player Track format)
    lastfmTracks.forEach((track: any) => {
      const trackTitle = track.name;
      const trackArtist = track.artist?.name;
      if (!trackTitle || !trackArtist) return;

      const key = `${normalizeString(trackTitle)} - ${normalizeString(trackArtist)}`;
      // Skip if already added from YouTube (prefer YouTube metadata/IDs where possible)
      if (candidates.has(key)) return;

      // Note: Last.fm tracks don't have video URLs or artwork, they will resolve lazily on client play
      candidates.set(key, {
        id: `lastfm:${normalizeString(trackTitle)}:${normalizeString(trackArtist)}`,
        title: trackTitle,
        artist: trackArtist,
        artworkUrl: '',
        duration: (parseInt(track.duration) || 240) * 1000,
        url: '',
      });
    });

    // 3. Filter against user history and the currently playing seed track
    const seedKey = artist && title ? `${normalizeString(title)} - ${normalizeString(artist)}` : '';
    const seedTitleNorm = title ? normalizeString(title) : '';

    // Extract all recently played titles to prevent any title repetition
    const playedTitles = new Set<string>();
    playedKeys.forEach(k => {
      const parts = k.split(' - ');
      if (parts[0]) playedTitles.add(parts[0]);
    });

    const filtered = Array.from(candidates.entries())
      .filter(([key, track]) => {
        const trackTitleNorm = normalizeString(track.title);
        // 1. Skip if it is the exact same title as the seed track (prevents loops like "Closer")
        if (trackTitleNorm === seedTitleNorm) return false;
        
        // 2. Skip if full key is matched in played history
        if (playedKeys.has(key)) return false;
        
        // 3. Skip if the title has been played recently
        if (playedTitles.has(trackTitleNorm)) return false;

        return true;
      })
      .map(([, track]) => track);

    // 4. Rank with a slight index-based sorting + random jitter
    const ranked = filtered
      .map((track, idx) => ({ ...track, index: idx }))
      .sort((a, b) => {
        const scoreA = a.index + Math.random() * 5;
        const scoreB = b.index + Math.random() * 5;
        return scoreA - scoreB;
      })
      .map(({ index, ...track }) => track)
      .slice(0, 40);

    // Resolve artwork for the top 25 candidate tracks in parallel
    const resolveCount = Math.min(ranked.length, 25);
    const resolvedTracks = [...ranked];
    
    await Promise.all(
      Array.from({ length: resolveCount }).map(async (_, idx) => {
        const track = resolvedTracks[idx];
        if (track && !track.artworkUrl) {
          track.artworkUrl = await resolveTrackArtwork(track.title, track.artist);
        }
      })
    );

    res.json({ tracks: resolvedTracks });
  } catch (error) {
    console.error('[Radio] Autoplay queue build failed:', error);
    res.status(500).json({ error: 'Failed to build autoplay radio queue' });
  }
});

// POST /api/radio/log-play - Log a track play to Firestore via Admin SDK
router.post('/log-play', requireFirebaseAuth, async (req: Request, res: Response) => {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { track } = req.body;
  if (!track || !track.title || !track.artist) {
    return res.status(400).json({ error: 'Invalid track data' });
  }

  try {
    const db = getFirestore(getAdminApp());
    await db.collection(`users/${userId}/plays`).add({
      trackId: track.id || '',
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl || '',
      playedAt: new Date(),
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[Radio] Failed to log track play to Firestore:', error);
    res.status(500).json({ error: 'Failed to log play history' });
  }
});

export default router;
