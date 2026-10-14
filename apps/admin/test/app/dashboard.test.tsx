import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';
import { StatusCodes } from 'http-status-codes';

beforeAll(startServer);
afterEach(() => server.events.removeAllListeners());
afterAll(() => server.close());

function stubGrowth(months: string[], reply: (month: string) => Response) {
  server.use(
    http.get('*/v1/reports/growth', ({ request }) => {
      const month = new URL(request.url).searchParams.get('month') ?? '';
      months.push(month);
      return reply(month);
    }),
  );
}

describe('dashboard', () => {
  it.each(['growth_report_missing', 'not_found'])(
    'shows a neutral "no report yet" state on 404 %s and keeps the month picker',
    async (code) => {
      const months: string[] = [];
      const view = renderApp({ path: '/?month=2026-09', as: 'owner' });
      stubGrowth(months, () =>
        HttpResponse.json(
          { error: { code, message: 'No growth report for this month.' } },
          { status: StatusCodes.NOT_FOUND },
        ),
      );

      const status = await screen.findByRole('status', { name: 'No report for this month yet' });
      expect(status.textContent).toContain('Reports are generated on the 1st of each month.');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
      expect(months).toEqual(['2026-09']);

      fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-08' } });
      await waitFor(() => expect(months).toEqual(['2026-09', '2026-08']));
      expect(view.router.state.location.search).toMatchObject({ month: '2026-08' });
      expect(
        await screen.findByRole('status', { name: 'No report for this month yet' }),
      ).toBeTruthy();
    },
  );

  it('shows an error with retry when the growth report fails', async () => {
    const months: string[] = [];
    renderApp({ path: '/?month=2026-09', as: 'owner' });
    stubGrowth(months, () =>
      HttpResponse.json(
        { error: { code: 'internal_error', message: 'Boom' } },
        { status: StatusCodes.INTERNAL_SERVER_ERROR },
      ),
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
