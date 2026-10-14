import { Injectable } from '@nestjs/common';
import type { Review } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { schoolReviews } from './schema.js';

export const REVIEW_AGGREGATE = 'school_review';

export type ReviewRow = typeof schoolReviews.$inferSelect;

export function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    studentId: row.studentId,
    displayName: row.displayName,
    rating: row.rating,
    text: row.text,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ReviewRecords {
  constructor(private readonly tenant: TenantContext) {}

  /** Locks a review of the current school; 404 for an unknown id or another school's review. */
  async lock(id: string): Promise<ReviewRow> {
    const [row] = await this.tenant.tx
      .select()
      .from(schoolReviews)
      .where(eq(schoolReviews.id, id))
      .for('update');
    if (!row) throw notFound();
    return row;
  }
}
