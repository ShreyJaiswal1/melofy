import axios from 'axios';
import { redis } from './redis';
import * as indexModule from '../index';
import { getTopTracks as getLastfmTopTracks } from './lastfm';
import { searchSpotifyTrack } from './spotify';

const DEEZER_API_BASE = 'https://api.deezer.com';

// Cache helpers
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
    console.error(`[Redis] Cache write failed for key ${key}:`, err);
  }
}

// Maps some ISO country codes to specific Deezer chart/editorial genre IDs
const COUNTRY_CHART_MAP: Record<string, number> = {
  US: 0,
  GB: 0,
  IN: 0, // Fallback to global top charts for now, or editorial sub-genres if defined
  FR: 116, // Rap
  DE: 0,
  BR: 0,
};

const COUNTRY_MAP: Record<string, string> = {
  IN: 'India',
  US: 'United States',
  GB: 'United Kingdom',
  FR: 'France',
  DE: 'Germany',
  BR: 'Brazil',
};

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

async function searchAppleMusicArtwork(title: string, artist: string): Promise<string> {
  try {
    const query = `${artist} - ${title}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
    const res = await axios.get(url, { timeout: 5000 });
    const results = res.data?.results;
    if (Array.isArray(results) && results.length > 0) {
      const rawUrl = results[0].artworkUrl100 || results[0].artworkUrl60;
      if (rawUrl) {
        return rawUrl.replace(/\/\d+x\d+bb\.jpg$/, '/600x600bb.jpg');
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

  // 3. Try Deezer
  try {
    const deezerResult = await searchDeezerTrack(searchQuery);
    if (deezerResult && deezerResult.artworkUrl) {
      await redis.set(cacheKey, deezerResult.artworkUrl, { ex: 604800 }); // 7 days TTL
      return deezerResult.artworkUrl;
    }
  } catch (err) {
    console.warn(`[Artwork Resolve] Deezer failed for "${searchQuery}":`, err);
  }

  return '';
}

export async function getChartForCountry(countryCode: string) {
  const code = countryCode.toUpperCase();
  const cacheKey = `deezer:chart:lastfm:${code}`;

  const cached = await getCached<any>(cacheKey);
  if (cached && cached.tracks?.data?.length > 0) return cached;

  try {
    const countryName = COUNTRY_MAP[code] || 'United States';
    console.log(`[Chart] Fetching Last.fm top tracks for country "${countryName}" (code: ${code})`);
    
    const rawTracks = await getLastfmTopTracks(countryName);
    
    // Map to Deezer-compatible format
    const mappedTracks = rawTracks.map((track: any) => {
      const trackTitle = track.name;
      const trackArtist = track.artist?.name;
      return {
        id: `lastfm:top:${normalizeString(trackTitle)}:${normalizeString(trackArtist)}`,
        title: trackTitle,
        duration: 240,
        artist: {
          name: trackArtist
        },
        album: {
          cover_medium: ''
        }
      };
    });

    // Resolve artwork for the top 15 tracks in parallel to prevent request timeout
    const resolveCount = Math.min(mappedTracks.length, 15);
    await Promise.all(
      Array.from({ length: resolveCount }).map(async (_, idx) => {
        const track = mappedTracks[idx];
        if (track) {
          track.album.cover_medium = await resolveTrackArtwork(track.title, track.artist.name);
        }
      })
    );

    const data = {
      tracks: {
        data: mappedTracks,
        total: mappedTracks.length
      }
    };

    if (mappedTracks.length > 0) {
      await setCached(cacheKey, data, 43200); // 12 hours TTL
    }
    return data;
  } catch (error) {
    console.error(`[Deezer] Failed to fetch Last.fm chart for ${code}:`, error);
    throw error;
  }
}

export async function getArtist(id: string) {
  const cacheKey = `deezer:artist:${id}`;
  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`${DEEZER_API_BASE}/artist/${id}`, { timeout: 8000 });
    const data = res.data;
    if (data) {
      await setCached(cacheKey, data, 86400); // 24 hours TTL
    }
    return data;
  } catch (error) {
    console.error(`[Deezer] Failed to fetch artist ${id}:`, error);
    throw error;
  }
}

export async function getArtistTop(id: string) {
  const cacheKey = `deezer:artist:${id}:top`;
  const cached = await getCached<any>(cacheKey);
  if (cached && cached.data && cached.data.length > 0) return cached;

  try {
    const res = await axios.get(`${DEEZER_API_BASE}/artist/${id}/top?limit=15`, { timeout: 8000 });
    let data = res.data;

    // Fallback if Deezer returns empty data (due to geo-restrictions)
    if (!data || !data.data || data.data.length === 0) {
      console.log(`[Deezer] Top tracks for artist ${id} returned empty. Falling back to iTunes...`);
      try {
        const artist = await getArtist(id);
        const artistName = artist?.name;
        if (artistName) {
          const fallbackTracks = await getArtistTopFallbackFromItunes(artistName);
          if (fallbackTracks && fallbackTracks.length > 0) {
            data = {
              data: fallbackTracks,
              total: fallbackTracks.length
            };
          }
        }
      } catch (fallbackErr) {
        console.error(`[Deezer] Fallback iTunes search failed for artist ${id}:`, fallbackErr);
      }
    }

    if (data && data.data && data.data.length > 0) {
      await setCached(cacheKey, data, 86400); // 24 hours TTL
    }
    return data;
  } catch (error) {
    console.error(`[Deezer] Failed to fetch artist top tracks ${id}:`, error);
    throw error;
  }
}

export async function getArtistAlbums(id: string) {
  const cacheKey = `deezer:artist:${id}:albums`;
  const cached = await getCached<any>(cacheKey);
  if (cached && cached.data && cached.data.length > 0) return cached;

  try {
    const res = await axios.get(`${DEEZER_API_BASE}/artist/${id}/albums?limit=25`, { timeout: 8000 });
    let data = res.data;

    // Fallback if Deezer returns empty data (due to geo-restrictions)
    if (!data || !data.data || data.data.length === 0) {
      console.log(`[Deezer] Albums for artist ${id} returned empty. Falling back to iTunes...`);
      try {
        const artist = await getArtist(id);
        const artistName = artist?.name;
        if (artistName) {
          const fallbackAlbums = await getAlbumsFallbackFromItunes(artistName);
          if (fallbackAlbums && fallbackAlbums.length > 0) {
            data = {
              data: fallbackAlbums,
              total: fallbackAlbums.length
            };
          }
        }
      } catch (fallbackErr) {
        console.error(`[Deezer] Fallback iTunes search failed for albums ${id}:`, fallbackErr);
      }
    }

    if (data && data.data && data.data.length > 0) {
      await setCached(cacheKey, data, 86400); // 24 hours TTL
    }
    return data;
  } catch (error) {
    console.error(`[Deezer] Failed to fetch artist albums ${id}:`, error);
    throw error;
  }
}

// Fallback search helpers using iTunes Search API (Apple Music metadata)

async function getArtistTopFallbackFromItunes(artistName: string): Promise<any[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicTrack&limit=15`;
    const res = await axios.get(url, { timeout: 6000 });
    const results = res.data?.results || [];
    
    // Filter results strictly to only include tracks by the correct artist to prevent cross-name matching
    const normalizedQuery = artistName.toLowerCase().trim();
    const filteredResults = results.filter((r: any) => {
      if (!r.artistName) return false;
      const artistLower = r.artistName.toLowerCase();
      return artistLower === normalizedQuery || 
             artistLower.startsWith(normalizedQuery + ' ') || 
             artistLower.endsWith(' ' + normalizedQuery) ||
             artistLower.includes(' & ' + normalizedQuery) ||
             artistLower.includes(normalizedQuery + ' & ');
    });

    return filteredResults.map((track: any) => {
      // Convert artwork to higher resolution (500x500)
      const artwork = track.artworkUrl100 
        ? track.artworkUrl100.replace('100x100bb.jpg', '500x500bb.jpg')
        : '';
      return {
        id: track.trackId || track.trackName,
        title: track.trackName,
        duration: Math.floor((track.trackTimeMillis || 240000) / 1000),
        artist: {
          name: track.artistName
        },
        album: {
          title: track.collectionName,
          cover_small: artwork,
          cover_medium: artwork,
          cover_big: artwork,
        }
      };
    });
  } catch (err) {
    console.error('[iTunes Fallback] Artist tracks search failed:', err);
    return [];
  }
}

