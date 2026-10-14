import { eq } from 'drizzle-orm';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { schoolReviews } from '../infra/schema.js';
import { DeleteStudentReviewCommand } from './delete-student-review.command.js';

@CommandHandler(DeleteStudentReviewCommand)
export class DeleteStudentReviewHandler implements ICommandHandler<
  DeleteStudentReviewCommand,
  void
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ studentId }: DeleteStudentReviewCommand): Promise<void> {
    await this.tenant.tx.delete(schoolReviews).where(eq(schoolReviews.studentId, studentId));
  }
}
