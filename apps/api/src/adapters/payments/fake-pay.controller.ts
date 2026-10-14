import { Controller, Get, Header, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../kernel/auth/public.decorator.js';
import type { Env } from '../../kernel/config/env.js';
import { notFound } from '../../kernel/http/errors.js';
import { RateLimit } from '../../kernel/http/rate-limit.decorator.js';
import { t } from '../../kernel/i18n/i18n.js';
import { formatMinorAmount } from '../money.js';
import { type FakeCheckoutSession, FakePaymentProvider } from './fake-payment-provider.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';
import { StatusCodes } from 'http-status-codes';

const HTML = 'text/html; charset=utf-8';
const OUTCOMES = { succeed: 'payment.succeeded', fail: 'payment.failed' } as const;

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

@ApiExcludeController()
@RateLimit({ name: 'fake-pay', keyBy: 'ip+route' })
@Controller('fake-pay')
export class FakePayController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get(':ref')
  @Public()
  @Header('Content-Type', HTML)
  show(@Param('ref') ref: string): string {
    const { session } = this.checkout(ref);
    const path = `/fake-pay/${encodeURIComponent(session.providerRef)}`;
    const amount = formatMinorAmount(session.amountMinor, session.currency);
    return page(
      t('fake_pay.title'),
      `<p>${escapeHtml(session.description)}</p>` +
        `<p>${escapeHtml(t('fake_pay.amount', { amount }))}</p>` +
        `<form method="post" action="${path}/succeed"><button>${escapeHtml(t('fake_pay.succeed'))}</button></form>` +
        `<form method="post" action="${path}/fail"><button>${escapeHtml(t('fake_pay.fail'))}</button></form>`,
    );
  }

  @Post(':ref/:outcome')
  @Public()
  @HttpCode(StatusCodes.OK)
  @Header('Content-Type', HTML)
  async complete(
    @Param('ref') ref: string,
    @Param('outcome') outcome: string,
    @Req() req: Request,
  ): Promise<string> {
    if (outcome !== 'succeed' && outcome !== 'fail') throw notFound();
    const { provider, session } = this.checkout(ref);
    const signed = provider.signedWebhook({
      type: OUTCOMES[outcome],
      providerRef: session.providerRef,
      amountMinor: session.amountMinor,
      currency: session.currency,
      occurredAt: new Date().toISOString(),
    });
    const response = await fetch(
      `http://127.0.0.1:${req.socket.localPort}/v1/webhooks/payments/${provider.name}`,
      { method: 'POST', headers: signed.headers, body: signed.body },
    );
    return page(
      t(outcome === 'succeed' ? 'fake_pay.succeeded' : 'fake_pay.failed'),
      `<p>${escapeHtml(t('fake_pay.webhook_status', { status: response.status }))}</p>`,
    );
  }

  private checkout(ref: string): { provider: FakePaymentProvider; session: FakeCheckoutSession } {
    const provider = this.provider;
    const enabled = this.config.get('NODE_ENV', { infer: true }) !== 'production';
    const session =
      enabled && provider instanceof FakePaymentProvider ? provider.checkoutSession(ref) : null;
    if (!session || !(provider instanceof FakePaymentProvider)) throw notFound();
    return { provider, session };
  }
}
