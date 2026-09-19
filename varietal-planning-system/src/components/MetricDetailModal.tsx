import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ArrowUpDown, Download, Inbox } from 'lucide-react';

export interface DetailColumn<T> {
  key: keyof T & string;
  label: string;
  numeric?: boolean;
  /** Rendered instead of the raw value. */
  format?: (row: T) => React.ReactNode;
  width?: string;
}

interface MetricDetailModalProps<T extends Record<string, any>> {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: T[];
  columns: DetailColumn<T>[];
  /** Columns searched by the box at the top. */
  searchKeys: (keyof T & string)[];
  /** Column sorted on first open. */
  initialSort?: keyof T & string;
}

/**
 * The panel behind a headline figure. Every metric card opens one of these, so
 * a number like "334 villages" can be inspected rather than taken on trust.
 */
export function MetricDetailModal<T extends Record<string, any>>({
  open,
  onClose,
  title,
  subtitle,
  rows,
  columns,
  searchKeys,
  initialSort,
}: MetricDetailModalProps<T>) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>(initialSort || columns[0]?.key);
  const [asc, setAsc] = useState(false);

  // Reset when reopened, so the panel never shows a stale filter.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSortKey(initialSort || columns[0]?.key);
      setAsc(false);
    }
  }, [open, initialSort]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)))
      : rows;
    const col = columns.find((c) => c.key === sortKey);
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = col?.numeric
        ? Number(av) - Number(bv)
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return asc ? cmp : -cmp;
    });
  }, [rows, query, sortKey, asc, columns, searchKeys]);

  const exportCsv = () => {
    const head = columns.map((c) => `"${c.label}"`).join(',');
    const body = visible
      .map((r) => columns.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!open) return null;

  // Into <body>: a transformed ancestor would otherwise capture `position: fixed`
  // and anchor this panel to the scrolled page rather than the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative w-full max-w-4xl max-h-full flex flex-col bg-(--surface-card) border border-(--border) rounded-[16px] shadow-(--shadow-lg) overflow-hidden screen-fade-in">
        {/* header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-(--border)">
          <div className="min-w-0">
            <h3 className="text-[17px] font-extrabold text-(--text-primary) tracking-tight">{title}</h3>
            {subtitle && <p className="text-[13px] text-(--text-muted) mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg border border-(--border) bg-(--surface-sunken) text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* controls */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-(--border) bg-(--surface-sunken)">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-(--text-muted) absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-(--surface-card) text-(--text-primary) border border-(--border) rounded-lg focus:outline-none focus:ring-2 focus:ring-(--accent)/40 focus:border-(--accent)"
            />
          </div>
          <span className="text-[12px] text-(--text-muted) tabular-nums whitespace-nowrap">
            {visible.length.toLocaleString()}
            {visible.length !== rows.length && ` of ${rows.length.toLocaleString()}`}
          </span>
          <button type="button" onClick={exportCsv} className="btn-secondary !h-[32px] !px-3 ml-auto">
            <Download className="w-3.5 h-3.5" />
            <span className="text-[12px]">CSV</span>
          </button>
        </div>

        {/* table */}
        <div className="overflow-auto flex-1 min-h-0">
          {visible.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center gap-2">
              <Inbox className="w-7 h-7 text-(--text-muted)" />
              <p className="text-[13px] text-(--text-secondary)">Nothing matches “{query}”.</p>
            </div>
          ) : (
            <table className="app-table">
              <thead>
                <tr>
                  <th className="text-right w-12">#</th>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      style={c.width ? { width: c.width } : undefined}
                      className={c.numeric ? 'text-right' : 'text-left'}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (sortKey === c.key) setAsc((v) => !v);
                          else { setSortKey(c.key); setAsc(false); }
                        }}
                        className={`inline-flex items-center gap-1 hover:text-(--text-primary) transition-colors cursor-pointer ${
                          sortKey === c.key ? 'text-(--text-primary)' : ''
                        }`}
                      >
                        <span>{c.label}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={i}>
                    <td className="text-right text-(--text-muted) tabular-nums">{i + 1}</td>
                    {columns.map((c) => (
                      <td key={c.key} className={c.numeric ? 'text-right tabular-nums' : ''}>
                        {c.format ? c.format(r) : String(r[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
