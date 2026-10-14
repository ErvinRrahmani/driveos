import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { Command, Query } from '../../src/kernel/cqrs/index.js';
import * as billing from '../../src/modules/billing/index.js';
import * as documents from '../../src/modules/documents/index.js';
import * as identity from '../../src/modules/identity/index.js';
import * as messaging from '../../src/modules/messaging/index.js';
import * as platform from '../../src/modules/platform/index.js';
import * as reporting from '../../src/modules/reporting/index.js';
import * as scheduling from '../../src/modules/scheduling/index.js';
import * as school from '../../src/modules/school/index.js';
import * as theory from '../../src/modules/theory/index.js';
import * as training from '../../src/modules/training/index.js';
import { BillingModule } from '../../src/modules/billing/billing.module.js';
import { DocumentsModule } from '../../src/modules/documents/documents.module.js';
import { MessagingModule } from '../../src/modules/messaging/messaging.module.js';
import { PlatformModule } from '../../src/modules/platform/platform.module.js';
import { ReportingModule } from '../../src/modules/reporting/reporting.module.js';
import { SchedulingModule } from '../../src/modules/scheduling/scheduling.module.js';
import { SchoolModule } from '../../src/modules/school/school.module.js';
import { TheoryModule } from '../../src/modules/theory/theory.module.js';
import { TrainingModule } from '../../src/modules/training/training.module.js';

const STEP_4_MODULES = {
  school,
  platform,
  scheduling,
  training,
  theory,
  billing,
  documents,
  messaging,
  reporting,
} as const;

const SERVICE_TOKENS = ['LEDGER_WRITER', 'AUDIT_WRITER'];

const NEST_MODULES = [
  SchoolModule,
  PlatformModule,
  SchedulingModule,
  TrainingModule,
  TheoryModule,
  BillingModule,
  DocumentsModule,
  MessagingModule,
  ReportingModule,
];

const isSubclassOf = (value: unknown, base: abstract new (...args: never[]) => unknown) =>
  typeof value === 'function' && value.prototype instanceof base;

describe('module public surfaces (index.ts)', () => {
  it('covers every module directory', () => {
    const modulesDir = fileURLToPath(new URL('../../src/modules/', import.meta.url));
    const dirs = readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual([...Object.keys(STEP_4_MODULES), 'identity'].sort());
  });

  it.each(Object.entries({ ...STEP_4_MODULES, identity }))(
    '%s exports no handlers, repositories or projections',
    (_name, surface) => {
      const leaks = Object.keys(surface).filter((key) =>
        /(Handler|Repository|Projection|Subscriber|Controller)$/.test(key),
      );
      expect(leaks).toEqual([]);
    },
  );

  describe.each(Object.entries(STEP_4_MODULES))('%s', (_name, surface) => {
    const entries = Object.entries(surface as Record<string, unknown>);

    it('exports only command and query classes and service tokens, never its Nest module', () => {
      const unexpected = entries
        .filter(([key, value]) => {
          if (key.endsWith('Command')) return !isSubclassOf(value, Command);
          if (key.endsWith('Query')) return !isSubclassOf(value, Query);
          return !(SERVICE_TOKENS.includes(key) && typeof value === 'symbol');
        })
        .map(([key]) => key);
      expect(unexpected).toEqual([]);
    });

    it('has at least one command or query', () => {
      expect(entries.some(([key]) => key.endsWith('Command') || key.endsWith('Query'))).toBe(true);
    });
  });

  it('every module class can be imported into a Nest application', async () => {
    const app = await Test.createTestingModule({
      imports: [AppModule.forRoot({ envFilePath: ['.env', '.env.example'] }), ...NEST_MODULES],
    }).compile();
    expect(app).toBeDefined();
    await app.close();
  });

  it('exposes the cross-module contracts other modules rely on', () => {
    const required: Record<string, string[]> = {
      school: ['GetSchoolSettingsQuery', 'ProvisionSchoolCommand', 'GetPaymentAccountQuery'],
      platform: ['CreateSchoolCommand', 'StartSupportSessionCommand', 'AUDIT_WRITER'],
      scheduling: [
        'BookLessonCommand',
        'CancelLessonCommand',
        'CreateSlotOfferCommand',
        'GetLessonQuery',
        'HasCompletedLessonsQuery',
      ],
      training: [
        'EnrolStudentCommand',
        'GetStudentMinorStatusQuery',
        'ListStudentIdsForInstructorQuery',
        'GetStudentRecipientsQuery',
      ],
      theory: ['ImportQuestionPackCommand', 'PublishQuestionPackCommand'],
      billing: [
        'LEDGER_WRITER',
        'RecordCashPaymentCommand',
        'IssueRefundCommand',
        'AdjustLedgerCommand',
        'MarkStatementPaidCommand',
        'GetBalanceQuery',
        'GetStudentEntitlementsQuery',
        'HasEntitlementQuery',
      ],
      documents: ['SignContractCommand'],
      messaging: ['SendNotificationCommand', 'SendMessageCommand'],
      reporting: ['GenerateGrowthReportCommand', 'GetGrowthReportQuery'],
    };
    for (const [name, keys] of Object.entries(required)) {
      const surface = STEP_4_MODULES[name as keyof typeof STEP_4_MODULES] as Record<
        string,
        unknown
      >;
      expect(
        keys.filter((key) => !(key in surface)),
        name,
      ).toEqual([]);
    }
  });

  it('identity still exports MembershipDirectory', () => {
    expect(typeof identity.MembershipDirectory).toBe('function');
  });
});
