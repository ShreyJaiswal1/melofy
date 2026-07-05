import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis/client';

export async function GET(req: NextRequest) {
  try {
    // 1. Check Cloudflare header first
    const cfCountry = req.headers.get('cf-ipcountry');
    if (cfCountry && cfCountry !== 'XX') {
      return NextResponse.json({ country: cfCountry.toUpperCase() });
    }

    // 2. Get client IP
    const xForwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = xForwardedFor ? xForwardedFor.split(',')[0].trim() : '';

    if (
      !clientIp ||
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp.startsWith('10.') ||
      clientIp.startsWith('192.168.') ||
      clientIp.startsWith('172.16.')
    ) {
      // Local/private IP, default to US
      return NextResponse.json({ country: 'US' });
    }

    const cacheKey = `geo:ip:${clientIp}`;

    // Check Redis cache first
    try {
      if (redis) {
        const cached = await redis.get<string>(cacheKey);
        if (cached) {
          return NextResponse.json({ country: cached.toUpperCase() });
        }
      }
    } catch (redisError) {
      console.error('Redis error in geo lookup:', redisError);
    }

    // Call ip-api.com json endpoint
    const response = await fetch(`http://ip-api.com/json/${clientIp}?fields=countryCode`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 }, // Next.js fetch caching (24h)
    });

    if (!response.ok) {
      return NextResponse.json({ country: 'US' });
    }

    const data = await response.json() as { countryCode?: string };
    const country = data.countryCode ? data.countryCode.toUpperCase() : 'US';

    // Store in Redis cache for 24 hours (86400 seconds)
    try {
      if (redis) {
        await redis.set(cacheKey, country, { ex: 86400 });
      }
    } catch (redisError) {
      console.error('Redis set error in geo lookup:', redisError);
    }

    return NextResponse.json({ country });
  } catch (error) {
    console.error('Geo API error:', error);
    return NextResponse.json({ country: 'US' });
  }
}