async function getAlbumsFallbackFromItunes(artistName: string): Promise<any[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=album&limit=25`;
    const res = await axios.get(url, { timeout: 6000 });
    const results = res.data?.results || [];

    const normalizedQuery = artistName.toLowerCase().trim();
    const filteredResults = results.filter((r: any) => {
      if (!r.artistName) return false;
      const artistLower = r.artistName.toLowerCase();
      return artistLower === normalizedQuery || 
             artistLower.startsWith(normalizedQuery + ' ') || 
             artistLower.endsWith(' ' + normalizedQuery) ||
             artistLower.includes(' & ' + normalizedQuery) ||
             artistLower.includes(normalizedQuery + ' & ');
    });

    return filteredResults.map((album: any) => {
      const artwork = album.artworkUrl100 
        ? album.artworkUrl100.replace('100x100bb.jpg', '500x500bb.jpg')
        : '';
      return {
        id: album.collectionId,
        title: album.collectionName,
        cover_medium: artwork,
        release_date: album.releaseDate || new Date().toISOString()
      };
    });
  } catch (err) {
    console.error('[iTunes Fallback] Artist albums search failed:', err);
    return [];
  }
}

export async function getArtistArtwork(name: string): Promise<{ artworkUrl: string; animatedUrl: string }> {
  const cacheKey = `artist:artwork:ben:${normalizeString(name)}`;
  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  const result = { artworkUrl: '', animatedUrl: '' };

  try {
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=1`;
    const searchRes = await axios.get(searchUrl, { timeout: 5000 });
    const artist = searchRes.data?.results?.[0];
    const artistLinkUrl = artist?.artistLinkUrl;

    if (artistLinkUrl) {
      console.log(`[ArtistArtwork] Found iTunes artist link for "${name}":`, artistLinkUrl);
      
      const lookupPromise = axios.post('https://api.bendodson.com/v1/artwork/apple-music/lookup', {
        url: artistLinkUrl
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://bendodson.com/',
          'Origin': 'https://bendodson.com'
        },
        timeout: 8000
      }).catch(err => {
        console.error('[ArtistArtwork] Ben Dodson lookup failed:', err.message || err);
        return null;
      });

      const animPromise = axios.post('https://api.bendodson.com/v1/artwork/apple-music/animation', {
        url: artistLinkUrl
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://bendodson.com/',
          'Origin': 'https://bendodson.com'
        },
        timeout: 8000
      }).catch(err => {
        console.error('[ArtistArtwork] Ben Dodson animation failed:', err.message || err);
        return null;
      });

      const [lookupRes, animRes] = await Promise.all([lookupPromise, animPromise]);

      if (lookupRes && lookupRes.data?.data) {
        const data = lookupRes.data.data;
        result.artworkUrl = data.artwork1000 || data.large || data.artwork600 || '';
      }
      if (animRes && animRes.data?.data) {
        const data = animRes.data.data;
        result.animatedUrl = data.animatedUrl || data.animatedUrl1080 || '';
      }
    }
  } catch (err: any) {
    console.error(`[ArtistArtwork] Failed to resolve artwork for "${name}":`, err.message || err);
  }

  await setCached(cacheKey, result, 604800); // Cache for 7 days
  return result;
}

