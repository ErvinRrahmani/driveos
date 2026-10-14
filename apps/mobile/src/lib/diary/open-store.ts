import { type DiaryStore, MemoryDiaryStore } from './store';

export function openDiaryStore(): DiaryStore {
  return new MemoryDiaryStore();
}
