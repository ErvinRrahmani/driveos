import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiPublicUrl, type Env } from '../kernel/config/env.js';
import { EMAIL_SENDER } from './email/email-sender.js';
import { ErrorPointsExamRules } from './exam-rules/error-points-exam-rules.js';
import { EXAM_RULES } from './exam-rules/exam-rules.js';
import { ExamRulesRegistry } from './exam-rules/exam-rules.registry.js';
import { FractionExamRules } from './exam-rules/fraction-exam-rules.js';
import { GenericEuInvoicePolicy } from './invoices/generic-eu-invoice-policy.js';
import { INVOICE_POLICY } from './invoices/invoice-policy.js';
import { notificationSenderProviders } from './notification-senders.provider.js';
import { FakePaymentProvider } from './payments/fake-payment-provider.js';
import { PAYMENT_PROVIDER } from './payments/payment-provider.js';
import { PUSH_SENDER } from './push/push-sender.js';
import { JsonQuestionBankImporter } from './question-bank/json-question-bank-importer.js';
import { QUESTION_BANK_IMPORTER } from './question-bank/question-bank-importer.js';
import { SMS_SENDER } from './sms/sms-sender.js';
import { OBJECT_STORAGE } from './storage/object-storage.js';
import { objectStorageProvider } from './storage/object-storage.provider.js';

@Global()
@Module({
  providers: [
    ...notificationSenderProviders,
    { provide: INVOICE_POLICY, useClass: GenericEuInvoicePolicy },
    objectStorageProvider,
    { provide: QUESTION_BANK_IMPORTER, useClass: JsonQuestionBankImporter },
    {
      provide: EXAM_RULES,
      useValue: new ExamRulesRegistry([new FractionExamRules(), new ErrorPointsExamRules()]),
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new FakePaymentProvider({
          baseUrl: apiPublicUrl({
            API_PORT: config.get('API_PORT', { infer: true }),
            API_PUBLIC_URL: config.get('API_PUBLIC_URL', { infer: true }),
          }),
          secret: config.get('FAKE_PAYMENT_SECRET', { infer: true }),
        }),
    },
  ],
  exports: [
    SMS_SENDER,
    EMAIL_SENDER,
    PUSH_SENDER,
    PAYMENT_PROVIDER,
    INVOICE_POLICY,
    OBJECT_STORAGE,
    QUESTION_BANK_IMPORTER,
    EXAM_RULES,
  ],
})
export class AdaptersModule {}
