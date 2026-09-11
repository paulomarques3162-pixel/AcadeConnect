import { useState } from 'react';
import { Download } from 'lucide-react';
import { adminApi, exportCsv, downloadBlob } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar, Pagination } from '../../components/DataTable';
import { Select, Field, StatusBadge, Spinner, ErrorState, Button } from '../../components/ui';

export default function AdminParticipantes() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi(
    () => adminApi.users({ search, role, page, limit: 15 }).then((r) => r),
    [search, role, page]
  );

  const doExport = async () => {
    try {
      const blob = await exportCsv('participantes', { search, status: role });
      downloadBlob(blob, `participantes-${new Date().toISOString().slice(0,10)}.csv`);
      toast.success('Exportação concluída.');
    } catch (e) { toast.error(e?.response?.data?.message || 'Erro ao exportar.'); }
  };

  const columns = [
    { header: 'Nome', key: 'name', render: (r) => <strong>{r.name}</strong> },
    { header: 'E-mail', key: 'email' },
    { header: 'Curso', key: 'course', render: (r) => r.course || '—' },
    { header: 'Papel', key: 'role', render: (r) => <StatusBadge status={r.role} label={r.role} /> },
    { header: 'Inscrições', key: 'reg', render: (r) => r._count?.registrations ?? 0 },
    { header: 'Certificados', key: 'cert', render: (r) => r._count?.certificates ?? 0 },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Participantes</h1>
          <p>Gerencie os usuários participantes.</p>
        </div>
        <Button variant="secondary" onClick={doExport} icon={<Download size={17} />}>Exportar CSV</Button>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Pesquisar participantes..." /></div>
        <Field label="Papel">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Todos</option>
            {['PARTICIPANT','ORGANIZER','ADMIN'].map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando participantes..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={data?.data?.users || []} loading={loading} emptyTitle="Nenhum participante." />}
      <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />
    </>
  );
}
