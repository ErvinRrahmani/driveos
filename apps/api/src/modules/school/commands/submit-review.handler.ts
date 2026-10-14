import { ReviewSubmitted } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { findPgError, PG_UNIQUE_VIOLATION } from '../../../kernel/http/pg-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetStudentByUserQuery, HasPassedPracticalQuery } from '../../training/index.js';
import { displayNameOf } from '../domain/reviews.js';
import { REVIEW_AGGREGATE } from '../infra/review-records.js';
import { SchoolRecords } from '../infra/school-records.js';
import { schoolReviews } from '../infra/schema.js';
import { SubmitReviewCommand } from './submit-review.command.js';

const STUDENT_KEY = 'school_reviews_student_key';

@CommandHandler(SubmitReviewCommand)
export class SubmitReviewHandler implements ICommandHandler<SubmitReviewCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly school: SchoolRecords,
    private readonly queryBus: QueryBus,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, body }: SubmitReviewCommand): Promise<CommandResult> {
    const student = await this.queryBus.execute(new GetStudentByUserQuery(actor.userId));
    if (!student) throw notFound();
    if (!(await this.queryBus.execute(new HasPassedPracticalQuery(student.studentId)))) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'review_not_available',
        t('errors.review_not_available'),
      );
    }
    const id = newId();
    const submittedAt = new Date();
    try {
      await this.tenant.tx.insert(schoolReviews).values({
        id,
        schoolId: this.school.schoolId,
        studentId: student.studentId,
        rating: body.rating,
        text: body.text || null,
        displayName: displayNameOf(student.fullName),
        submittedAt,
      });
    } catch (error) {
      const pgError = findPgError(error);
      if (pgError?.code === PG_UNIQUE_VIOLATION && pgError.constraint === STUDENT_KEY) {
        throw new ConflictError('review_exists', t('errors.review_exists'));
      }
      throw error;
    }
    await this.publisher.append([
      newEvent(ReviewSubmitted, {
        aggregateType: REVIEW_AGGREGATE,
        aggregateId: id,
        aggregateVersion: 1,
        payload: {
          reviewId: id,
          studentId: student.studentId,
          rating: body.rating,
          submittedAt: submittedAt.toISOString(),
        },
      }),
    ]);
    return { id, version: 1 };
  }
}
