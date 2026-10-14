import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdaptersModule } from '../../src/adapters/adapters.module.js';
import { ConsoleSmsSender } from '../../src/adapters/sms/console-sms-sender.js';
import { FakeSmsSender } from '../../src/adapters/sms/fake-sms-sender.js';
import { SMS_SENDER, type SmsSender } from '../../src/adapters/sms/sms-sender.js';
import { EMAIL_SENDER, type EmailSender } from '../../src/adapters/email/email-sender.js';
import { FakeEmailSender } from '../../src/adapters/email/fake-email-sender.js';
import { SmtpEmailSender } from '../../src/adapters/email/smtp-email-sender.js';
import { AppConfigModule } from '../../src/kernel/config/config.module.js';
import { ConsolePushSender } from '../../src/adapters/push/console-push-sender.js';
import { FakePushSender } from '../../src/adapters/push/fake-push-sender.js';
import { PUSH_SENDER, type PushSender } from '../../src/adapters/push/push-sender.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../src/adapters/payments/payment-provider.js';

describe('SMS adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the console sender logs the destination and the body as a structured entry', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new ConsoleSmsSender(true).send({ to: '+4915550000002', body: 'Your code is 123456' });

    expect(log).toHaveBeenCalledWith({
      msg: 'sms (console adapter)',
      to: '+4915550000002',
      body: 'Your code is 123456',
    });
  });

  it('the console sender in production logs neither the destination nor the body', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new ConsoleSmsSender(false).send({ to: '+4915550000002', body: 'Your code is 123456' });

    expect(log).toHaveBeenCalledWith({ msg: 'sms (console adapter)', length: 19 });
    expect(JSON.stringify(log.mock.calls)).not.toContain('123456');
    expect(JSON.stringify(log.mock.calls)).not.toContain('+4915550000002');
  });

  it('the fake sender records messages in memory', async () => {
    const fake = new FakeSmsSender();
    await fake.send({ to: '+1', body: 'a' });
    await fake.send({ to: '+2', body: 'b' });

    expect(fake.sent).toEqual([
      { to: '+1', body: 'a' },
      { to: '+2', body: 'b' },
    ]);
    expect(fake.last()).toEqual({ to: '+2', body: 'b' });
    fake.clear();
    expect(fake.sent).toEqual([]);
  });
});

describe('email adapters', () => {
  it('the fake sender records messages in memory', async () => {
    const fake = new FakeEmailSender();
    await fake.send({ to: 'a@example.com', subject: 's', text: 't' });

    expect(fake.sent).toEqual([{ to: 'a@example.com', subject: 's', text: 't' }]);
    expect(fake.last()?.subject).toBe('s');
  });
});

describe('push adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the console sender logs the push and reports it as sent', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const message = { token: 'ExponentPushToken[a]', title: 'Hi', body: 'There', data: { k: 'v' } };

    expect(await new ConsolePushSender().send(message)).toEqual({ status: 'sent' });
    expect(log).toHaveBeenCalledWith({ msg: 'push (console adapter)', ...message });
  });

  it('the fake sender records pushes and reports tokens marked invalid', async () => {
    const fake = new FakePushSender();
    fake.invalidTokens.add('dead');
    expect(await fake.send({ token: 'live', title: 't', body: 'b' })).toEqual({ status: 'sent' });
    expect(await fake.send({ token: 'dead', title: 't', body: 'b' })).toEqual({
      status: 'invalid_token',
    });
    expect(fake.sent).toEqual([{ token: 'live', title: 't', body: 'b' }]);
  });
});

describe('AdaptersModule', () => {
  it('provides the console SMS sender and the SMTP email sender by default', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule.forRoot({ envFilePath: ['.env.example'] }), AdaptersModule],
    }).compile();

    expect(moduleRef.get<SmsSender>(SMS_SENDER)).toBeInstanceOf(ConsoleSmsSender);
    expect(moduleRef.get<EmailSender>(EMAIL_SENDER)).toBeInstanceOf(SmtpEmailSender);
    expect(moduleRef.get<PushSender>(PUSH_SENDER)).toBeInstanceOf(ConsolePushSender);
    await moduleRef.close();
  });

  it('builds fake checkout links on API_PUBLIC_URL, or on localhost and API_PORT by default', async () => {
    const checkoutUrl = async (env: Record<string, string>) => {
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const moduleRef = await Test.createTestingModule({
        imports: [AppConfigModule.forRoot({ envFilePath: ['.env.example'] }), AdaptersModule],
      }).compile();
      try {
        const session = await moduleRef.get<PaymentProvider>(PAYMENT_PROVIDER).createCheckout({
          accountRef: 'fake_acct_1',
          paymentId: '0192f000-0000-7000-8000-000000000001',
          amountMinor: 1000,
          currency: 'EUR',
          description: 'Lesson',
        });
        return session.checkoutUrl;
      } finally {
        await moduleRef.close();
        vi.unstubAllEnvs();
      }
    };

    expect(await checkoutUrl({ API_PORT: '13999' })).toMatch(
      /^http:\/\/localhost:13999\/fake-pay\/fake_pay_/,
    );
    expect(await checkoutUrl({ API_PUBLIC_URL: 'https://api.example.com/' })).toMatch(
      /^https:\/\/api\.example\.com\/fake-pay\/fake_pay_/,
    );
  });

  it('lets tests override the senders', async () => {
    const sms = new FakeSmsSender();
    const email = new FakeEmailSender();
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule.forRoot({ envFilePath: ['.env.example'] }), AdaptersModule],
    })
      .overrideProvider(SMS_SENDER)
      .useValue(sms)
      .overrideProvider(EMAIL_SENDER)
      .useValue(email)
      .compile();

    expect(moduleRef.get(SMS_SENDER)).toBe(sms);
    expect(moduleRef.get(EMAIL_SENDER)).toBe(email);
    await moduleRef.close();
  });
});
