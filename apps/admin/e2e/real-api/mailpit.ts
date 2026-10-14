import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:18025';

const searchSchema = z.object({
  messages: z.array(z.object({ ID: z.string(), Created: z.iso.datetime({ offset: true }) })),
});
const messageSchema = z.object({ Text: z.string() });

export async function latestLoginCode(
  request: APIRequestContext,
  address: string,
  since: Date,
): Promise<string | null> {
  const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
    params: { query: `to:"${address}" subject:"sign-in code"`, limit: 5 },
  });
  if (!search.ok()) return null;
  const newest = searchSchema
    .parse(await search.json())
    .messages.find((message) => Date.parse(message.Created) >= since.getTime());
  if (!newest) return null;
  const message = await request.get(`${MAILPIT_URL}/api/v1/message/${newest.ID}`);
  if (!message.ok()) return null;
  return /\b(\d{6})\b/.exec(messageSchema.parse(await message.json()).Text)?.[1] ?? null;
}
