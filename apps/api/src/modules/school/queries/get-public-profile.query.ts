import type { PublicProfile } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

/** The current school's public page profile, or null when it has none yet. */
export class GetPublicProfileQuery extends Query<PublicProfile | null> {}
