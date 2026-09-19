import React from 'react';
import { BarChart3, Table2 } from 'lucide-react';

/**
 * Chart / table switch.
 *
 * Two call styles exist in the codebase, so both are supported:
 *   <TableViewToggle isTableView={b} onToggle={setB} />          (boolean)
 *   <TableViewToggle view="chart" onViewChange={setView} />      (string)
 * The second form was silently broken until React types were added - it type
 * checked against nothing, so the toggle simply never fired.
 */
interface TableViewToggleProps {
  isTableView?: boolean;
  onToggle?: (val: boolean) => void;
  view?: 'chart' | 'table';
  onViewChange?: (v: 'chart' | 'table') => void;
  id?: string;
}

export const TableViewToggle: React.FC<TableViewToggleProps> = ({
  isTableView,
  onToggle,
  view,
  onViewChange,
  id,
}) => {
  const tableActive = view !== undefined ? view === 'table' : !!isTableView;

  const select = (wantTable: boolean) => {
    onToggle?.(wantTable);
    onViewChange?.(wantTable ? 'table' : 'chart');
  };

  const base =
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all cursor-pointer';
  const on = 'bg-(--surface-card) text-(--text-primary) shadow-(--shadow-sm) border border-(--border)';
  const off = 'text-(--text-muted) hover:text-(--text-primary) border border-transparent';

  return (
    <div
      id={id}
      className="inline-flex items-center p-0.5 bg-(--surface-sunken) rounded-lg border border-(--border)"
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        onClick={() => select(false)}
        aria-pressed={!tableActive}
        className={`${base} ${!tableActive ? on : off}`}
      >
        <BarChart3 className="w-3.5 h-3.5" />
        <span>Chart</span>
      </button>
      <button
        type="button"
        onClick={() => select(true)}
        aria-pressed={tableActive}
        className={`${base} ${tableActive ? on : off}`}
      >
        <Table2 className="w-3.5 h-3.5" />
        <span>Table</span>
      </button>
    </div>
  );
};
