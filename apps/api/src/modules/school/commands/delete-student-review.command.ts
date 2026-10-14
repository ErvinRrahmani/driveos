import { Command } from '../../../kernel/cqrs/index.js';

/** Deletes the student's review in the current school (student anonymization); no-op without one. */
export class DeleteStudentReviewCommand extends Command<void> {
  constructor(readonly studentId: string) {
    super();
  }
}
