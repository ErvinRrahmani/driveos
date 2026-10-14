import { bigint, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const newId = (): string => uuidv7();

export const id = () => uuid('id').primaryKey().$defaultFn(newId);

export const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const minor = (name: string) => bigint(name, { mode: 'number' });

export const timestamps = () => ({
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
