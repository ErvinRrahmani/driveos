import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { assertLessonTypeRules } from '../infra/lesson-type-records.js';
import { lessonTypes } from '../infra/schema.js';
import { schoolIdOf } from '../infra/tenant.js';
import { CreateLessonTypeCommand } from './create-lesson-type.command.js';

@CommandHandler(CreateLessonTypeCommand)
export class CreateLessonTypeHandler implements ICommandHandler<
  CreateLessonTypeCommand,
  CommandResult
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ body }: CreateLessonTypeCommand): Promise<CommandResult> {
    assertLessonTypeRules(body);
    const [row] = await this.tenant.tx
      .insert(lessonTypes)
      .values({ ...body, schoolId: schoolIdOf(this.tenant) })
      .returning({ id: lessonTypes.id, version: lessonTypes.version });
    if (!row) throw new Error('Lesson type insert returned no row');
    return row;
  }
}
