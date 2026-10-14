import type {
  GrowthReport,
  NoShowReportResponse,
  PassRateReportResponse,
  RevenueReportResponse,
  UtilisationReportResponse,
} from '@driveos/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';
import { StatusCodes } from 'http-status-codes';

beforeAll(startServer);
afterEach(() => server.events.removeAllListeners());
afterAll(() => server.close());

const RANGE = 'from=2026-09-01&to=2026-09-30';

function echoedRange(request: Request) {
  const query = new URL(request.url).searchParams;
  return {
    from: query.get('from') ?? '',
    to: query.get('to') ?? '',
    bucket: (query.get('bucket') ?? 'day') as NoShowReportResponse['bucket'],
  };
}

function stubRangeReports(calls: URL[] = []) {
  server.use(
    http.get('*/v1/reports/no-shows', ({ request }) => {
      calls.push(new URL(request.url));
      return HttpResponse.json({
        ...echoedRange(request),
        items: [
          { period: '2026-09-01', lessonsDue: 48, noShows: 2, noShowRateBp: 417 },
          { period: '2026-09-08', lessonsDue: 52, noShows: 1, noShowRateBp: 192 },
        ],
        totals: { lessonsDue: 100, noShows: 3, noShowRateBp: 300 },
      } satisfies NoShowReportResponse);
    }),
    http.get('*/v1/reports/revenue', ({ request }) => {
      const bucket = {
        currency: 'EUR',
        revenueInAppMinor: 120000,
        revenueRecordedMinor: 145000,
        refundsMinor: 6000,
        upsellsSold: 3,
        upsellRevenueMinor: 23700,
        packageMinutesSold: 900,
      };
      return HttpResponse.json({
        ...echoedRange(request),
        items: [{ period: '2026-09-01', ...bucket }],
        totals: bucket,
      } satisfies RevenueReportResponse);
    }),
    http.get('*/v1/reports/pass-rate', ({ request }) =>
      HttpResponse.json({
        ...echoedRange(request),
        items: [
          { period: '2026-09-01', kind: 'practical', attempts: 4, passed: 3, passRateBp: 7500 },
        ],
        totals: [
          { kind: 'practical', attempts: 4, passed: 3, passRateBp: 7500 },
          { kind: 'theory', attempts: 6, passed: 5, passRateBp: 8333 },
        ],
      } satisfies PassRateReportResponse),
    ),
    http.get('*/v1/reports/utilisation', ({ request }) => {
      const bucket = {
        instructorMinutesAvailable: 7200,
        instructorMinutesBooked: 5760,
        utilisationBp: 8000,
        slotsOffered: 6,
        slotsFilled: 4,
        slotFillMinutes: 240,
      };
      return HttpResponse.json({
        ...echoedRange(request),
        items: [{ period: '2026-09-01', ...bucket }],
        totals: bucket,
      } satisfies UtilisationReportResponse);
    }),
  );
  return calls;
}

function growthReport(month: string, revenueRecordedMinor: number): GrowthReport {
  return {
    id: '0192f000-011c-7000-8000-000000000001',
    month,
    currency: 'EUR',
    revenueInAppMinor: 480000,
    revenueRecordedMinor,
    inappShareBp: 8000,
    lateCancellationsKept: 3,
    lateCancelMinutesKept: 180,
    noShowRateBp: 350,
    noShowRatePrev3mBp: 520,
    upsellsSold: 9,
    upsellRevenueMinor: 71100,
    slotsFilled: 11,
    slotFillMinutes: 660,
    generatedAt: '2026-10-01T01:00:00.000Z',
  };
}

