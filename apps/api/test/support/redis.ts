import { Redis } from 'ioredis';

export async function deleteKeys(url: string, prefix: string): Promise<void> {
  const redis = new Redis(url);
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } finally {
    await redis.quit();
  }
}
