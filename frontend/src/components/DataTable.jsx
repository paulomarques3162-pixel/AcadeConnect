import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Input } from './ui';
import { EmptyState } from './ui';

export function SearchBar({ value, onChange, placeholder = 'Pesquisar...', className = '' }) {
  return (
    <div className={`search-bar ${className}`}>
      <Search size={18} />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Pagination({ page, pages, onPage, total }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="pagination">
      <span className="pagination__info">
        Página {page} de {pages}
        {typeof total === 'number' && ` · ${total} registros`}
      </span>
      <div className="pagination__controls">
        <button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Anterior">
          <ChevronLeft size={18} />
        </button>
        <button className="icon-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

export function DataTable({ columns, rows, loading, emptyTitle = 'Nenhum registro encontrado.', emptyDescription, rowKey = 'id' }) {
  if (loading) {
    return <div className="table-skeleton"><div className="skeleton"><div className="skeleton__line" style={{ height: 40, width: '100%' }} /></div></div>;
  }
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[rowKey] ?? i}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
