import type { PublicProfile } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { PublicProfileRecords, toPublicProfile } from '../infra/public-profile-records.js';
import { GetPublicProfileQuery } from './get-public-profile.query.js';

@QueryHandler(GetPublicProfileQuery)
export class GetPublicProfileHandler implements IQueryHandler<
  GetPublicProfileQuery,
  PublicProfile | null
> {
  constructor(private readonly profiles: PublicProfileRecords) {}

  async execute(): Promise<PublicProfile | null> {
    const row = await this.profiles.current();
    return row ? toPublicProfile(row) : null;
  }
}
