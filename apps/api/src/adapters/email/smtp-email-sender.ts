import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../kernel/config/env.js';
import type { EmailMessage, EmailSender } from './email-sender.js';

@Injectable()
export class SmtpEmailSender implements EmailSender, OnApplicationShutdown {
  private transporter: Transporter | undefined;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(message: EmailMessage): Promise<void> {
    this.transporter ??= nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: false,
    });
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    });
  }

  onApplicationShutdown(): void {
    this.transporter?.close();
    this.transporter = undefined;
  }
}
