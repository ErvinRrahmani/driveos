import { defineEvent } from '@driveos/shared';
import { z } from 'zod';

export const PingRecorded = defineEvent({
  type: 'PingRecorded',
  version: 1,
  schema: z.object({ message: z.string().min(1) }),
});
