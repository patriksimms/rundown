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
import { ChevronDownIcon, ChevronsUpDownIcon, ChevronUpIcon, SearchIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '#/components/ui/input-group';
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
    <InputGroup className="max-w-xs">
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

export function DataTable<TData extends RowData>({
  table,
  emptyMessage,
  rowProps,
}: {
  table: ReactTable<DataTableFeatures, TData>;
  emptyMessage: string;
  rowProps?: (row: TData) => ComponentProps<'tr'>;
}) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;
  return (
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
  );
}
