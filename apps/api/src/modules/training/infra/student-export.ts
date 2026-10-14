import type {
  DocumentListResponse,
  InvoiceListResponse,
  LedgerListResponse,
  LessonStatus,
  StudentExportBundle,
} from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { formatMinorAmount } from '../../../adapters/money.js';
import { renderTextPdf } from '../../../adapters/pdf/text-pdf.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { ListInvoicesQuery, ListLedgerEntriesQuery } from '../../billing/index.js';
import { ListDocumentsQuery } from '../../documents/index.js';
import { People } from './people.js';
import { ProgressRecords } from './progress-records.js';
import { StudentListRows } from './student-list.js';
import type { StudentRow } from './student-records.js';
import { StudentViews } from './student-views.js';

const PAGE = 200;

async function allPages<T>(
  fetch: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetch(cursor);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

@Injectable()
export class StudentExport {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly views: StudentViews,
    private readonly progress: ProgressRecords,
    private readonly list: StudentListRows,
    private readonly people: People,
  ) {}

  async bundle(actor: Principal, student: StudentRow): Promise<StudentExportBundle> {
    const { guardians, ...detail } = await this.views.detail(student);
    const names = await this.people.staffNames();
    const lessons = await this.list.lessons(student.id);
    const invoices = await allPages((cursor) =>
      this.queryBus.execute<InvoiceListResponse>(
        new ListInvoicesQuery(actor, { studentId: student.id, limit: PAGE, cursor }),
      ),
    );
    const ledger = await allPages((cursor) =>
      this.queryBus.execute<LedgerListResponse>(
        new ListLedgerEntriesQuery(actor, student.id, { limit: PAGE, cursor }),
      ),
    );
    return {
      exportedAt: new Date().toISOString(),
      student: detail,
      guardians: guardians.map((guardian) => ({
        fullName: guardian.fullName,
        consentAt: guardian.consentAt,
        consentTextVersion: guardian.consentTextVersion,
        revokedAt: guardian.revokedAt,
      })),
      lessons: lessons.map((lesson) => ({
        lessonId: lesson.lessonId,
        start: lesson.startAt.toISOString(),
        end: lesson.endAt.toISOString(),
        status: lesson.status as LessonStatus,
        instructorName: names.get(lesson.instructorMembershipId) ?? '',
      })),
      progress: await this.progress.progress(student),
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        kind: invoice.kind,
        formattedNumber: invoice.formattedNumber,
        status: invoice.status,
        issuedAt: invoice.issuedAt,
        totalMinor: invoice.totalMinor,
        currency: invoice.currency,
      })),
      ledger: ledger.map((entry) => ({
        id: entry.id,
        entryType: entry.entryType,
        minutes: entry.minutes,
        balanceAfter: entry.balanceAfter,
        paymentId: entry.paymentId,
        createdAt: entry.createdAt,
      })),
      documents: (await this.documents(actor, student.id)).map((document) => ({
        id: document.id,
        kind: document.kind,
        createdAt: document.createdAt,
      })),
    };
  }

  pdf(bundle: StudentExportBundle): Uint8Array {
    const { student, progress } = bundle;
    const none = t('training.export.none');
    const field = (label: Parameters<typeof labelOf>[0], value: string | null) =>
      t('training.export.field', { label: labelOf(label), value: value ?? none });
    const codes = new Map(progress.syllabus.map((item) => [item.syllabusItemId, item.code]));
    return renderTextPdf([
      t('training.export.title', { name: student.fullName }),
      t('training.export.exported_at', { date: bundle.exportedAt }),
      '',
      t('training.export.student'),
      field('full_name', student.fullName),
      field('date_of_birth', student.dateOfBirth),
      field('phone', student.phone),
      field('email', student.email),
      field('licence_class', student.licenceClass),
      field('exam_language', student.examLanguage),
      field('test_date', student.testDate),
      field('area', student.area),
      field('pickup_address', student.pickupAddress),
      field('status', student.status),
      '',
      t('training.export.enrolments'),
      ...student.enrolments.map((enrolment) =>
        t('training.export.enrolment', {
          course: enrolment.courseName,
          licenceClass: enrolment.licenceClass,
          start: enrolment.startedAt,
          end: enrolment.endedAt ?? t('training.export.open_end'),
        }),
      ),
      '',
      t('training.export.guardians'),
      ...bundle.guardians.map((guardian) =>
        t('training.export.guardian', {
          name: guardian.fullName,
          consent: guardian.consentAt ?? none,
          revoked: guardian.revokedAt ?? none,
        }),
      ),
      '',
      t('training.export.lessons'),
      ...bundle.lessons.map((lesson) =>
        t('training.export.lesson', {
          start: lesson.start,
          end: lesson.end,
          status: lesson.status,
          instructor: lesson.instructorName,
        }),
      ),
      '',
      t('training.export.progress', { pct: progress.progressPct }),
      ...progress.syllabus.map((item) =>
        t('training.export.progress_item', {
          code: item.code,
          title: item.title,
          level: item.level ?? none,
          lessons: item.lessonCount,
        }),
      ),
      ...progress.entries.map((entry) =>
        t('training.export.progress_entry', {
          start: entry.lessonStart,
          code: codes.get(entry.syllabusItemId) ?? '',
          level: entry.level,
          note: entry.note,
        }),
      ),
      '',
      t('training.export.test_attempts'),
      ...progress.testAttempts.map((attempt) =>
        t('training.export.test_attempt', {
          date: attempt.takenOn,
          kind: attempt.kind,
          result: attempt.result,
          notes: attempt.notes,
        }),
      ),
      '',
      t('training.export.invoices'),
      ...bundle.invoices.map((invoice) =>
        t('training.export.invoice', {
          number: invoice.formattedNumber ?? none,
          kind: invoice.kind,
          status: invoice.status,
          date: invoice.issuedAt ?? none,
          total: formatMinorAmount(invoice.totalMinor, invoice.currency),
          currency: invoice.currency,
        }),
      ),
      '',
      t('training.export.ledger'),
      ...bundle.ledger.map((entry) =>
        t('training.export.ledger_entry', {
          date: entry.createdAt,
          type: entry.entryType,
          minutes: entry.minutes,
          balance: entry.balanceAfter,
        }),
      ),
      '',
      t('training.export.documents'),
      ...bundle.documents.map((document) =>
        t('training.export.document', { date: document.createdAt, kind: document.kind }),
      ),
    ]);
  }

  private documents(actor: Principal, studentId: string) {
    return allPages((cursor) =>
      this.queryBus.execute<DocumentListResponse>(
        new ListDocumentsQuery(actor, { ownerStudentId: studentId, limit: PAGE, cursor }),
      ),
    );
  }
}

function labelOf(
  key:
    | 'full_name'
    | 'date_of_birth'
    | 'phone'
    | 'email'
    | 'licence_class'
    | 'exam_language'
    | 'test_date'
    | 'area'
    | 'pickup_address'
    | 'status',
): string {
  return t(`training.export.labels.${key}`);
}
