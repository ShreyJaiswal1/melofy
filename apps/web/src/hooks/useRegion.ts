'use client';

import { useState, useEffect, useCallback } from 'react';

interface RegionData {
  country: string;
  source: 'geo' | 'manual';
  setAt: number;
}

export function useRegion() {
  const [country, setCountry] = useState<string>('US');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('melofy_region');
    let needsFetch = false;

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as RegionData;
        setCountry(parsed.country);
        setIsLoaded(true);

        // Invalidate if older than 30 days and source is 'geo'
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        if (parsed.source === 'geo' && Date.now() - parsed.setAt > thirtyDaysMs) {
          needsFetch = true;
        }
      } catch (e) {
        needsFetch = true;
      }
    } else {
      needsFetch = true;
    }

    if (needsFetch) {
      fetch('/api/geo')
        .then((res) => {
          if (!res.ok) throw new Error('Network response was not ok');
          return res.json() as Promise<{ country: string }>;
        })
        .then((data) => {
          const regionData: RegionData = {
            country: data.country || 'US',
            source: 'geo',
            setAt: Date.now(),
          };
          localStorage.setItem('melofy_region', JSON.stringify(regionData));
          setCountry(regionData.country);
          setIsLoaded(true);
        })
        .catch((err) => {
          console.error('Failed to fetch geo region:', err);
          setCountry('US');
          setIsLoaded(true);
        });
    }
  }, []);

  const setRegion = useCallback((newCountry: string) => {
    const regionData: RegionData = {
      country: newCountry.toUpperCase(),
      source: 'manual',
      setAt: Date.now(),
    };
    localStorage.setItem('melofy_region', JSON.stringify(regionData));
    setCountry(regionData.country);
  }, []);

  return { country, setRegion, isLoaded };
}
