import { eq, sql } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { assertLessonTypeRules } from '../infra/lesson-type-records.js';
import { lessonTypes } from '../infra/schema.js';
import { UpdateLessonTypeCommand } from './update-lesson-type.command.js';

@CommandHandler(UpdateLessonTypeCommand)
export class UpdateLessonTypeHandler implements ICommandHandler<
  UpdateLessonTypeCommand,
  CommandResult
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ lessonTypeId, patch }: UpdateLessonTypeCommand): Promise<CommandResult> {
    const [current] = await this.tenant.tx
      .select()
      .from(lessonTypes)
      .where(eq(lessonTypes.id, lessonTypeId))
      .for('update');
    if (!current) throw notFound();
    assertLessonTypeRules({ ...current, ...patch });
    const [row] = await this.tenant.tx
      .update(lessonTypes)
      .set({ ...patch, version: sql`${lessonTypes.version} + 1` })
      .where(eq(lessonTypes.id, lessonTypeId))
      .returning({ id: lessonTypes.id, version: lessonTypes.version });
    if (!row) throw notFound();
    return row;
  }
}
