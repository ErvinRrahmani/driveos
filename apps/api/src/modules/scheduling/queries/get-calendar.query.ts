import type { CalendarQuery, CalendarResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetCalendarQuery extends Query<CalendarResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: CalendarQuery,
  ) {
    super();
  }
}
