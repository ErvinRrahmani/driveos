import { z } from 'zod';
import type { KeyValueStorage } from './storage';

const linksSchema = z.array(z.string());

const keyFor = (userId: string) => `driveos.pendingConsent.${userId}`;

export function createPendingConsents(storage: KeyValueStorage) {
  const list = async (userId: string): Promise<string[]> => {
    try {
      const raw = await storage.getItem(keyFor(userId));
      if (!raw) return [];
      const parsed = linksSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  };
  const save = (userId: string, links: string[]) =>
    links.length === 0
      ? storage.removeItem(keyFor(userId))
      : storage.setItem(keyFor(userId), JSON.stringify(links));

  return {
    list,
    async remember(userId: string, linkId: string) {
      const links = await list(userId);
      if (!links.includes(linkId)) await save(userId, [...links, linkId]);
    },
    async forget(userId: string, linkId: string) {
      await save(
        userId,
        (await list(userId)).filter((id) => id !== linkId),
      );
    },
  };
}
