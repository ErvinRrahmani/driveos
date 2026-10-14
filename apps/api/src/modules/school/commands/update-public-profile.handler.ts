import { eq, sql } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError, invalidField } from '../../../kernel/http/errors.js';
import { findPgError, PG_UNIQUE_VIOLATION } from '../../../kernel/http/pg-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { SchoolHasFeatureQuery } from '../../platform/index.js';
import { slugIssues } from '../domain/slug.js';
import { PublicProfileRecords } from '../infra/public-profile-records.js';
import { SchoolRecords } from '../infra/school-records.js';
import { schoolPublicProfiles } from '../infra/schema.js';
import { UpdatePublicProfileCommand } from './update-public-profile.command.js';

const SLUG_KEY = 'school_public_profiles_slug_key';

@CommandHandler(UpdatePublicProfileCommand)
export class UpdatePublicProfileHandler implements ICommandHandler<
  UpdatePublicProfileCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly school: SchoolRecords,
    private readonly profiles: PublicProfileRecords,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ body }: UpdatePublicProfileCommand): Promise<CommandResult> {
    const [issue] = body.slug === undefined ? [] : slugIssues(body.slug);
    if (issue) throw invalidField(issue.path, issue.message);
    const current = await this.profiles.current({ lock: true });
    const slug = body.slug ?? current?.slug;
    if (slug === undefined) throw invalidField(['slug'], 'Required');
    if ((body.published ?? current?.published ?? false) && !(await this.hasEnrolmentPage())) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'feature_not_in_plan',
        t('errors.feature_not_in_plan'),
      );
    }
    // drizzle skips undefined keys: an update changes only the given fields, an insert takes defaults.
    const schoolId = this.school.schoolId;
    try {
      const [row] = current
        ? await this.tenant.tx
            .update(schoolPublicProfiles)
            .set({ ...body, version: sql`${schoolPublicProfiles.version} + 1` })
            .where(eq(schoolPublicProfiles.schoolId, schoolId))
            .returning({ version: schoolPublicProfiles.version })
        : await this.tenant.tx
            .insert(schoolPublicProfiles)
            .values({ ...body, schoolId, slug })
            .returning({ version: schoolPublicProfiles.version });
      if (!row) throw new Error('The public profile was not saved');
      return { id: schoolId, version: row.version };
    } catch (error) {
      const pgError = findPgError(error);
      if (pgError?.code === PG_UNIQUE_VIOLATION && pgError.constraint === SLUG_KEY) {
        throw new ConflictError('slug_taken', t('errors.slug_taken'));
      }
      throw error;
    }
  }

  private hasEnrolmentPage(): Promise<boolean> {
    return this.queryBus.execute(new SchoolHasFeatureQuery('enrolment_page'));
  }
}
