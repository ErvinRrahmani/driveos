import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { ApiStatus } from '../src/components/api-status';
import { i18n } from '../src/i18n';

function renderStatus(state: 'loading' | 'ok' | 'unreachable') {
  return render(
    <I18nextProvider i18n={i18n}>
      <ApiStatus state={state} />
    </I18nextProvider>,
  );
}

describe('ApiStatus', () => {
  it('shows the healthy state', () => {
    renderStatus('ok');
    expect(screen.getByRole('status').textContent).toBe('API is up');
  });

  it('shows the unreachable state', () => {
    renderStatus('unreachable');
    expect(screen.getByRole('status').textContent).toBe('API is unreachable');
  });
});
