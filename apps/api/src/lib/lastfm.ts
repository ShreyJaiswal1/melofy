import axios from 'axios';
import { redis } from './redis';

// A widely used public Last.fm API key as a fallback
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || '4a9f55839123e7f6cfd9a8e0f6c2419c';
const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const USER_AGENT = 'Melofy/1.0.5 (https://github.com/lazyshrey/melofy)';

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get<string | object>(key);
    if (!data) return null;
    return (typeof data === 'string' ? JSON.parse(data) : data) as T;
  } catch {
    return null;
  }
}

async function setCached(key: string, value: any, ttlSeconds: number) {
  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (err) {
    console.error(`[Redis] Last.fm cache write failed for key ${key}:`, err);
  }
}

export async function getSimilarTracks(artist: string, title: string) {
  const normArtist = artist.toLowerCase().trim();
  const normTitle = title.toLowerCase().trim();
  const cacheKey = `lastfm:similar:track:${normArtist}:${normTitle}`;

  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(LASTFM_API_URL, {
      params: {
        method: 'track.getsimilar',
        artist: trimmedString(artist),
        track: trimmedString(title),
        api_key: LASTFM_API_KEY,
        format: 'json',
        limit: 25,
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
    });

    const rawTracks = res.data?.similartracks?.track;
    const tracks = Array.isArray(rawTracks)
      ? rawTracks
      : rawTracks
      ? [rawTracks]
      : [];

    await setCached(cacheKey, tracks, 43200); // 12 hours TTL
    return tracks;
  } catch (error) {
    console.error(`[Last.fm] Failed to fetch similar tracks for ${artist} - ${title}:`, error);
    return [];
  }
}

export async function getSimilarArtists(artist: string) {
  const normArtist = artist.toLowerCase().trim();
  const cacheKey = `lastfm:similar:artist:${normArtist}`;

  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(LASTFM_API_URL, {
      params: {
        method: 'artist.getsimilar',
        artist: trimmedString(artist),
        api_key: LASTFM_API_KEY,
        format: 'json',
        limit: 15,
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
    });

    const rawArtists = res.data?.similarartists?.artist;
    const artists = Array.isArray(rawArtists)
      ? rawArtists
      : rawArtists
      ? [rawArtists]
      : [];

    await setCached(cacheKey, artists, 86400); // 24 hours TTL
    return artists;
  } catch (error) {
    console.error(`[Last.fm] Failed to fetch similar artists for ${artist}:`, error);
    return [];
  }
}

export async function getArtistInfo(artist: string) {
  const normArtist = artist.toLowerCase().trim();
  const cacheKey = `lastfm:artist:info:${normArtist}`;

  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(LASTFM_API_URL, {
      params: {
        method: 'artist.getinfo',
        artist: trimmedString(artist),
        api_key: LASTFM_API_KEY,
        format: 'json',
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
    });

    const info = res.data?.artist || null;
    if (info) {
      await setCached(cacheKey, info, 86400); // 24 hours TTL
    }
    return info;
  } catch (error) {
    console.error(`[Last.fm] Failed to fetch artist info for ${artist}:`, error);
    return null;
  }
}

function trimmedString(val: string): string {
  return val.trim();
}

export async function getTopTracks(country?: string) {
  const cacheKey = `lastfm:top-tracks:${country ? country.toLowerCase().trim() : 'global'}`;
  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const isGeo = Boolean(country && country.toLowerCase() !== 'us' && country.toLowerCase() !== 'global');
    const params: Record<string, any> = {
      method: isGeo ? 'geo.gettoptracks' : 'chart.gettoptracks',
      api_key: LASTFM_API_KEY,
      format: 'json',
      limit: 30,
    };
    if (isGeo) {
      params.country = country;
    }

    const res = await axios.get(LASTFM_API_URL, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
    });

    const rawTracks = isGeo ? res.data?.tracks?.track : res.data?.tracks?.track;
    const tracks = Array.isArray(rawTracks) ? rawTracks : rawTracks ? [rawTracks] : [];

    await setCached(cacheKey, tracks, 43200); // 12 hours TTL
    return tracks;
  } catch (error) {
    console.error(`[Last.fm] Failed to fetch top tracks for country ${country}:`, error);
    // Fallback to global top tracks if geo query fails
    if (country && country.toLowerCase() !== 'global') {
      return getTopTracks();
    }
    return [];
  }
}
