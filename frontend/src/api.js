/* Backend (Django REST) bilan aloqa: JWT tokenlar, avtomatik yangilash, xatolarni o'zbekcha matnga aylantirish */
import axios from 'axios';

const TOKENS = 'bm_examer.tokens';
const readTokens = () => { try { return JSON.parse(localStorage.getItem(TOKENS)) || null; } catch (e) { return null; } };
export const setTokens = t => { try { t ? localStorage.setItem(TOKENS, JSON.stringify(t)) : localStorage.removeItem(TOKENS); } catch (e) {} };
export const hasTokens = () => !!readTokens();

export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

http.interceptors.request.use(cfg => {
  const t = readTokens();
  if (t && t.access) cfg.headers.Authorization = `Bearer ${t.access}`;
  return cfg;
});

let refreshing = null;
let onLogout = () => {};
export const setLogoutHandler = fn => { onLogout = fn; };

http.interceptors.response.use(r => r, async err => {
  const orig = err.config;
  const t = readTokens();
  if (err.response && err.response.status === 401 && t && t.refresh && !orig._retry && !orig.url.includes('/auth/')) {
    orig._retry = true;
    try {
      refreshing = refreshing || axios.post(`${http.defaults.baseURL}/auth/refresh/`, { refresh: t.refresh });
      const { data } = await refreshing;
      setTokens({ ...t, access: data.access });
      return http(orig);
    } catch (e) {
      setTokens(null);
      onLogout();
    } finally {
      refreshing = null;
    }
  }
  return Promise.reject(err);
});

/* Xatoni foydalanuvchiga ko'rsatiladigan matnga aylantirish */
export function errText(err, fallback = "Xatolik yuz berdi. Qayta urinib ko'ring.") {
  if (!err || !err.response) return err && err.message === 'Network Error' ? "Serverga ulanib bo'lmadi. Internet yoki serverni tekshiring." : fallback;
  const d = err.response.data;
  if (!d) return fallback;
  if (typeof d === 'string') return fallback;
  if (d.detail) return String(d.detail);
  const first = v => Array.isArray(v) ? first(v[0]) : (v && typeof v === 'object' ? first(Object.values(v)[0]) : v);
  if (d.errors) { const [row, e] = Object.entries(d.errors)[0] || []; return `${+row + 1}-qator: ${first(e)}`; }
  const v = first(d);
  return v ? String(v) : fallback;
}

/* Faylni yuklab olish (Excel/Word/PDF) */
export async function download(url, params, filename) {
  const r = await http.get(url, { params, responseType: 'blob' });
  const cd = r.headers['content-disposition'] || '';
  const m = cd.match(/filename="?([^";]+)"?/);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(r.data);
  a.download = (m && m[1]) || filename || 'fayl';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const api = {
  login: (username, password) => http.post('/auth/login/', { username, password }).then(r => r.data),
  register: data => http.post('/auth/register/', data).then(r => r.data),
  bootstrap: () => http.get('/bootstrap/').then(r => r.data),
  updateProfile: data => http.patch('/auth/profile/', data).then(r => r.data),
  changePassword: (old_password, new_password) => http.post('/auth/change-password/', { old_password, new_password }).then(r => r.data),

  createUser: data => http.post('/users/', data).then(r => r.data),
  bulkUsers: users => http.post('/users/bulk/', { users }).then(r => r.data),
  updateUser: (id, data) => http.patch(`/users/${id}/`, data).then(r => r.data),
  deleteUser: id => http.delete(`/users/${id}/`),

  saveSubject: (id, data) => (id ? http.patch(`/subjects/${id}/`, data) : http.post('/subjects/', data)).then(r => r.data),
  deleteSubject: id => http.delete(`/subjects/${id}/`),

  saveTest: (id, data) => (id ? http.patch(`/tests/${id}/`, data) : http.post('/tests/', data)).then(r => r.data),
  deleteTest: id => http.delete(`/tests/${id}/`),
  setQuestions: (id, questions) => http.put(`/tests/${id}/questions/`, { questions }).then(r => r.data),
  activateTest: id => http.post(`/tests/${id}/activate/`).then(r => r.data),
  completeTest: id => http.post(`/tests/${id}/complete/`).then(r => r.data),
  testByCode: code => http.get('/tests/by-code/', { params: { code } }).then(r => r.data),
  startTest: id => http.post(`/tests/${id}/start/`).then(r => r.data),

  createBank: data => http.post('/question-banks/', data).then(r => r.data),
  deleteBank: id => http.delete(`/question-banks/${id}/`),
  saveBankQuestion: (id, data) => (id ? http.put(`/bank-questions/${id}/`, data) : http.post('/bank-questions/', data)).then(r => r.data),
  deleteBankQuestion: id => http.delete(`/bank-questions/${id}/`),

  attempt: id => http.get(`/attempts/${id}/`).then(r => r.data),
  answer: (id, question_id, value) => http.post(`/attempts/${id}/answer/`, { question_id, value }).then(r => r.data),
  violation: (id, reason) => http.post(`/attempts/${id}/violation/`, { reason }).then(r => r.data),
  submit: id => http.post(`/attempts/${id}/submit/`).then(r => r.data),
  result: id => http.get(`/attempts/${id}/result/`).then(r => r.data),
};
