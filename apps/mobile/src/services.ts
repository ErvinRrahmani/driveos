import { parseApiUrl } from './config';
import { createServices } from './lib/api';
import { openDiaryStore } from './lib/diary/open-store';
import { plainStorage, secureStorage } from './lib/platform';

export const services = createServices({
  baseUrl: parseApiUrl(process.env.EXPO_PUBLIC_API_URL),
  secure: secureStorage,
  storage: plainStorage,
  diaryStore: openDiaryStore(),
});
