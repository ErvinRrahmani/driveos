import type { PlanFeature } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class SchoolHasFeatureQuery extends Query<boolean> {
  constructor(readonly feature: PlanFeature) {
    super();
  }
}
