process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
import path from 'path';
// Load environment variables from apps/api/.env before importing helpers
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import * as firebaseAuth from './lib/firebaseAuth';

// Mock authentication middleware directly before importing routes
// @ts-ignore
firebaseAuth.requireFirebaseAuth = (req: any, res: any, next: any) => {
  req.user = { uid: 'test-client-automated-verifier', email: 'test@melofy.com' };
  next();
};

import * as deezer from './lib/deezer';
import * as lastfm from './lib/lastfm';
import * as innertube from './lib/innertube';
import express from 'express';
import http from 'http';
import axios from 'axios';

// Simple unit checking assertions
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✓ Passed: ${message}`);
}

async function runTests() {
  console.log('\n======================================');
  console.log('STARTING AUTOMATED API ENDPOINT TESTS');
  console.log('======================================\n');

  // --- Test 1: Deezer API Helper ---
  console.log('1. Testing Deezer API Helper...');
  try {
    const chart = await deezer.getChartForCountry('IN');
    assert(chart !== null, 'getChartForCountry returns chart object');
    assert(Array.isArray(chart.tracks?.data), 'chart contains tracks data array');
    console.log(`  (Found ${chart.tracks?.data?.length || 0} tracks in regional chart)`);

    const artist = await deezer.searchArtist('Sia');
    assert(artist !== null, 'searchArtist finds Sia');
    assert(artist.name === 'Sia', `searchArtist resolved artist name: ${artist.name}`);
    console.log(`  (Sia Deezer ID: ${artist.id})`);

    const artistDetails = await deezer.getArtist(artist.id.toString());
    assert(artistDetails !== null, 'getArtist returns Sia details');

    const topTracks = await deezer.getArtistTop(artist.id.toString());
    assert(Array.isArray(topTracks.data), 'getArtistTop returns data array');

    const albums = await deezer.getArtistAlbums(artist.id.toString());
    assert(Array.isArray(albums.data), 'getArtistAlbums returns data array');

    if (albums.data.length > 0) {
      const albumDetail = await deezer.getAlbum(albums.data[0].id.toString());
      assert(albumDetail !== null, 'getAlbum returns album details object');
      assert(Array.isArray(albumDetail.tracks?.data), 'album details contain tracks list');
      console.log(`  (Album details resolved for "${albumDetail.title}" with ${albumDetail.tracks?.data?.length || 0} tracks)`);
    }

    const related = await deezer.getArtistRelated(artist.id.toString());
    assert(Array.isArray(related.data), 'getArtistRelated returns data array');
  } catch (err: any) {
    console.error('  ✗ Deezer tests failed:', err.message || err);
  }

  // --- Test 2: Last.fm API Helper ---
  console.log('\n2. Testing Last.fm API Helper...');
  try {
    const similarTracks = await lastfm.getSimilarTracks('Sia', 'Chandelier');
    assert(Array.isArray(similarTracks), 'getSimilarTracks returns an array');
    console.log(`  (Found ${similarTracks.length} similar tracks on Last.fm)`);

    const similarArtists = await lastfm.getSimilarArtists('Sia');
    assert(Array.isArray(similarArtists), 'getSimilarArtists returns an array');

    const artistInfo = await lastfm.getArtistInfo('Sia');
    assert(artistInfo !== null, 'getArtistInfo returns Sia bio details');
  } catch (err: any) {
    console.error('  ✗ Last.fm tests failed:', err.message || err);
  }

  // --- Test 3: YouTube InnerTube Recommendations Helper ---
  console.log('\n3. Testing YouTube InnerTube Helper (Lavalink integration)...');
  try {
    const recs = await innertube.getYoutubeRecommendations('dQw4w9WgXcQ');
    assert(Array.isArray(recs), 'getYoutubeRecommendations returns an array');
    console.log(`  (Found ${recs.length} YouTube recommendations)`);
  } catch (err: any) {
    console.warn('  ! YouTube recommendations test warning (expected if Lavalink is offline):', err.message || err);
  }

  // --- Test 4: Radio Router (Local HTTP Integration Check) ---
  console.log('\n4. Testing /api/radio Router HTTP Integration...');
  let server: http.Server | null = null;
  try {
    const radioModule = await import('./routes/radio');
    const radioRouter = radioModule.default;

    const app = express();
    app.use(express.json());
    
    app.use('/api/radio', radioRouter);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(3009, resolve));
    console.log('  (Test server running on port 3009)');

    // Call route over real HTTP
    const res = await axios.get('http://localhost:3009/api/radio', {
      headers: {
        Authorization: 'Bearer dummy-test-token'
      },
      params: {
        artist: 'Sia',
        title: 'Chandelier',
        videoId: 'dQw4w9WgXcQ',
        region: 'IN'
      }
    });

    assert(res.status === 200, 'GET /api/radio responds with 200 OK');
    assert(Array.isArray(res.data?.tracks), 'GET /api/radio returns tracks array');
    console.log(`  (API returned ${res.data?.tracks?.length || 0} candidate tracks)`);
    if (res.data?.tracks?.length > 0) {
      const tracksWithArtwork = res.data.tracks.filter((t: any) => t.artworkUrl && t.artworkUrl.length > 0);
      console.log(`  (Found ${tracksWithArtwork.length} tracks with resolved artwork out of ${res.data.tracks.length})`);
      assert(tracksWithArtwork.length > 0, 'At least one candidate track should have resolved artworkUrl');
    }

    // Test collaborative artist matching fallback over HTTP
    const collabRes = await axios.get('http://localhost:3009/api/radio', {
      headers: {
        Authorization: 'Bearer dummy-test-token'
      },
      params: {
        artist: 'Arijit Singh / Pritam / Shadab Faridi',
        title: 'Raabta (Official Audio)',
        videoId: 'dQw4w9WgXcQ',
        region: 'IN'
      }
    });

    assert(collabRes.status === 200, 'GET /api/radio with collaborative artist responds with 200 OK');
    assert(Array.isArray(collabRes.data?.tracks), 'GET /api/radio with collaborative artist returns tracks array');
    console.log(`  (API returned ${collabRes.data?.tracks?.length || 0} collaborative candidate tracks)`);

    // Test POST log-play route
    const postRes = await axios.post('http://localhost:3009/api/radio/log-play', {
      track: {
        id: 'deezer:12345',
        title: 'Chandelier',
        artist: 'Sia',
        artworkUrl: 'https://placeholder.com'
      }
    }, {
      headers: {
        Authorization: 'Bearer dummy-test-token'
      }
    });

    assert(postRes.status === 200, 'POST /api/radio/log-play responds with 200 OK');
    assert(postRes.data?.success === true, 'POST /api/radio/log-play returns success');
    console.log('  (Log play endpoint successfully called)');

  } catch (err: any) {
    console.error('  ✗ HTTP Integration tests failed:', err.message || err);
  } finally {
    if (server) {
      server.close();
      console.log('  (Test server shut down)');
    }
  }

  console.log('\n======================================');
  console.log('AUTOMATED VERIFICATION RUN COMPLETED');
  console.log('======================================\n');
}

void runTests();
