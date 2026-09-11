import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarSearch } from 'lucide-react';
import { eventApi } from '../api/services';
import { EventCard } from '../components/Cards';
import { SearchBar, Pagination } from '../components/DataTable';
import { Select, Field, EmptyState, Spinner, ErrorState } from '../components/ui';

const MODALITIES = ['PRESENCIAL', 'ONLINE', 'HIBRIDO'];
const STATUSES = ['OPEN', 'ONGOING', 'PUBLISHED', 'CLOSED'];

export default function Events() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [category, setCategory] = useState(params.get('category') || '');
  const [modality, setModality] = useState(params.get('modality') || '');
  const [status, setStatus] = useState(params.get('status') || '');
  const [sort, setSort] = useState(params.get('sort') || 'recent');
  const [page, setPage] = useState(Number(params.get('page')) || 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const query = useMemo(
    () => ({ search, category, modality, status, sort, page, limit: 9 }),
    [search, category, modality, status, sort, page]
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    eventApi.list(query)
      .then((r) => setData(r))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [JSON.stringify(query)]);

  const categories = useMemo(() => {
    if (!data?.data?.events) return [];
    return [...new Set(data.data.events.map((e) => e.category).filter(Boolean))];
  }, [data]);

  const apply = (key, value) => {
    if (key === 'search') setSearch(value);
    if (key === 'category') setCategory(value);
    if (key === 'modality') setModality(value);
    if (key === 'status') setStatus(value);
    if (key === 'sort') setSort(value);
    setPage(1);
  };

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <div className="page-head">
        <div>
          <h1>Eventos</h1>
          <p>Encontre o evento ideal para você.</p>
        </div>
      </div>

      <div className="filters mb-3">
        <div className="field field--search">
          <SearchBar value={search} onChange={(v) => apply('search', v)} placeholder="Pesquise eventos, palestras, cursos..." />
        </div>
        <Field label="Categoria">
          <Select value={category} onChange={(e) => apply('category', e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Modalidade">
          <Select value={modality} onChange={(e) => apply('modality', e.target.value)}>
            <option value="">Todas</option>
            {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => apply('status', e.target.value)}>
            <option value="">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Ordenar">
          <Select value={sort} onChange={(e) => apply('sort', e.target.value)}>
            <option value="recent">Mais recentes</option>
            <option value="closest">Próximos</option>
            <option value="popular">Mais populares</option>
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando eventos..." />}
      {error && <ErrorState title="Não foi possível carregar os eventos." description={error?.message} />}
      {!loading && !error && (
        <>
          {data?.data?.events?.length === 0 ? (
            <EmptyState
              icon={<CalendarSearch size={28} />}
              title="Nenhum evento encontrado"
              description="Tente ajustar os filtros ou a busca."
            />
          ) : (
            <div className="grid">
              {data.data.events.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          )}
          <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
