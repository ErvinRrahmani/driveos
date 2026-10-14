import type { PlatformAlertListResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetPlatformAlertsQuery extends Query<PlatformAlertListResponse> {}
