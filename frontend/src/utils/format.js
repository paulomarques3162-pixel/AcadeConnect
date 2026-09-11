export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', opts);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('pt-BR');
}

export function fullNameInitials(name = '') {
  const parts = String(name).trim().split(/\s+/);
  if (!parts[0]) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
}

const STATUS_LABELS = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  OPEN: 'Inscrições abertas',
  ONGOING: 'Em andamento',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PRESENT: 'Presente',
  ABSENT: 'Ausente',
  AVAILABLE: 'Disponível',
  ISSUED: 'Emitido',
  SCHEDULED: 'Agendada',
  FULL: 'Lotada',
  FINISHED: 'Concluída',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || '—';
}

export const ACTIVITY_TYPE_LABELS = {
  PALESTRA: 'Palestra',
  MINICURSO: 'Minicurso',
  WORKSHOP: 'Workshop',
  MESA_REDONDA: 'Mesa-redonda',
  CURSO: 'Curso',
  OFICINA: 'Oficina',
  NETWORKING: 'Networking',
  PRATICA: 'Atividade prática',
  OUTRO: 'Outro',
};

export const MODALITY_LABELS = {
  PRESENCIAL: 'Presencial',
  ONLINE: 'Online',
  HIBRIDO: 'Híbrido',
};

export const ATTENDANCE_METHOD_LABELS = {
  QR_CODE: 'QR Code',
  MANUAL: 'Manual',
  IMPORTACAO: 'Importação',
  ADMIN: 'Administrador',
};
