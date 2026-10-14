import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, LoadingState, NeutralState } from '../../src/components/states';
import { renderWithProviders } from '../support/providers';

describe('state components', () => {
  it('announces loading', () => {
    renderWithProviders(<LoadingState />);
    expect(screen.getByRole('status').textContent).toContain('Loading…');
  });

  it('shows the server message and retries on demand', async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <ErrorState
        error={{ error: { code: 'not_found', message: 'Branch not found' } }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Branch not found');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic message for network errors', () => {
    renderWithProviders(<ErrorState error={new TypeError('Failed to fetch')} />);
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
  });

  it('treats not_implemented like any other error', () => {
    renderWithProviders(
      <ErrorState
        error={{ error: { code: 'not_implemented', message: 'Not available.' } }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Not available.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('renders a neutral state for data that does not exist yet', () => {
    renderWithProviders(<NeutralState title="No report yet" description="Comes on the 1st." />);
    const status = screen.getByRole('status', { name: 'No report yet' });
    expect(status.textContent).toContain('Comes on the 1st.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the error state with a retry button for server errors', () => {
    renderWithProviders(
      <ErrorState
        error={{ error: { code: 'internal_error', message: 'Boom' } }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('renders an empty state with its action', () => {
    renderWithProviders(
      <EmptyState title="No branches yet" action={<button>Add branch</button>} />,
    );
    expect(screen.getByText('No branches yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add branch' })).toBeTruthy();
  });
});
