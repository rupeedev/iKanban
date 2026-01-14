import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table ref={ref} className={cn('w-full text-sm', className)} {...props} />
));
Table.displayName = 'Table';

const TableHead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('uppercase text-muted-foreground', className)}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={className} {...props} />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & {
    clickable?: boolean;
  }
>(({ className, clickable, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-t',
      clickable && 'cursor-pointer hover:bg-muted',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHeaderCell = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th ref={ref} className={cn('text-left', className)} {...props} />
));
TableHeaderCell.displayName = 'TableHeaderCell';

interface ResizableTableHeaderCellProps
  extends React.ThHTMLAttributes<HTMLTableCellElement> {
  width: number;
  minWidth?: number;
  onResize: (width: number) => void;
}

const ResizableTableHeaderCell = React.forwardRef<
  HTMLTableCellElement,
  ResizableTableHeaderCellProps
>(({ className, width, minWidth = 80, onResize, children, ...props }, ref) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(minWidth, startWidth + e.clientX - startX);
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <th
      ref={ref}
      className={cn('text-left relative select-none', className)}
      style={{ width, minWidth }}
      {...props}
    >
      {children}
      <div
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
        onMouseDown={handleMouseDown}
        aria-hidden="true"
      />
    </th>
  );
});
ResizableTableHeaderCell.displayName = 'ResizableTableHeaderCell';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('py-2', className)} {...props} />
));
TableCell.displayName = 'TableCell';

const TableEmpty = ({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) => (
  <TableRow>
    <TableCell colSpan={colSpan} className="text-muted-foreground">
      {children}
    </TableCell>
  </TableRow>
);

const TableLoading = ({ colSpan }: { colSpan: number }) => (
  <TableRow>
    <TableCell colSpan={colSpan}>
      <div className="h-5 w-full bg-muted/30 rounded animate-pulse" />
    </TableCell>
  </TableRow>
);

export {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  ResizableTableHeaderCell,
  TableCell,
  TableEmpty,
  TableLoading,
};
