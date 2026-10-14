import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { columnHelperFor, DataTable } from '../../src/components/data-table';
import { useCursorPagination } from '../../src/hooks/use-cursor-pagination';
import { renderWithProviders } from '../support/providers';

interface Row {
  id: string;
  name: string;
}

const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }));
const helper = columnHelperFor<Row>();
const columns = helper.columns([helper.accessor('name', { header: 'Name' })]);

function servePage(cursor: string | undefined, limit: number) {
  const offset = cursor ? Number(cursor) : 0;
  const next = offset + limit;
  return { items: rows.slice(offset, next), nextCursor: next < rows.length ? String(next) : null };
}

function Harness({ limit = 2 }: { limit?: number }) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const pagination = useCursorPagination(cursor, setCursor);
  const page = servePage(cursor, limit);
  return (
    <DataTable
      label="Rows"
      columns={columns}
      items={page.items}
      nextCursor={page.nextCursor}
      pagination={pagination}
      status="success"
      emptyTitle="Nothing here"
    />
  );
}

const names = () =>
  within(screen.getByRole('table', { name: 'Rows' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent);

describe('DataTable with cursor pagination', () => {
  it('renders the header and the first page', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(names()).toEqual(['Row 0', 'Row 1']);
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true);
  });

  it('walks forward with the next cursor and back through the visited cursors', async () => {
    renderWithProviders(<Harness />);
    const next = screen.getByRole('button', { name: 'Next page' });
    const previous = screen.getByRole('button', { name: 'Previous page' });
    await userEvent.click(next);
    expect(names()).toEqual(['Row 2', 'Row 3']);
    await userEvent.click(next);
    expect(names()).toEqual(['Row 4']);
    expect(next).toHaveProperty('disabled', true);
    await userEvent.click(previous);
    expect(names()).toEqual(['Row 2', 'Row 3']);
    await userEvent.click(previous);
    expect(names()).toEqual(['Row 0', 'Row 1']);
    expect(previous).toHaveProperty('disabled', true);
  });

  it('hides the pager when everything fits on one page', () => {
    renderWithProviders(<Harness limit={10} />);
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('shows the empty state when there are no rows', () => {
    renderWithProviders(
      <DataTable
        label="Rows"
        columns={columns}
        items={[]}
        nextCursor={null}
        status="success"
        emptyTitle="Nothing here"
      />,
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows loading and error states', () => {
    const { rerender } = renderWithProviders(
      <DataTable
        label="Rows"
        columns={columns}
        items={undefined}
        nextCursor={null}
        status="pending"
        emptyTitle="-"
      />,
    );
    expect(screen.getByRole('status')).toBeTruthy();
    rerender(
      <DataTable
        label="Rows"
        columns={columns}
        items={undefined}
        nextCursor={null}
        status="error"
        error={{ error: { code: 'forbidden', message: 'Not allowed' } }}
        emptyTitle="-"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Not allowed');
  });
});
