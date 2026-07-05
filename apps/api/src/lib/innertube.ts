import * as indexModule from '../index';
import { redis } from './redis';

export async function getYoutubeRecommendations(videoId: string, userId: string = 'MelofyAutoplay') {
  const cacheKey = `recs:ytrec:${videoId}`;

  try {
    const cached = await redis.get<string | object>(cacheKey);
    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }
  } catch (err) {
    console.error('[Redis] Cache read failed in YouTube recommendations:', err);
  }

  try {
    const lavalink = indexModule.lavalink;
    if (!lavalink) throw new Error('Lavalink client is not initialized yet');

    const node = lavalink.nodeManager.leastUsedNodes()[0];
    if (!node) throw new Error('No NodeLink nodes available');

    const result = await node.search(
      { query: `ytrec:${videoId}` },
      { id: userId },
    );

    if (result.loadType === 'empty' || result.loadType === 'error') {
      return [];
    }

    const rawTracks = (result as any).tracks || (result as any).data || [];
    const tracks = rawTracks.map((track: any) => ({
      id: track.info.identifier,
      title: track.info.title,
      artist: track.info.author,
      artworkUrl: track.info.artworkUrl || `https://img.youtube.com/vi/${track.info.identifier}/mqdefault.jpg`,
      duration: track.info.length || track.info.duration || 0,
      url: track.encoded || '',
    }));

    try {
      await redis.set(cacheKey, JSON.stringify(tracks), { ex: 43200 }); // Cache for 12 hours
    } catch (err) {
      console.error('[Redis] Cache write failed in YouTube recommendations:', err);
    }

    return tracks;
  } catch (error) {
    console.error(`[InnerTube] Failed to fetch recommendations for video ${videoId}:`, error);
    return [];
  }
}
