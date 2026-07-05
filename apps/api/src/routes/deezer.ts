import { Router, Request, Response } from 'express';
import { requireFirebaseAuth } from '../lib/firebaseAuth';
import * as deezer from '../lib/deezer';
import { getArtistInfo } from '../lib/lastfm';

const router = Router();

// Apply auth middleware to all Deezer routes for security
router.use(requireFirebaseAuth);

// GET /api/deezer/artist-bio?name=Sia
router.get('/artist-bio', async (req: Request, res: Response) => {
  try {
    const name = req.query.name as string;
    if (!name) {
      return res.status(400).json({ error: 'Artist name query parameter is required' });
    }
    const data = await getArtistInfo(name);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch artist biography' });
  }
});

// GET /api/deezer/chart?country=IN
router.get('/chart', async (req: Request, res: Response) => {
  try {
    const country = (req.query.country as string) || 'US';
    const data = await deezer.getChartForCountry(country);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Deezer charts' });
  }
});

// GET /api/deezer/artist/:id
router.get('/artist/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = await deezer.getArtist(id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch artist details' });
  }
});

// GET /api/deezer/artist/:id/top
router.get('/artist/:id/top', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = await deezer.getArtistTop(id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch artist top tracks' });
  }
});

// GET /api/deezer/artist/:id/related
router.get('/artist/:id/related', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = await deezer.getArtistRelated(id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch related artists' });
  }
});

// GET /api/deezer/artist/:id/albums
router.get('/artist/:id/albums', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = await deezer.getArtistAlbums(id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch artist albums' });
  }
});

// GET /api/deezer/search-artist?name=Sia
router.get('/search-artist', async (req: Request, res: Response) => {
  try {
    const name = req.query.name as string;
    if (!name) {
      return res.status(400).json({ error: 'Artist name query parameter is required' });
    }
    const data = await deezer.searchArtist(name);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search artist' });
  }
});

// GET /api/deezer/artist-artwork?name=Sia
router.get('/artist-artwork', async (req: Request, res: Response) => {
  try {
    const name = req.query.name as string;
    if (!name) {
      return res.status(400).json({ error: 'Artist name query parameter is required' });
    }
    const data = await deezer.getArtistArtwork(name);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch artist artwork' });
  }
});

// GET /api/deezer/album/:id
router.get('/album/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const data = await deezer.getAlbum(id);
    if (data?.error) {
      return res.status(404).json({ error: data.error.message || 'Album not found' });
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch album details' });
  }
});

export default router;
