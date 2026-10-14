import type { SyncProgressEntry } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export interface ProgressEntryFilter {
  ids?: readonly string[];
  studentIds?: readonly string[];
}

export class ListProgressEntriesQuery extends Query<SyncProgressEntry[]> {
  constructor(readonly filter: ProgressEntryFilter) {
    super();
  }
}
