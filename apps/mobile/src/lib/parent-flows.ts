import type { AppServices } from './api';
import { failure, type FlowResult, send } from './flow';

export const CONSENT_TEXT_VERSION = 'guardian-consent-2026-01';

export async function giveConsent(services: AppServices, linkId: string): Promise<FlowResult> {
  const result = await send(() =>
    services.api.fetchClient.POST('/v1/guardians/{linkId}/consent', {
      params: { path: { linkId } },
      body: { consentTextVersion: CONSENT_TEXT_VERSION },
    }),
  );
  return result.ok ? { ok: true } : failure(result);
}

export async function fetchInvoicePdf(
  services: AppServices,
  invoiceId: string,
): Promise<FlowResult<{ bytes: ArrayBuffer }>> {
  const result = await send(() =>
    services.api.fetchClient.GET('/v1/invoices/{id}.pdf', {
      params: { path: { id: invoiceId } },
      parseAs: 'arrayBuffer',
    }),
  );
  return result.ok ? { ok: true, bytes: result.data } : failure(result);
}
