// Datas "somente data" (Activity.date, Event.startDate/endDate) são gravadas
// no banco como meia-noite UTC. Formatá-las com o fuso local (UTC-3) exibia o
// dia anterior. Detectamos esse caso e formatamos em UTC, sem mexer em
// timestamps reais (createdAt, etc.), que continuam em horário local.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT_RE = /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/;

function isDateOnly(value) {
  if (value instanceof Date) return false;
  const s = String(value);
  return DATE_ONLY_RE.test(s) || UTC_MIDNIGHT_RE.test(s);
}

export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const dateOnly = isDateOnly(value);
  const d = new Date(dateOnly && DATE_ONLY_RE.test(String(value)) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', dateOnly ? { timeZone: 'UTC', ...opts } : opts);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  if (isDateOnly(value)) return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Converte um valor vindo da API para o formato do <input type="date">. */
export function toDateInputValue(value) {
  if (!value) return '';
  const s = String(value);
  if (DATE_ONLY_RE.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Chave de DIA DE CALENDÁRIO (YYYY-MM-DD) para um valor de data.
 *
 * Datas de evento/atividade são dias de calendário gravados como meia-noite
 * UTC (ex.: "2026-09-01T00:00:00.000Z"). Nesse caso o dia é exatamente os 10
 * primeiros caracteres — nunca deve ser convertido para o fuso local, senão
 * vira 31/08 em UTC-3.
 *
 * Valores que são instantes reais (ex.: createdAt) ou Date locais usam os
 * componentes locais, que é o dia que o usuário enxerga.
 */
export function calendarDayKey(value) {
  if (!value) return '';
  const s = String(value);
  if (isDateOnly(value)) return s.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Dia de calendário de hoje no fuso do usuário (YYYY-MM-DD). */
export function todayKey() {
  return calendarDayKey(new Date());
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
  PAID: 'Pago',
  EXPIRED: 'Expirado',
  REFUNDED: 'Estornado',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  RESOLVED: 'Resolvida',
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
