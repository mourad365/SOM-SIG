import React, { useState, useMemo, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button.jsx';
import './ui.css';

// columns: [{ key, header, numeric?, sortable?, render?(row), sortValue?(row) }]
// pageSize: when set, the table sorts the full set then paginates client-side and
//           shows a compact pager. Omit for a single, unpaginated list.
export function Table({ columns, rows, onRowClick, rowKey, getRowClassName, initialSort, pageSize }) {
  const [sort, setSort] = useState(initialSort || null); // { key, dir }
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.sortValue || ((r) => r[col.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort, columns]);

  // Sort runs over the whole set; pagination is the last step so the page always
  // shows the correct slice of the sorted order.
  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const visible = pageSize ? sorted.slice(safePage * pageSize, (safePage + 1) * pageSize) : sorted;

  // Snap back into range when the data shrinks below the current page.
  useEffect(() => { if (page !== safePage) setPage(safePage); }, [page, safePage]);

  function toggleSort(col) {
    if (!col.sortable) return;
    setSort((s) =>
      s && s.key === col.key
        ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: col.numeric ? 'desc' : 'asc' }
    );
  }

  return (
    <div className="ui-table-block">
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${col.sortable ? 'ui-th--sortable' : ''} ${col.numeric ? 'ui-th--num' : ''}`}
                  onClick={() => toggleSort(col)}
                  aria-sort={sort?.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="ui-th__inner">
                    {col.header}
                    {col.sortable && sort?.key === col.key &&
                      (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const key = rowKey ? rowKey(row) : i;
              return (
                <tr
                  key={key}
                  className={`${onRowClick ? 'ui-tr--clickable' : ''} ${getRowClassName?.(row) || ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={col.numeric ? 'ui-td--num' : ''}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageSize && pageCount > 1 && (
        <div className="ui-table__foot">
          <div className="ui-table__pager">
            <Button
              variant="icon" size="sm" aria-label="Page précédente"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="ui-table__page mono">{safePage + 1} / {pageCount}</span>
            <Button
              variant="icon" size="sm" aria-label="Page suivante"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
