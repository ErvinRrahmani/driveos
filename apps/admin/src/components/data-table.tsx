import {
  createColumnHelper,
  tableFeatures,
  useTable,
  type RowData,
  type TableOptions,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CursorPagination } from '@/hooks/use-cursor-pagination';

export const dataTableFeatures = tableFeatures({});
export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableColumns<TData extends RowData> = TableOptions<
  DataTableFeatures,
  TData
>['columns'];

export function columnHelperFor<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

const NO_ROWS: never[] = [];

export interface DataTableProps<TData extends RowData> {
  label: string;
  columns: DataTableColumns<TData>;
  items: TData[] | undefined;
  nextCursor: string | null | undefined;
  status: 'pending' | 'error' | 'success';
  error?: unknown;
  onRetry?: () => void;
  pagination?: CursorPagination;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  getRowId?: (row: TData) => string;
}

export function DataTable<TData extends RowData>(props: DataTableProps<TData>) {
  const { t } = useTranslation();
  const table = useTable({
    features: dataTableFeatures,
    columns: props.columns,
    data: props.items ?? NO_ROWS,
    getRowId: props.getRowId ? (row) => props.getRowId?.(row) ?? '' : undefined,
  });

  if (props.status === 'pending') return <LoadingState />;
  if (props.status === 'error') return <ErrorState error={props.error} onRetry={props.onRetry} />;

  const rows = table.getRowModel().rows;
  const showPager = props.pagination && (props.pagination.hasPrevious || !!props.nextCursor);

  if (rows.length === 0 && !props.pagination?.hasPrevious) {
    return (
      <EmptyState
        title={props.emptyTitle}
        description={props.emptyDescription}
        action={props.emptyAction}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table aria-label={props.label}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showPager && props.pagination && (
        <nav className="flex items-center justify-end gap-2" aria-label={props.label}>
          <Button
            variant="outline"
            size="sm"
            disabled={!props.pagination.hasPrevious}
            onClick={() => props.pagination?.previous()}
          >
            <ChevronLeft aria-hidden />
            {t('common.previousPage')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!props.nextCursor}
            onClick={() => props.nextCursor && props.pagination?.next(props.nextCursor)}
          >
            {t('common.nextPage')}
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );
}
