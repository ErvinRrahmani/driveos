import { openDatabaseAsync } from 'expo-sqlite';
import { type DiaryStore, SqliteDiaryStore } from './store';

const DATABASE_NAME = 'driveos-diary.db';

export function openDiaryStore(): DiaryStore {
  return new SqliteDiaryStore(() => openDatabaseAsync(DATABASE_NAME));
}
