import type { ReportBucket, TestAttemptKind } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export interface TestAttemptRange {
  from: string;
  to: string;
  bucket: ReportBucket;
}

export interface TestAttemptCount {
  period: string;
  kind: TestAttemptKind;
  attempts: number;
  passed: number;
}

export class GetTestAttemptStatsQuery extends Query<TestAttemptCount[]> {
  constructor(readonly range: TestAttemptRange) {
    super();
  }
}
