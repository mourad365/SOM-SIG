import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import './ui.css';

// columns: [{ key, header, numeric?, sortable?, render?(row), sortValue?(row) }]
export function Table({ columns, rows, onRowClick, rowKey, getRowClassName, initialSort }) {
  const [sort, setSort] = useState(initialSort || null); // { key, dir }

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

  function toggleSort(col) {
    if (!col.sortable) return;
    setSort((s) =>
      s && s.key === col.key
        ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: col.numeric ? 'desc' : 'asc' }
    );
  }

  return (
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
          {sorted.map((row, i) => {
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
  );
}
