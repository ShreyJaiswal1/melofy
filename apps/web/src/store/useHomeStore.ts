import { create } from 'zustand';
import type { SpotifyTrackLike } from '@/lib/track-mappers';

export interface SpotifyTrendingItem {
  id?: string;
  track?: SpotifyTrackLike;
}

export interface SpotifyCollectionOwner {
  display_name?: string;
}

export interface SpotifyCollectionSummary {
  id: string;
  name?: string;
  description?: string;
  images?: Array<{ url?: string }>;
  owner?: SpotifyCollectionOwner;
  tracks?: { total?: number };
  type?: string;
}

export interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  artist: {
    id: number;
    name: string;
    picture_medium?: string;
  };
  album: {
    id: number;
    title: string;
    cover_medium?: string;
  };
}

export interface DeezerChart {
  tracks?: {
    data: DeezerTrack[];
  };
}

interface HomeStore {
  trending: SpotifyTrendingItem[];
  newReleases: SpotifyCollectionSummary[];
  recommendations: SpotifyTrackLike[];
  mixes: SpotifyCollectionSummary[];
  editorsPicks: SpotifyCollectionSummary[];
  discoveryMixes: SpotifyCollectionSummary[];
  featuredPlaylists: SpotifyCollectionSummary[];
  regionalChart: DeezerChart | null;
  hasFetched: boolean;

  setTrending: (data: SpotifyTrendingItem[]) => void;
  setNewReleases: (data: SpotifyCollectionSummary[]) => void;
  setRecommendations: (data: SpotifyTrackLike[]) => void;
  setMixes: (data: SpotifyCollectionSummary[]) => void;
  setEditorsPicks: (data: SpotifyCollectionSummary[]) => void;
  setDiscoveryMixes: (data: SpotifyCollectionSummary[]) => void;
  setFeaturedPlaylists: (data: SpotifyCollectionSummary[]) => void;
  setRegionalChart: (data: DeezerChart | null) => void;
  setHasFetched: (status: boolean) => void;
}

export const useHomeStore = create<HomeStore>((set) => ({
  trending: [],
  newReleases: [],
  recommendations: [],
  mixes: [],
  editorsPicks: [],
  discoveryMixes: [],
  featuredPlaylists: [],
  regionalChart: null,
  hasFetched: false,

  setTrending: (data) => set({ trending: data }),
  setNewReleases: (data) => set({ newReleases: data }),
  setRecommendations: (data) => set({ recommendations: data }),
  setMixes: (data) => set({ mixes: data }),
  setEditorsPicks: (data) => set({ editorsPicks: data }),
  setDiscoveryMixes: (data) => set({ discoveryMixes: data }),
  setFeaturedPlaylists: (data) => set({ featuredPlaylists: data }),
  setRegionalChart: (data) => set({ regionalChart: data }),
  setHasFetched: (status) => set({ hasFetched: status }),
}));
