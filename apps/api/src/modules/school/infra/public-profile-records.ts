import { Injectable } from '@nestjs/common';
import type { PublicProfile } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { schoolPublicProfiles } from './schema.js';

export type PublicProfileRow = typeof schoolPublicProfiles.$inferSelect;

/** Unknown slug, unpublished page, inactive school or no `enrolment_page` feature: all look the same. */
export function schoolNotFound(): ApiError {
  return new ApiError(StatusCodes.NOT_FOUND, 'school_not_found', t('errors.school_not_found'));
}

export function toPublicProfile(row: PublicProfileRow): PublicProfile {
  return {
    slug: row.slug,
    published: row.published,
    headline: row.headline,
    description: row.description,
    phone: row.phone,
    whatsappNumber: row.whatsappNumber,
    instagramUrl: row.instagramUrl,
    facebookUrl: row.facebookUrl,
    externalReviewUrl: row.externalReviewUrl,
    showPrices: row.showPrices,
    showInstructors: row.showInstructors,
    version: row.version,
  };
}

@Injectable()
export class PublicProfileRecords {
  constructor(private readonly tenant: TenantContext) {}

  /** The current school's profile row (one per school, RLS-scoped), optionally locked for update. */
  async current(options: { lock?: boolean } = {}): Promise<PublicProfileRow | null> {
    const query = this.tenant.tx.select().from(schoolPublicProfiles);
    const [row] = options.lock ? await query.for('update') : await query;
    return row ?? null;
  }
}
