import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// Initialize Redis only if both configuration variables are present
export const redis = url && token ? new Redis({ url, token }) : null;