describe('reports', () => {
  it('shows the no-show report as a table and a chart by default', async () => {
    renderApp({ path: `/reports?${RANGE}`, as: 'owner' });
    stubRangeReports();
    const table = await screen.findByRole('table', { name: 'No-shows' });
    const row = await within(table).findByRole('row', { name: /Sep 1, 2026/ });
    expect(await within(row).findByText('48')).toBeTruthy();
    expect(await within(row).findByText('4.2%')).toBeTruthy();
    expect(await screen.findByRole('img', { name: 'No-show rate by day' })).toBeTruthy();
    const totals = await screen.findByRole('region', { name: 'Totals' });
    expect(await within(totals).findByText('3%')).toBeTruthy();
  });

  it('sends the range from the URL and updates it', async () => {
    const view = renderApp({ path: `/reports?${RANGE}`, as: 'owner' });
    const calls = stubRangeReports();
    await screen.findByRole('table', { name: 'No-shows' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-01' } });
    await waitFor(() =>
      expect(view.router.state.location.search).toMatchObject({
        from: '2026-07-01',
        to: '2026-09-30',
      }),
    );
    await waitFor(() => {
      const last = calls.at(-1);
      expect(last?.searchParams.get('from')).toBe('2026-07-01');
      expect(last?.searchParams.get('to')).toBe('2026-09-30');
      expect(last?.searchParams.get('bucket')).toBe('week');
    });
  });

  it('lets the user choose the bucket and keeps it in the URL', async () => {
    const view = renderApp({ path: `/reports?${RANGE}`, as: 'owner' });
    const calls = stubRangeReports();
    await screen.findByRole('img', { name: 'No-show rate by day' });
    await userEvent.selectOptions(await screen.findByLabelText('Group by'), 'week');
    await waitFor(() =>
      expect(view.router.state.location.search).toMatchObject({ bucket: 'week' }),
    );
    expect(await screen.findByRole('img', { name: 'No-show rate by week' })).toBeTruthy();
    expect(calls.at(-1)?.searchParams.get('bucket')).toBe('week');

    await userEvent.selectOptions(screen.getByLabelText('Group by'), '');
    await waitFor(() => expect(view.router.state.location.search.bucket).toBeUndefined());
    expect(await screen.findByRole('img', { name: 'No-show rate by day' })).toBeTruthy();
  });

  it('reads the bucket from the URL', async () => {
    renderApp({ path: `/reports?${RANGE}&bucket=month`, as: 'owner' });
    const calls = stubRangeReports();
    expect(await screen.findByRole('img', { name: 'No-show rate by month' })).toBeTruthy();
    expect(calls.at(-1)?.searchParams.get('bucket')).toBe('month');
  });

  it('falls back to the automatic bucket for an unknown one', async () => {
    renderApp({ path: `/reports?${RANGE}&bucket=year`, as: 'owner' });
    const calls = stubRangeReports();
    expect(await screen.findByRole('img', { name: 'No-show rate by day' })).toBeTruthy();
    expect(calls.at(-1)?.searchParams.get('bucket')).toBe('day');
  });

  it('does not request a range the API would reject', async () => {
    renderApp({ path: '/reports?from=2025-01-01&to=2026-01-02', as: 'owner' });
    const calls = stubRangeReports();
    expect(
      await screen.findByText(
        'Choose a start date on or before the end date, at most 366 days apart.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'No-shows' })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('switches tabs through the URL', async () => {
    const view = renderApp({ path: `/reports?${RANGE}`, as: 'owner' });
    stubRangeReports();
    await userEvent.click(await screen.findByRole('tab', { name: 'Revenue' }));
    await waitFor(() =>
      expect(view.router.state.location.search).toMatchObject({
        tab: 'revenue',
        from: '2026-09-01',
      }),
    );
    const table = await screen.findByRole('table', { name: 'Revenue' });
    const row = await within(table).findByRole('row', { name: /Sep 1, 2026/ });
    expect(await within(row).findByText('€1,450.00')).toBeTruthy();
    expect(await within(row).findByText('€60.00')).toBeTruthy();
    expect(await screen.findByRole('img', { name: 'Recorded revenue by day' })).toBeTruthy();
  });

  it('shows pass rates per test kind', async () => {
    renderApp({ path: `/reports?tab=pass-rate&${RANGE}`, as: 'owner' });
    stubRangeReports();
    const totals = await screen.findByRole('region', { name: 'Totals' });
    expect(await within(totals).findByText('Practical: 75% (3 of 4)')).toBeTruthy();
    expect(await within(totals).findByText('Theory: 83.3% (5 of 6)')).toBeTruthy();
    expect(await screen.findByRole('table', { name: 'Pass rate' })).toBeTruthy();
  });

  it('shows instructor utilisation', async () => {
    renderApp({ path: `/reports?tab=utilisation&${RANGE}`, as: 'owner' });
    stubRangeReports();
    const table = await screen.findByRole('table', { name: 'Utilisation' });
    const row = await within(table).findByRole('row', { name: /Sep 1, 2026/ });
    expect(await within(row).findByText('80%')).toBeTruthy();
    expect(await within(row).findByText('120 h')).toBeTruthy();
    expect(await within(row).findByText('96 h')).toBeTruthy();
  });

  it('lists the growth history for the 12 months up to the chosen month', async () => {
    const months: string[] = [];
    renderApp({ path: '/reports?tab=growth&month=2026-09', as: 'owner' });
    server.use(
      http.get('*/v1/reports/growth', ({ request }) => {
        const month = new URL(request.url).searchParams.get('month') ?? '';
        months.push(month);
        if (month === '2026-09') return HttpResponse.json(growthReport(month, 600000));
        if (month === '2026-08') return HttpResponse.json(growthReport(month, 500000));
        if (month === '2025-11')
          return HttpResponse.json(
            { error: { code: 'internal_error', message: 'Boom' } },
            { status: StatusCodes.INTERNAL_SERVER_ERROR },
          );
        return HttpResponse.json(
          {
            error: {
              code: month === '2025-10' ? 'not_found' : 'growth_report_missing',
              message: 'No report',
            },
          },
          { status: StatusCodes.NOT_FOUND },
        );
      }),
    );
    const table = await screen.findByRole('table', { name: 'Growth history' });
    const september = await within(table).findByRole('row', { name: /September 2026/ });
    expect(await within(september).findByText('€6,000.00')).toBeTruthy();
    expect(await within(table).findByRole('row', { name: /August 2026.*€5,000\.00/ })).toBeTruthy();
    const july = await within(table).findByRole('row', { name: /July 2026/ });
    expect(await within(july).findByText('No report')).toBeTruthy();
    const october = await within(table).findByRole('row', { name: /October 2025/ });
    expect(await within(october).findByText('No report')).toBeTruthy();
    const november = await within(table).findByRole('row', { name: /November 2025/ });
    expect(await within(november).findByText('Something went wrong')).toBeTruthy();
    await waitFor(() => expect(new Set(months).size).toBe(12));
    expect(months).toContain('2025-10');
    expect(await screen.findByRole('img', { name: 'Recorded revenue by month' })).toBeTruthy();
  });

  it('is hidden from office staff', async () => {
    renderApp({ path: '/reports', as: 'office' });
    expect(await screen.findByText('You do not have access to this page.')).toBeTruthy();
  });
});
