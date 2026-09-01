import {
  columnFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  type ReactTable,
  type RowData,
} from '@tanstack/react-table';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  SearchIcon,
} from 'lucide-react';
import type { MouseEventHandler, ReactNode } from 'react';
import { Button } from '#/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '#/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table';

/** Sorting plus a single search box is all either datasource table needs. */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
});

export type DataTableFeatures = typeof dataTableFeatures;

/** Anything a row can attach to its container, in either the card or the table view. */
export interface DataTableRowProps {
  className?: string;
  onClick?: MouseEventHandler<HTMLElement>;
}

export function DataTableSearch({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <InputGroup className="sm:max-w-xs">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  );
}

/**
 * One filtered and sorted row model rendered two ways: stacked cards on a phone,
 * where a wide table would either clip or force sideways scrolling, and the full
 * table from sm up. Both views come from the same rows, so search and sorting
 * apply either way.
 */
export function DataTable<TData extends RowData>({
  table,
  emptyMessage,
  rowProps,
  renderCard,
  sortLabel,
}: {
  table: ReactTable<DataTableFeatures, TData>;
  emptyMessage: string;
  rowProps?: (row: TData) => DataTableRowProps;
  renderCard: (row: TData) => ReactNode;
  sortLabel: string;
}) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;
  return (
    <div className="flex flex-col gap-3">
      <MobileSort table={table} label={sortLabel} />
      {rows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground sm:hidden">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2 sm:hidden">
          {rows.map((row) => {
            const { className, ...extra } = rowProps?.(row.original) ?? {};
            return (
              <li
                key={row.id}
                className={['rounded-lg bg-muted/60 p-3', className].filter(Boolean).join(' ')}
                {...extra}
              >
                {renderCard(row.original)}
              </li>
            );
          })}
        </ul>
      )}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const label = <table.FlexRender header={header} />;
                  const definition = header.column.columnDef.header;
                  const name = typeof definition === 'string' ? definition : header.column.id;
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        !header.column.getCanSort()
                          ? undefined
                          : sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : 'none'
                      }
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="-mx-1 flex items-center gap-1 rounded-sm px-1 py-0.5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          aria-label={`Sort by ${name}`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {label}
                          {sorted === 'asc' ? (
                            <ChevronUpIcon className="size-3.5" />
                          ) : sorted === 'desc' ? (
                            <ChevronDownIcon className="size-3.5" />
                          ) : (
                            <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
                          )}
                        </button>
                      ) : (
                        label
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} {...rowProps?.(row.original)}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** The card view has no column headers to click, so sorting gets its own control. */
function MobileSort<TData extends RowData>({
  table,
  label,
}: {
  table: ReactTable<DataTableFeatures, TData>;
  label: string;
}) {
  const sortable = table.getAllLeafColumns().filter((column) => column.getCanSort());
  const [sort] = table.state.sorting;
  const active = sortable.find((column) => column.id === sort?.id);
  const name = (column: (typeof sortable)[number]) => {
    const definition = column.columnDef.header;
    return typeof definition === 'string' ? definition : column.id;
  };
  return (
    <div className="flex items-center gap-2 sm:hidden">
      <NativeSelect
        aria-label={label}
        className="flex-1"
        value={active?.id ?? ''}
        onChange={(event) =>
          table.setSorting(event.target.value ? [{ id: event.target.value, desc: false }] : [])
        }
      >
        <NativeSelectOption value="">Unsorted</NativeSelectOption>
        {sortable.map((column) => (
          <NativeSelectOption key={column.id} value={column.id}>
            {name(column)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        variant="outline"
        size="icon"
        disabled={!sort}
        aria-label={sort?.desc ? 'Sort ascending' : 'Sort descending'}
        onClick={() => sort && table.setSorting([{ id: sort.id, desc: !sort.desc }])}
      >
        {sort?.desc ? <ArrowDownIcon /> : <ArrowUpIcon />}
      </Button>
    </div>
  );
}
