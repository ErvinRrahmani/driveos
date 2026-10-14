import { type EventPayload, MembershipCreated, MembershipRolesChanged } from '@driveos/shared';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GuardianLinks } from '../infra/guardian-links.js';
import { students } from '../infra/schema.js';

type Payload = EventPayload<typeof MembershipCreated> | EventPayload<typeof MembershipRolesChanged>;

@Injectable()
@EventSubscriber({
  name: 'training.membership-student-link',
  events: [MembershipCreated, MembershipRolesChanged],
})
export class MembershipStudentLinkSubscriber implements EventHandler<Payload> {
  private readonly logger = new Logger(MembershipStudentLinkSubscriber.name);

  constructor(
    private readonly tenant: TenantContext,
    private readonly guardians: GuardianLinks,
  ) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    const { studentId, userId, roles } = event.payload;
    if (!studentId) return;
    const previous = 'previousRoles' in event.payload ? event.payload.previousRoles : [];
    const added = roles.filter((role) => !previous.includes(role));
    if (added.includes('student')) await this.linkStudentUser(event, studentId, userId);
    if (added.includes('parent') && (await this.studentExists(studentId))) {
      await this.guardians.link(studentId, userId);
    }
  }

  private async studentExists(studentId: string): Promise<boolean> {
    const rows = await this.tenant.tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), ne(students.status, 'anonymized')));
    return rows.length > 0;
  }

  private async linkStudentUser(
    event: DomainEvent<Payload>,
    studentId: string,
    userId: string,
  ): Promise<void> {
    const [student] = await this.tenant.tx
      .select()
      .from(students)
      .where(eq(students.id, studentId))
      .for('update');
    if (!student || student.status === 'anonymized' || student.userId === userId) return;
    const [other] = await this.tenant.tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, userId));
    if (student.userId || other) {
      this.logger.warn({
        msg: 'student login not linked: student or user already linked',
        eventId: event.id,
        schoolId: event.schoolId,
        studentId,
      });
      return;
    }
    await this.tenant.tx
      .update(students)
      .set({ userId, version: student.version + 1 })
      .where(eq(students.id, studentId));
  }
}
