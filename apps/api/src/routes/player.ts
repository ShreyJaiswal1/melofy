import { Router } from 'express';
import { Redis } from '@upstash/redis';
import { requireFirebaseAuth } from '../lib/firebaseAuth';

const router = Router();
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const MAX_STATE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit

// GET /api/player-state - Fetch persisted player state
router.get('/player-state', requireFirebaseAuth, async (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Using the same key pattern as the frontend for consistency: player:{userId}
    const state = await redis.get(`player:${uid}`);
    res.json({ state: state || null });
  } catch (error) {
    console.error('[PlayerState] Failed to fetch state:', error);
    res.status(500).json({ error: 'Failed to fetch player state' });
  }
});

// POST /api/player-state - Persist current player state
router.post('/player-state', requireFirebaseAuth, async (req, res) => {
  const uid = req.user?.uid;
  const { state } = req.body;

  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!state) return res.status(400).json({ error: 'Missing state' });

  try {
    const serializedState = JSON.stringify(state);
    if (Buffer.byteLength(serializedState, 'utf8') > MAX_STATE_SIZE_BYTES) {
      return res.status(413).json({ error: 'Player state payload too large' });
    }

    // Store state for 14 days (matching the frontend's previous policy)
    await redis.set(`player:${uid}`, serializedState, { ex: 60 * 60 * 24 * 14 });
    res.json({ success: true });
  } catch (error) {
    console.error('[PlayerState] Failed to save state:', error);
    res.status(500).json({ error: 'Failed to save player state' });
  }
});

// GET /api/player/track/:id - Fetch track info by YouTube ID (or general search)
router.get('/player/track/:id', async (req, res) => {
  const id = req.params.id;
  const cacheKey = `track:yt:${id}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(typeof cached === 'string' ? JSON.parse(cached) : cached);
    }
  } catch {}

  try {
    const { lavalink } = await import('../index');
    const node = lavalink.nodeManager.leastUsedNodes()[0];
    if (!node || !node.connected) {
      return res.status(500).json({ error: 'Audio node link not available' });
    }

    // Try finding the track directly by its YouTube URL or ID
    const searchResult = await node.search(
      { query: id.startsWith('http') ? id : `https://www.youtube.com/watch?v=${id}` },
      { id: req.user?.uid || 'MelofyInternal' }
    );

    if (searchResult.loadType === 'empty' || searchResult.loadType === 'error' || !searchResult.tracks || searchResult.tracks.length === 0) {
      // Try raw search as fallback
      const fallbackResult = await node.search(
        { query: id },
        { id: req.user?.uid || 'MelofyInternal' }
      );
      if (fallbackResult.loadType === 'empty' || fallbackResult.loadType === 'error' || !fallbackResult.tracks || fallbackResult.tracks.length === 0) {
        return res.status(404).json({ error: 'Track not found' });
      }
      
      const track = fallbackResult.tracks[0];
      await redis.set(cacheKey, JSON.stringify(track), { ex: 86400 * 7 }); // Cache for 7 days
      return res.json(track);
    }

    const track = searchResult.tracks[0];
    await redis.set(cacheKey, JSON.stringify(track), { ex: 86400 * 7 }); // Cache for 7 days
    return res.json(track);
  } catch (error) {
    console.error('[TrackResolver] Failed to resolve track:', error);
    res.status(500).json({ error: 'Failed to resolve track' });
  }
});

export default router;
