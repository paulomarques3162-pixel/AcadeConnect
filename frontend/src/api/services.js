import { api, unwrap } from './client.js';

// ---- Auth ----
export const authApi = {
  register: (data) => api.post('/auth/register', data).then(unwrap),
  login: (data) => api.post('/auth/login', data).then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  forgot: (email) => api.post('/auth/forgot-password', { email }).then(unwrap),
  reset: (token, password) => api.post('/auth/reset-password', { token, password }).then(unwrap),
  changePassword: (d) => api.post('/auth/change-password', d).then(unwrap),
};

// ---- Users / profile ----
export const userApi = {
  profile: () => api.get('/users/profile').then(unwrap),
  updateProfile: (data) => api.put('/users/profile', data).then(unwrap),
  updateAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return api.put('/users/profile', fd).then(unwrap);
  },
  deleteAccount: () => api.delete('/users/account').then(unwrap),
};

// ---- Events ----
export const eventApi = {
  list: (params) => api.get('/events', { params }).then(unwrap),
  get: (idOrSlug) => api.get(`/events/${idOrSlug}`).then(unwrap),
  create: (data) => api.post('/events', data).then(unwrap),
  createWithFile: (data, file) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.append(k, v ?? '');
    if (file) fd.append('banner', file);
    return api.post('/events', fd).then(unwrap);
  },
  updateWithFile: (id, data, file) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.append(k, v ?? '');
    if (file) fd.append('banner', file);
    return api.put(`/events/${id}`, fd).then(unwrap);
  },
  update: (id, data) => api.put(`/events/${id}`, data).then(unwrap),
  remove: (id) => api.delete(`/events/${id}`).then(unwrap),
  hardDelete: (id) => api.delete(`/events/${id}/hard`).then(unwrap),
  duplicate: (id) => api.post(`/events/${id}/duplicate`).then(unwrap),
  close: (id) => api.post(`/events/${id}/close`).then(unwrap),
};

// ---- Activities ----
export const activityApi = {
  listByEvent: (eventId) => api.get(`/events/${eventId}/activities`).then(unwrap),
  list: (params) => api.get('/activities', { params }).then(unwrap),
  get: (id) => api.get(`/activities/${id}`).then(unwrap),
  create: (data) => api.post('/activities', data).then(unwrap),
  createWithFile: (data, file) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.append(k, v ?? '');
    if (file) fd.append('image', file);
    return api.post('/activities', fd).then(unwrap);
  },
  update: (id, data) => api.put(`/activities/${id}`, data).then(unwrap),
  remove: (id) => api.delete(`/activities/${id}`).then(unwrap),
  duplicate: (id) => api.post(`/activities/${id}/duplicate`).then(unwrap),
  close: (id) => api.post(`/activities/${id}/close`).then(unwrap),
};

// ---- Speakers ----
export const speakerApi = {
  list: (params) => api.get('/speakers', { params }).then(unwrap),
  create: (data) => api.post('/speakers', data).then(unwrap),
  update: (id, data) => api.put(`/speakers/${id}`, data).then(unwrap),
  remove: (id) => api.delete(`/speakers/${id}`).then(unwrap),
};

// ---- Registrations ----
export const registrationApi = {
  registerForEvent: (eventId, activityIds = []) => api.post(`/registrations/${eventId}`, { activityIds }).then(unwrap),
  mine: () => api.get('/registrations/me').then(unwrap),
  get: (id) => api.get(`/registrations/${id}`).then(unwrap),
  cancel: (id) => api.delete(`/registrations/${id}`).then(unwrap),
  registerForActivity: (id, activityId) => api.post(`/registrations/${id}/activities`, { activityId }).then(unwrap),
  unregisterFromActivity: (id, activityId) => api.delete(`/registrations/${id}/activities/${activityId}`).then(unwrap),
};

// ---- Attendance ----
export const attendanceApi = {
  scan: (qrToken, activityId) => api.post('/attendance/scan', { qrToken, activityId }).then(unwrap),
  validateQr: (qrToken) => api.post('/attendance/validate', { qrToken }).then(unwrap),
  manual: (registrationId, activityId, present) => api.post('/attendance/manual', { registrationId, activityId, present }).then(unwrap),
  activityRows: (activityId, params) => api.get(`/attendance/activity/${activityId}`, { params }).then(unwrap),
  summary: (eventId) => api.get(`/attendance/summary/${eventId}`).then(unwrap),
  searchParticipants: (params) => api.get('/attendance/participants/search', { params }).then(unwrap),
  all: (params) => api.get('/attendance', { params }).then(unwrap),
};

// ---- Certificates ----
export const certificateApi = {
  mine: () => api.get('/certificates/me').then(unwrap),
  get: (id) => api.get(`/certificates/${id}`).then(unwrap),
  downloadUrl: (id) => `/api/certificates/${id}/download`,
  validate: (code) => api.get(`/certificates/validate/${code}`).then(unwrap),
  issue: (data) => api.post('/certificates/issue', data).then(unwrap),
  auto: (eventId) => api.post(`/certificates/auto/${eventId}`).then(unwrap),
  adminList: (params) => api.get('/certificates/admin/list', { params }).then(unwrap),
};

// ---- Notifications ----
export const notificationApi = {
  list: (params) => api.get('/notifications', { params }).then(unwrap),
  unreadCount: () => api.get('/notifications/unread-count').then(unwrap),
  markRead: (id) => api.post(`/notifications/${id}/read`).then(unwrap),
  markAllRead: () => api.post('/notifications/read-all').then(unwrap),
};

// ---- Admin ----
export const adminApi = {
  dashboard: () => api.get('/admin/dashboard').then(unwrap),
  users: (params) => api.get('/admin/users', { params }).then(unwrap),
  createUser: (data) => api.post('/admin/users', data).then(unwrap),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data).then(unwrap),
  deleteUser: (id) => api.delete(`/admin/users/${id}`).then(unwrap),
  registrations: (params) => api.get('/admin/registrations', { params }).then(unwrap),
  institutions: () => api.get('/admin/institutions').then(unwrap),
  createInstitution: (data) => api.post('/admin/institutions', data).then(unwrap),
  deleteInstitution: (id) => api.delete(`/admin/institutions/${id}`).then(unwrap),
  logs: (params) => api.get('/admin/logs', { params }).then(unwrap),
  reports: (params) => api.get('/admin/reports', { params }).then(unwrap),
  exportUrl: '/admin/export',
};

export const exportCsv = async (type, body) => {
  const token = localStorage.getItem('acadeconnect_token');
  const res = await api.post(`/admin/export/${type}`, { ...body, format: 'csv' }, {
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.data;
};

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
