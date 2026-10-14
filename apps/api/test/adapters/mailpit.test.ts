import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdaptersModule } from '../../src/adapters/adapters.module.js';
import { EMAIL_SENDER, type EmailSender } from '../../src/adapters/email/email-sender.js';
import { AppConfigModule } from '../../src/kernel/config/config.module.js';
import type { Env } from '../../src/kernel/config/env.js';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  From: { Address: string };
}

describe('SMTP email sender against Mailpit', () => {
  let moduleRef: TestingModule;
  let apiUrl: string;
  const created: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule.forRoot({ envFilePath: ['.env.example'] }), AdaptersModule],
    }).compile();
    apiUrl = moduleRef.get<ConfigService<Env, true>>(ConfigService).get('MAILPIT_API_URL', {
      infer: true,
    });
  });

  afterAll(async () => {
    if (created.length > 0) {
      await fetch(`${apiUrl}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ IDs: created }),
      });
    }
    await moduleRef?.close();
  });

  async function findBySubject(subject: string): Promise<MailpitSummary> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const res = await fetch(
        `${apiUrl}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
      );
      const body = (await res.json()) as { messages: MailpitSummary[] };
      const match = body.messages.find((m) => m.Subject === subject);
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Mailpit has no message with subject ${subject}`);
  }

  it('delivers through SMTP, and the message can be read back from the Mailpit API', async () => {
    const subject = `DriveOS adapter test ${randomUUID()}`;
    const sender = moduleRef.get<EmailSender>(EMAIL_SENDER);

    await sender.send({
      to: 'adapter.test@example.com',
      subject,
      text: 'Plain body 123456',
      html: '<p>Html body 123456</p>',
    });

    const summary = await findBySubject(subject);
    created.push(summary.ID);
    expect(summary.To.map((to) => to.Address)).toEqual(['adapter.test@example.com']);
    expect(summary.From.Address).toBe('no-reply@driveos.local');
    const message = (await (await fetch(`${apiUrl}/api/v1/message/${summary.ID}`)).json()) as {
      Text: string;
      HTML: string;
    };
    expect(message.Text.trim()).toBe('Plain body 123456');
    expect(message.HTML).toContain('<p>Html body 123456</p>');
  });
});