export async function getArtistRelated(id: string) {
  const cacheKey = `deezer:artist:${id}:related`;
  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`${DEEZER_API_BASE}/artist/${id}/related?limit=20`, { timeout: 8000 });
    const data = res.data;
    if (data) {
      await setCached(cacheKey, data, 86400); // 24 hours TTL
    }
    return data;
  } catch (error) {
    console.error(`[Deezer] Failed to fetch artist related ${id}:`, error);
    throw error;
  }
}

export async function getAlbum(id: string) {
  const cacheKey = `deezer:album:${id}`;
  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`${DEEZER_API_BASE}/album/${id}`, { timeout: 8000 });
    const data = res.data;
    if (data && !data.error) {
      await setCached(cacheKey, data, 86400); // 24 hours TTL
      return data;
    }
  } catch (error: any) {
    console.warn(`[Deezer] Failed to fetch album ${id} on Deezer, falling back to iTunes:`, error.message || error);
  }

  // Fallback to iTunes Lookup
  try {
    console.log(`[AlbumFallback] Querying iTunes lookup for album ID: ${id}`);
    const lookupUrl = `https://itunes.apple.com/lookup?id=${id}&entity=song`;
    const res = await axios.get(lookupUrl, { timeout: 8000 });
    const results = res.data?.results;
    if (results && results.length > 0) {
      const collection = results.find((r: any) => r.wrapperType === 'collection');
      const tracks = results.filter((r: any) => r.wrapperType === 'track');
      
      if (collection) {
        const mappedData = {
          id: collection.collectionId,
          title: collection.collectionName,
          cover_xl: collection.artworkUrl100 ? collection.artworkUrl100.replace('100x100bb.jpg', '1000x1000bb.jpg') : '',
          cover_medium: collection.artworkUrl100 ? collection.artworkUrl100.replace('100x100bb.jpg', '500x500bb.jpg') : '',
          release_date: collection.releaseDate || '',
          artist: {
            id: collection.artistId || 0,
            name: collection.artistName || 'Unknown Artist'
          },
          duration: tracks.reduce((acc: number, t: any) => acc + Math.floor((t.trackTimeMillis || 0) / 1000), 0),
          tracks: {
            data: tracks.map((track: any) => ({
              id: track.trackId,
              title: track.trackName,
              duration: Math.floor((track.trackTimeMillis || 0) / 1000),
              artist: {
                name: track.artistName
              }
            }))
          }
        };
        await setCached(cacheKey, mappedData, 86400);
        return mappedData;
      }
    }
  } catch (error: any) {
    console.error(`[AlbumFallback] iTunes lookup failed for album ${id}:`, error.message || error);
  }

  return { error: { message: 'Album not found' } };
}

