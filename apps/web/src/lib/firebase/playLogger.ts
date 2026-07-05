import { Track } from '@/store/usePlayerStore';
import { getAuth } from 'firebase/auth';
import { app } from './config';

export async function logTrackPlay(userId: string, track: Track) {
  try {
    const currentUser = getAuth(app).currentUser;
    if (!currentUser) return;

    const token = await currentUser.getIdToken();
    const res = await fetch('/api/radio/log-play', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ track }),
    });

    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }

    console.log(`[PlayLogger] Logged play: "${track.title}" by ${track.artist}`);
  } catch (error) {
    console.error('[PlayLogger] Failed to log track play to backend:', error);
  }
}
