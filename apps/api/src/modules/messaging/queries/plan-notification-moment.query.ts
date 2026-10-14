import type { NotificationTiming } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export interface NotificationMomentRequest {
  timing: NotificationTiming;
  sendAt: Date;
}

export class PlanNotificationMomentQuery extends Query<Date> {
  constructor(readonly input: NotificationMomentRequest) {
    super();
  }
}