export async function searchArtist(name: string) {
  const trimmedName = name.trim();
  const cacheKey = `deezer:search:artist:${trimmedName.toLowerCase()}`;
  const cached = await getCached<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(
      `${DEEZER_API_BASE}/search/artist?q=${encodeURIComponent(trimmedName)}`,
      { timeout: 8000 }
    );
    const results = res.data?.data;
    if (!results || results.length === 0) return null;

    const queryName = trimmedName.toLowerCase();
    
    // Find the best verified match to prevent common-name collisions
    let verifiedArtist = null;
    const firstResult = results[0];
    if (firstResult.name.toLowerCase() === queryName) {
      verifiedArtist = firstResult;
    } else {
      verifiedArtist = results.find((r: any) => r.name.toLowerCase() === queryName) || firstResult;
    }

    if (verifiedArtist) {
      await setCached(cacheKey, verifiedArtist, 86400); // 24 hours TTL
    }
    return verifiedArtist;
  } catch (error) {
    console.error(`[Deezer] Failed to search artist ${name}:`, error);
    return null;
  }
}

export async function searchDeezerTrack(query: string) {
  try {
    const res = await axios.get(`${DEEZER_API_BASE}/search?q=${encodeURIComponent(query)}&limit=1`, { timeout: 5000 });
    const track = res.data?.data?.[0];
    if (!track) return null;
    return {
      title: track.title,
      artist: track.artist?.name || '',
      artworkUrl: track.album?.cover_medium || track.album?.cover_big || '',
      duration: track.duration * 1000
    };
  } catch (error: any) {
    console.error(`[Deezer Search] Failed for query "${query}":`, error.message || error);
    return null;
  }
}
