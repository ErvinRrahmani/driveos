import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/kernel/schema.ts', './src/modules/*/infra/schema.ts'],
  out: './drizzle',
  strict: true,
  verbose: true,
});
