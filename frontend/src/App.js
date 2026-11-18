/* BM Examer — React ilova (htm sintaksisi bilan). Ma'lumotlar Django REST API'dan keladi (api.js). */
import React, { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import htm from 'htm';
import katex from 'katex';
import * as XLSX from 'xlsx';
import { api, download, errText, hasTokens, setLogoutHandler, setTokens } from './api.js';

const html = htm.bind(React.createElement);

/* =========================================================
   utils/  — yordamchi funksiyalar
   ========================================================= */
const KEYS = { db:'bm_examer.db.v1', session:'bm_examer.session', theme:'bm_examer.theme.v2' };
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
const MONTHS = ['yan','fev','mar','apr','may','iyn','iyl','avg','sen','okt','noy','dek'];
const p2 = n => String(n).padStart(2,'0');
const fmtDate = iso => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDateTime = iso => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const fmtClock = sec => { sec = Math.max(0, Math.ceil(sec)); return `${p2(Math.floor(sec/60))}:${p2(sec%60)}`; };
const fmtSpent = sec => { sec = Math.round(sec); const m = Math.floor(sec/60), s = sec%60; return m ? `${m} daq ${s} s` : `${s} s`; };
const fmtNum = v => (Math.round((+v || 0)*10)/10).toString().replace('.',',');
const fmtPct = v => `${(Math.round(v*10)/10).toString().replace('.',',')}%`;
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const fullName = u => u ? `${u.first_name} ${u.last_name}` : '—';
const initials = u => u ? ((u.first_name||' ')[0] + (u.last_name||' ')[0]).toUpperCase() : '?';
let _seq = 0;
const nid = () => Date.now()*100 + (_seq++ % 100);
const shuffle = a => { a = a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const genCode = () => 'BM-' + Array.from({length:6}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
const LETTERS = 'ABCDEFGH';
const spentSec = a => a.finished_at ? (new Date(a.finished_at) - new Date(a.started_at))/1000 : 0;
const toneFor = p => p >= 80 ? 'ok' : p >= 55 ? 'warn' : 'bad';

const ROLE = { admin:'Admin', teacher:"O'qituvchi", student:"O'quvchi" };
const STATUS = { draft:'Qoralama', active:'Faol', completed:'Yakunlangan' };
const STATUS_TONE = { draft:'', active:'ok', completed:'accent' };
const DIFF = { easy:'Oson', medium:"O'rta", hard:'Qiyin' };
const QTYPE = { single:'Bitta javob', multiple:"Ko'p javob", true_false:"Rost / Yolg'on", written:'Yozma javob' };
/* Test tarkibi qoidasi: 20 ta variantli (A, B, C, D) + 10 ta yozma = 30 ta savol */
const RULE = { closed:20, written:10, total:30 };
const isWritten = q => q.question_type === 'written';
const composition = qs => ({ closed: qs.filter(q => !isWritten(q)).length, written: qs.filter(isWritten).length, total: qs.length });
const compositionOk = c => c.closed === RULE.closed && c.written === RULE.written;
/* Ball tizimi (jami 50): 1–10-savollar 1,2 ball; 11–20-savollar 1,8 ball; 21–30-savollar (yozma) 2 ball */
const BLOCKS = [{ from:1, to:10, points:1.2 }, { from:11, to:20, points:1.8 }, { from:21, to:30, points:2 }];
const pointsAt = i => BLOCKS[Math.min(BLOCKS.length - 1, Math.floor(i / 10))].points;
const MAX_SCORE = 50;
const MAX_WARNINGS = 3; // qat'iy rejim: shuncha ogohlantirishdan keyingi qoidabuzarlik testni topshiradi
/* Tartib: avval variantli savollar (1–20), keyin yozma (21–30); ball o'rniga qarab avtomatik */
/* Ball tizimi testda tanlanadi: 'standard' — 50 ballik (yuqoridagi qoida), 'free' — o'qituvchi har savolga ballni o'zi qo'yadi (TZ FR-QST-2) */
const isFree = t => !!t && t.scoring === 'free';
const arrangeFor = (scoring, qs) => scoring === 'free' ? qs.map((q, i) => Object.assign({}, q, { order:i, points: +q.points > 0 ? +q.points : 1 })) : arrangeTest(qs);
const arrangeTest = qs => [...qs.filter(q => !isWritten(q)), ...qs.filter(isWritten)].map((q, i) => Object.assign({}, q, { order:i, points:pointsAt(i) }));
const compositionText = c => `Faollashtirish uchun ${RULE.closed} ta variantli (hozir ${c.closed}) va ${RULE.written} ta yozma (hozir ${c.written}) savol kerak`;
/* Yozma javobni solishtirish: katta-kichik harf, ortiqcha bo'shliq, ё/е va 3,5/3.5 farqi hisobga olinmaydi */
const normAns = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g,' ').replace(/ё/g,'е').replace(/(\d),(\d)/g,'$1.$2').replace(/[.!]+$/,'');
const isAnswered = (q, sel) => q && isWritten(q) ? !!(sel && sel[0] && String(sel[0]).trim()) : !!(sel && sel.length);
const SHOW = {
  score_only: ['Faqat ball va foiz', "O'quvchi faqat umumiy natijani ko'radi"],
  correct_answers: ["To'g'ri javoblar bilan", "Har bir savolning to'g'ri javobi ko'rsatiladi"],
  detailed: ['Batafsil tahlil', "O'quvchi javobi, to'g'ri javob va olingan ball"]
};

/* Urinishni baholash: ko'p javobli savolda to'liq mos kelsagina ball beriladi */
function grade(attempt, qmap){
  let score = 0, max = 0, correct = 0; const per = {};
  attempt.order.forEach(qid => {
    const q = qmap[qid]; if(!q) return;
    max += q.points;
    const sel = attempt.answers[qid] || [];
    let right, ok;
    if(isWritten(q)){ right = q.answers || []; ok = !!normAns(sel[0]) && right.some(x => normAns(x) === normAns(sel[0])); }
    else { right = q.choices.filter(c => c.is_correct).map(c => c.id); ok = sel.length === right.length && sel.every(id => right.includes(id)); }
    if(ok){ score += q.points; correct++; }
    per[qid] = { ok, earned: ok ? q.points : 0, sel, right };
  });
  score = Math.round(score*10)/10; max = Math.round(max*10)/10;
  return { score, max_score:max, correct_answers:correct, total_questions:attempt.order.length,
           percentage: max ? Math.round(score/max*1000)/10 : 0, per };
}
const qmapOf = db => Object.fromEntries(db.questions.map(q => [q.id, q]));

/* Test reytingi: har o'quvchining eng yaxshi urinishi (foiz ↓, vaqt ↑) */
function leaderboard(db, testId){
  const best = {};
  db.attempts.filter(a => a.test_id === testId && a.is_completed).forEach(a => {
    const b = best[a.student_id];
    if(!b || a.percentage > b.percentage || (a.percentage === b.percentage && spentSec(a) < spentSec(b))) best[a.student_id] = a;
  });
  return Object.values(best).sort((a,b) => b.percentage - a.percentage || spentSec(a) - spentSec(b));
}

/* =========================================================
   context/  — App (Auth + Theme + Toast + Router)
   ========================================================= */
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

/* =========================================================
   components/common
   ========================================================= */
const ICONS = {
  home:'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  book:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  list:'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  plus:'M12 5v14 M5 12h14',
  layers:'M12 2 2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  user:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  chart:'M3 3v18h18 M7 15l4-4 3 3 5-6',
  clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  moon:'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  menu:'M3 6h18 M3 12h18 M3 18h18',
  copy:'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  edit:'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash:'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  check:'M20 6 9 17l-5-5',
  x:'M18 6 6 18 M6 6l12 12',
  search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  upload:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  play:'M7 4l13 8-13 8z',
  flag:'M4 22V4 M4 4h12l-2 4 2 4H4',
  trophy:'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3',
  eye:'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  key:'M15.5 7.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z M13 11l8 8 M18 16l2-2 M16 14l2-2',
  left:'M19 12H5 M12 19l-7-7 7-7',
  right:'M5 12h14 M12 5l7 7-7 7',
  alert:'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  max:'M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M3 16v3a2 2 0 0 0 2 2h3 M16 21h3a2 2 0 0 0 2-2v-3',
  image:'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  up:'M12 19V5 M5 12l7-7 7 7',
  down:'M12 5v14 M19 12l-7 7-7-7',
  file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  hash:'M4 9h16 M4 15h16 M10 3 8 21 M16 3l-2 18',
  info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
  refresh:'M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6',
  drop:'M12 2.7s-6 6.3-6 11a6 6 0 0 0 12 0c0-4.7-6-11-6-11z'
};
const PALETTES = [
  ['blue','Ko\'k-kulrang','linear-gradient(135deg,#1d4ed8 0%,#2563eb 55%,#e2e8f0 56%)'],
  ['lavender','Lavanda','linear-gradient(135deg,#6d28d9,#c4b5fd)'],
  ['ocean','Okean','linear-gradient(135deg,#0369a1,#0f766e)'],
  ['indigo','Ko\'k-binafsha','linear-gradient(135deg,#4466f0,#8448f0)'],
  ['emerald','Zumrad','linear-gradient(135deg,#047857,#4d7c0f)'],
  ['sunset','Quyosh botishi','linear-gradient(135deg,#c2410c,#be123c)'],
  ['rose','Pushti','linear-gradient(135deg,#be185d,#7e22ce)']
];
function PalettePicker({ left }){
  const { palette, setPalette, theme, setTheme } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if(!open) return;
    const f = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = e => { if(e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [open]);
  return html`<div className="pal-wrap" ref=${ref}>
    <button type="button" className="icon-btn" onClick=${() => setOpen(!open)} aria-expanded=${open} aria-label="Fon va rangni tanlash" title="Fon va rang"><${Icon} n="drop"/></button>
    ${open ? html`<div className=${'pal-pop' + (left ? ' left' : '')} role="menu"><span className="pal-title">Fon</span>
      <div style=${{ padding:'0 4px 6px' }}><${Seg} label="Fon" value=${theme} onChange=${setTheme} options=${[['light','Oq'],['dark','Qora']]}/></div>
      <span className="pal-title">Rang</span>
      ${PALETTES.map(([k,l,g]) => html`<button key=${k} type="button" role="menuitemradio" aria-checked=${palette === k} className=${palette === k ? 'on' : ''} onClick=${() => { setPalette(k); setOpen(false); }}><span className="swatch" style=${{ background:g }}></span>${l}${palette === k ? html`<${Icon} n="check" s=${16}/>` : null}</button>`)}
    </div>` : null}</div>`;
}
function Icon({ n, s }){
  s = s || 18;
  return html`<svg className="ic" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d=${ICONS[n] || ''}/></svg>`;
}

function texToHtml(tex){
  try{ return katex.renderToString(tex, { output:'mathml', throwOnError:false }); }catch(e){}
  return tex.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
/* MathRenderer: $...$ ichidagi LaTeX'ni KaTeX bilan chizadi */
function MathText({ text }){
  const parts = useMemo(() => {
    const s = text || '', out = [], re = /\$([^$]+)\$/g; let last = 0, m;
    while((m = re.exec(s))){ if(m.index > last) out.push(s.slice(last, m.index)); out.push({ tex:m[1] }); last = re.lastIndex; }
    if(last < s.length) out.push(s.slice(last));
    return out;
  }, [text]);
  return html`<span className="math-text">${parts.map((p,i) => typeof p === 'string' ? p : html`<span key=${i} className="math" dangerouslySetInnerHTML=${{ __html: texToHtml(p.tex) }}></span>`)}</span>`;
}

function Pill({ tone, plain, children }){ return html`<span className=${'pill ' + (tone||'') + (plain ? ' plain' : '')}>${children}</span>`; }
function StatusPill({ status }){ return html`<${Pill} tone=${STATUS_TONE[status]}>${STATUS[status]}<//>`; }
function Avatar({ user, lg }){
  return html`<span className=${'avatar' + (lg ? ' lg' : '')}>${user && user.avatar ? html`<img src=${user.avatar} alt=""/>` : initials(user)}</span>`;
}
function SubjIcon({ subject }){
  if(!subject) return null;
  return html`<span className="subj-ic" style=${{ background: subject.color }} aria-hidden="true">${subject.icon}</span>`;
}
function Empty({ icon, title, children }){
  return html`<div className="empty"><${Icon} n=${icon || 'info'} s=${30}/><b>${title}</b>${children}</div>`;
}
function CodeChip({ code }){
  const { toast } = useApp();
  const copy = () => {
    const done = () => toast(`${code} kodi nusxalandi`);
    try{ navigator.clipboard.writeText(code).then(done, () => toast("Nusxalab bo'lmadi — kodni qo'lda belgilang", 'warn')); }
    catch(e){ toast("Nusxalab bo'lmadi — kodni qo'lda belgilang", 'warn'); }
  };
  return html`<span className="code-chip"><span>${code}</span><button type="button" onClick=${copy} aria-label=${'Kodni nusxalash: ' + code} title="Nusxalash"><${Icon} n="copy" s=${14}/></button></span>`;
}
function Field({ label, hint, error, children, className }){
  return html`<label className=${'field ' + (className||'')}><span className="field-label">${label}</span>${children}${error ? html`<span className="field-err">${error}</span>` : hint ? html`<span className="field-hint">${hint}</span>` : null}</label>`;
}
function Switch({ id, checked, onChange, title, sub }){
  return html`<label className="switch" htmlFor=${id}><span className="switch-text"><b>${title}</b><span>${sub}</span></span><input id=${id} type="checkbox" checked=${checked} onChange=${e => onChange(e.target.checked)}/><span className="track"></span></label>`;
}
function Seg({ value, options, onChange, label }){
  return html`<div className="seg" role="group" aria-label=${label}>${options.map(([v,l]) => html`<button type="button" key=${v} className=${value === v ? 'on' : ''} aria-pressed=${value === v} onClick=${() => onChange(v)}>${l}</button>`)}</div>`;
}
function Modal({ title, onClose, children, footer, wide }){
  useEffect(() => { const f = e => { if(e.key === 'Escape') onClose(); }; document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f); }, [onClose]);
  /* Portal: oyna kartochka ichida chaqirilsa ham butun ekranni qoplaydi (backdrop-filter konteyneri fixed'ni qisib qo'ymasin) */
  return createPortal(html`<div className="modal-back" onMouseDown=${e => { if(e.target === e.currentTarget) onClose(); }}>
    <div className=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <header className="modal-head"><h3>${title}</h3><button className="icon-btn" onClick=${onClose} aria-label="Yopish"><${Icon} n="x"/></button></header>
      <div className="modal-body">${children}</div>
      ${footer ? html`<footer className="modal-foot">${footer}</footer>` : null}
    </div></div>`, document.body);
}
function Confirm({ title, text, okLabel, danger, onOk, onClose }){
  return html`<${Modal} title=${title} onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button><button className=${'btn ' + (danger ? 'danger' : 'primary')} onClick=${() => { onOk(); onClose(); }}>${okLabel}</button>`}><p className="muted">${text}</p><//>`;
}
/* Ro'yxatni sahifalash: resetKey o'zgarsa (filtr, tanlangan test) 1-sahifaga qaytadi */
function usePaged(list, per, resetKey){
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(list.length / per)), pg = Math.min(page, pages), offset = (pg - 1) * per;
  return { rows: list.slice(offset, offset + per), offset,
    pager: html`<${Pager} page=${pg} pages=${pages} total=${list.length} per=${per} onPage=${p => { setPage(p); window.scrollTo(0, 0); }}/>` };
}
function Pager({ page, pages, total, onPage, per }){
  per = per || 10;
  const from = total ? (page-1)*per + 1 : 0, to = Math.min(total, page*per);
  return html`<div className="pager"><span className="num">${from}–${to} / ${total} · ${page}/${pages}-sahifa</span><div className="actions">
    <button className="btn sm" disabled=${page <= 1} onClick=${() => onPage(page-1)}><${Icon} n="left" s=${14}/> Oldingi</button>
    ${Array.from({ length:pages }, (_,i) => i+1).map(n => html`<button key=${n} className=${'btn sm' + (n === page ? ' primary' : ' ghost')} aria-current=${n === page ? 'page' : undefined} onClick=${() => onPage(n)}>${n}</button>`)}
    <button className="btn sm" disabled=${page >= pages} onClick=${() => onPage(page+1)}>Keyingi <${Icon} n="right" s=${14}/></button></div></div>`;
}
function Tile({ icon, label, value, sub }){
  return html`<div className="card tile"><span className="tile-label"><${Icon} n=${icon} s=${15}/>${label}</span><span className="tile-value">${value}</span>${sub ? html`<span className="tile-sub">${sub}</span>` : null}</div>`;
}
function PageHead({ title, sub, children }){
  return html`<div className="page-head"><div><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : null}</div>${children ? html`<div className="actions">${children}</div>` : null}</div>`;
}

/* ---------- components/charts ---------- */
function Bars({ data, suffix }){
  const max = Math.max(100, ...data.map(d => d.value));
  if(!data.length) return html`<${Empty} icon="chart" title="Ma'lumot yo'q"/>`;
  const dense = data.length > 12 ? ' dense' : '';
  return html`<div><div className=${'bars' + dense} role="img" aria-label=${data.map(d => `${d.label}: ${d.value}${suffix||''}`).join(', ')}>
    ${data.map(d => html`<div className="b" key=${d.label} title=${`${d.label}: ${d.display != null ? d.display : Math.round(d.value) + (suffix||'')}`}>${dense ? null : html`<span>${d.display != null ? d.display : Math.round(d.value) + (suffix||'')}</span>`}<i style=${{ height: (d.value/max*100) + '%', background: d.color || undefined }}></i></div>`)}
  </div><div className=${'bars-x' + dense}>${data.map(d => html`<span key=${d.label} title=${d.label}>${d.label}</span>`)}</div></div>`;
}
function LineChart({ points, labels }){
  if(points.length < 2) return html`<${Empty} icon="chart" title="Grafik uchun kamida 2 ta natija kerak"/>`;
  const W = 600, H = 180, max = 100;
  const xy = points.map((v,i) => [i/(points.length-1)*W, H - v/max*H]);
  const d = xy.map((p,i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = xy[xy.length-1];
  return html`<div><div className="line-chart">
    <svg viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="lg-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".32"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>
      ${[0,25,50,75,100].map(g => html`<line key=${g} x1="0" x2=${W} y1=${H - g/100*H} y2=${H - g/100*H} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke"/>`)}
      <path d=${d + ` L${W} ${H} L0 ${H} Z`} fill="url(#lg-area)"/>
      <path d=${d} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>
    </svg>
    <span className="dot" style=${{ left: (last[0]/W*100) + '%', top: (last[1]/H*100) + '%' }}></span>
    <span className="dot-label num" style=${{ left: Math.min(94, last[0]/W*100) + '%', top: (last[1]/H*100) + '%' }}>${fmtPct(points[points.length-1])}</span>
  </div><div className="line-x"><span>${labels[0]}</span><span>${labels[labels.length-1]}</span></div></div>`;
}
function Donut({ parts, center, sub }){
  const total = parts.reduce((s,p) => s + p.value, 0) || 1;
  let off = 0;
  return html`<div className="donut-wrap"><div className="donut">
    <svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--surface-3)" strokeWidth="5"/>
      ${parts.map(p => { const len = p.value/total*100; const el = html`<circle key=${p.label} cx="21" cy="21" r="15.9155" fill="none" stroke=${p.color} strokeWidth="5" strokeDasharray=${`${len} ${100-len}`} strokeDashoffset=${-off}/>`; off += len; return el; })}
    </svg><div className="center"><div><b className="num">${center}</b><span>${sub}</span></div></div></div>
    <div className="legend">${parts.map(p => html`<div key=${p.label}><i style=${{ background:p.color }}></i>${p.label}<b>${p.value}</b></div>`)}</div></div>`;
}
function Ring({ value }){
  const tone = toneFor(value);
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--bad)';
  return html`<div className="ring"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--surface-3)" strokeWidth="4"/><circle cx="21" cy="21" r="15.9155" fill="none" stroke=${color} strokeWidth="4" strokeLinecap="round" strokeDasharray=${`${value} ${100-value}`}/></svg><div className="center"><div><b className="num">${fmtPct(value)}</b><span>natija</span></div></div></div>`;
}

/* =========================================================
   components/layout
   ========================================================= */
const NAV = {
  admin: [['/admin','home','Bosh panel'],['/admin/users','users','Foydalanuvchilar'],['/admin/subjects','book','Fanlar'],['/admin/tests','list','Testlar monitoringi'],['/students','chart',"O'quvchilar natijalari"],['/profile','user','Profil']],
  teacher: [['/teacher','home','Bosh panel'],['/teacher/tests','list','Mening testlarim'],['/teacher/tests/new','plus','Yangi test'],['/students','users',"O'quvchilar"],['/teacher/bank','layers','Savol banki'],['/subjects','book','Fanlar'],['/profile','user','Profil']],
  student: [['/student','home','Bosh panel'],['/student/tests','list','Testlar'],['/subjects','book','Fanlar'],['/student/history','chart','Natijalarim'],['/student/leaderboard','trophy','Reyting'],['/profile','user','Profil']]
};
function Shell({ children, crumb }){
  const { user, route, navigate, theme, setTheme, logout } = useApp();
  const [open, setOpen] = useState(false);
  const items = NAV[user.role];
  const path = route.split('?')[0];
  const active = items.slice().sort((a,b) => b[0].length - a[0].length).find(it => path === it[0] || path.startsWith(it[0] + '/'));
  const go = p => { setOpen(false); navigate(p); };
  return html`<div className=${'shell' + (open ? ' nav-open' : '')}>
    <aside className="sidebar" aria-label="Asosiy menyu">
      <div className="brand"><span className="brand-mark">BM</span><span className="brand-name">BM<span>examer</span></span></div>
      <nav className="nav"><span className="nav-label">${ROLE[user.role]} paneli</span>
        ${items.map(([p,ic,l]) => html`<button key=${p} className=${active && active[0] === p ? 'on' : ''} aria-current=${active && active[0] === p ? 'page' : undefined} onClick=${() => go(p)}><${Icon} n=${ic}/>${l}</button>`)}
      </nav>
      <div className="side-foot">
        <div className="me"><${Avatar} user=${user}/><div style=${{ minWidth:0 }}><div className="me-name">${fullName(user)}</div><div className="me-role">@${user.username} · ${ROLE[user.role]}</div></div></div>
        <button className="btn ghost block" onClick=${logout}><${Icon} n="logout" s=${16}/> Chiqish</button>
      </div>
    </aside>
    <div className="scrim" onClick=${() => setOpen(false)}></div>
    <div className="main">
      <header className="topbar">
        <button className="icon-btn menu-btn" onClick=${() => setOpen(true)} aria-label="Menyuni ochish"><${Icon} n="menu"/></button>
        <span className="crumb">${ROLE[user.role]} / ${crumb || (active ? active[2] : '')}</span>
        <span className="grow"></span>
        <${PalettePicker}/>
        <button className="icon-btn" onClick=${() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label=${theme === 'dark' ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish"} title="Mavzu"><${Icon} n=${theme === 'dark' ? 'sun' : 'moon'}/></button>
        <${Avatar} user=${user}/>
      </header>
      <main className="page">${children}</main>
    </div>
  </div>`;
}

/* =========================================================
   pages/auth
   ========================================================= */
function AuthBrand(){
  return html`<section className="auth-brand">
    <div className="actions" style=${{ justifyContent:'space-between' }}><div className="brand"><span className="brand-mark">BM</span><span className="brand-name">BM<span>examer</span></span></div><${PalettePicker}/></div>
    <div><h1>Har qanday fandan <em>test tuzing</em> va natijani bir zumda ko'ring</h1>
      <p className="lead">O'qituvchi test yaratadi va kod beradi. O'quvchi kodni kiritib, belgilangan vaqt ichida yechadi. Ball, foiz va reyting avtomatik hisoblanadi.</p></div>
    <div className="card preview-card" aria-hidden="true">
      <div className="preview-top"><span className="code-chip"><span>BM-7KQ2XD</span></span><span className="timer-chip"><${Icon} n="clock" s=${14}/>24:18</span></div>
      <div className="small muted">3 / 6-savol · 2 ball</div>
      <div style=${{ fontSize:'1.02rem' }}><${MathText} text="Viyet teoremasiga ko'ra $x_1 \\cdot x_2$ nimaga teng?"/></div>
      <div className="options">
        ${[['A','$\\frac{c}{a}$',true],['B','$-\\frac{b}{a}$',false]].map(([k,t,on]) => html`<div key=${k} className=${'option static' + (on ? ' on' : '')}><span className="key">${k}</span><span className="option-text"><${MathText} text=${t}/></span></div>`)}
      </div>
    </div>
  </section>`;
}
function LoginPage(){
  const { login, navigate } = useApp();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const enter = async (un, pw) => {
    if(!un.trim() || !pw){ setErr('Login va parolni kiriting'); return; }
    setBusy(true);
    try{ const r = await api.login(un.trim(), pw); await login(r); }
    catch(ex){ setErr(errText(ex, "Login yoki parol noto'g'ri")); setBusy(false); }
  };
  const submit = e => { e.preventDefault(); enter(u, p); };
  const demo = [['admin','admin123','Admin','Bekzod Alimov'],['dilnoza','teacher123',"O'qituvchi",'Dilnoza Rahimova · Matematika'],['aziz','student123',"O'quvchi",'Aziz Qodirov']];
  return html`<div className="auth"><${AuthBrand}/>
    <section className="auth-side"><form className="card auth-form" onSubmit=${submit} noValidate>
      <div><h2>Tizimga kirish</h2><p className="muted small" style=${{ marginTop:4 }}>Login va parolingizni kiriting</p></div>
      <${Field} label="Login"><input id="login-u" className="input" autoComplete="username" value=${u} onChange=${e => { setU(e.target.value); setErr(''); }} placeholder="masalan, aziz"/><//>
      <${Field} label="Parol" error=${err}><input id="login-p" className="input" type="password" autoComplete="current-password" value=${p} onChange=${e => { setP(e.target.value); setErr(''); }}/><//>
      <button className="btn primary lg block" type="submit" disabled=${busy}>${busy ? 'Kirilmoqda…' : 'Kirish'}</button>
      <div className="or">demo akkauntlar</div>
      <div className="demo-list">${demo.map(([un,pw,role,name]) => html`<button type="button" key=${un} className="demo-btn" disabled=${busy} onClick=${() => enter(un, pw)}>
        <span className="avatar">${name.split(' ').map(s => s[0]).slice(0,2).join('')}</span><span style=${{ flex:1, minWidth:0 }}><b>${role} sifatida kirish</b><span>${un} / ${pw}</span></span><${Icon} n="right" s=${16}/></button>`)}</div>
      <p className="small muted" style=${{ textAlign:'center' }}>Akkauntingiz yo'qmi? <a href="#" onClick=${e => { e.preventDefault(); navigate('/register'); }}>Ro'yxatdan o'ting</a></p>
    </form></section></div>`;
}
function RegisterPage(){
  const { login, navigate } = useApp();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ first_name:'', last_name:'', username:'', email:'', phone:'', role:'student', password:'', password2:'' });
  const [err, setErr] = useState({});
  const set = k => e => setF(Object.assign({}, f, { [k]: e.target.value }));
  const submit = e => {
    e.preventDefault();
    const er = {};
    if(!f.first_name.trim()) er.first_name = 'Ismni kiriting';
    if(!f.last_name.trim()) er.last_name = 'Familiyani kiriting';
    if(!/^[a-z0-9_.]{3,}$/i.test(f.username)) er.username = 'Kamida 3 ta belgi: harf, raqam, _ yoki .';
    if(!/^\S+@\S+\.\S+$/.test(f.email)) er.email = "Email manzil noto'g'ri";
    if(f.password.length < 6) er.password = "Parol kamida 6 ta belgidan iborat bo'lsin";
    if(f.password !== f.password2) er.password2 = 'Parollar mos kelmadi';
    setErr(er); if(Object.keys(er).length) return;
    setBusy(true);
    api.register({ username:f.username.trim(), password:f.password, password2:f.password2, email:f.email.trim(), first_name:f.first_name.trim(), last_name:f.last_name.trim(), role:f.role, phone:f.phone.trim() })
      .then(r => login(r, "Ro'yxatdan o'tdingiz — xush kelibsiz!"))
      .catch(ex => { setBusy(false); const d = ex.response && ex.response.data; if(d && typeof d === 'object' && !d.detail){ const o = {}; Object.keys(d).forEach(k => { o[k] = String([].concat(d[k])[0]); }); if(o.non_field_errors) o.password2 = o.non_field_errors; setErr(o); } else setErr({ password2: errText(ex) }); });
  };
  return html`<div className="auth"><${AuthBrand}/>
    <section className="auth-side"><form className="card auth-form" onSubmit=${submit} noValidate style=${{ maxWidth:480 }}>
      <div><h2>Ro'yxatdan o'tish</h2><p className="muted small" style=${{ marginTop:4 }}>Rolni tanlang va ma'lumotlaringizni kiriting</p></div>
      <${Seg} label="Rol" value=${f.role} onChange=${v => setF(Object.assign({}, f, { role:v }))} options=${[['student',"Men o'quvchiman"],['teacher',"Men o'qituvchiman"]]}/>
      <div className="form-grid">
        <${Field} label="Ism" error=${err.first_name}><input id="reg-fn" className="input" value=${f.first_name} onChange=${set('first_name')}/><//>
        <${Field} label="Familiya" error=${err.last_name}><input id="reg-ln" className="input" value=${f.last_name} onChange=${set('last_name')}/><//>
        <${Field} label="Login" error=${err.username}><input id="reg-un" className="input" autoComplete="username" value=${f.username} onChange=${set('username')}/><//>
        <${Field} label="Telefon" hint="Ixtiyoriy"><input id="reg-ph" className="input" value=${f.phone} onChange=${set('phone')} placeholder="+998 90 123 45 67"/><//>
        <${Field} className="span2" label="Email" error=${err.email}><input id="reg-em" className="input" type="email" value=${f.email} onChange=${set('email')}/><//>
        <${Field} label="Parol" error=${err.password}><input id="reg-pw" className="input" type="password" autoComplete="new-password" value=${f.password} onChange=${set('password')}/><//>
        <${Field} label="Parolni takrorlang" error=${err.password2}><input id="reg-pw2" className="input" type="password" autoComplete="new-password" value=${f.password2} onChange=${set('password2')}/><//>
      </div>
      <button className="btn primary lg block" type="submit" disabled=${busy}>${busy ? 'Yaratilmoqda…' : 'Akkaunt yaratish'}</button>
      <p className="small muted" style=${{ textAlign:'center' }}>Akkauntingiz bormi? <a href="#" onClick=${e => { e.preventDefault(); navigate('/login'); }}>Kirish</a></p>
    </form></section></div>`;
}

/* =========================================================
   pages/admin
   ========================================================= */
function AdminDashboard(){
  const { db, navigate } = useApp();
  const done = db.attempts.filter(a => a.is_completed);
  const cnt = r => db.users.filter(u => u.role === r).length;
  const bySubject = db.subjects.map(s => {
    const ids = db.tests.filter(t => t.subject_id === s.id).map(t => t.id);
    const at = done.filter(a => ids.includes(a.test_id));
    return { label:s.name, value: avg(at.map(a => a.percentage)), color:s.color, n:at.length };
  }).filter(x => x.n);
  const st = ['active','draft','completed'].map(s => ({ label:STATUS[s], value: db.tests.filter(t => t.status === s).length, color: s === 'active' ? 'var(--ok)' : s === 'draft' ? 'var(--faint)' : 'var(--accent)' }));
  const days = Array.from({ length:14 }, (_,i) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 13 + i); return d; });
  const perDay = days.map(d => done.filter(a => { const x = new Date(a.started_at); return x >= d && x < new Date(d.getTime() + 86400000); }).length);
  const recent = done.slice().sort((a,b) => new Date(b.finished_at) - new Date(a.finished_at)).slice(0,6);
  return html`<${PageHead} title="Tizim statistikasi" sub="Barcha foydalanuvchilar, testlar va natijalar bo'yicha umumiy ko'rinish"/>
    <div className="tiles">
      <${Tile} icon="users" label="Foydalanuvchilar" value=${db.users.length} sub=${`${cnt('student')} o'quvchi · ${cnt('teacher')} o'qituvchi · ${cnt('admin')} admin`}/>
      <${Tile} icon="list" label="Testlar" value=${db.tests.length} sub=${`${db.tests.filter(t => t.status === 'active').length} tasi hozir faol`}/>
      <${Tile} icon="check" label="Yakunlangan urinishlar" value=${done.length} sub=${`${new Set(done.map(a => a.student_id)).size} nafar o'quvchi qatnashgan`}/>
      <${Tile} icon="chart" label="O'rtacha natija" value=${fmtPct(avg(done.map(a => a.percentage)))} sub="Barcha urinishlar bo'yicha"/>
    </div>
    <div className="grid g-main">
      <div className="card"><div className="card-head"><div><h3>Fanlar bo'yicha o'rtacha natija</h3><p>Yakunlangan urinishlar foizi</p></div></div><div className="card-body"><${Bars} data=${bySubject} suffix="%"/></div></div>
      <div className="card"><div className="card-head"><div><h3>Test holatlari</h3><p>Qoralama → Faol → Yakunlangan</p></div></div><div className="card-body"><${Donut} parts=${st} center=${db.tests.length} sub="test"/></div></div>
    </div>
    <div className="grid g-main">
      <div className="card"><div className="card-head"><div><h3>So'nggi 14 kunlik faollik</h3><p>Kunlik yakunlangan urinishlar soni</p></div></div><div className="card-body">
        <${Bars} data=${perDay.map((v,i) => ({ label: `${days[i].getDate()}`, value: v / Math.max(1, ...perDay) * 100, display: v }))}/></div></div>
      <div className="card"><div className="card-head"><h3>So'nggi natijalar</h3></div>
        <div className="table-wrap"><table className="tbl"><tbody>${recent.map(a => { const u = db.users.find(x => x.id === a.student_id), t = db.tests.find(x => x.id === a.test_id); return html`<tr key=${a.id} style=${{ cursor:'pointer' }} onClick=${() => navigate('/results/' + a.test_id)}><td><div className="who"><${Avatar} user=${u}/><div style=${{ minWidth:0 }}><b>${fullName(u)}</b><span>${t ? t.title : ''}</span></div></div></td><td className="r"><${Pill} tone=${toneFor(a.percentage)} plain>${fmtPct(a.percentage)}<//></td></tr>`; })}</tbody></table></div></div>
    </div>`;
}

/* Login va parol generatori (admin foydalanuvchi qo'shganda) */
const CYR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:'o',қ:'q',ғ:'g',ҳ:'h' };
const slug = s => String(s || '').toLowerCase().split('').map(c => CYR[c] != null ? CYR[c] : c).join('').replace(/[^a-z0-9]/g, '');
const genPassword = () => Array.from({ length:8 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random()*31)]).join('');
function makeUsername(first, last, taken){
  const base = (slug(first) + (slug(last)[0] || '')) || 'user';
  let u = base, k = 1;
  while(taken.has(u)) u = base + (++k);
  taken.add(u); return u;
}
/* Yangi foydalanuvchilarning login/parollari — admin nusxalab tarqatadi */
function CredentialsView({ users }){
  const { toast } = useApp();
  const tsv = [['Ism', 'Familiya', 'Rol', 'Login', 'Parol'], ...users.map(u => [u.first_name, u.last_name, ROLE[u.role], u.username, u.password])].map(r => r.join('\t')).join('\n');
  const copy = () => { try{ navigator.clipboard.writeText(tsv).then(() => toast('Login va parollar nusxalandi — Excel yoki Telegram\'ga qo\'ying'), () => toast("Nusxalab bo'lmadi — jadvalni qo'lda belgilang", 'warn')); }catch(e){ toast("Nusxalab bo'lmadi — jadvalni qo'lda belgilang", 'warn'); } };
  return html`<div className="banner info"><${Icon} n="key"/><div><b>${users.length} ta foydalanuvchi qo'shildi.</b> Login va parollarni hozir nusxalab oling va egalariga bering — parol keyin ro'yxatda ko'rsatilmaydi. Foydalanuvchi kirgach, parolini Profil'da o'zgartira oladi.</div></div>
    <div className="card table-wrap" style=${{ maxHeight:300, overflow:'auto' }}><table className="tbl compact"><thead><tr><th>F.I.Sh.</th><th>Rol</th><th>Login</th><th>Parol</th></tr></thead>
      <tbody>${users.map(u => html`<tr key=${u.id}><td>${fullName(u)}</td><td>${ROLE[u.role]}</td><td className="mono">${u.username}</td><td className="mono">${u.password}</td></tr>`)}</tbody></table></div>
    <button className="btn primary" style=${{ alignSelf:'flex-start' }} onClick=${copy}><${Icon} n="copy" s=${16}/> Login va parollarni nusxalash</button>`;
}
function AddUserModal({ onClose }){
  const { db, run } = useApp();
  const [f, setF] = useState({ first_name:'', last_name:'', username:'', email:'', phone:'', role:'student', password:genPassword() });
  const [err, setErr] = useState({}); const [done, setDone] = useState(null);
  const set = k => e => { setF(Object.assign({}, f, { [k]: e.target.value })); setErr({}); };
  const suggest = () => { if(!f.username && (f.first_name || f.last_name)) setF(Object.assign({}, f, { username: makeUsername(f.first_name, f.last_name, new Set(db.users.map(u => u.username.toLowerCase()))) })); };
  const save = () => {
    const er = {};
    if(!f.first_name.trim()) er.first_name = 'Ismni kiriting';
    if(!f.last_name.trim()) er.last_name = 'Familiyani kiriting';
    if(!/^[a-z0-9_.]{3,}$/i.test(f.username)) er.username = 'Kamida 3 ta belgi: harf, raqam, _ yoki .';
    else if(db.users.some(u => u.username.toLowerCase() === f.username.toLowerCase())) er.username = 'Bu login band';
    if(f.email && !/^\S+@\S+\.\S+$/.test(f.email)) er.email = "Email noto'g'ri";
    if(f.password.length < 6) er.password = 'Kamida 6 ta belgi';
    setErr(er); if(Object.keys(er).length) return;
    const nu = { username:f.username.trim(), password:f.password, email:f.email.trim(), first_name:f.first_name.trim(), last_name:f.last_name.trim(), role:f.role, phone:f.phone.trim() };
    run(() => api.createUser(nu)).then(r => setDone([Object.assign({}, nu, r, { password: r.password || nu.password })])).catch(ex => { const d = ex.response && ex.response.data; if(d && d.username) setErr({ username:String([].concat(d.username)[0]) }); });
  };
  if(done) return html`<${Modal} title="Foydalanuvchi qo'shildi" onClose=${onClose} footer=${html`<button className="btn" onClick=${onClose}>Yopish</button>`}><${CredentialsView} users=${done}/><//>`;
  return html`<${Modal} title="Foydalanuvchi qo'shish" onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button><button className="btn primary" onClick=${save}>Qo'shish</button>`}>
    <${Seg} label="Rol" value=${f.role} onChange=${v => setF(Object.assign({}, f, { role:v }))} options=${[['student',"O'quvchi"],['teacher',"O'qituvchi"],['admin','Admin']]}/>
    <div className="form-grid">
      <${Field} label="Ism" error=${err.first_name}><input id="au-fn" className="input" value=${f.first_name} onChange=${set('first_name')}/><//>
      <${Field} label="Familiya" error=${err.last_name}><input id="au-ln" className="input" value=${f.last_name} onChange=${set('last_name')} onBlur=${suggest}/><//>
      <${Field} label="Login" error=${err.username} hint="Ism-familiyadan avtomatik taklif qilinadi"><input id="au-un" className="input" value=${f.username} onChange=${set('username')} onFocus=${suggest}/><//>
      <${Field} label="Parol" error=${err.password}><div className="actions" style=${{ flexWrap:'nowrap' }}><input id="au-pw" className="input mono" value=${f.password} onChange=${set('password')}/><button type="button" className="icon-btn" title="Yangi parol" aria-label="Yangi parol yaratish" onClick=${() => setF(Object.assign({}, f, { password:genPassword() }))}><${Icon} n="refresh" s=${16}/></button></div><//>
      <${Field} label="Telefon" hint="Ixtiyoriy"><input id="au-ph" className="input" value=${f.phone} onChange=${set('phone')} placeholder="+998 90 123 45 67"/><//>
      <${Field} label="Email" error=${err.email} hint="Ixtiyoriy"><input id="au-em" className="input" value=${f.email} onChange=${set('email')}/><//>
    </div><//>`;
}
/* Ko'p foydalanuvchi: ro'yxatni yozish/qo'yish yoki Excel fayl. Ustunlar: Ism | Familiya | Telefon | Email | Login | Parol | Rol */
/* Foydalanuvchilar uchun bitta "Import / Export" oynasi */
function UsersIOModal({ rows, count, onPick, onClose }){
  const { toast } = useApp();
  const copyNow = () => {
    const tsv = rows.map(r => r.map(c => String(c == null ? '' : c).replace(/[\t\n]+/g, ' ')).join('\t')).join('\n');
    try{ navigator.clipboard.writeText(tsv).then(() => toast(`${count} ta foydalanuvchi nusxalandi — Excel yoki Word'da Ctrl+V bosing`), () => onPick('export-xlsx')); }catch(e){ onPick('export-xlsx'); }
  };
  const card = (key, icon, title, sub, onClick) => html`<button key=${key} type="button" className="fmt-card" onClick=${onClick}>
    <span className="actions" style=${{ gap:8 }}><${Icon} n=${icon} s=${18}/><b>${title}</b></span><span>${sub}</span></button>`;
  return html`<${Modal} wide title="Foydalanuvchilar: Import / Export" onClose=${onClose}>
    <h4>Foydalanuvchilarni qo'shish</h4>
    <div className="fmt-cards">
      ${card('xl', 'upload', "Excel'dan", '.xlsx, .xls yoki .csv: Ism | Familiya | Telefon…', () => onPick('bulk-file'))}
      ${card('wd', 'file', "Word'dan", '.docx: har qatorda yoki jadvalda bitta odam', () => onPick('bulk-word'))}
      ${card('tx', 'edit', "Ro'yxatni qo'yish", "Telegram, Excel yoki istalgan joydan nusxalangan ismlar", () => onPick('bulk-text'))}
    </div>
    <h4>Ro'yxatni chiqarish <span className="muted small">· ${count} ta foydalanuvchi (joriy filtr bo'yicha)</span></h4>
    <div className="fmt-cards">
      ${card('cp', 'copy', 'Nusxalash', "Jadval sifatida — Excel yoki Word'ga Ctrl+V", copyNow)}
      ${card('dx', 'download', 'Excel / Word yuklab olish', '.xlsx yoki .docx fayl', () => onPick('export-xlsx'))}
      ${card('pd', 'download', 'PDF yuklab olish', 'Chop etish uchun ro\'yxat', () => onPick('export-pdf'))}
    </div>
    <p className="small muted">Parollar eksportga kiritilmaydi — ular faqat qo'shilgan paytda bir marta ko'rsatiladi.</p><//>`;
}
function BulkAddModal({ onClose, initialMode }){
  const { db, run } = useApp();
  const [mode, setMode] = useState(initialMode || 'text'); const [text, setText] = useState(''); const [role, setRole] = useState('student');
  const [rows, setRows] = useState(null); const [err, setErr] = useState(''); const [done, setDone] = useState(null); const [fname, setFname] = useState('');
  const fileRef = useRef(null);
  const ROLE_IN = v => { v = slug(v); return /teach|oqit|ustoz|uchit/.test(v) ? 'teacher' : /admin/.test(v) ? 'admin' : /stud|oquv|uchen/.test(v) ? 'student' : null; };
  const build = raw => {
    const taken = new Set(db.users.map(u => u.username.toLowerCase()));
    return raw.map(c => c.map(x => String(x == null ? '' : x).trim())).filter(c => c.some(Boolean)).map((c, i) => {
      let [first, last, phone, email, login, pass, r] = c;
      if(first && !last && first.includes(' ')){ const p = first.split(/\s+/); first = p[0]; last = p.slice(1).join(' '); }
      const problems = [];
      if(!first || !last) problems.push('ism va familiya kerak');
      let username = login ? login.toLowerCase() : '';
      if(username){ if(!/^[a-z0-9_.]{3,}$/.test(username)) problems.push("login noto'g'ri"); else if(taken.has(username)) problems.push('login band'); else taken.add(username); }
      else if(first && last) username = makeUsername(first, last, taken);
      if(email && !/^\S+@\S+\.\S+$/.test(email)) problems.push("email noto'g'ri");
      if(pass && pass.length < 6) problems.push('parol 6 belgidan qisqa');
      return { n:i+1, problem: problems.join(', '), u:{ id:nid(), username, password: pass || genPassword(), email: email || '', first_name:first || '', last_name:last || '', role: ROLE_IN(r) || role, phone: phone || '', avatar:null, created_at:new Date().toISOString() } };
    });
  };
  const parseText = () => { setErr(''); const lines = text.split(/\r?\n/).filter(l => l.trim()); if(!lines.length) return setErr("Kamida bitta qator yozing"); setRows(build(lines.map(l => l.split(/\t|;|,/)))); };
  const parseFile = e => {
    const file = e.target.files && e.target.files[0]; if(!file) return; setFname(file.name); setErr('');
    const rd = new FileReader();
    if(mode === 'word'){
      if(!/\.docx$/i.test(file.name)) return setErr("Faqat .docx fayl. Eski .doc bo'lsa, Word'da .docx qilib saqlang yoki ro'yxatni nusxalab qo'ying.");
      rd.onload = () => { try{ const lines = docxToText(rd.result).split('\n').filter(l => l.trim()).map(l => l.replace(/^\s*\d+\s*[.)]\s*/, ''));
        const data = lines.map(l => l.split(/\t|;|,/)).filter(c => !/^\s*(ism|f\.?\s*i\.?\s*sh\.?|ism[- ]familiya|name|имя|фио)\s*$/i.test(c[0])); setRows(build(data)); }catch(ex){ setErr("Word faylni o'qib bo'lmadi. Ro'yxatni nusxalab \"Ro'yxatni yozish\" orqali qo'ying."); } };
      return rd.readAsArrayBuffer(file);
    }
    rd.onload = () => { try{ const wb = XLSX.read(new Uint8Array(rd.result), { type:'array' }); let data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });
      if(data[0] && /ism|name|имя/i.test(String(data[0][0]))) data = data.slice(1); setRows(build(data)); }catch(ex){ setErr("Faylni o'qib bo'lmadi. .xlsx yoki .csv jadval yuklang."); } };
    rd.readAsArrayBuffer(file);
  };
  const good = rows ? rows.filter(r => !r.problem) : [];
  const add = () => {
    const list = good.map(r => r.u);
    run(() => api.bulkUsers(list.map(u => ({ username:u.username, password:u.password, email:u.email, first_name:u.first_name, last_name:u.last_name, role:u.role, phone:u.phone }))))
      .then(r => setDone((r.created || []).map((u, i) => Object.assign({}, list[i], u, { password: u.password || list[i].password })))).catch(() => {});
  };
  if(done) return html`<${Modal} wide title="Foydalanuvchilar qo'shildi" onClose=${onClose} footer=${html`<button className="btn" onClick=${onClose}>Yopish</button>`}><${CredentialsView} users=${done}/><//>`;
  return html`<${Modal} wide title="Ko'p foydalanuvchi qo'shish" onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button>${rows ? html`<button className="btn" onClick=${() => setRows(null)}>Orqaga</button>` : null}<button className="btn primary" disabled=${rows ? !good.length : false} onClick=${rows ? add : (mode === 'text' ? parseText : () => fileRef.current && fileRef.current.click())}>${rows ? `${good.length} ta foydalanuvchini qo'shish` : mode === 'text' ? 'Tekshirish' : 'Fayl tanlash'}</button>`}>
    ${rows ? html`
      <b className="small">${rows.length} ta qator: ${good.length} tasi tayyor${rows.length - good.length ? `, ${rows.length - good.length} tasida xato (ular qo'shilmaydi)` : ''}</b>
      <div className="card table-wrap" style=${{ maxHeight:340, overflow:'auto' }}><table className="tbl compact"><thead><tr><th>#</th><th>F.I.Sh.</th><th>Rol</th><th>Login</th><th>Telefon</th><th>Holat</th></tr></thead>
        <tbody>${rows.map(r => html`<tr key=${r.n}><td className="faint">${r.n}</td><td>${r.u.first_name} ${r.u.last_name}</td><td>${ROLE[r.u.role]}</td><td className="mono">${r.u.username || '—'}</td><td>${r.u.phone || '—'}</td><td>${r.problem ? html`<${Pill} tone="bad" plain>${r.problem}<//>` : html`<${Pill} tone="ok" plain>tayyor<//>`}</td></tr>`)}</tbody></table></div>`
    : html`
      <div className="actions" style=${{ justifyContent:'space-between' }}>
        <${Seg} label="Usul" value=${mode} onChange=${v => { setMode(v); setErr(''); setFname(''); }} options=${[['text',"Ro'yxatni yozish"],['file','Excel fayl'],['word','Word fayl']]}/>
        <label className="actions small muted">Rol (ko'rsatilmasa) <select id="ba-role" className="select" style=${{ width:'auto' }} value=${role} onChange=${e => setRole(e.target.value)}>${Object.keys(ROLE).map(r => html`<option key=${r} value=${r}>${ROLE[r]}</option>`)}</select></label>
      </div>
      ${mode === 'text' ? html`<${Field} label="Har bir qatorda bitta odam" hint="Excel'dan ustunlarni nusxalab qo'yish ham mumkin. Login va parol bo'sh qolsa, avtomatik yaratiladi.">
          <textarea id="ba-text" className="textarea mono" style=${{ minHeight:180, fontSize:'.85rem' }} value=${text} onChange=${e => setText(e.target.value)} placeholder=${"Aziza Karimova\nJasur Toshmatov; +998 90 111 22 33\nNodira; Aliyeva; +998 91 222 33 44; nodira@mail.uz\nRustam; Qodirov; ; ; rustam.q; parol123; o'qituvchi"}></textarea><//>`
      : html`<button type="button" className="drop" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} n="upload" s=${24}/><span>${fname || (mode === 'word' ? 'Word fayl tanlash — .docx (har qatorda yoki jadval qatorida bitta odam)' : 'Fayl tanlash — .xlsx, .xls yoki .csv')}</span></button>`}
      <input key=${mode} ref=${fileRef} type="file" accept=${mode === 'word' ? '.docx' : '.xlsx,.xls,.csv'} hidden onChange=${parseFile}/>
      <div className="table-wrap card"><table className="tbl template"><thead><tr><th>Ism</th><th>Familiya</th><th>Telefon</th><th>Email</th><th>Login</th><th>Parol</th><th>Rol</th></tr></thead>
        <tbody><tr><td>Aziza</td><td>Karimova</td><td>+998 90 111 22 33</td><td></td><td></td><td></td><td></td></tr><tr><td>Rustam</td><td>Qodirov</td><td></td><td>r.q@mail.uz</td><td>rustam.q</td><td>parol123</td><td>o'qituvchi</td></tr></tbody></table></div>
      <p className="small muted">Ustunlar tartibi shunday. Faqat Ism va Familiya majburiy. Qatorda ustunlarni <span className="mono">;</span>, vergul yoki Tab bilan ajrating. "Ism Familiya" bitta katakda bo'lsa ham bo'ladi.</p>`}
    ${err ? html`<div className="banner bad"><${Icon} n="alert"/>${err}</div>` : null}<//>`;
}

function AdminUsers(){
  const { db, run, user: me } = useApp();
  const [q, setQ] = useState(''); const [role, setRole] = useState('all'); const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null); const [del, setDel] = useState(null); const [add, setAdd] = useState(null);
  const list = db.users.filter(u => (role === 'all' || u.role === role) && (`${u.first_name} ${u.last_name} ${u.username} ${u.email} ${u.phone}`).toLowerCase().includes(q.toLowerCase()))
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const per = 10, pages = Math.max(1, Math.ceil(list.length/per)), pg = Math.min(page, pages);
  const rows = list.slice((pg-1)*per, pg*per);
  const userRows = [['Ism', 'Familiya', 'Rol', 'Login', 'Telefon', 'Email', "Qo'shilgan"], ...list.map(u => [u.first_name, u.last_name, ROLE[u.role], u.username, u.phone || '', u.email || '', fmtDate(u.created_at)])];
  const attemptsOf = id => db.attempts.filter(a => a.student_id === id && a.is_completed).length;
  const testsOf = id => db.tests.filter(t => t.created_by === id).length;
  return html`<${PageHead} title="Foydalanuvchilar" sub="Qo'shish, qidirish, rol bo'yicha filtrlash, tahrirlash va o'chirish">
      <button className="btn" onClick=${() => setAdd('io')}><${Icon} n="file" s=${16}/> Import / Export</button>
      <button className="btn" onClick=${() => setAdd('bulk-text')}><${Icon} n="users" s=${16}/> Ko'p odam qo'shish</button>
      <button className="btn primary" onClick=${() => setAdd('one')}><${Icon} n="plus" s=${16}/> Foydalanuvchi qo'shish</button><//>
    ${add === 'one' ? html`<${AddUserModal} onClose=${() => setAdd(null)}/>` : null}
    ${add === 'io' ? html`<${UsersIOModal} rows=${userRows} count=${list.length} onPick=${setAdd} onClose=${() => setAdd(null)}/>` : null}
    ${add && add.startsWith('bulk') ? html`<${BulkAddModal} initialMode=${{ 'bulk-file':'file', 'bulk-word':'word', 'bulk-text':'text' }[add] || 'text'} onClose=${() => setAdd(null)}/>` : null}
    ${add && add.startsWith('export') ? html`<${ExportModal} title="Foydalanuvchilar ro'yxatini export qilish" initialFmt=${add.split('-')[1]} endpoint="/users/export/" fileBase="foydalanuvchilar" formats=${[['xlsx','Excel','Jadval'],['docx','Word','Tahrirlanadigan ro\'yxat'],['pdf','PDF','Chop etish uchun']]} rows=${userRows} onClose=${() => setAdd(null)}/>` : null}
    <div className="card">
      <div className="filters">
        <div className="search"><${Icon} n="search" s=${16}/><input id="u-search" className="input" placeholder="Ism, login, email yoki telefon" value=${q} onChange=${e => { setQ(e.target.value); setPage(1); }}/></div>
        <${Seg} label="Rol" value=${role} onChange=${v => { setRole(v); setPage(1); }} options=${[['all','Hammasi'],['student',"O'quvchilar"],['teacher',"O'qituvchilar"],['admin','Adminlar']]}/>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Foydalanuvchi</th><th>Rol</th><th>Telefon</th><th>Faollik</th><th>Qo'shilgan</th><th className="r">Amallar</th></tr></thead>
        <tbody>${rows.map(u => html`<tr key=${u.id}>
          <td><div className="who"><${Avatar} user=${u}/><div><b>${fullName(u)}</b><span>@${u.username} · ${u.email}</span></div></div></td>
          <td><${Pill} tone=${u.role === 'admin' ? 'bad' : u.role === 'teacher' ? 'accent' : ''}>${ROLE[u.role]}<//></td>
          <td className="num" style=${{ whiteSpace:'nowrap' }}>${u.phone || '—'}</td>
          <td className="muted">${u.role === 'student' ? `${attemptsOf(u.id)} ta urinish` : u.role === 'teacher' ? `${testsOf(u.id)} ta test` : '—'}</td>
          <td className="muted" style=${{ whiteSpace:'nowrap' }}>${fmtDate(u.created_at)}</td>
          <td className="r" style=${{ whiteSpace:'nowrap' }}><button className="icon-btn" onClick=${() => setEdit(u)} aria-label=${'Tahrirlash: ' + fullName(u)}><${Icon} n="edit" s=${16}/></button><button className="icon-btn danger" disabled=${u.id === me.id} title=${u.id === me.id ? "O'zingizni o'chira olmaysiz" : "O'chirish"} onClick=${() => setDel(u)} aria-label=${"O'chirish: " + fullName(u)}><${Icon} n="trash" s=${16}/></button></td>
        </tr>`)}</tbody></table>
        ${!rows.length ? html`<${Empty} icon="search" title="Hech kim topilmadi">Qidiruv so'zini yoki rol filtrini o'zgartirib ko'ring.<//>` : null}
      </div>
      <${Pager} page=${pg} pages=${pages} total=${list.length} onPage=${setPage}/>
    </div>
    ${edit ? html`<${UserEditModal} u=${edit} onClose=${() => setEdit(null)}/>` : null}
    ${del ? html`<${Confirm} title="Foydalanuvchini o'chirish" danger okLabel="O'chirish" text=${`${fullName(del)} (@${del.username}) va uning barcha urinishlari o'chiriladi. Bu amalni qaytarib bo'lmaydi.`} onClose=${() => setDel(null)} onOk=${() => run(() => api.deleteUser(del.id), `${fullName(del)} o'chirildi`).catch(() => {})}/>` : null}`;
}
function UserEditModal({ u, onClose }){
  const { run, user: me } = useApp();
  const [f, setF] = useState({ first_name:u.first_name, last_name:u.last_name, email:u.email || '', phone:u.phone||'', role:u.role });
  const set = k => e => setF(Object.assign({}, f, { [k]: e.target.value }));
  const save = () => { run(() => api.updateUser(u.id, f), "O'zgarishlar saqlandi").then(onClose).catch(() => {}); };
  return html`<${Modal} title="Foydalanuvchini tahrirlash" onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button><button className="btn primary" onClick=${save} disabled=${!f.first_name.trim() || !f.last_name.trim()}>Saqlash</button>`}>
    <div className="who"><${Avatar} user=${u}/><div><b>@${u.username}</b><span>${fmtDate(u.created_at)} dan beri</span></div></div>
    <div className="form-grid">
      <${Field} label="Ism"><input id="ue-fn" className="input" value=${f.first_name} onChange=${set('first_name')}/><//>
      <${Field} label="Familiya"><input id="ue-ln" className="input" value=${f.last_name} onChange=${set('last_name')}/><//>
      <${Field} label="Email"><input id="ue-em" className="input" value=${f.email} onChange=${set('email')}/><//>
      <${Field} label="Telefon"><input id="ue-ph" className="input" value=${f.phone} onChange=${set('phone')}/><//>
      <${Field} className="span2" label="Rol" hint=${u.id === me.id ? "O'z rolingizni o'zgartira olmaysiz" : null}><select id="ue-role" className="select" value=${f.role} disabled=${u.id === me.id} onChange=${set('role')}>${Object.keys(ROLE).map(r => html`<option key=${r} value=${r}>${ROLE[r]}</option>`)}</select><//>
    </div><//>`;
}

/* Fanlar (FR-SUBJ-1/2): faqat admin boshqaradi; teacher va student faqat ko'radi */
function AdminSubjects(){
  const { db, run, user, navigate } = useApp();
  const canEdit = user.role === 'admin';
  const isTeacher = user.role === 'teacher';
  const [edit, setEdit] = useState(null); const [del, setDel] = useState(null);
  return html`<${PageHead} title="Fanlar" sub=${canEdit ? "Testlar fanlar bo'yicha guruhlanadi" : isTeacher ? "Fanlarni faqat admin qo'shadi va o'zgartiradi" : "Platformadagi fanlar va ulardagi faol testlar"}>${canEdit ? html`<button className="btn primary" onClick=${() => setEdit({})}><${Icon} n="plus" s=${16}/> Fan qo'shish</button>` : null}<//>
    <div className="grid g3">${db.subjects.map(s => { const tc = db.tests.filter(t => t.subject_id === s.id); const act = tc.filter(t => t.status === 'active'); const qc = tc.reduce((n, t) => n + (t.question_count || 0), 0); return html`<div key=${s.id} className="card subject-card">
      <div className="test-card-top"><${SubjIcon} subject=${s}/><div style=${{ flex:1, minWidth:0 }}><h3>${s.name}</h3><p className="small muted">${s.description || 'Tavsif yo\'q'}</p></div></div>
      <div className="meta">${canEdit || isTeacher ? html`<span><${Icon} n="list" s=${14}/>${tc.length} ta test</span><span><${Icon} n="hash" s=${14}/>${qc} ta savol</span><span><${Icon} n="clock" s=${14}/>${fmtDate(s.created_at)}</span>` : html`<span><${Icon} n="play" s=${14}/>${act.length} ta faol test</span>`}</div>
      <div className="actions">${canEdit ? html`<button className="btn sm" onClick=${() => setEdit(s)}><${Icon} n="edit" s=${14}/> Tahrirlash</button><button className="btn sm danger" onClick=${() => setDel(s)}><${Icon} n="trash" s=${14}/> O'chirish</button>`
        : isTeacher ? html`<button className="btn sm primary" onClick=${() => navigate('/teacher/tests/new?' + s.id)}><${Icon} n="plus" s=${14}/> Shu fandan test tuzish</button>`
        : html`<button className="btn sm primary" disabled=${!act.length} onClick=${() => navigate('/student/tests?' + s.id)}>Testlarni ko'rish <${Icon} n="right" s=${14}/></button>`}</div>
    </div>`; })}</div>
    ${edit ? html`<${SubjectModal} s=${edit} onClose=${() => setEdit(null)}/>` : null}
    ${del ? (db.tests.some(t => t.subject_id === del.id)
      ? html`<${Modal} title="Fanni o'chirib bo'lmaydi" onClose=${() => setDel(null)} footer=${html`<button className="btn primary" onClick=${() => setDel(null)}>Tushunarli</button>`}><p className="muted">"${del.name}" faniga ${db.tests.filter(t => t.subject_id === del.id).length} ta test biriktirilgan. Avval bu testlarni boshqa fanga o'tkazing yoki o'chiring.</p><//>`
      : html`<${Confirm} title="Fanni o'chirish" danger okLabel="O'chirish" text=${`"${del.name}" fani o'chiriladi.`} onClose=${() => setDel(null)} onOk=${() => run(() => api.deleteSubject(del.id), "Fan o'chirildi").catch(() => {})}/>`) : null}`;
}
const SUBJ_COLORS = ['#5b7cff','#9b5cff','#2fb7c9','#e0669b','#3cb878','#e39b3a','#d9534f','#6c7a89'];
function SubjectModal({ s, onClose }){
  const { run } = useApp();
  const isNew = !s.id;
  const [f, setF] = useState({ name:s.name||'', description:s.description||'', icon:s.icon||'', color:s.color||SUBJ_COLORS[0] });
  const save = () => {
    const data = Object.assign({}, f, { name:f.name.trim(), icon: f.icon.trim() || f.name.trim().slice(0,2) });
    run(() => api.saveSubject(s.id, data), isNew ? "Fan qo'shildi" : 'Fan yangilandi').then(onClose).catch(() => {});
  };
  return html`<${Modal} title=${isNew ? "Yangi fan" : "Fanni tahrirlash"} onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button><button className="btn primary" disabled=${!f.name.trim()} onClick=${save}>Saqlash</button>`}>
    <${Field} label="Fan nomi"><input id="sj-name" className="input" value=${f.name} onChange=${e => setF(Object.assign({}, f, { name:e.target.value }))} placeholder="masalan, Kimyo"/><//>
    <${Field} label="Tavsif"><textarea id="sj-desc" className="textarea" value=${f.description} onChange=${e => setF(Object.assign({}, f, { description:e.target.value }))}></textarea><//>
    <div className="form-grid">
      <${Field} label="Belgi" hint="1–3 belgi, masalan Ch"><input id="sj-icon" className="input" maxLength="3" value=${f.icon} onChange=${e => setF(Object.assign({}, f, { icon:e.target.value }))}/><//>
      <div className="field"><span className="field-label">Rang</span><div className="actions">${SUBJ_COLORS.map(c => html`<button key=${c} type="button" aria-label=${'Rang ' + c} aria-pressed=${f.color === c} onClick=${() => setF(Object.assign({}, f, { color:c }))} style=${{ width:28, height:28, borderRadius:8, border: f.color === c ? '2px solid var(--fg)' : '2px solid transparent', background:c, cursor:'pointer' }}></button>`)}</div></div>
    </div>
    <div className="who"><${SubjIcon} subject=${{ icon: f.icon || f.name.slice(0,2) || '?', color:f.color }}/><div><b>${f.name || 'Fan nomi'}</b><span>Ko'rinishi</span></div></div><//>`;
}

function AdminTests(){
  const { db, navigate } = useApp();
  const [q, setQ] = useState(''); const [status, setStatus] = useState('all'); const [subj, setSubj] = useState('all'); const [page, setPage] = useState(1);
  const list = db.tests.filter(t => (status === 'all' || t.status === status) && (subj === 'all' || t.subject_id === +subj) && (t.title + ' ' + t.test_code).toLowerCase().includes(q.toLowerCase()))
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const per = 10, pages = Math.max(1, Math.ceil(list.length/per)), pg = Math.min(page, pages);
  const rows = list.slice((pg-1)*per, pg*per);
  return html`<${PageHead} title="Testlar monitoringi" sub="Barcha o'qituvchilarning testlari, holatlari va natijalari"/>
    <div className="card">
      <div className="filters">
        <div className="search"><${Icon} n="search" s=${16}/><input id="t-search" className="input" placeholder="Test nomi yoki kodi" value=${q} onChange=${e => { setQ(e.target.value); setPage(1); }}/></div>
        <select id="t-subj" className="select" value=${subj} onChange=${e => { setSubj(e.target.value); setPage(1); }} aria-label="Fan"><option value="all">Barcha fanlar</option>${db.subjects.map(s => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}</select>
        <${Seg} label="Holat" value=${status} onChange=${v => { setStatus(v); setPage(1); }} options=${[['all','Hammasi'],['active','Faol'],['draft','Qoralama'],['completed','Yakunlangan']]}/>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Test</th><th>O'qituvchi</th><th>Kod</th><th>Holat</th><th className="r">Savollar</th><th className="r">Urinishlar</th><th className="r">O'rtacha</th><th></th></tr></thead>
        <tbody>${rows.map(t => { const s = db.subjects.find(x => x.id === t.subject_id), tch = db.users.find(u => u.id === t.created_by); const at = db.attempts.filter(a => a.test_id === t.id && a.is_completed); return html`<tr key=${t.id}>
          <td><div className="who"><${SubjIcon} subject=${s}/><div><b>${t.title}</b><span>${s ? s.name : '—'} · ${t.duration_minutes} daq · ${DIFF[t.difficulty]}</span></div></div></td>
          <td style=${{ whiteSpace:'nowrap' }}>${fullName(tch)}</td>
          <td><span className="mono small" style=${{ whiteSpace:'nowrap' }}>${t.test_code}</span></td>
          <td><${StatusPill} status=${t.status}/></td>
          <td className="r num">${t.question_count}</td>
          <td className="r num">${at.length}</td>
          <td className="r num">${at.length ? fmtPct(avg(at.map(a => a.percentage))) : '—'}</td>
          <td className="r"><button className="btn sm" disabled=${!at.length} onClick=${() => navigate('/results/' + t.id)}>Natijalar</button></td></tr>`; })}</tbody></table>
        ${!list.length ? html`<${Empty} icon="search" title="Test topilmadi">Filtrlarni o'zgartirib ko'ring.<//>` : null}</div>
      <${Pager} page=${pg} pages=${pages} total=${list.length} onPage=${setPage}/>
    </div>`;
}

/* =========================================================
   pages/teacher
   ========================================================= */
function TeacherDashboard(){
  const { db, user, navigate } = useApp();
  const mine = db.tests.filter(t => t.created_by === user.id);
  const ids = mine.map(t => t.id);
  const done = db.attempts.filter(a => ids.includes(a.test_id) && a.is_completed);
  const perTest = mine.filter(t => done.some(a => a.test_id === t.id)).map(t => ({ label: t.title.split(':')[0], value: avg(done.filter(a => a.test_id === t.id).map(a => a.percentage)) }));
  const recent = done.slice().sort((a,b) => new Date(b.finished_at) - new Date(a.finished_at)).slice(0,6);
  return html`<${PageHead} title=${`Salom, ${user.first_name}!`} sub="Testlaringiz va o'quvchilaringiz natijalari"><${NewTestButton}/><//>
    <div className="tiles">
      <${Tile} icon="list" label="Mening testlarim" value=${mine.length} sub=${`${mine.filter(t => t.status === 'draft').length} ta qoralama`}/>
      <${Tile} icon="play" label="Faol testlar" value=${mine.filter(t => t.status === 'active').length} sub="O'quvchilar hozir yecha oladi"/>
      <${Tile} icon="users" label="Urinishlar" value=${done.length} sub=${`${new Set(done.map(a => a.student_id)).size} nafar o'quvchi`}/>
      <${Tile} icon="chart" label="O'rtacha natija" value=${done.length ? fmtPct(avg(done.map(a => a.percentage))) : '—'} sub="Barcha testlaringiz bo'yicha"/>
    </div>
    <div className="grid g-main">
      <div className="card"><div className="card-head"><div><h3>Faol testlar</h3><p>Kodni o'quvchilarga yuboring</p></div><button className="btn sm ghost" onClick=${() => navigate('/teacher/tests')}>Hammasi <${Icon} n="right" s=${14}/></button></div>
        ${mine.filter(t => t.status === 'active').length ? html`<div className="table-wrap"><table className="tbl"><tbody>${mine.filter(t => t.status === 'active').map(t => { const at = done.filter(a => a.test_id === t.id); return html`<tr key=${t.id}><td><div className="who"><${SubjIcon} subject=${db.subjects.find(s => s.id === t.subject_id)}/><div><b>${t.title}</b><span>${at.length} urinish · ${t.duration_minutes} daq</span></div></div></td><td><${CodeChip} code=${t.test_code}/></td><td className="r"><button className="btn sm" onClick=${() => navigate('/results/' + t.id)}>Natijalar</button></td></tr>`; })}</tbody></table></div>`
        : html`<${Empty} icon="play" title="Faol test yo'q">Qoralamani tayyorlab, "Faollashtirish" tugmasini bosing.<//>`}</div>
      <div className="card"><div className="card-head"><div><h3>Testlar bo'yicha o'rtacha</h3><p>Foiz</p></div></div><div className="card-body"><${Bars} data=${perTest} suffix="%"/></div></div>
    </div>
    <div className="card"><div className="card-head"><div><h3>So'nggi urinishlar</h3><p>Qatorni bosing — o'quvchining barcha natijalari ochiladi</p></div><button className="btn sm ghost" onClick=${() => navigate('/students')}>Barcha o'quvchilar <${Icon} n="right" s=${14}/></button></div>
      ${recent.length ? html`<div className="table-wrap"><table className="tbl compact"><thead><tr><th>O'quvchi</th><th>Test</th><th className="r">Ball</th><th className="r">Natija</th><th className="r">Tab</th><th>Sana</th></tr></thead><tbody>${recent.map(a => { const u = db.users.find(x => x.id === a.student_id), t = db.tests.find(x => x.id === a.test_id); return html`<tr key=${a.id} style=${{ cursor:'pointer' }} onClick=${() => u && navigate('/students/' + u.id)}><td><div className="who"><${Avatar} user=${u}/><b>${fullName(u)}</b></div></td><td>${t.title}</td><td className="r num">${fmtNum(a.score)}/${fmtNum(a.max_score)}</td><td className="r"><${Pill} tone=${toneFor(a.percentage)} plain>${fmtPct(a.percentage)}<//></td><td className="r num">${a.tab_switches ? html`<${Pill} tone="warn" plain>${a.tab_switches}<//>` : '0'}</td><td className="muted" style=${{ whiteSpace:'nowrap' }}>${fmtDateTime(a.finished_at)}</td></tr>`; })}</tbody></table></div>`
      : html`<${Empty} icon="users" title="Hali urinishlar yo'q"/>`}</div>`;
}

/* Yangi test: avval fan tanlanadi (Matematika, Rus tili, Ingliz tili) */
function NewTestModal({ onClose }){
  const { db, navigate } = useApp();
  return html`<${Modal} title="Qaysi fandan test tuzasiz?" onClose=${onClose}>
    <div style=${{ display:'flex', flexDirection:'column', gap:10 }}>${db.subjects.map(s => html`<button key=${s.id} type="button" className="demo-btn" style=${{ padding:'14px' }} onClick=${() => { onClose(); navigate('/teacher/tests/new?' + s.id); }}>
      <${SubjIcon} subject=${s}/><span style=${{ flex:1, minWidth:0 }}><b>${s.name}</b><span style=${{ fontFamily:'var(--f-body)' }}>${s.description || ''}</span></span><${Icon} n="right" s=${16}/></button>`)}</div>
    <p className="small muted" style=${{ textAlign:'center' }}>Fanni keyin test sozlamalarida ham o'zgartirish mumkin.</p><//>`;
}
function NewTestButton({ label, className }){
  const [open, setOpen] = useState(false);
  return html`<button className=${className || 'btn primary'} onClick=${() => setOpen(true)}><${Icon} n="plus" s=${16}/> ${label || 'Yangi test'}</button>${open ? html`<${NewTestModal} onClose=${() => setOpen(false)}/>` : null}`;
}
function TeacherTests(){
  const { db, user, navigate, run, toast } = useApp();
  const [status, setStatus] = useState('all'); const [subj, setSubj] = useState('all'); const [del, setDel] = useState(null); const [page, setPage] = useState(1);
  const all = db.tests.filter(t => t.created_by === user.id && (status === 'all' || t.status === status) && (subj === 'all' || t.subject_id === +subj)).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
  const per = 9, pages = Math.max(1, Math.ceil(all.length/per)), pg = Math.min(page, pages);
  const mine = all.slice((pg-1)*per, pg*per);
  const setSt = (t, s) => {
    if(s === 'active'){ const c = { closed:t.closed_count, written:t.written_count, total:t.question_count };
      if(isFree(t) ? !c.total : !compositionOk(c)){ toast(isFree(t) ? "Faollashtirishdan oldin kamida bitta savol qo'shing" : compositionText(c), 'warn'); return; } }
    run(() => s === 'active' ? api.activateTest(t.id) : api.completeTest(t.id), s === 'active' ? `"${t.title}" faollashtirildi — o'quvchilar yecha oladi` : `"${t.title}" yakunlandi`).catch(() => {});
  };
  return html`<${PageHead} title="Mening testlarim" sub="Matematika, Rus tili va Ingliz tili testlarini yaratish va boshqarish"><${NewTestButton}/><//>
    <div className="actions">
      <${Seg} label="Fan" value=${subj} onChange=${v => { setSubj(v); setPage(1); }} options=${[['all','Barcha fanlar'], ...db.subjects.map(s => [String(s.id), s.name])]}/>
      <${Seg} label="Holat" value=${status} onChange=${v => { setStatus(v); setPage(1); }} options=${[['all','Hammasi'],['draft','Qoralama'],['active','Faol'],['completed','Yakunlangan']]}/>
    </div>
    ${mine.length ? html`<div className="grid g3">${mine.map(t => { const s = db.subjects.find(x => x.id === t.subject_id); const qn = t.question_count; const at = db.attempts.filter(a => a.test_id === t.id && a.is_completed); return html`<div key=${t.id} className="card test-card">
      <div className="test-card-top"><${SubjIcon} subject=${s}/><div style=${{ flex:1, minWidth:0 }}><h3>${t.title}</h3><p className="small muted">${s ? s.name : ''}</p></div><${StatusPill} status=${t.status}/></div>
      <div className="meta"><span><${Icon} n="hash" s=${14}/>${isFree(t) ? `${qn} savol · erkin ball` : `${qn}/${RULE.total} savol`}</span><span><${Icon} n="clock" s=${14}/>${t.duration_minutes} daq</span><span><${Icon} n="refresh" s=${14}/>${t.max_attempts ? t.max_attempts + ' urinish' : 'Cheksiz'}</span><span><${Icon} n="users" s=${14}/>${at.length} natija</span></div>
      <${CodeChip} code=${t.test_code}/>
      <div className="test-card-foot">
        <div className="actions">
          ${t.status === 'draft' ? html`<button className="btn sm ok" onClick=${() => setSt(t,'active')}><${Icon} n="play" s=${14}/> Faollashtirish</button>` : null}
          ${t.status === 'active' ? html`<button className="btn sm" onClick=${() => setSt(t,'completed')}><${Icon} n="flag" s=${14}/> Yakunlash</button>` : null}
          ${at.length ? html`<button className="btn sm" onClick=${() => navigate('/results/' + t.id)}><${Icon} n="chart" s=${14}/> Natijalar</button>` : null}
        </div>
        <div className="actions"><button className="icon-btn" onClick=${() => navigate(`/teacher/tests/${t.id}/edit`)} aria-label=${'Tahrirlash: ' + t.title}><${Icon} n="edit" s=${16}/></button><button className="icon-btn danger" onClick=${() => setDel(t)} aria-label=${"O'chirish: " + t.title}><${Icon} n="trash" s=${16}/></button></div>
      </div></div>`; })}</div>
      <div className="card"><${Pager} page=${pg} pages=${pages} total=${all.length} per=${per} onPage=${p => { setPage(p); window.scrollTo(0, 0); }}/></div>`
    : html`<div className="card"><${Empty} icon="list" title=${subj !== 'all' ? `Sizda hali ${(db.subjects.find(s => s.id === +subj) || {}).name || ''} testi yo'q` : "Bu holatda test yo'q"}><${NewTestButton} label="Test yaratish"/><//></div>`}
    ${del ? html`<${Confirm} title="Testni o'chirish" danger okLabel="O'chirish" text=${`"${del.title}" testi, uning savollari va ${db.attempts.filter(a => a.test_id === del.id).length} ta urinish natijasi o'chiriladi.`} onClose=${() => setDel(null)} onOk=${() => run(() => api.deleteTest(del.id), "Test o'chirildi").catch(() => {})}/>` : null}`;
}

/* Savol formasi (test va savol banki uchun umumiy) */
function QuestionModal({ initial, onSave, onClose, freePoints }){
  const blank = { question_type:'single', text:'', image:null, difficulty:'medium', points:1, choices:[{ id:nid(), text:'', is_correct:true },{ id:nid(), text:'', is_correct:false },{ id:nid(), text:'', is_correct:false },{ id:nid(), text:'', is_correct:false }] };
  const [q, setQ] = useState(() => initial ? JSON.parse(JSON.stringify(initial)) : blank);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const upd = patch => { setQ(Object.assign({}, q, patch)); setErr(''); };
  const setType = t => {
    if(t === q.question_type) return;
    if(t === 'written') upd({ question_type:t, choices:[], answers: q.answers && q.answers.length ? q.answers : [''], points: Math.max(+q.points || 1, 2) });
    else if(q.question_type === 'written') upd({ question_type:t, choices: t === 'true_false' ? [{ id:nid(), text:'Rost', is_correct:true },{ id:nid(), text:"Yolg'on", is_correct:false }] : blank.choices });
    else if(t === 'true_false') upd({ question_type:t, choices:[{ id:nid(), text:'Rost', is_correct:true },{ id:nid(), text:"Yolg'on", is_correct:false }] });
    else if(q.question_type === 'true_false') upd({ question_type:t, choices:blank.choices });
    else { let found = false; upd({ question_type:t, choices: t === 'single' ? q.choices.map(c => { const keep = c.is_correct && !found; if(keep) found = true; return Object.assign({}, c, { is_correct:keep }); }) : q.choices }); }
  };
  const setChoice = (i, patch) => upd({ choices: q.choices.map((c,j) => j === i ? Object.assign({}, c, patch) : c) });
  const mark = i => {
    if(q.question_type === 'multiple') setChoice(i, { is_correct: !q.choices[i].is_correct });
    else upd({ choices: q.choices.map((c,j) => Object.assign({}, c, { is_correct: j === i })) });
  };
  const onImage = e => {
    const file = e.target.files && e.target.files[0]; if(!file) return;
    if(!file.type.startsWith('image/')){ setErr('Faqat rasm fayli (PNG, JPG, GIF) yuklang'); return; }
    if(file.size > 600*1024){ setErr(`Rasm hajmi ${Math.round(file.size/1024)} KB — prototipda 600 KB gacha ruxsat`); return; }
    const rd = new FileReader(); rd.onload = () => upd({ image: rd.result }); rd.readAsDataURL(file);
  };
  const save = () => {
    if(!q.text.trim()) return setErr('Savol matnini kiriting');
    if(isWritten(q)){
      const acc = (q.answers || []).map(s => s.trim()).filter(Boolean);
      if(!acc.length) return setErr("Kamida bitta to'g'ri javobni yozing");
      if(!(+q.points > 0)) return setErr("Ball 0 dan katta bo'lishi kerak");
      onSave(Object.assign({}, q, { id: q.id || nid(), text:q.text.trim(), points:+q.points, choices:[], answers:acc })); onClose(); return;
    }
    if(q.choices.some(c => !c.text.trim())) return setErr("Bo'sh variantlarni to'ldiring yoki o'chiring");
    if(!q.choices.some(c => c.is_correct)) return setErr("Kamida bitta to'g'ri javobni belgilang");
    if(!(+q.points > 0)) return setErr("Ball 0 dan katta bo'lishi kerak");
    onSave(Object.assign({}, q, { id: q.id || nid(), text:q.text.trim(), points:+q.points })); onClose();
  };
  const multi = q.question_type === 'multiple';
  return html`<${Modal} wide title=${initial ? 'Savolni tahrirlash' : "Yangi savol"} onClose=${onClose} footer=${html`${err ? html`<span className="field-err" style=${{ marginRight:'auto', alignSelf:'center' }}>${err}</span>` : null}<button className="btn ghost" onClick=${onClose}>Bekor qilish</button><button className="btn primary" onClick=${save}>Savolni saqlash</button>`}>
    <div className="actions" style=${{ justifyContent:'space-between' }}>
      <${Seg} label="Savol turi" value=${q.question_type} onChange=${setType} options=${Object.entries(QTYPE)}/>
      <div className="actions">
        <select id="qm-diff" className="select" style=${{ width:'auto' }} value=${q.difficulty} onChange=${e => upd({ difficulty:e.target.value })} aria-label="Qiyinlik">${Object.entries(DIFF).map(([k,v]) => html`<option key=${k} value=${k}>${v}</option>`)}</select>
        ${freePoints ? html`<label className="actions small muted" htmlFor="qm-pts">Ball <input id="qm-pts" className="input num" type="number" min="0.1" max="100" step="0.1" style=${{ width:80 }} value=${q.points} onChange=${e => upd({ points: e.target.value === '' ? '' : +e.target.value })}/></label>`
        : html`<span className="small muted" title="1–10-savollar 1,2 ball, 11–20-savollar 1,8 ball, 21–30-savollar 2 ball">Ball o'rniga qarab avtomatik</span>`}
      </div>
    </div>
    <${Field} label="Savol matni" hint="Formula uchun $ belgisi ichida LaTeX yozing: $x^2 + \\frac{1}{2}$, $\\sqrt{a}$, $\\sin\\alpha$"><textarea id="qm-text" className="textarea" value=${q.text} onChange=${e => upd({ text:e.target.value })} placeholder="masalan, $x^2 - 9 = 0$ tenglamaning ildizlarini toping"></textarea><//>
    ${q.text.includes('$') ? html`<div className="preview-box"><div className="small faint" style=${{ marginBottom:4 }}>Ko'rinishi</div><${MathText} text=${q.text}/></div>` : null}
    <div className="field"><span className="field-label">Rasm (ixtiyoriy)</span>
      ${q.image ? html`<div className="actions" style=${{ alignItems:'flex-start' }}><img className="q-img" src=${q.image} alt="Savol rasmi"/><button className="btn sm danger" onClick=${() => upd({ image:null })}><${Icon} n="trash" s=${14}/> Olib tashlash</button></div>`
      : html`<button type="button" className="drop" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} n="image" s=${24}/><span>Rasm tanlash — PNG, JPG, 600 KB gacha</span></button>`}
      <input ref=${fileRef} type="file" accept="image/*" hidden onChange=${onImage}/></div>
    ${isWritten(q) ? html`<div className="field"><span className="field-label">To'g'ri javob(lar) — o'quvchi yozgan javob shulardan biriga mos kelsa, ball beriladi</span>
      <div style=${{ display:'flex', flexDirection:'column', gap:8 }}>${(q.answers || []).map((s,i) => html`<div key=${i} className="choice-row">
        <span className="q-num" style=${{ width:26, height:26, fontSize:'.78rem', background:'var(--ok-soft)', color:'var(--ok)' }}><${Icon} n="check" s=${14}/></span>
        <input id=${'qm-a-' + i} className="input" value=${s} onChange=${e => upd({ answers: q.answers.map((x,j) => j === i ? e.target.value : x) })} placeholder=${i ? 'Muqobil yozilishi (ixtiyoriy)' : "To'g'ri javob, masalan 36"}/>
        <button className="icon-btn danger" disabled=${q.answers.length <= 1} onClick=${() => upd({ answers: q.answers.filter((_,j) => j !== i) })} aria-label="Javobni o'chirish"><${Icon} n="x" s=${16}/></button></div>`)}</div>
      ${(q.answers || []).length < 5 ? html`<button className="btn sm ghost" style=${{ alignSelf:'flex-start' }} onClick=${() => upd({ answers: (q.answers || []).concat('') })}><${Icon} n="plus" s=${14}/> Muqobil javob qo'shish</button>` : null}
      <span className="field-hint">Katta-kichik harf, ortiqcha bo'shliq, ё/е va 3,5 / 3.5 farqi hisobga olinmaydi.</span></div>` : html`
    <div className="field"><span className="field-label">${q.question_type === 'true_false' ? "To'g'ri javobni belgilang" : multi ? "Variantlar — bir nechta to'g'ri javobni belgilash mumkin" : "Variantlar — bitta to'g'ri javobni belgilang"}</span>
      <div style=${{ display:'flex', flexDirection:'column', gap:8 }}>${q.choices.map((c,i) => html`<div key=${c.id} className="choice-row">
        <input className="mark" type=${multi ? 'checkbox' : 'radio'} name="qm-correct" checked=${c.is_correct} onChange=${() => mark(i)} aria-label=${`${LETTERS[i]} variant to'g'ri`}/>
        <span className="q-num" style=${{ width:26, height:26, fontSize:'.78rem' }}>${LETTERS[i]}</span>
        <input id=${'qm-c-' + i} className="input" value=${c.text} disabled=${q.question_type === 'true_false'} onChange=${e => setChoice(i, { text:e.target.value })} placeholder=${`${LETTERS[i]} variant`}/>
        ${c.text.includes('$') ? html`<span className="small" style=${{ minWidth:60 }}><${MathText} text=${c.text}/></span>` : null}
        ${q.question_type !== 'true_false' ? html`<button className="icon-btn danger" disabled=${q.choices.length <= 2} onClick=${() => upd({ choices: q.choices.filter((_,j) => j !== i) })} aria-label=${LETTERS[i] + " variantni o'chirish"}><${Icon} n="x" s=${16}/></button>` : null}
      </div>`)}</div>
      ${q.question_type !== 'true_false' && q.choices.length < 6 ? html`<button className="btn sm ghost" style=${{ alignSelf:'flex-start' }} onClick=${() => upd({ choices: q.choices.concat({ id:nid(), text:'', is_correct:false }) })}><${Icon} n="plus" s=${14}/> Variant qo'shish</button>` : null}
    </div>`}<//>`;
}

function QuestionItem({ q, i, onEdit, onDelete, onUp, onDown }){
  return html`<div className="q-item"><span className="q-num">${i+1}</span><div className="q-main">
    <div className="actions"><${Pill} tone="accent" plain>${QTYPE[q.question_type]}<//><${Pill} plain>${fmtNum(q.points)} ball<//><${Pill} plain>${DIFF[q.difficulty]}<//>${q.image ? html`<${Pill} plain><${Icon} n="image" s=${12}/> rasm<//>` : null}</div>
    <div className="q-text"><${MathText} text=${q.text}/></div>
    ${q.image ? html`<img className="q-img" src=${q.image} alt=""/>` : null}
    <div className="q-choices">${isWritten(q) ? (q.answers || []).map((s,j) => html`<span key=${j} className="q-choice right">Javob: ${s}</span>`)
      : q.choices.map((c,j) => html`<span key=${c.id} className=${'q-choice' + (c.is_correct ? ' right' : '')}>${LETTERS[j]}) <${MathText} text=${c.text}/></span>`)}</div></div>
    ${onEdit ? html`<div className="q-tools">
      ${onUp ? html`<button className="icon-btn" onClick=${onUp} aria-label="Yuqoriga"><${Icon} n="up" s=${16}/></button>` : null}
      ${onDown ? html`<button className="icon-btn" onClick=${onDown} aria-label="Pastga"><${Icon} n="down" s=${16}/></button>` : null}
      <button className="icon-btn" onClick=${onEdit} aria-label="Tahrirlash"><${Icon} n="edit" s=${16}/></button>
      <button className="icon-btn danger" onClick=${onDelete} aria-label="O'chirish"><${Icon} n="trash" s=${16}/></button></div>` : null}
  </div>`;
}

function BankPickModal({ subjectId, onAdd, onClose }){
  const { db, user } = useApp();
  const banks = db.banks.filter(b => b.created_by === user.id || user.role === 'admin');
  const [bank, setBank] = useState(() => { const b = banks.find(x => x.subject_id === subjectId) || banks[0]; return b ? b.id : null; });
  const [sel, setSel] = useState([]);
  const qs = db.questions.filter(q => q.bank_id === bank);
  const toggle = id => setSel(sel.includes(id) ? sel.filter(x => x !== id) : sel.concat(id));
  return html`<${Modal} wide title="Savol bankidan qo'shish" onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button><button className="btn primary" disabled=${!sel.length} onClick=${() => { onAdd(db.questions.filter(q => sel.includes(q.id))); onClose(); }}>${sel.length} ta savolni qo'shish</button>`}>
    ${banks.length ? html`<${Field} label="Bank"><select id="bp-bank" className="select" value=${bank || ''} onChange=${e => { setBank(+e.target.value); setSel([]); }}>${banks.map(b => html`<option key=${b.id} value=${b.id}>${b.name} — ${(db.subjects.find(s => s.id === b.subject_id) || {}).name || ''} (${db.questions.filter(q => q.bank_id === b.id).length})</option>`)}</select><//>
      <div style=${{ display:'flex', flexDirection:'column', gap:8 }}>${qs.map(q => html`<label key=${q.id} className=${'pick-row' + (sel.includes(q.id) ? ' on' : '')}><input type="checkbox" checked=${sel.includes(q.id)} onChange=${() => toggle(q.id)}/><div style=${{ minWidth:0 }}><div><${MathText} text=${q.text}/></div><div className="small muted">${QTYPE[q.question_type]} · ${fmtNum(q.points)} ball · ${DIFF[q.difficulty]}</div></div></label>`)}
      ${!qs.length ? html`<${Empty} icon="layers" title="Bu bank bo'sh"/>` : null}</div>`
    : html`<${Empty} icon="layers" title="Sizda hali savol banki yo'q">"Savol banki" bo'limida bank yarating.<//>`}<//>`;
}

/* Excel import: 1-qator sarlavha; ustunlar: Savol | Tur | Ball | A | B | C | D | E | F | To'g'ri */
/* Bitta "Import / Export" oynasi: hamma usullar bir joyda */
function IOModal({ count, rows, onPick, onClose }){
  const { toast } = useApp();
  /* Nusxalash shu bosishning o'zida bajariladi (brauzer clipboard'ga faqat bosish paytida ruxsat beradi) */
  const copyNow = () => {
    const tsv = (rows || []).map(r => r.map(c => String(c == null ? '' : c).replace(/[\t\n]+/g, ' ')).join('\t')).join('\n');
    const ok = () => toast(count ? `${count} ta savol nusxalandi — Excel yoki Word'da Ctrl+V bosing` : "Namuna jadval nusxalandi — Excel'ga qo'yib to'ldiring, keyin \"Excel'dan\" orqali yuklang");
    try{ navigator.clipboard.writeText(tsv).then(ok, () => onPick('export', 'xlsx')); }catch(e){ onPick('export', 'xlsx'); }
  };
  const card = (key, icon, title, sub, onClick) => html`<button key=${key} type="button" className="fmt-card" onClick=${onClick}>
    <span className="actions" style=${{ gap:8 }}><${Icon} n=${icon} s=${18}/><b>${title}</b></span><span>${sub}</span></button>`;
  return html`<${Modal} wide title="Import / Export" onClose=${onClose}>
    <h4>Savollarni olib kirish</h4>
    <div className="fmt-cards">
      ${card('xl', 'upload', "Excel'dan", '.xlsx, .xls yoki .csv jadval', () => onPick('import'))}
      ${card('wd', 'file', "Word'dan", '.docx fayl: 1. Savol, A) B) C) D), Javob: B', () => onPick('word'))}
      ${card('tx', 'edit', "Matnni qo'yish", "Word, Telegram yoki istalgan joydan nusxalangan matn", () => onPick('paste'))}
    </div>
    <h4>Savollarni chiqarish <span className="muted small">· ${count ? `${count} ta savol` : "savol yo'q — namuna jadval beriladi"}</span></h4>
    <div className="fmt-cards">
      ${card('cp', 'copy', 'Nusxalash', count ? "Jadval sifatida — Excel yoki Word'ga Ctrl+V" : "Namuna jadvalni nusxalash", copyNow)}
      ${card('dx', 'download', 'Excel / Word yuklab olish', '.xlsx yoki .docx fayl', () => onPick('export', 'xlsx'))}
      ${card('pd', 'download', 'PDF yuklab olish', 'Chop etish uchun varaqa', () => onPick('export', 'pdf'))}
    </div><//>`;
}

/* Word/matn formatidagi testni o'qish:
   1. Savol matni          (raqam bilan boshlanadi)
   A) variant  B) variant* (to'g'ri variant oxirida * yoki +)
   Javob: B   yoki  Javob: A, C   yoki yozma savol uchun  Javob: 36 */
const ANS_RE = /^\s*(javob|to'?g'?ri javob|to‘g‘ri javob|ответ|answer|key)\s*[:\-–]\s*(.+)$/i;
const OPT_RE = /^\s*([A-Fa-fАБВГДЕабвгде])\s*[).]\s*(.+)$/;
const CYR_LET = { 'А':'A','Б':'B','В':'C','Г':'D','Д':'E','Е':'F' };
function parseQuestionText(text){
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = []; let cur = null;
  lines.forEach(raw => {
    const line = raw.replace(/ /g, ' ').trim(); if(!line) return;
    const qm = line.match(/^\s*(\d+)\s*[.)]\s*(.+)$/);
    const om = line.match(OPT_RE), am = line.match(ANS_RE);
    if(qm){ cur = { text: qm[2], opts: [], ans: null }; blocks.push(cur); }
    else if(!cur) { cur = { text: line, opts: [], ans: null }; blocks.push(cur); }
    else if(am) cur.ans = am[2].trim();
    else if(om) cur.opts.push(om[2].trim());
    else if(!cur.opts.length) cur.text += ' ' + line;
    else cur.opts[cur.opts.length - 1] += ' ' + line;
  });
  return blocks.map((b, i) => {
    const marked = b.opts.map(o => /[*+]\s*$|^\s*[*+]/.test(o));
    const opts = b.opts.map(o => o.replace(/^\s*[*+]\s*|\s*[*+]\s*$/g, '').trim());
    let letters = [];
    if(b.ans && opts.length) letters = b.ans.toUpperCase().split(/[,;\s]+/).map(x => CYR_LET[x] || x).filter(x => /^[A-F]$/.test(x));
    const id = nid();
    if(!opts.length){
      const acc = b.ans ? b.ans.split(/[;|]/).map(s => s.trim()).filter(Boolean) : [];
      return { row:i+1, problem: acc.length ? null : "variant ham, javob ham yo'q", q:{ id, question_type:'written', text:b.text, image:null, difficulty:'medium', points:2, choices:[], answers:acc } };
    }
    const choices = opts.map((t, j) => ({ id:nid(), text:t, is_correct: letters.length ? letters.includes(LETTERS[j]) : marked[j] }));
    const nRight = choices.filter(c => c.is_correct).length;
    const problem = choices.length < 2 ? 'kamida 2 ta variant kerak' : !nRight ? "to'g'ri javob ko'rsatilmagan (Javob: B yoki variant oxirida *)" : null;
    return { row:i+1, problem, q:{ id, question_type: nRight > 1 ? 'multiple' : 'single', text:b.text, image:null, difficulty:'medium', points:1, choices } };
  });
}
/* .docx ichidan matnni olish (docx = zip; SheetJS'ning CFB moduli zip'ni o'qiydi) */
function docxToText(buf){
  const cfb = XLSX.CFB.read(new Uint8Array(buf), { type:'array' });
  const entry = XLSX.CFB.find(cfb, 'word/document.xml') || XLSX.CFB.find(cfb, '/word/document.xml');
  if(!entry) throw new Error('document.xml topilmadi');
  const xml = new TextDecoder('utf-8').decode(entry.content);
  /* Jadval: katak → Tab, qator → yangi qator (har katak ichidagi paragraf yangi qator bo'lib ketmasin) */
  const txt = xml.replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>').replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n')
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/\t+\n/g, '\n');
  const el = document.createElement('textarea'); el.innerHTML = txt; return el.value;
}
function TextImportModal({ mode, onAdd, onClose }){
  const [text, setText] = useState(''); const [rows, setRows] = useState(null); const [err, setErr] = useState(''); const [fname, setFname] = useState('');
  const fileRef = useRef(null);
  const onFile = e => {
    const file = e.target.files && e.target.files[0]; if(!file) return; setFname(file.name); setErr('');
    if(!/\.docx$/i.test(file.name)) return setErr("Faqat .docx fayl. Eski .doc bo'lsa, Word'da \"Boshqacha saqlash → .docx\" qiling yoki matnni nusxalab qo'ying.");
    const rd = new FileReader();
    rd.onload = () => { try{ const t = docxToText(rd.result); setText(t); setRows(parseQuestionText(t)); }catch(ex){ setErr("Word faylni o'qib bo'lmadi. Matnni nusxalab \"Matnni qo'yish\" orqali kiriting."); } };
    rd.readAsArrayBuffer(file);
  };
  const good = rows ? rows.filter(r => !r.problem) : [];
  const sample = "1. 2 + 2 nechaga teng?\nA) 3\nB) 4\nC) 5\nJavob: B\n\n2. Tub sonlarni belgilang\nA) 2*\nB) 4\nC) 7*\nD) 9\n\n3. 12 × 3 ni hisoblang\nJavob: 36";
  return html`<${Modal} wide title=${mode === 'word' ? "Savollarni Word'dan olish" : "Savollarni matndan olish"} onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button>
      ${rows ? html`<button className="btn" onClick=${() => setRows(null)}>Orqaga</button><button className="btn primary" disabled=${!good.length} onClick=${() => { onAdd(good.map(r => r.q)); onClose(); }}>${good.length} ta savolni qo'shish</button>`
      : mode === 'word' ? html`<button className="btn primary" onClick=${() => fileRef.current && fileRef.current.click()}>Fayl tanlash</button>`
      : html`<button className="btn primary" onClick=${() => { if(!text.trim()) return setErr("Matnni kiriting"); setRows(parseQuestionText(text)); }}>Tekshirish</button>`}`}>
    ${rows ? html`
      <b className="small">${rows.length} ta savol topildi: ${good.length} tasi tayyor${rows.length - good.length ? `, ${rows.length - good.length} tasida xato (qo'shilmaydi)` : ''}</b>
      <div style=${{ display:'flex', flexDirection:'column', gap:6, maxHeight:360, overflow:'auto' }}>${rows.map(r => html`<div key=${r.row} className=${'pick-row' + (r.problem ? '' : ' on')} style=${{ cursor:'default' }}><span className="mono small faint">${r.row}</span><div style=${{ minWidth:0, flex:1 }}><${MathText} text=${r.q.text}/>
        <div className="small muted">${QTYPE[r.q.question_type]} · ${isWritten(r.q) ? 'javob: ' + (r.q.answers.join(' / ') || '—') : r.q.choices.map((c,j) => (c.is_correct ? '✓' : '') + LETTERS[j] + ') ' + c.text).join('  ')}</div></div>
        ${r.problem ? html`<${Pill} tone="bad" plain>${r.problem}<//>` : html`<${Pill} tone="ok" plain>tayyor<//>`}</div>`)}</div>`
    : html`
      ${mode === 'word' ? html`<button type="button" className="drop" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} n="file" s=${24}/><span>${fname || '.docx fayl tanlash'}</span></button>`
        : html`<${Field} label="Testni shu yerga qo'ying"><textarea id="ti-text" className="textarea mono" style=${{ minHeight:200, fontSize:'.85rem' }} value=${text} onChange=${e => { setText(e.target.value); setErr(''); }} placeholder=${sample}></textarea><//>`}
      <input ref=${fileRef} type="file" accept=".docx" hidden onChange=${onFile}/>
      <div className="banner info small"><${Icon} n="info" s=${16}/><div><b>Format:</b> har savol raqam bilan boshlanadi (<span className="mono">1.</span>), variantlar <span className="mono">A)</span> <span className="mono">B)</span>… (kirill <span className="mono">А) Б)</span> ham bo'ladi). To'g'ri javob — <span className="mono">Javob: B</span> qatori yoki variant oxiridagi <span className="mono">*</span>. Bir nechta to'g'ri bo'lsa: <span className="mono">Javob: A, C</span>. Variantsiz savol + <span className="mono">Javob: 36</span> — yozma savol bo'ladi.</div></div>`}
    ${err ? html`<div className="banner bad"><${Icon} n="alert"/>${err}</div>` : null}<//>`;
}

function ImportModal({ onAdd, onClose }){
  const [rows, setRows] = useState(null); const [err, setErr] = useState(''); const [name, setName] = useState('');
  const fileRef = useRef(null);
  const parse = e => {
    const file = e.target.files && e.target.files[0]; if(!file) return;
    setName(file.name); setErr('');
    const rd = new FileReader();
    rd.onload = () => {
      try{
        const wb = XLSX.read(new Uint8Array(rd.result), { type:'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' }).slice(1).filter(r => String(r[0]).trim());
        setRows(data.map((r, idx) => {
          const typeRaw = String(r[1]).trim().toLowerCase();
          const type = /yozma|written|ochiq|text/.test(typeRaw) ? 'written' : /multi|ko'p|kop/.test(typeRaw) ? 'multiple' : /true|rost|false|tf/.test(typeRaw) ? 'true_false' : 'single';
          const ans = String(r[9]).toUpperCase().replace(/\s/g,'').split(/[,;]/).filter(Boolean);
          const id = nid();
          if(type === 'written'){
            const acc = String(r[9]).split(/[;|]/).map(s => s.trim()).filter(Boolean);
            return { row: idx+2, problem: acc.length ? null : "to'g'ri javob yozilmagan", q:{ id, question_type:type, text:String(r[0]).trim(), image:null, difficulty:'medium', points: Math.max(1, parseInt(r[2],10) || 2), choices:[], answers:acc } };
          }
          let choices;
          if(type === 'true_false'){ const t = /ROST|TRUE|^A$/.test(ans[0] || ''); choices = [{ id:nid(), text:'Rost', is_correct:t },{ id:nid(), text:"Yolg'on", is_correct:!t }]; }
          else choices = r.slice(3,9).map((c,i) => ({ id:nid(), text:String(c).trim(), is_correct: ans.includes(LETTERS[i]) })).filter(c => c.text);
          const problem = choices.length < 2 ? 'kamida 2 ta variant kerak' : !choices.some(c => c.is_correct) ? "to'g'ri javob ko'rsatilmagan" : (type === 'single' && choices.filter(c => c.is_correct).length > 1) ? "bitta javobli savolda bir nechta to'g'ri javob" : null;
          return { row: idx+2, problem, q:{ id, question_type:type, text:String(r[0]).trim(), image:null, difficulty:'medium', points: Math.max(1, parseInt(r[2],10) || 1), choices } };
        }));
      }catch(ex){ setErr("Faylni o'qib bo'lmadi. .xlsx yoki .csv formatidagi jadval yuklang."); }
    };
    rd.readAsArrayBuffer(file);
  };
  const good = rows ? rows.filter(r => !r.problem) : [];
  return html`<${Modal} wide title="Savollarni Excel'dan import qilish" onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button><button className="btn primary" disabled=${!good.length} onClick=${() => { onAdd(good.map(r => r.q)); onClose(); }}>${good.length} ta savolni qo'shish</button>`}>
    <p className="muted small">Jadvalning birinchi varag'i o'qiladi. Birinchi qator — sarlavha. Ustunlar tartibi:</p>
    <div className="table-wrap card"><table className="tbl template"><thead><tr><th>Savol</th><th>Tur</th><th>Ball</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th><th>To'g'ri</th></tr></thead>
      <tbody><tr><td>$2+2$ nechaga teng?</td><td>single</td><td>1</td><td>3</td><td>4</td><td>5</td><td></td><td></td><td></td><td>B</td></tr>
      <tr><td>Tub sonlarni belgilang</td><td>multiple</td><td>2</td><td>2</td><td>4</td><td>7</td><td>9</td><td></td><td></td><td>A,C</td></tr>
      <tr><td>Yer — sayyora</td><td>true_false</td><td>1</td><td></td><td></td><td></td><td></td><td></td><td></td><td>Rost</td></tr>
      <tr><td>12 × 3 ni hisoblang</td><td>yozma</td><td>2</td><td></td><td></td><td></td><td></td><td></td><td></td><td>36</td></tr></tbody></table></div>
    <p className="small muted">Yozma savolda variant ustunlari bo'sh qoladi. Bir nechta to'g'ri yozilishi bo'lsa, ";" bilan ajrating: <span className="mono">went; Went</span></p>
    <button type="button" className="drop" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} n="upload" s=${24}/><span>${name || 'Fayl tanlash — .xlsx, .xls yoki .csv'}</span></button>
    <input ref=${fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange=${parse}/>
    ${err ? html`<div className="banner bad"><${Icon} n="alert"/>${err}</div>` : null}
    ${rows ? html`<div style=${{ display:'flex', flexDirection:'column', gap:6 }}>
      <b className="small">${rows.length} ta qator o'qildi: ${good.length} tasi tayyor${rows.length - good.length ? `, ${rows.length - good.length} tasida xato` : ''}</b>
      ${rows.map(r => html`<div key=${r.row} className=${'pick-row' + (r.problem ? '' : ' on')} style=${{ cursor:'default' }}><span className="mono small faint">${r.row}</span><div style=${{ minWidth:0, flex:1 }}><${MathText} text=${r.q.text}/><div className="small muted">${QTYPE[r.q.question_type]}${isWritten(r.q) ? ` · javob: ${(r.q.answers || []).join(' / ')}` : ` · ${r.q.choices.length} variant`}</div></div>${r.problem ? html`<${Pill} tone="bad" plain>${r.problem}<//>` : html`<${Pill} tone="ok" plain>tayyor<//>`}</div>`)}
    </div>` : null}<//>`;
}

/* Eksport: prototipda jadval nusxalanadi (Excel/Word'ga qo'yish uchun); fayl yuklash backend bilan */
function ExportModal({ title, formats, endpoint, rows, onClose, initialFmt, fileBase }){
  const { toast } = useApp();
  const [fmt, setFmt] = useState(initialFmt && formats.some(f => f[0] === initialFmt) ? initialFmt : formats[0][0]);
  const [busy, setBusy] = useState(false);
  /* Fayl serverda tayyorlanadi (GET endpoint?format=xlsx|docx|pdf) va brauzerga yuklanadi */
  const get = () => { setBusy(true); download(endpoint, { format:fmt }, `${fileBase || 'bm-examer'}.${fmt}`).then(() => toast(`${fmt.toUpperCase()} fayl yuklab olindi`)).catch(e => toast(errText(e, "Faylni yuklab bo'lmadi"), 'bad')).finally(() => setBusy(false)); };
  const tsv = (rows || []).map(r => r.map(c => String(c == null ? '' : c).replace(/[\t\n]+/g, ' ')).join('\t')).join('\n');
  const copy = () => {
    try{ navigator.clipboard.writeText(tsv).then(() => toast(`${rows.length - 1} qator nusxalandi — Excel yoki Word'da Ctrl+V bosing`), () => toast("Nusxalab bo'lmadi — brauzer ruxsat bermadi", 'warn')); }
    catch(e){ toast("Nusxalab bo'lmadi — brauzer ruxsat bermadi", 'warn'); }
  };
  return html`<${Modal} wide title=${title} onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Yopish</button>${rows ? html`<button className=${'btn' + (endpoint ? '' : ' primary')} onClick=${copy}><${Icon} n="copy" s=${16}/> Jadvalni nusxalash</button>` : null}${endpoint ? html`<button className="btn primary" disabled=${busy} onClick=${get}><${Icon} n="download" s=${16}/> ${busy ? 'Tayyorlanmoqda…' : `${fmt.toUpperCase()} yuklab olish`}</button>` : null}`}>
    <div className="fmt-cards">${formats.map(([k,l,d]) => html`<button type="button" key=${k} className=${'fmt-card' + (fmt === k ? ' on' : '')} onClick=${() => setFmt(k)}><b>${l}</b><span>${d}</span></button>`)}</div>
    ${rows ? html`<div className="card table-wrap" style=${{ maxHeight:260, overflow:'auto' }}><table className="tbl compact"><thead><tr>${rows[0].map((h,i) => html`<th key=${i}>${h}</th>`)}</tr></thead>
      <tbody>${rows.slice(1, 9).map((r,i) => html`<tr key=${i}>${r.map((c,j) => html`<td key=${j} style=${{ whiteSpace:'nowrap', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis' }}>${c}</td>`)}</tr>`)}</tbody></table></div>
      ${rows.length > 9 ? html`<span className="small muted">Ko'rinishda 8 ta qator, nusxada hammasi: ${rows.length - 1} ta.</span>` : null}` : null}
    <div className="banner info"><${Icon} n="info"/><div>${endpoint ? html`<b>"${fmt.toUpperCase()} yuklab olish"</b> — fayl kompyuteringizga saqlanadi. Yoki "Jadvalni nusxalash" bosib, Excel/Word'ga Ctrl+V bilan qo'ying.` : html`Test hali saqlanmagan — namunani nusxalab Excel'ga qo'ying. Saqlangandan keyin fayl sifatida yuklab olish mumkin.`}</div></div><//>`;
}

function TestEditor({ id, subjectId }){
  const { db, run, navigate, toast } = useApp();
  const [saving, setSaving] = useState(false);
  const existing = id ? db.tests.find(t => t.id === id) : null;
  const [form, setForm] = useState(() => existing ? Object.assign({}, existing) : { title:'', description:'', subject_id: (db.subjects.find(s => s.id === subjectId) || db.subjects[0] || {}).id, duration_minutes:30, difficulty:'medium', status:'draft', shuffle_questions:true, shuffle_choices:true, max_attempts:1, show_results:'detailed', strict_mode:true, scoring:'standard', test_code:genCode() });
  const [qs, setQsRaw] = useState(() => existing ? arrangeFor(existing.scoring, db.questions.filter(q => q.test_id === id).sort((a,b) => a.order - b.order)) : []);
  const setQs = list => setQsRaw(arrangeFor(form.scoring, list));
  const free = form.scoring === 'free';
  const setScoring = v => { setForm(Object.assign({}, form, { scoring:v })); setQsRaw(arrangeFor(v, qs)); };
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState({});
  const initial = useRef(JSON.stringify([form, qs]));
  const dirty = JSON.stringify([form, qs]) !== initial.current;
  if(id && !existing) return html`<div className="card"><${Empty} icon="alert" title="Test topilmadi"><button className="btn" onClick=${() => navigate('/teacher/tests')}>Testlarimga qaytish</button><//></div>`;
  const attemptsN = existing ? db.attempts.filter(a => a.test_id === id).length : 0;
  const set = (k, v) => { setForm(Object.assign({}, form, { [k]: v })); setErr(Object.assign({}, err, { [k]: null })); };
  const total = qs.reduce((s,q) => s + (+q.points || 0), 0);
  const comp = composition(qs);
  /* Eksport jadvali; savol bo'lmasa — import uchun to'ldiriladigan namuna */
  const EXPORT_HEAD = ['Savol', 'Tur', 'Ball', 'A', 'B', 'C', 'D', 'E', 'F', "To'g'ri"];
  const exportRows = qs.length
    ? [EXPORT_HEAD, ...qs.map(q => [q.text, isWritten(q) ? 'yozma' : q.question_type, fmtNum(q.points), ...[0,1,2,3,4,5].map(j => q.choices[j] ? q.choices[j].text : ''), isWritten(q) ? (q.answers || []).join('; ') : q.choices.map((c,j) => c.is_correct ? LETTERS[j] : null).filter(Boolean).join(',')])]
    : [EXPORT_HEAD, ['2 + 2 nechaga teng?', 'single', '1', '3', '4', '5', '', '', '', 'B'], ['Tub sonlarni belgilang', 'multiple', '1', '2', '4', '7', '9', '', '', 'A,C'], ['12 × 3 ni hisoblang', 'yozma', '2', '', '', '', '', '', '', '36']];
  const upsertQ = q => setQs(qs.some(x => x.id === q.id) ? qs.map(x => x.id === q.id ? q : x) : qs.concat(q));
  const move = (i, d) => { const a = qs.slice(); [a[i], a[i+d]] = [a[i+d], a[i]]; setQs(a); };
  const copyIn = list => { setQs(qs.concat(list.map(q => Object.assign(JSON.parse(JSON.stringify(q)), { id:nid(), bank_id:null, choices: q.choices.map(c => Object.assign({}, c, { id:nid() })) })))); toast(`${list.length} ta savol qo'shildi`); };
  const save = () => {
    const er = {};
    if(!form.title.trim()) er.title = 'Test nomini kiriting';
    if(!(form.duration_minutes >= 1)) er.duration_minutes = 'Kamida 1 daqiqa';
    if(form.max_attempts === '' || form.max_attempts < 0) er.max_attempts = "0 yoki undan katta son kiriting";
    setErr(er); if(Object.keys(er).length){ toast("Formadagi xatolarni tuzating", 'warn'); return; }
    const data = { title:form.title.trim(), description:form.description || '', subject_id:+form.subject_id, test_code:form.test_code, duration_minutes:+form.duration_minutes, difficulty:form.difficulty,
      shuffle_questions:!!form.shuffle_questions, shuffle_choices:!!form.shuffle_choices, max_attempts:+form.max_attempts, show_results:form.show_results, strict_mode:form.strict_mode !== false, scoring:form.scoring || 'standard' };
    /* Serverga: avval test sozlamalari, keyin savollar ro'yxati (to'liq almashtiriladi). Yangi savollarning vaqtinchalik id'si server tomonida e'tiborsiz qoldiriladi. */
    const payload = qs.map((q, i) => ({ id:q.id, question_type:q.question_type, text:q.text, image:q.image || null, difficulty:q.difficulty || 'medium', points:+q.points || 1, order:i,
      answers: isWritten(q) ? (q.answers || []) : [], choices: isWritten(q) ? [] : q.choices.map(c => ({ id:c.id, text:c.text, is_correct:!!c.is_correct })) }));
    setSaving(true);
    run(async () => { const t = await api.saveTest(existing ? existing.id : null, data); const saved = await api.setQuestions(t.id, payload); return { t, saved }; },
        existing ? 'Test saqlandi' : `Test yaratildi — kodi ${data.test_code}`)
      .then(({ t, saved }) => {
        const nq = arrangeFor(t.scoring, saved.sort((a,b) => a.order - b.order));
        const nf = Object.assign({}, form, t);
        initial.current = JSON.stringify([nf, nq]); setForm(nf); setQsRaw(nq);
        if(!existing) navigate(`/teacher/tests/${t.id}/edit`, true);
      })
      .catch(ex => { const d = ex.response && ex.response.data; if(d && typeof d === 'object' && !d.errors && !d.detail){ const o = {}; Object.keys(d).forEach(k => { o[k] = String([].concat(d[k])[0]); }); setErr(o); } })
      .finally(() => setSaving(false));
  };
  return html`<${PageHead} title=${existing ? 'Testni tahrirlash' : 'Yangi test'} sub=${existing ? html`<span>${existing.title} · <${StatusPill} status=${existing.status}/></span>` : "Sozlamalarni kiriting va savollarni qo'shing"}>
      ${dirty ? html`<span className="small" style=${{ color:'var(--warn)' }}>Saqlanmagan o'zgarishlar bor</span>` : null}
      <button className="btn ghost" onClick=${() => navigate('/teacher/tests')}>Orqaga</button>
      <button className="btn primary" onClick=${save} disabled=${saving}><${Icon} n="check" s=${16}/> ${saving ? 'Saqlanmoqda…' : 'Saqlash'}</button><//>
    ${!free && !compositionOk(comp) ? html`<div className="banner warn"><${Icon} n="alert"/><div><b>${compositionText(comp)}.</b> Har bir test ${RULE.total} ta savoldan iborat: ${RULE.closed} tasi A, B, C, D variantli va ${RULE.written} tasi yozma javobli. Qoralamani istalgan holatda saqlash mumkin.</div></div>` : null}
    ${free ? html`<div className="banner info small"><${Icon} n="info" s=${16}/><div><b>Erkin ball tizimi:</b> har bir savolning balini o'zingiz qo'yasiz, savollar soni va turi cheklanmaydi. Jami: <b>${fmtNum(total)} ball</b>.</div></div>`
    : html`<div className="banner info small"><${Icon} n="info" s=${16}/><div>Ball avtomatik (jami ${MAX_SCORE}): <b>1–10-savollar ${fmtNum(BLOCKS[0].points)}</b>, <b>11–20-savollar ${fmtNum(BLOCKS[1].points)}</b>, <b>21–30-savollar (yozma) ${fmtNum(BLOCKS[2].points)}</b> balldan. Variantli savollar doim birinchi 20 ta o'rinda, yozmalar oxirgi 10 tada turadi.</div></div>`}
    ${attemptsN ? html`<div className="banner warn"><${Icon} n="alert"/><div>Bu testda ${attemptsN} ta urinish bor. Savollarni o'zgartirsangiz, eski natijalar tahlili yangi savollarga mos kelmasligi mumkin.</div></div>` : null}
    <div className="grid g-main" style=${{ alignItems:'start' }}>
      <div className="card">
        <div className="card-head"><div><h3>Savollar</h3><div className="actions" style=${{ marginTop:6 }}>
            ${free ? html`<${Pill} plain>Variantli: ${comp.closed}<//><${Pill} plain>Yozma: ${comp.written}<//><${Pill} tone="accent" plain>Jami: ${comp.total} savol · ${fmtNum(total)} ball<//>`
            : html`<${Pill} tone=${comp.closed === RULE.closed ? 'ok' : 'warn'} plain>Variantli: ${comp.closed}/${RULE.closed}<//>
            <${Pill} tone=${comp.written === RULE.written ? 'ok' : 'warn'} plain>Yozma: ${comp.written}/${RULE.written}<//>
            <${Pill} plain>Jami: ${comp.total}/${RULE.total} · ${fmtNum(total)} ball<//>`}</div></div>
          <div className="actions">
            <button className="btn sm" onClick=${() => setModal({ t:'io' })}><${Icon} n="file" s=${14}/> Import / Export</button>
            <button className="btn sm" onClick=${() => setModal({ t:'bank' })}><${Icon} n="layers" s=${14}/> Bankdan</button>
            <button className="btn sm primary" onClick=${() => setModal({ t:'q' })}><${Icon} n="plus" s=${14}/> Savol qo'shish</button>
          </div></div>
        ${qs.length ? qs.map((q,i) => html`<${QuestionItem} key=${q.id} q=${q} i=${i} onEdit=${() => setModal({ t:'q', q })} onDelete=${() => setQs(qs.filter(x => x.id !== q.id))} onUp=${i > 0 ? () => move(i,-1) : null} onDown=${i < qs.length-1 ? () => move(i,1) : null}/>`)
        : html`<${Empty} icon="hash" title="Hali savol yo'q">Savolni qo'lda yozing, bankdan tanlang yoki Excel fayldan import qiling.<//>`}
      </div>
      <div style=${{ display:'flex', flexDirection:'column', gap:16 }}>
        <div className="card card-body" style=${{ display:'flex', flexDirection:'column', gap:14 }}>
          <h3>Asosiy ma'lumotlar</h3>
          <${Field} label="Test nomi" error=${err.title}><input id="te-title" className="input" value=${form.title} onChange=${e => set('title', e.target.value)} placeholder="masalan, Algebra: kvadrat tenglamalar"/><//>
          <${Field} label="Tavsif"><textarea id="te-desc" className="textarea" style=${{ minHeight:70 }} value=${form.description} onChange=${e => set('description', e.target.value)}></textarea><//>
          <div className="form-grid">
            <div className="field span2"><span className="field-label">Fan</span><${Seg} label="Fan" value=${+form.subject_id} onChange=${v => set('subject_id', v)} options=${db.subjects.map(s => [s.id, s.name])}/></div>
            <${Field} label="Qiyinlik"><select id="te-diff" className="select" value=${form.difficulty} onChange=${e => set('difficulty', e.target.value)}>${Object.entries(DIFF).map(([k,v]) => html`<option key=${k} value=${k}>${v}</option>`)}</select><//>
            <${Field} label="Davomiyligi (daqiqa)" error=${err.duration_minutes}><input id="te-dur" className="input num" type="number" min="1" max="300" value=${form.duration_minutes} onChange=${e => set('duration_minutes', e.target.value === '' ? '' : +e.target.value)}/><//>
            <${Field} label="Urinishlar soni" hint="0 — cheksiz" error=${err.max_attempts}><input id="te-att" className="input num" type="number" min="0" max="20" value=${form.max_attempts} onChange=${e => set('max_attempts', e.target.value === '' ? '' : +e.target.value)}/><//>
          </div>
          <div className="field"><span className="field-label">Test kodi</span><div className="actions"><${CodeChip} code=${form.test_code}/>${!existing ? html`<button className="btn sm ghost" onClick=${() => set('test_code', genCode())}><${Icon} n="refresh" s=${14}/> Yangi kod</button>` : null}</div><span className="field-hint">O'quvchilar shu kod orqali testga kiradi</span></div>
        </div>
        <div className="card card-body" style=${{ display:'flex', flexDirection:'column', gap:10 }}>
          <h3>Ball tizimi</h3>
          <div className="radio-cards" role="radiogroup">${[['standard', `${MAX_SCORE} ballik standart`, `30 savol: 20 variantli + 10 yozma; ball o'rniga qarab (${fmtNum(BLOCKS[0].points)} / ${fmtNum(BLOCKS[1].points)} / ${fmtNum(BLOCKS[2].points)})`], ['free', 'Erkin', "Har savolga ballni o'zingiz qo'yasiz, savollar soni cheklanmaydi"]].map(([k,l,d]) => html`<label key=${k} className=${'radio-card' + ((form.scoring || 'standard') === k ? ' on' : '')}><input type="radio" name="te-scoring" checked=${(form.scoring || 'standard') === k} onChange=${() => setScoring(k)}/><span><b>${l}</b><span>${d}</span></span></label>`)}</div>
        </div>
        <div className="card card-body" style=${{ display:'flex', flexDirection:'column', gap:10 }}>
          <h3>Anti-cheating</h3>
          <${Switch} id="te-shq" checked=${form.shuffle_questions} onChange=${v => set('shuffle_questions', v)} title="Savollarni aralashtirish" sub=${free ? "Har bir o'quvchida savollar tartibi har xil" : "Har bir 10 talik ichida aralashadi — ball o'zgarmaydi"}/>
          <${Switch} id="te-shc" checked=${form.shuffle_choices} onChange=${v => set('shuffle_choices', v)} title="Variantlarni aralashtirish" sub="A, B, C, D tartibi o'zgaradi"/>
          <${Switch} id="te-strict" checked=${form.strict_mode !== false} onChange=${v => set('strict_mode', v)} title="Qat'iy rejim" sub=${`${MAX_WARNINGS} ta ogohlantirish, keyingi qoidabuzarlikda test avtomatik topshiriladi`}/>
          <div className="banner info small"><${Icon} n="eye" s=${16}/><div>${form.strict_mode !== false ? `Yoqilgan: tab/oyna almashtirish, nusxa olish, ekran rasmi va to'liq ekrandan chiqish — ogohlantirish. ${MAX_WARNINGS + 1}-marta bo'lsa, test topshiriladi va faqat ishlangan javoblar hisoblanadi. Ekran rasmi olinmoqchi bo'lsa ekran qorayadi.` : "O'chirilgan: qoidabuzarliklar faqat sanaladi va natijalarda ko'rsatiladi."}</div></div>
        </div>
        <div className="card card-body" style=${{ display:'flex', flexDirection:'column', gap:10 }}>
          <h3>Natijani ko'rsatish</h3>
          <div className="radio-cards" role="radiogroup">${Object.entries(SHOW).map(([k,[l,d]]) => html`<label key=${k} className=${'radio-card' + (form.show_results === k ? ' on' : '')}><input type="radio" name="te-show" checked=${form.show_results === k} onChange=${() => set('show_results', k)}/><span><b>${l}</b><span>${d}</span></span></label>`)}</div>
        </div>
      </div>
    </div>
    ${modal && modal.t === 'q' ? html`<${QuestionModal} freePoints=${free} initial=${modal.q} onSave=${upsertQ} onClose=${() => setModal(null)}/>` : null}
    ${modal && modal.t === 'bank' ? html`<${BankPickModal} subjectId=${+form.subject_id} onAdd=${copyIn} onClose=${() => setModal(null)}/>` : null}
    ${modal && modal.t === 'io' ? html`<${IOModal} count=${qs.length} rows=${exportRows} onPick=${(t, fmt) => setModal({ t, fmt })} onClose=${() => setModal(null)}/>` : null}
    ${modal && modal.t === 'import' ? html`<${ImportModal} onAdd=${copyIn} onClose=${() => setModal(null)}/>` : null}
    ${modal && (modal.t === 'word' || modal.t === 'paste') ? html`<${TextImportModal} mode=${modal.t} onAdd=${copyIn} onClose=${() => setModal(null)}/>` : null}
    ${modal && modal.t === 'export' ? html`<${ExportModal} title=${qs.length ? 'Savollarni export qilish' : "Namuna jadval (savollar hali yo'q)"} initialFmt=${modal.fmt} endpoint=${existing && qs.length ? `/tests/${existing.id}/export-questions/` : null} fileBase=${existing ? `${existing.test_code}-savollar` : 'namuna'} formats=${[['xlsx','Excel','Qayta import qilish mumkin'],['docx','Word',"Tahrirlanadigan varaqa"],['pdf','PDF','Chop etish uchun']]}
      rows=${exportRows} onClose=${() => setModal(null)}/>` : null}`;
}

function QuestionBankPage(){
  const { db, user, run } = useApp();
  const banks = db.banks.filter(b => b.created_by === user.id);
  const [cur, setCur] = useState(banks[0] ? banks[0].id : null);
  const [modal, setModal] = useState(null);
  const bank = db.banks.find(b => b.id === cur);
  const qs = db.questions.filter(q => q.bank_id === cur);
  const saveQ = q => {
    const isOld = db.questions.some(x => x.id === q.id && x.bank_id === cur);
    const data = { bank_id:cur, question_type:q.question_type, text:q.text, image:q.image || null, difficulty:q.difficulty || 'medium', points:+q.points || 1,
      answers: isWritten(q) ? (q.answers || []) : [], choices: isWritten(q) ? [] : q.choices.map(c => ({ id:c.id, text:c.text, is_correct:!!c.is_correct })) };
    run(() => api.saveBankQuestion(isOld ? q.id : null, data), 'Savol bankka saqlandi').catch(() => {});
  };
  return html`<${PageHead} title="Savol banki" sub="Qayta ishlatiladigan savollar to'plami — testga bir bosishda qo'shiladi"><button className="btn primary" onClick=${() => setModal({ t:'bank' })}><${Icon} n="plus" s=${16}/> Yangi bank</button><//>
    <div className="grid" style=${{ gridTemplateColumns:'minmax(0,280px) minmax(0,1fr)', alignItems:'start' }}>
      <div className="card bank-list">${banks.length ? banks.map(b => { const s = db.subjects.find(x => x.id === b.subject_id); return html`<button key=${b.id} className=${cur === b.id ? 'on' : ''} onClick=${() => setCur(b.id)}><${SubjIcon} subject=${s}/><span style=${{ minWidth:0, flex:1 }}><b style=${{ display:'block', fontWeight:500 }}>${b.name}</b><span className="small muted">${s ? s.name : ''} · ${db.questions.filter(q => q.bank_id === b.id).length} savol</span></span></button>`; })
        : html`<${Empty} icon="layers" title="Bank yo'q">Birinchi bankni yarating.<//>`}</div>
      <div className="card">${bank ? html`
        <div className="card-head"><div><h3>${bank.name}</h3><p>${qs.length} ta savol</p></div><div className="actions">
          <button className="btn sm danger" onClick=${() => setModal({ t:'del' })}><${Icon} n="trash" s=${14}/> Bankni o'chirish</button>
          <button className="btn sm primary" onClick=${() => setModal({ t:'q' })}><${Icon} n="plus" s=${14}/> Savol qo'shish</button></div></div>
        ${qs.length ? qs.map((q,i) => html`<${QuestionItem} key=${q.id} q=${q} i=${i} onEdit=${() => setModal({ t:'q', q })} onDelete=${() => run(() => api.deleteBankQuestion(q.id), "Savol o'chirildi").catch(() => {})}/>`) : html`<${Empty} icon="hash" title="Bankda savol yo'q"/>`}`
        : html`<${Empty} icon="layers" title="Bank tanlanmagan"/>`}</div>
    </div>
    <style>${'@media (max-width:760px){ .page > .grid[style]{ grid-template-columns:minmax(0,1fr)!important } }'}</style>
    ${modal && modal.t === 'q' ? html`<${QuestionModal} initial=${modal.q} onSave=${saveQ} onClose=${() => setModal(null)}/>` : null}
    ${modal && modal.t === 'bank' ? html`<${NewBankModal} onCreated=${setCur} onClose=${() => setModal(null)}/>` : null}
    ${modal && modal.t === 'del' ? html`<${Confirm} title="Bankni o'chirish" danger okLabel="O'chirish" text=${`"${bank.name}" banki va undagi ${qs.length} ta savol o'chiriladi. Testlarga qo'shilgan nusxalar saqlanib qoladi.`} onClose=${() => setModal(null)} onOk=${() => { const next = (banks.find(b => b.id !== cur) || {}).id || null; run(() => api.deleteBank(cur), "Bank o'chirildi").then(() => setCur(next)).catch(() => {}); }}/>` : null}`;
}
function NewBankModal({ onCreated, onClose }){
  const { db, run } = useApp();
  const [name, setName] = useState(''); const [subj, setSubj] = useState((db.subjects[0] || {}).id);
  const create = () => { run(() => api.createBank({ name:name.trim(), subject_id:+subj }), 'Bank yaratildi').then(b => { onCreated(b.id); onClose(); }).catch(() => {}); };
  return html`<${Modal} title="Yangi savol banki" onClose=${onClose} footer=${html`<button className="btn ghost" onClick=${onClose}>Bekor qilish</button><button className="btn primary" disabled=${!name.trim()} onClick=${create}>Yaratish</button>`}>
    <${Field} label="Bank nomi"><input id="nb-name" className="input" value=${name} onChange=${e => setName(e.target.value)} placeholder="masalan, Logarifmlar"/><//>
    <${Field} label="Fan"><select id="nb-subj" className="select" value=${subj} onChange=${e => setSubj(e.target.value)}>${db.subjects.map(s => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}</select><//><//>`;
}

/* Natijalar sahifasi (teacher + admin) */
function ResultsPage({ id }){
  const { db, user, navigate } = useApp();
  const test = db.tests.find(t => t.id === id);
  const [view, setView] = useState(null); const [exp, setExp] = useState(false);
  const pg = usePaged(test ? leaderboard(db, id) : [], 10, id);
  if(!test) return html`<div className="card"><${Empty} icon="alert" title="Test topilmadi"/></div>`;
  if(user.role === 'teacher' && test.created_by !== user.id) return html`<div className="card"><${Empty} icon="alert" title="Bu test sizga tegishli emas"/></div>`;
  const qs = db.questions.filter(q => q.test_id === id).sort((a,b) => a.order - b.order);
  const qmap = qmapOf(db);
  const all = db.attempts.filter(a => a.test_id === id && a.is_completed);
  const board = leaderboard(db, id);
  const buckets = [[0,20],[20,40],[40,60],[60,80],[80,101]].map(([lo,hi]) => ({ label: `${lo}–${Math.min(hi,100)}%`, n: all.filter(a => a.percentage >= lo && a.percentage < hi).length }));
  const maxB = Math.max(1, ...buckets.map(b => b.n));
  const graded = all.filter(a => a.order && a.answers).map(a => grade(a, qmap).per);
  const perQ = qs.map((q,i) => { const n = graded.filter(per => per[q.id] && per[q.id].ok).length; return { label:`${i+1}`, value: graded.length ? n/graded.length*100 : 0 }; });
  const s = db.subjects.find(x => x.id === test.subject_id);
  return html`<${PageHead} title=${test.title} sub=${html`<span className="actions" style=${{ display:'inline-flex' }}>${s ? s.name : ''} · <${StatusPill} status=${test.status}/> <${CodeChip} code=${test.test_code}/></span>`}>
      <button className="btn ghost" onClick=${() => navigate(user.role === 'admin' ? '/admin/tests' : '/teacher/tests')}>Orqaga</button>
      <button className="btn" onClick=${() => setExp(true)}><${Icon} n="download" s=${16}/> Export</button><//>
    <div className="tiles">
      <${Tile} icon="users" label="Qatnashchilar" value=${board.length} sub=${`${all.length} ta urinish`}/>
      <${Tile} icon="chart" label="O'rtacha natija" value=${all.length ? fmtPct(avg(all.map(a => a.percentage))) : '—'}/>
      <${Tile} icon="trophy" label="Eng yuqori" value=${board[0] ? fmtPct(board[0].percentage) : '—'} sub=${board[0] ? fullName(db.users.find(u => u.id === board[0].student_id)) : ''}/>
      <${Tile} icon="clock" label="O'rtacha vaqt" value=${all.length ? fmtClock(avg(all.map(spentSec))) : '—'} sub=${`${test.duration_minutes} daqiqadan`}/>
    </div>
    <div className="grid g2">
      <div className="card"><div className="card-head"><div><h3>Natijalar taqsimoti</h3><p>Nechta urinish qaysi oraliqqa tushgan</p></div></div><div className="card-body"><${Bars} data=${buckets.map(b => ({ label:b.label, value:b.n/maxB*100, display:b.n }))}/></div></div>
      <div className="card"><div className="card-head"><div><h3>Savollar tahlili</h3><p>Har bir savolga to'g'ri javob bergan urinishlar ulushi</p></div></div><div className="card-body"><${Bars} data=${perQ} suffix="%"/></div></div>
    </div>
    <div className="card"><div className="card-head"><div><h3>Reyting</h3><p>Har bir o'quvchining eng yaxshi urinishi</p></div></div>
      ${board.length ? html`<div className="table-wrap"><table className="tbl"><thead><tr><th>#</th><th>O'quvchi</th><th className="r">Ball</th><th className="r">Natija</th><th className="r">Vaqt</th><th className="r">Urinish</th><th className="r">Tab</th><th>Sana</th><th></th></tr></thead>
        <tbody>${pg.rows.map((a,k) => { const i = pg.offset + k; const u = db.users.find(x => x.id === a.student_id); return html`<tr key=${a.id}><td><span className=${'rank' + (i < 3 ? ' r' + (i+1) : '')}>${i+1}</span></td><td><div className="who"><${Avatar} user=${u}/><b>${fullName(u)}</b></div></td><td className="r num">${fmtNum(a.score)}/${fmtNum(a.max_score)}</td><td className="r"><${Pill} tone=${toneFor(a.percentage)} plain>${fmtPct(a.percentage)}<//></td><td className="r num">${fmtClock(spentSec(a))}</td><td className="r num">${a.attempt_number}${test.max_attempts ? '/' + test.max_attempts : ''}</td><td className="r">${a.disqualified ? html`<span title=${a.violation}><${Pill} tone="bad" plain>Bekor qilingan<//></span>` : a.force_submitted ? html`<span title=${'Sabab: ' + a.violation}><${Pill} tone="bad" plain>${a.tab_switches} · majburan topshirilgan<//></span>` : a.tab_switches ? html`<${Pill} tone="warn" plain>${a.tab_switches}<//>` : html`<span className="faint">0</span>`}</td><td className="muted" style=${{ whiteSpace:'nowrap' }}>${fmtDateTime(a.finished_at)}</td><td className="r"><button className="btn sm" onClick=${() => setView(a)}>Ko'rish</button></td></tr>`; })}</tbody></table></div>${pg.pager}`
      : html`<${Empty} icon="users" title="Hali hech kim yechmagan"/>`}</div>
    ${view ? html`<${Modal} wide title=${`${fullName(db.users.find(u => u.id === view.student_id))} — ${view.attempt_number}-urinish`} onClose=${() => setView(null)}><${Breakdown} attempt=${view}/><//>` : null}
    ${exp ? html`<${ExportModal} title="Natijalarni export qilish" endpoint=${`/tests/${id}/export-results/`} fileBase=${`${test.test_code}-natijalar`} formats=${[['pdf','PDF','Hisobot ko\'rinishida'],['xlsx','Excel','Jadval, filtrlash uchun']]}
      rows=${[["O'rin", "O'quvchi", 'Ball', 'Foiz', 'Vaqt', 'Urinish', 'Tab', 'Holat', 'Sana'], ...board.map((a,i) => [i+1, fullName(db.users.find(u => u.id === a.student_id)), `${fmtNum(a.score)}/${fmtNum(a.max_score)}`, fmtPct(a.percentage), fmtClock(spentSec(a)), a.attempt_number, a.tab_switches || 0, a.disqualified ? 'Bekor qilingan' : a.force_submitted ? 'Majburan topshirilgan' : 'OK', fmtDateTime(a.finished_at)])]}
      onClose=${() => setExp(false)}/>` : null}`;
}

/* Urinish tahlili: mode = correct_answers | detailed */
/* Tahlil serverdan olinadi (GET /api/attempts/{id}/result/) — o'quvchiga to'g'ri javoblar faqat test sozlamasi ruxsat bersa keladi */
function useResult(attemptId){
  const [data, setData] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { if(!attemptId) return; let alive = true; setData(null); setErr(''); api.result(attemptId).then(d => alive && setData(d)).catch(e => alive && setErr(errText(e))); return () => { alive = false; }; }, [attemptId]);
  return { data, err };
}
function Breakdown({ attempt, data: given }){
  const loaded = useResult(given ? null : attempt.id);
  const data = given || loaded.data;
  if(!given && loaded.err) return html`<div className="banner bad"><${Icon} n="alert"/>${loaded.err}</div>`;
  if(!data) return html`<div className="card card-pad muted">Tahlil yuklanmoqda…</div>`;
  const mode = data.mode;
  if(mode === 'score_only') return null;
  const qmap = Object.fromEntries(data.questions.map(q => [q.id, q]));
  const att = data.attempt;
  return html`<div className="card">${att.order.map((qid, i) => { const q = qmap[qid]; if(!q) return null; const r = (data.per || {})[qid] || { ok:false, earned:0, sel:[] }; const attempt = att; const order = (attempt.choice_order && attempt.choice_order[qid]) || q.choices.map(c => c.id);
    return html`<div key=${qid} className="q-item"><span className="q-num" style=${mode === 'detailed' ? { background: r.ok ? 'var(--ok-soft)' : 'var(--bad-soft)', color: r.ok ? 'var(--ok)' : 'var(--bad)' } : null}>${i+1}</span><div className="q-main">
      <div className="actions"><${Pill} plain>${QTYPE[q.question_type]}<//>${mode === 'detailed' ? html`<${Pill} tone=${r.ok ? 'ok' : 'bad'} plain>${fmtNum(r.earned)}/${fmtNum(q.points)} ball<//>` : null}${mode === 'detailed' && !isAnswered(q, r.sel) ? html`<${Pill} tone="warn" plain>Javob berilmagan<//>` : null}</div>
      <div className="q-text"><${MathText} text=${q.text}/></div>${q.image ? html`<img className="q-img" src=${q.image} alt=""/>` : null}
      ${isWritten(q) ? html`<div className="options">
        ${mode === 'detailed' ? html`<div className=${'option static' + (r.ok ? ' right' : ' wrong')} style=${{ padding:'10px 14px' }}><span className="option-text"><span className="small muted">Sizning javobingiz: </span><b>${isAnswered(q, r.sel) ? r.sel[0] : '—'}</b></span>${r.ok ? html`<${Icon} n="check" s=${18}/>` : html`<${Icon} n="x" s=${18}/>`}</div>` : null}
        <div className="option static right" style=${{ padding:'10px 14px' }}><span className="option-text"><span className="small muted">To'g'ri javob: </span><b>${(q.answers || []).join(' / ')}</b></span><${Icon} n="check" s=${18}/></div></div>`
      : html`<div className="options">${order.map((cid, j) => { const c = q.choices.find(x => x.id === cid); if(!c) return null; const picked = r.sel.includes(cid);
        const cls = c.is_correct ? ' right' : (mode === 'detailed' && picked ? ' wrong' : '');
        return html`<div key=${cid} className=${'option static' + cls} style=${{ padding:'10px 14px' }}><span className="key">${LETTERS[j]}</span><span className="option-text"><${MathText} text=${c.text}/></span>${mode === 'detailed' && picked ? html`<span className="small muted">sizning javobingiz</span>` : null}${c.is_correct ? html`<${Icon} n="check" s=${18}/>` : null}</div>`; })}</div>`}
    </div></div>`; })}</div>`;
}

/* =========================================================
   pages/student
   ========================================================= */
function useStudentTests(){
  const { db, user } = useApp();
  return useMemo(() => db.tests.filter(t => t.status === 'active').map(t => {
    const mine = db.attempts.filter(a => a.test_id === t.id && a.student_id === user.id);
    const used = mine.filter(a => a.is_completed).length;
    const open = mine.find(a => !a.is_completed);
    const left = t.max_attempts === 0 ? Infinity : t.max_attempts - used;
    return { t, used, open, left, qn: t.question_count, best: Math.max(-1, ...mine.filter(a => a.is_completed).map(a => a.percentage)) };
  }), [db, user.id]);
}
function CodeEntry({ big }){
  const { db, navigate } = useApp();
  const [code, setCode] = useState(''); const [err, setErr] = useState('');
  const go = e => {
    e.preventDefault();
    let c = code.trim().toUpperCase().replace(/\s/g,'');
    if(!c) return setErr('Test kodini kiriting');
    if(!c.startsWith('BM-')) c = 'BM-' + c.replace(/^BM/,'');
    const t = db.tests.find(x => x.test_code === c);
    if(!t || t.status === 'draft') return setErr(`${c} kodli test topilmadi. Kodni o'qituvchingizdan qayta so'rang.`);
    if(t.status === 'completed') return setErr(`"${t.title}" testi yakunlangan — endi yechib bo'lmaydi.`);
    navigate('/student/test/' + t.id);
  };
  return html`<form onSubmit=${go} style=${{ display:'flex', flexDirection:'column', gap:8 }}>
    <div className="code-entry"><label className="sr" htmlFor=${big ? 'code-big' : 'code-sm'}>Test kodi</label><input id=${big ? 'code-big' : 'code-sm'} className="input code" value=${code} onChange=${e => { setCode(e.target.value); setErr(''); }} placeholder="BM-XXXXXX" maxLength="12" autoComplete="off"/><button className="btn primary" type="submit">Testga kirish <${Icon} n="right" s=${16}/></button></div>
    ${err ? html`<span className="field-err">${err}</span>` : html`<span className="field-hint">Kodni o'qituvchingiz beradi. Sinab ko'rish uchun: BM-7KQ2XD</span>`}</form>`;
}
function TestCard({ it }){
  const { db, navigate } = useApp();
  const { t } = it; const s = db.subjects.find(x => x.id === t.subject_id), tch = db.users.find(u => u.id === t.created_by);
  return html`<div className="card test-card">
    <div className="test-card-top"><${SubjIcon} subject=${s}/><div style=${{ flex:1, minWidth:0 }}><h3>${t.title}</h3><p className="small muted">${s ? s.name : ''} · ${fullName(tch)}</p></div></div>
    <div className="meta"><span><${Icon} n="hash" s=${14}/>${it.qn} savol</span><span><${Icon} n="clock" s=${14}/>${t.duration_minutes} daq</span><span>${DIFF[t.difficulty]}</span></div>
    <div className="test-card-foot">
      <span className="small muted">${t.max_attempts === 0 ? `Cheksiz urinish · ${it.used} ta ishlatilgan` : `Urinish: ${it.used}/${t.max_attempts}`}${it.best >= 0 ? ` · eng yaxshi ${fmtPct(it.best)}` : ''}</span>
      ${it.open ? html`<button className="btn sm primary" onClick=${() => navigate('/student/take/' + it.open.id)}>Davom ettirish</button>`
        : it.left > 0 ? html`<button className="btn sm primary" onClick=${() => navigate('/student/test/' + t.id)}>${it.used ? 'Qayta yechish' : 'Boshlash'}</button>`
        : html`<${Pill} plain>Urinishlar tugagan<//>`}
    </div></div>`;
}
function StudentDashboard(){
  const { db, user, navigate } = useApp();
  const tests = useStudentTests();
  const mine = db.attempts.filter(a => a.student_id === user.id && a.is_completed).sort((a,b) => new Date(a.finished_at) - new Date(b.finished_at));
  const todo = tests.filter(x => x.used === 0 || x.open);
  return html`<${PageHead} title=${`Salom, ${user.first_name}!`} sub=${todo.length ? `Sizni ${todo.length} ta yangi test kutmoqda` : "Hamma faol testlarni yechib bo'ldingiz"}/>
    <div className="card hero-code"><div><h2>Test kodi bormi?</h2><p className="muted" style=${{ marginTop:4 }}>O'qituvchi bergan kodni kiriting va testni darhol boshlang.</p></div><${CodeEntry} big/></div>
    <div className="tiles">
      <${Tile} icon="check" label="Yechilgan testlar" value=${new Set(mine.map(a => a.test_id)).size} sub=${`${mine.length} ta urinish`}/>
      <${Tile} icon="chart" label="O'rtacha natija" value=${mine.length ? fmtPct(avg(mine.map(a => a.percentage))) : '—'}/>
      <${Tile} icon="trophy" label="Eng yaxshi natija" value=${mine.length ? fmtPct(Math.max(...mine.map(a => a.percentage))) : '—'}/>
      <${Tile} icon="play" label="Faol testlar" value=${tests.length} sub=${`${todo.length} tasi hali yechilmagan`}/>
    </div>
    <div className="grid g-main">
      <div className="card"><div className="card-head"><div><h3>Natijalar dinamikasi</h3><p>Har bir urinish foizi, vaqt bo'yicha</p></div></div><div className="card-body"><${LineChart} points=${mine.map(a => a.percentage)} labels=${mine.length ? [fmtDate(mine[0].finished_at), fmtDate(mine[mine.length-1].finished_at)] : []}/></div></div>
      <div className="card"><div className="card-head"><h3>So'nggi natijalar</h3><button className="btn sm ghost" onClick=${() => navigate('/student/history')}>Hammasi <${Icon} n="right" s=${14}/></button></div>
        ${mine.length ? html`<div className="table-wrap"><table className="tbl"><tbody>${mine.slice(-5).reverse().map(a => { const t = db.tests.find(x => x.id === a.test_id); return html`<tr key=${a.id} style=${{ cursor:'pointer' }} onClick=${() => navigate('/student/result/' + a.id)}><td><b style=${{ fontWeight:500 }}>${t ? t.title : '—'}</b><div className="small muted">${fmtDate(a.finished_at)}</div></td><td className="r"><${Pill} tone=${toneFor(a.percentage)} plain>${fmtPct(a.percentage)}<//></td></tr>`; })}</tbody></table></div>`
        : html`<${Empty} icon="chart" title="Hali natija yo'q"/>`}</div>
    </div>
    <div className="page-head"><h2>Siz uchun testlar</h2><button className="btn sm ghost" onClick=${() => navigate('/student/tests')}>Barcha testlar <${Icon} n="right" s=${14}/></button></div>
    ${todo.length ? html`<div className="grid g3">${todo.slice(0,3).map(it => html`<${TestCard} key=${it.t.id} it=${it}/>`)}</div>` : html`<div className="card"><${Empty} icon="check" title="Yangi test yo'q">O'qituvchi yangi test faollashtirganda shu yerda paydo bo'ladi.<//></div>`}`;
}
function StudentTests({ initialSubj }){
  const { db } = useApp();
  const tests = useStudentTests();
  const [q, setQ] = useState(''); const [subj, setSubj] = useState(initialSubj || 'all');
  const list = tests.filter(it => (subj === 'all' || it.t.subject_id === +subj) && it.t.title.toLowerCase().includes(q.toLowerCase()));
  const pg = usePaged(list, 9, q + '|' + subj);
  return html`<${PageHead} title="Testlar" sub="Faol testlar ro'yxati yoki test kodi orqali kirish"/>
    <div className="card card-body"><${CodeEntry}/></div>
    <div className="actions"><div className="search" style=${{ flex:'1 1 240px' }}><${Icon} n="search" s=${16}/><input id="st-search" className="input" placeholder="Test nomi bo'yicha qidirish" value=${q} onChange=${e => setQ(e.target.value)}/></div>
      <select id="st-subj" className="select" style=${{ width:'auto' }} value=${subj} onChange=${e => setSubj(e.target.value)} aria-label="Fan"><option value="all">Barcha fanlar</option>${db.subjects.map(s => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}</select></div>
    ${list.length ? html`<div className="grid g3">${pg.rows.map(it => html`<${TestCard} key=${it.t.id} it=${it}/>`)}</div><div className="card">${pg.pager}</div>` : html`<div className="card"><${Empty} icon="search" title="Test topilmadi">Qidiruv yoki fan filtrini o'zgartiring.<//></div>`}`;
}
function TestIntro({ id }){
  const { db, user, run, navigate } = useApp();
  const [busy, setBusy] = useState(false);
  const t = db.tests.find(x => x.id === id);
  if(!t || t.status === 'draft') return html`<div className="card"><${Empty} icon="alert" title="Test topilmadi"/></div>`;
  const mine = db.attempts.filter(a => a.test_id === id && a.student_id === user.id);
  const used = mine.filter(a => a.is_completed).length, open = mine.find(a => !a.is_completed);
  const left = t.max_attempts === 0 ? Infinity : t.max_attempts - used;
  const s = db.subjects.find(x => x.id === t.subject_id), tch = db.users.find(u => u.id === t.created_by);
  const start = () => {
    /* To'liq ekran majburiy — shu bosish paytida so'raladi (brauzer faqat foydalanuvchi bosganda ruxsat beradi) */
    if(document.fullscreenEnabled && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if(open){ navigate('/student/take/' + open.id); return; }
    /* Server urinish yaratadi: savollar tartibi, variantlar aralashtirilishi va limit tekshiruvi — hammasi backendda */
    setBusy(true);
    run(() => api.startTest(id)).then(r => navigate('/student/take/' + r.attempt.id))
      .catch(() => { if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); setBusy(false); });
  };
  return html`<${PageHead} title=${t.title} sub=${`${s ? s.name : ''} · ${fullName(tch)}`}><button className="btn ghost" onClick=${() => navigate('/student/tests')}>Orqaga</button><//>
    <div className="grid g-main" style=${{ alignItems:'start' }}>
      <div className="card card-body" style=${{ display:'flex', flexDirection:'column', gap:16 }}>
        ${t.description ? html`<p>${t.description}</p>` : null}
        <h3>Qoidalar</h3>
        <div style=${{ display:'flex', flexDirection:'column', gap:10 }}>
          ${[['clock', `Vaqt — ${t.duration_minutes} daqiqa. Vaqt tugaganda test avtomatik yakunlanadi.`],
             ['check', "Har bir javob darhol saqlanadi. Sahifa yopilsa ham, qaytib kelib davom ettirasiz."],
             ['left', "Savollar orasida erkin o'tish va javobni o'zgartirish mumkin."],
             ['eye', t.strict_mode !== false ? `QAT'IY REJIM: boshqa tab, sayt yoki dasturga o'tish, nusxa olish, ekran rasmini olish yoki to'liq ekrandan chiqish — har biri ogohlantirish. ${MAX_WARNINGS} ta ogohlantirishdan keyingi qoidabuzarlikda test avtomatik topshiriladi va faqat shu paytgacha ishlagan javoblaringiz hisoblanadi. Ekran rasmi olinmoqchi bo'lsa yoki oynadan chiqilsa, ekran qorayadi.` : "Boshqa oyna yoki tabga o'tish hisoblanadi va o'qituvchiga ko'rinadi."],
             ['hash', "Ko'p javobli savolda ball faqat barcha to'g'ri variantlar belgilansa beriladi."]].map(([ic, txt]) => html`<div key=${ic} className="actions" style=${{ alignItems:'flex-start', flexWrap:'nowrap' }}><span style=${{ color:'var(--accent)', marginTop:2 }}><${Icon} n=${ic} s=${17}/></span><span>${txt}</span></div>`)}
        </div>
        <div className="banner info small"><${Icon} n="max" s=${16}/><div><b>Test to'liq ekranda ochiladi.</b> To'liq ekransiz savollar ko'rinmaydi. Skrinshot tugmalari (PrintScreen, Win yoki Cmd) bosilsa, savollar darhol yashiriladi.</div></div>
      </div>
      <div className="card card-body" style=${{ display:'flex', flexDirection:'column', gap:14 }}>
        <dl className="kv">
          <dt>Savollar</dt><dd className="num">${t.question_count} ta · ${fmtNum(t.total_points)} ball</dd>
          <dt>Tarkibi</dt><dd>${t.closed_count} variantli + ${t.written_count} yozma</dd>
          <dt>Davomiyligi</dt><dd>${t.duration_minutes} daqiqa</dd>
          <dt>Qiyinlik</dt><dd>${DIFF[t.difficulty]}</dd>
          <dt>Urinishlar</dt><dd>${t.max_attempts === 0 ? `Cheksiz (${used} ishlatilgan)` : `${used} / ${t.max_attempts}`}</dd>
          <dt>Natija</dt><dd>${SHOW[t.show_results][0]}</dd>
        </dl>
        <hr className="divider"/>
        ${t.status === 'completed' ? html`<div className="banner warn"><${Icon} n="alert"/>Test yakunlangan.</div>`
          : left <= 0 && !open ? html`<div className="banner warn"><${Icon} n="alert"/>Barcha urinishlaringiz ishlatilgan.</div>`
          : html`<button className="btn primary lg block" disabled=${busy} onClick=${start}><${Icon} n="play" s=${18}/> ${open ? 'Davom ettirish' : busy ? 'Boshlanmoqda…' : 'Testni boshlash'}</button>`}
        ${used ? html`<button className="btn ghost block" onClick=${() => navigate('/student/leaderboard?' + id)}>Reytingni ko'rish</button>` : null}
      </div>
    </div>`;
}

function TakeTest({ id }){
  const { db, user, navigate, toast, refresh } = useApp();
  /* Urinish serverdan yuklanadi: savollar to'g'ri javoblarsiz, tartib va muddat (deadline) server belgilaydi */
  const [p, setP] = useState(null); const [loadErr, setLoadErr] = useState('');
  const [answers, setAnswers] = useState({});
  const offset = useRef(0); // server va kompyuter soati farqi
  useEffect(() => {
    let alive = true;
    api.attempt(id).then(d => { if(!alive) return;
      if(d.mode){ refresh().then(() => navigate('/student/result/' + id, true)); return; }
      offset.current = Date.parse(d.server_now) - Date.now();
      setAnswers(d.attempt.answers || {}); setP(d); countRef.current = d.attempt.tab_switches || 0;
      const i = d.attempt.order.findIndex(qid => !((d.attempt.answers || {})[qid] || []).length); setCur(i < 0 ? 0 : i);
    }).catch(e => alive && setLoadErr(errText(e, 'Urinish topilmadi')));
    return () => { alive = false; };
  }, [id]);
  const a = p ? Object.assign({}, p.attempt, { answers }) : null;
  const t = a && db.tests.find(x => x.id === a.test_id);
  const qmap = useMemo(() => p ? Object.fromEntries(p.questions.map(q => [q.id, q])) : {}, [p]);
  const [cur, setCur] = useState(0);
  const writeTimers = useRef({});
  const [flags, setFlags] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [savedAt, setSavedAt] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [warn, setWarn] = useState(null);   // { n, reason, soft }
  const [black, setBlack] = useState(false); // ekran qoraytirilgan
  const countRef = useRef(a ? a.tab_switches || 0 : 0);
  /* To'liq ekran majburiy: brauzer qo'llasa, to'liq ekransiz savollar ko'rinmaydi */
  const fsSupported = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  const [isFs, setIsFs] = useState(!!document.fullscreenElement);
  useEffect(() => { const f = () => setIsFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const enterFs = () => {
    if(!fsSupported) return toast("Bu brauzer to'liq ekran rejimini qo'llamaydi", 'warn');
    document.documentElement.requestFullscreen().catch(() => toast("Brauzer to'liq ekranga ruxsat bermadi — testni kompyuter brauzerida oching", 'warn'));
  };
  const fsGate = fsSupported && !isFs;
  const submitted = useRef(false);
  const wasFs = useRef(!!document.fullscreenElement);
  const valid = !!(a && t && a.student_id === user.id);
  const endAt = valid ? Date.parse(p.deadline) - offset.current : 0;
  const remaining = (endAt - now)/1000;
  const leave = () => { if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); };

  const submit = useCallback(async auto => {
    if(submitted.current || !valid) return; submitted.current = true;
    Object.values(writeTimers.current).forEach(f => f && f.flush && f.flush());
    try{ await api.submit(id); }
    catch(e){ submitted.current = false; toast(errText(e, "Topshirib bo'lmadi — internetni tekshirib, qayta bosing"), 'bad'); return; }
    leave(); await refresh().catch(() => {});
    toast(auto ? 'Vaqt tugadi — test avtomatik yakunlandi' : 'Test yakunlandi', auto ? 'warn' : 'ok');
    navigate('/student/result/' + id, true);
  }, [valid, id]);

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(iv); }, []);
  useEffect(() => { if(valid && remaining <= 0) submit(true); }, [valid && remaining <= 0]);
  const strict = valid && t.strict_mode !== false;

  /* Qat'iy rejim: server qoidabuzarlikni sanaydi; 3 ta ogohlantirishdan keyingisida testni o'zi topshiradi (ishlangan javoblar baholanadi) */
  const forceSubmitted = useCallback(async reason => {
    if(submitted.current) return; submitted.current = true;
    leave(); await refresh().catch(() => {});
    toast(`Test topshirildi: ${MAX_WARNINGS} ta ogohlantirishdan keyin yana ${reason}`, 'bad');
    navigate('/student/result/' + id, true);
  }, [id]);

  useEffect(() => {
    if(!valid) return;
    const armedAt = Date.now() + 1200; // sahifa ochilishidagi tasodifiy hodisalarni hisobga olmaslik
    const armed = () => Date.now() > armedAt;
    let last = 0, blackTimer = null;
    /* Bitta harakat bir nechta hodisa beradi (blur + visibilitychange) — 1,5 soniya ichidagilar bitta hisoblanadi */
    const violation = reason => {
      if(!armed() || submitted.current || Date.now() - last < 1500) return;
      last = Date.now();
      const n = (countRef.current || 0) + 1; countRef.current = n;
      if(!strict) setWarn({ n, reason, soft:true }); else if(n <= MAX_WARNINGS) setWarn({ n, reason });
      api.violation(id, reason).then(r => {
        countRef.current = r.tab_switches;
        if(r.state === 'force_submitted' || r.is_completed) forceSubmitted(reason);
        else if(strict) setWarn({ n:r.tab_switches, reason });
        else setWarn({ n:r.tab_switches, reason, soft:true });
      }).catch(() => {});
    };
    /* Ekran yashirilishi: oyna fokusni yo'qotsa yoki PrintScreen bosilsa — butun ekran qora */
    const hide = ms => { setBlack(true); clearTimeout(blackTimer); if(ms) blackTimer = setTimeout(() => { if(document.hasFocus() && !document.hidden) setBlack(false); }, ms); };
    const show = () => { clearTimeout(blackTimer); setBlack(false); };
    const onVis = () => { if(document.hidden){ hide(); violation("boshqa tab yoki saytga o'tildi"); } else if(document.hasFocus()) show(); };
    const onBlur = () => { hide(); violation('test oynasidan chiqildi'); };
    const onFocus = () => { if(!document.hidden) show(); };
    const shot = e => {
      e.preventDefault(); hide(3000);
      try{ navigator.clipboard.writeText('BM Examer: test paytida ekran rasmini olish taqiqlangan').catch(() => {}); }catch(_){}
      violation('ekran rasmini olishga urinish');
    };
    const onClip = e => { e.preventDefault(); violation(e.type === 'paste' ? 'matn qo\'yishga urinish' : 'nusxa olishga urinish'); };
    const onMenu = e => e.preventDefault();
    const onKey = e => {
      const k = (e.key || '').toLowerCase();
      if(k === 'printscreen' || ((e.metaKey || e.key === 'Meta') && e.shiftKey && k === 's')) return shot(e);
      /* Win/Cmd tugmasi bosilishi bilan savollar darhol yashiriladi — Win+Shift+S, Win+PrtSc, Cmd+Shift+3/4 rasmga tushmasin */
      if(k === 'meta' || k === 'os' || (e.metaKey && e.shiftKey)){ setBlack(true); return; }
      const dev = k === 'f12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i','j','c'].includes(k)) || ((e.ctrlKey || e.metaKey) && k === 'u');
      if(dev){ e.preventDefault(); violation('dasturchi vositalarini ochishga urinish'); }
    };
    const onKeyUp = e => { const k = (e.key || '').toLowerCase(); if(k === 'printscreen') shot(e); else if((k === 'meta' || k === 'os') && document.hasFocus() && !document.hidden) hide(600); };
    const onFs = () => { if(armed() && !document.fullscreenElement && wasFs.current) violation("to'liq ekran rejimidan chiqildi"); if(document.fullscreenElement) wasFs.current = true; };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
    ['copy','cut','paste'].forEach(ev => document.addEventListener(ev, onClip));
    document.addEventListener('contextmenu', onMenu); document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp); document.addEventListener('fullscreenchange', onFs);
    return () => {
      clearTimeout(blackTimer);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
      ['copy','cut','paste'].forEach(ev => document.removeEventListener(ev, onClip));
      document.removeEventListener('contextmenu', onMenu); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp); document.removeEventListener('fullscreenchange', onFs);
    };
  }, [valid, strict]);

  if(!p && !loadErr) return html`<div className="boot">Test yuklanmoqda…</div>`;
  if(!valid) return html`<div className="boot"><${Empty} icon="alert" title=${loadErr || 'Urinish topilmadi'}><button className="btn" onClick=${() => navigate('/student')}>Bosh sahifaga</button><//></div>`;

  const qid = a.order[cur], q = qmap[qid];
  /* Javob darhol ekranda yangilanadi va serverga yuboriladi; yozma javob 0,6 soniya to'xtagandan keyin yuboriladi */
  const send = (qq, value) => api.answer(id, qq, value).then(() => setSavedAt(new Date())).catch(e => {
    const d = e.response && e.response.data;
    if(d && /yakunlangan/i.test(String(d.detail || ''))) forceSubmitted('vaqt tugadi'); else toast("Javob saqlanmadi — internetni tekshiring", 'warn');
  });
  const sel = a.answers[qid] || [];
  const order = (a.choice_order && a.choice_order[qid]) || q.choices.map(c => c.id);
  const multi = q.question_type === 'multiple';
  const done = x => isAnswered(qmap[x], a.answers[x]);
  const answered = a.order.filter(done).length;
  const write = text => {
    setAnswers(prev => Object.assign({}, prev, { [qid]: [text] }));
    const old = writeTimers.current[qid]; if(old) clearTimeout(old.h);
    const job = { flush: () => { clearTimeout(job.h); delete writeTimers.current[qid]; send(qid, [text]); } };
    job.h = setTimeout(job.flush, 600); writeTimers.current[qid] = job;
  };
  const pick = cid => {
    const next = multi ? (sel.includes(cid) ? sel.filter(x => x !== cid) : sel.concat(cid)) : [cid];
    setAnswers(prev => Object.assign({}, prev, { [qid]: next }));
    send(qid, next);
  };
  const tone = remaining < 60 ? ' low' : remaining < 300 ? ' mid' : '';
  const fsToggle = () => { if(document.fullscreenElement) toast("Test faqat to'liq ekranda yechiladi — chiqish ogohlantirish hisoblanadi", 'warn'); else enterFs(); };
  return html`<div className="take">
    <header className="take-bar">
      <div className="take-title"><b>${t.title}</b><span>${a.attempt_number}-urinish · ${answered}/${a.order.length} javob berildi</span></div>
      <span className="saved" aria-live="polite">${savedAt ? html`<${Icon} n="check" s=${14}/> Saqlandi ${p2(savedAt.getHours())}:${p2(savedAt.getMinutes())}:${p2(savedAt.getSeconds())}` : 'Javoblar avtomatik saqlanadi'}</span>
      ${strict ? html`<${Pill} tone="bad" plain><${Icon} n="eye" s=${12}/> Qat'iy rejim<//>` : a.tab_switches ? html`<${Pill} tone="warn"><${Icon} n="eye" s=${12}/> Tab: ${a.tab_switches}<//>` : null}
      <button className="icon-btn" onClick=${fsToggle} aria-label="To'liq ekran" title="To'liq ekran"><${Icon} n="max"/></button>
      <span className=${'timer' + tone} role="timer" aria-label=${'Qolgan vaqt ' + fmtClock(remaining)}><${Icon} n="clock" s=${18}/>${fmtClock(remaining)}</span>
    </header>
    <div className="take-body">
      <section className="card question" aria-live="polite">
        <div className="question-top"><span className="small muted">${cur+1} / ${a.order.length}-savol · ${fmtNum(q.points)} ball</span><div className="actions"><${Pill} tone="accent" plain>${isWritten(q) ? 'Javobni yozing' : multi ? "Bir nechta javobni tanlang" : q.question_type === 'true_false' ? "Rost yoki yolg'on" : 'Bitta javobni tanlang'}<//>
          <button className=${'btn sm' + (flags.includes(qid) ? ' ok' : ' ghost')} onClick=${() => setFlags(flags.includes(qid) ? flags.filter(x => x !== qid) : flags.concat(qid))}><${Icon} n="flag" s=${14}/> ${flags.includes(qid) ? 'Belgilangan' : 'Keyinroq qaytish'}</button></div></div>
        <div className="question-text"><${MathText} text=${q.text}/></div>
        ${q.image ? html`<img className="q-img" style=${{ maxWidth:'100%', maxHeight:320 }} src=${q.image} alt="Savolga ilova qilingan rasm"/>` : null}
        ${isWritten(q) ? html`<div className="field"><label className="field-label" htmlFor=${'wr-' + qid}>Javobingiz</label>
          <input key=${qid} id=${'wr-' + qid} className="input" style=${{ fontSize:'1.1rem', padding:'14px 16px' }} value=${sel[0] || ''} onChange=${e => write(e.target.value)} placeholder="Javobni shu yerga yozing" autoComplete="off" spellCheck="false"/>
          <span className="field-hint">Katta-kichik harf farqi yo'q. Son bo'lsa, faqat sonni yozing (masalan, 36 yoki 3,5).</span></div>`
        : html`<div className="options" role=${multi ? 'group' : 'radiogroup'}>${order.map((cid, j) => { const c = q.choices.find(x => x.id === cid); if(!c) return null; const on = sel.includes(cid);
          return html`<button key=${cid} className=${'option' + (on ? ' on' : '') + (multi ? ' multi' : '')} role=${multi ? 'checkbox' : 'radio'} aria-checked=${on} onClick=${() => pick(cid)}><span className="key">${on && multi ? html`<${Icon} n="check" s=${15}/>` : LETTERS[j]}</span><span className="option-text"><${MathText} text=${c.text}/></span></button>`; })}</div>`}
        <div className="q-foot">
          <button className="btn" disabled=${cur === 0} onClick=${() => setCur(cur-1)}><${Icon} n="left" s=${16}/> Oldingi</button>
          ${cur < a.order.length-1 ? html`<button className="btn primary" onClick=${() => setCur(cur+1)}>Keyingi <${Icon} n="right" s=${16}/></button>` : html`<button className="btn primary" onClick=${() => setConfirm(true)}><${Icon} n="check" s=${16}/> Yakunlash</button>`}
        </div>
      </section>
      <aside className="card qnav-card" aria-label="Savollar navigatsiyasi">
        <div className="actions" style=${{ justifyContent:'space-between' }}><h4>Savollar</h4><span className="small muted num">${answered}/${a.order.length}</span></div>
        <div className="bar"><i style=${{ width: (answered/a.order.length*100) + '%' }}></i></div>
        <div className="qnav">${a.order.map((x, i) => html`<button key=${x} className=${(done(x) ? 'done' : '') + (i === cur ? ' cur' : '') + (flags.includes(x) ? ' flag' : '')} onClick=${() => setCur(i)} aria-label=${`${i+1}-savol${done(x) ? ', javob berilgan' : ', javobsiz'}${isWritten(qmap[x] || {}) ? ', yozma' : ''}`}>${i+1}</button>`)}</div>
        <div className="qlegend"><span><i style=${{ background:'var(--accent)' }}></i>Javob berilgan</span><span><i style=${{ background:'var(--surface-3)' }}></i>Javobsiz</span><span><i style=${{ background:'var(--warn)', borderRadius:'50%' }}></i>Belgilangan</span></div>
        ${a.order.length - answered ? html`<div className="banner warn small"><${Icon} n="alert" s=${16}/>${a.order.length - answered} ta savolga javob berilmagan</div>` : html`<div className="banner info small"><${Icon} n="check" s=${16}/>Barcha savollarga javob berdingiz</div>`}
        <button className="btn primary block" onClick=${() => setConfirm(true)}>Testni yakunlash</button>
      </aside>
    </div>
    ${confirm ? html`<${Modal} title="Testni yakunlaysizmi?" onClose=${() => setConfirm(false)} footer=${html`<button className="btn ghost" onClick=${() => setConfirm(false)}>Davom ettirish</button><button className="btn primary" onClick=${() => submit(false)}>Ha, yakunlash</button>`}>
      <dl className="kv"><dt>Javob berilgan</dt><dd className="num">${answered} / ${a.order.length}</dd><dt>Qolgan vaqt</dt><dd className="num">${fmtClock(remaining)}</dd>${flags.length ? html`<dt>Belgilangan savollar</dt><dd>${flags.length}</dd>` : null}</dl>
      ${a.order.length - answered ? html`<div className="banner warn"><${Icon} n="alert"/>${a.order.length - answered} ta savol javobsiz qoladi va ular uchun ball berilmaydi.</div>` : null}
      <p className="small muted">Yakunlagandan keyin javoblarni o'zgartirib bo'lmaydi.</p><//>` : null}
    ${warn && !black ? html`<${Modal} title=${warn.soft ? 'Qoidabuzarlik qayd etildi' : `Ogohlantirish ${warn.n} / ${MAX_WARNINGS}`} onClose=${() => setWarn(null)} footer=${html`<button className="btn primary" onClick=${() => setWarn(null)}>Tushundim, testga qaytish</button>`}>
      <div className=${'banner ' + (warn.soft || warn.n < MAX_WARNINGS ? 'warn' : 'bad')}><${Icon} n="alert"/><div><b>Sabab: ${warn.reason}.</b> ${warn.soft ? `Jami ${warn.n} marta qayd etildi. O'qituvchi natijalarda buni ko'radi.`
        : warn.n < MAX_WARNINGS ? `Yana ${MAX_WARNINGS - warn.n} marta ogohlantirish beriladi. Undan keyingi qoidabuzarlikda test avtomatik topshiriladi va faqat shu paytgacha ishlagan javoblaringiz hisoblanadi.`
        : "Bu oxirgi ogohlantirish! Yana bir marta qoidabuzarlik qilsangiz, test darhol topshiriladi va faqat shu paytgacha ishlagan javoblaringiz hisoblanadi."}</div></div>
      ${!warn.soft ? html`<div className="actions">${Array.from({ length:MAX_WARNINGS }, (_, i) => html`<span key=${i} className=${'pill plain ' + (i < warn.n ? 'bad' : '')} style=${{ minWidth:34, justifyContent:'center' }}>${i + 1}</span>`)}</div>` : null}<//>` : null}
    ${fsGate && !black ? html`<div className="fs-gate" role="alert"><div><${Icon} n="max" s=${34}/><b>Test faqat to'liq ekranda davom etadi</b>
      <span>Savollar to'liq ekran rejimida ko'rinadi. Vaqt to'xtamaydi — tezroq qayting.${wasFs.current && strict ? " To'liq ekrandan chiqish ogohlantirish hisoblandi." : ''}</span>
      <button className="btn primary lg" onClick=${enterFs}><${Icon} n="max" s=${18}/> To'liq ekranga o'tish</button></div></div>` : null}
    ${black ? html`<div className="blackout" role="alert"><div><${Icon} n="eye" s=${30}/><b>Ekran yashirildi</b><span>Test davom etmoqda. Davom ettirish uchun test oynasiga qayting.</span></div></div>` : null}
  </div>`;
}

function StudentResult({ id }){
  const { db, user, navigate } = useApp();
  const a = db.attempts.find(x => x.id === id);
  const t = a && db.tests.find(x => x.id === a.test_id);
  const res = useResult(a && a.is_completed ? id : null);
  if(!a || !t || (user.role === 'student' && a.student_id !== user.id)) return html`<div className="card"><${Empty} icon="alert" title="Natija topilmadi"/></div>`;
  if(!a.is_completed) return html`<div className="card"><${Empty} icon="clock" title="Bu urinish hali yakunlanmagan"><button className="btn primary" onClick=${() => navigate('/student/take/' + id)}>Davom ettirish</button><//></div>`;
  const used = db.attempts.filter(x => x.test_id === t.id && x.student_id === user.id && x.is_completed).length;
  const canRetry = t.status === 'active' && (t.max_attempts === 0 || used < t.max_attempts);
  const board = leaderboard(db, t.id); const rank = board.findIndex(x => x.student_id === user.id) + 1;
  const verdict = a.disqualified ? 'Natija bekor qilindi' : a.force_submitted ? 'Test avtomatik topshirildi' : a.percentage >= 85 ? "A'lo natija!" : a.percentage >= 70 ? 'Yaxshi natija' : a.percentage >= 50 ? "Qoniqarli — yana mashq qiling" : "Mavzuni qayta takrorlash tavsiya etiladi";
  return html`<${PageHead} title=${t.title} sub=${`${a.attempt_number}-urinish · ${fmtDateTime(a.finished_at)}`}>
      <button className="btn ghost" onClick=${() => navigate('/student/history')}>Natijalarim</button>
      <button className="btn" onClick=${() => navigate('/student/leaderboard?' + t.id)}><${Icon} n="trophy" s=${16}/> Reyting</button>
      ${canRetry ? html`<button className="btn primary" onClick=${() => navigate('/student/test/' + t.id)}><${Icon} n="refresh" s=${16}/> Qayta yechish</button>` : null}<//>
    <div className="card result-hero"><${Ring} value=${a.percentage}/>
      <div style=${{ flex:1, minWidth:240, display:'flex', flexDirection:'column', gap:16 }}>
        <h2>${verdict}</h2>
        <div className="result-stats">
          <div><span>Ball</span><b>${fmtNum(a.score)} / ${fmtNum(a.max_score)}</b></div>
          <div><span>To'g'ri javoblar</span><b>${a.correct_answers} / ${a.total_questions}</b></div>
          <div><span>Sarflangan vaqt</span><b>${fmtSpent(spentSec(a))}</b></div>
          <div><span>Reytingdagi o'rin</span><b>${rank ? `${rank} / ${board.length}` : '—'}</b></div>
        </div>
        ${a.disqualified ? html`<div className="banner bad"><${Icon} n="alert"/><div><b>Qoidabuzarlik aniqlandi: ${a.violation}.</b> Test qat'iy rejimda edi, shuning uchun urinish to'xtatildi va natija 0 ga tenglashtirildi. Bu holat o'qituvchiga ko'rinadi.</div></div>`
          : a.force_submitted ? html`<div className="banner bad"><${Icon} n="alert"/><div><b>${MAX_WARNINGS} ta ogohlantirishdan keyin yana qoidabuzarlik: ${a.violation}.</b> Test avtomatik topshirildi — faqat shu paytgacha bergan javoblaringiz hisoblandi (${a.correct_answers} ta to'g'ri). Jami qoidabuzarliklar: ${a.tab_switches}. Bu o'qituvchiga ko'rinadi.</div></div>`
          : a.tab_switches ? html`<div className="banner warn small"><${Icon} n="eye" s=${16}/>Test davomida ${a.tab_switches} marta boshqa oynaga o'tilgan.</div>` : null}
      </div></div>
    ${a.disqualified ? null : t.show_results === 'score_only' ? html`<div className="banner info"><${Icon} n="info"/><div>O'qituvchi bu test uchun faqat umumiy natijani ko'rsatishni tanlagan. Savollar bo'yicha tahlil ko'rsatilmaydi.</div></div>`
      : res.err ? html`<div className="banner bad"><${Icon} n="alert"/>${res.err}</div>`
      : html`<div className="page-head"><h2>${t.show_results === 'detailed' ? 'Batafsil tahlil' : "To'g'ri javoblar"}</h2></div>${res.data ? html`<${Breakdown} attempt=${a} data=${res.data}/>` : html`<div className="card card-pad muted">Tahlil yuklanmoqda…</div>`}`}`;
}
function StudentHistory(){
  const { db, user, navigate } = useApp();
  const mine = db.attempts.filter(a => a.student_id === user.id && a.is_completed).sort((a,b) => new Date(b.finished_at) - new Date(a.finished_at));
  const chron = mine.slice().reverse();
  const pg = usePaged(mine, 10);
  return html`<${PageHead} title="Natijalarim" sub="Barcha urinishlaringiz tarixi va o'sish dinamikasi"/>
    <div className="card"><div className="card-head"><div><h3>Progress</h3><p>${mine.length} ta urinish · o'rtacha ${mine.length ? fmtPct(avg(mine.map(a => a.percentage))) : '—'}</p></div></div><div className="card-body"><${LineChart} points=${chron.map(a => a.percentage)} labels=${chron.length ? [fmtDate(chron[0].finished_at), fmtDate(chron[chron.length-1].finished_at)] : []}/></div></div>
    <div className="card">${mine.length ? html`<div className="table-wrap"><table className="tbl"><thead><tr><th>Test</th><th>Sana</th><th className="r">Urinish</th><th className="r">Ball</th><th className="r">Natija</th><th className="r">Vaqt</th><th></th></tr></thead>
      <tbody>${pg.rows.map(a => { const t = db.tests.find(x => x.id === a.test_id); const s = t && db.subjects.find(x => x.id === t.subject_id); return html`<tr key=${a.id}><td><div className="who"><${SubjIcon} subject=${s}/><div><b>${t ? t.title : "O'chirilgan test"}</b><span>${s ? s.name : ''}</span></div></div></td><td className="muted" style=${{ whiteSpace:'nowrap' }}>${fmtDateTime(a.finished_at)}</td><td className="r num">${a.attempt_number}</td><td className="r num">${fmtNum(a.score)}/${fmtNum(a.max_score)}</td><td className="r"><${Pill} tone=${toneFor(a.percentage)} plain>${fmtPct(a.percentage)}<//></td><td className="r num">${fmtClock(spentSec(a))}</td><td className="r"><button className="btn sm" onClick=${() => navigate('/student/result/' + a.id)}>Ko'rish</button></td></tr>`; })}</tbody></table></div>${pg.pager}`
      : html`<${Empty} icon="chart" title="Hali natija yo'q"><button className="btn primary" onClick=${() => navigate('/student/tests')}>Test tanlash</button><//>`}</div>`;
}
function StudentLeaderboard({ initial }){
  const { db, user } = useApp();
  const avail = db.tests.filter(t => t.status !== 'draft' && db.attempts.some(a => a.test_id === t.id && a.is_completed));
  const [tid, setTid] = useState(() => { const x = avail.find(t => t.id === initial) || avail.find(t => db.attempts.some(a => a.test_id === t.id && a.student_id === user.id)) || avail[0]; return x ? x.id : null; });
  const board = tid ? leaderboard(db, tid) : [];
  const t = db.tests.find(x => x.id === tid);
  const pg = usePaged(board, 10, tid);
  return html`<${PageHead} title="Reyting" sub="Har bir o'quvchining eng yaxshi natijasi bo'yicha"/>
    <${Field} label="Test"><select id="lb-test" className="select" style=${{ maxWidth:480 }} value=${tid || ''} onChange=${e => setTid(+e.target.value)}>${avail.map(x => html`<option key=${x.id} value=${x.id}>${x.title} (${STATUS[x.status].toLowerCase()})</option>`)}</select><//>
    ${board.length >= 3 ? html`<div className="grid g3">${[board[1], board[0], board[2]].map((a, k) => { const pos = [2,1,3][k]; const u = db.users.find(x => x.id === a.student_id); return html`<div key=${a.id} className="card card-pad" style=${{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, textAlign:'center', order: pos === 1 ? -1 : 0, outline: a.student_id === user.id ? '2px solid var(--accent)' : 'none' }}><span className=${'rank r' + pos} style=${{ width:34, height:34 }}>${pos}</span><${Avatar} user=${u} lg/><b>${fullName(u)}</b><span className="tile-value" style=${{ fontSize:'1.4rem' }}>${fmtPct(a.percentage)}</span><span className="small muted num">${fmtNum(a.score)}/${fmtNum(a.max_score)} ball · ${fmtClock(spentSec(a))}</span></div>`; })}</div>` : null}
    <div className="card">${board.length ? html`<div className="table-wrap"><table className="tbl compact"><thead><tr><th style=${{ width:48 }}>#</th><th>O'quvchi</th><th className="r">Ball</th><th className="r">Natija</th><th className="r">Vaqt</th></tr></thead>
      <tbody>${pg.rows.map((a,k) => { const i = pg.offset + k; const u = db.users.find(x => x.id === a.student_id); return html`<tr key=${a.id} className=${a.student_id === user.id ? 'is-me' : ''}><td><span className=${'rank' + (i < 3 ? ' r' + (i+1) : '')}>${i+1}</span></td><td><div className="who"><${Avatar} user=${u}/><b>${fullName(u)}${a.student_id === user.id ? ' (siz)' : ''}</b></div></td><td className="r num">${fmtNum(a.score)}/${fmtNum(a.max_score)}</td><td className="r"><${Pill} tone=${toneFor(a.percentage)} plain>${fmtPct(a.percentage)}<//></td><td className="r num">${fmtClock(spentSec(a))}</td></tr>`; })}</tbody></table></div>${pg.pager}`
      : html`<${Empty} icon="trophy" title="Reyting bo'sh"/>`}</div>
    ${t && t.status === 'active' ? html`<p className="small muted">Test hali faol — reyting yangi urinishlar bilan o'zgarib boradi.</p>` : null}`;
}

/* ---------- pages/students: o'qituvchi (o'z testlari bo'yicha) va admin (hammasi) har bir o'quvchi natijasini ko'radi ---------- */
function useScope(){
  const { db, user } = useApp();
  return useMemo(() => {
    const tests = user.role === 'admin' ? db.tests : db.tests.filter(t => t.created_by === user.id);
    const ids = new Set(tests.map(t => t.id));
    return { tests, attempts: db.attempts.filter(a => a.is_completed && ids.has(a.test_id)) };
  }, [db, user]);
}
function StudentsPage(){
  const { db, user, navigate } = useApp();
  const { tests, attempts } = useScope();
  const [q, setQ] = useState(''); const [tid, setTid] = useState('all'); const [sort, setSort] = useState('avg'); const [onlyActive, setOnlyActive] = useState(true);
  const rows = db.users.filter(u => u.role === 'student').map(u => {
    const at = attempts.filter(a => a.student_id === u.id && (tid === 'all' || a.test_id === +tid));
    const last = at.reduce((m, a) => !m || new Date(a.finished_at) > new Date(m) ? a.finished_at : m, null);
    return { u, n: at.length, tests: new Set(at.map(a => a.test_id)).size, avg: at.length ? avg(at.map(a => a.percentage)) : null,
      best: at.length ? Math.max(...at.map(a => a.percentage)) : null, viol: at.reduce((s, a) => s + (a.tab_switches || 0), 0), forced: at.filter(a => a.force_submitted || a.disqualified).length, last };
  }).filter(r => (!onlyActive || r.n) && `${r.u.first_name} ${r.u.last_name} ${r.u.username}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'name' ? fullName(a.u).localeCompare(fullName(b.u)) : sort === 'last' ? new Date(b.last || 0) - new Date(a.last || 0) : (b.avg ?? -1) - (a.avg ?? -1));
  const pg = usePaged(rows, 10, q + tid + sort + onlyActive);
  return html`<${PageHead} title="O'quvchilar natijalari" sub=${user.role === 'admin' ? "Barcha testlar bo'yicha har bir o'quvchining natijalari" : "Sizning testlaringiz bo'yicha har bir o'quvchining natijalari"}/>
    <div className="card">
      <div className="filters">
        <div className="search"><${Icon} n="search" s=${16}/><input id="sp-search" className="input" placeholder="Ism yoki login" value=${q} onChange=${e => setQ(e.target.value)}/></div>
        <select id="sp-test" className="select" value=${tid} onChange=${e => setTid(e.target.value)} aria-label="Test"><option value="all">${user.role === 'admin' ? 'Barcha testlar' : 'Barcha testlarim'}</option>${tests.map(t => html`<option key=${t.id} value=${t.id}>${t.title}</option>`)}</select>
        <${Seg} label="Saralash" value=${sort} onChange=${setSort} options=${[['avg',"O'rtacha bo'yicha"],['last','Oxirgi faollik'],['name','Ism bo\'yicha']]}/>
        <label className="actions small muted" style=${{ cursor:'pointer' }}><input type="checkbox" checked=${onlyActive} onChange=${e => setOnlyActive(e.target.checked)} style=${{ accentColor:'var(--accent)' }}/> Faqat test yechganlar</label>
      </div>
      <div className="table-wrap"><table className="tbl compact fit">
        <thead><tr><th>O'quvchi</th><th className="r">Urinish</th><th className="r">Testlar</th><th className="r">O'rtacha</th><th className="r">Eng yaxshi</th><th className="r">${'Qoida­buzarlik'}</th><th>Oxirgi urinish</th><th></th></tr></thead>
        <tbody>${pg.rows.map(r => html`<tr key=${r.u.id} style=${{ cursor:'pointer' }} onClick=${() => navigate('/students/' + r.u.id)}>
          <td><div className="who"><${Avatar} user=${r.u}/><div><b>${fullName(r.u)}</b><span>@${r.u.username}</span></div></div></td>
          <td className="r num">${r.n}</td><td className="r num">${r.tests}</td>
          <td className="r">${r.avg != null ? html`<${Pill} tone=${toneFor(r.avg)} plain>${fmtPct(r.avg)}<//>` : html`<span className="faint">—</span>`}</td>
          <td className="r num">${r.best != null ? fmtPct(r.best) : '—'}</td>
          <td className="r">${r.forced ? html`<${Pill} tone="bad" plain>${r.viol} · ${r.forced} majburiy<//>` : r.viol ? html`<${Pill} tone="warn" plain>${r.viol}<//>` : html`<span className="faint">0</span>`}</td>
          <td className="muted" style=${{ whiteSpace:'nowrap' }}>${r.last ? fmtDateTime(r.last) : '—'}</td>
          <td className="r"><button className="btn sm" onClick=${e => { e.stopPropagation(); navigate('/students/' + r.u.id); }}>Batafsil</button></td></tr>`)}</tbody></table>
        ${!rows.length ? html`<${Empty} icon="users" title="O'quvchi topilmadi">${onlyActive ? "Hali hech kim test yechmagan yoki filtr juda tor." : "Qidiruvni o'zgartiring."}<//>` : null}</div>
      ${pg.pager}
    </div>`;
}
function StudentDetail({ id }){
  const { db, user, navigate } = useApp();
  const { attempts } = useScope();
  const [view, setView] = useState(null);
  const u = db.users.find(x => x.id === id && x.role === 'student');
  const mine = attempts.filter(a => a.student_id === id).sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at));
  const pg = usePaged(mine, 10, id);
  if(!u) return html`<div className="card"><${Empty} icon="alert" title="O'quvchi topilmadi"><button className="btn" onClick=${() => navigate('/students')}>Ro'yxatga qaytish</button><//></div>`;
  const chron = mine.slice().reverse();
  return html`<${PageHead} title=${fullName(u)} sub=${`@${u.username}${u.phone ? ' · ' + u.phone : ''}${u.email ? ' · ' + u.email : ''}`}><button className="btn ghost" onClick=${() => navigate('/students')}><${Icon} n="left" s=${16}/> O'quvchilar</button><//>
    <div className="tiles">
      <${Tile} icon="check" label="Urinishlar" value=${mine.length} sub=${`${new Set(mine.map(a => a.test_id)).size} ta test`}/>
      <${Tile} icon="chart" label="O'rtacha natija" value=${mine.length ? fmtPct(avg(mine.map(a => a.percentage))) : '—'}/>
      <${Tile} icon="trophy" label="Eng yaxshi" value=${mine.length ? fmtPct(Math.max(...mine.map(a => a.percentage))) : '—'}/>
      <${Tile} icon="eye" label="Qoidabuzarliklar" value=${mine.reduce((s, a) => s + (a.tab_switches || 0), 0)} sub=${`${mine.filter(a => a.force_submitted || a.disqualified).length} ta majburan topshirilgan`}/>
    </div>
    <div className="card"><div className="card-head"><div><h3>Natijalar dinamikasi</h3><p>Har bir urinish foizi, vaqt bo'yicha</p></div></div><div className="card-body"><${LineChart} points=${chron.map(a => a.percentage)} labels=${chron.length ? [fmtDate(chron[0].finished_at), fmtDate(chron[chron.length-1].finished_at)] : []}/></div></div>
    <div className="card"><div className="card-head"><div><h3>Barcha urinishlar</h3><p>${user.role === 'admin' ? 'Barcha testlar' : 'Faqat sizning testlaringiz'} · "Ko'rish" — har bir savol bo'yicha javoblari</p></div></div>
      ${mine.length ? html`<div className="table-wrap"><table className="tbl compact"><thead><tr><th>Test</th><th>Sana</th><th className="r">Urinish</th><th className="r">Ball</th><th className="r">Natija</th><th className="r">Tab</th><th></th></tr></thead>
        <tbody>${pg.rows.map(a => { const t = db.tests.find(x => x.id === a.test_id); const s = t && db.subjects.find(x => x.id === t.subject_id); return html`<tr key=${a.id}>
          <td><div className="who"><${SubjIcon} subject=${s}/><div><b>${t ? t.title : "O'chirilgan test"}</b><span>${s ? s.name : ''}</span></div></div></td>
          <td className="muted" style=${{ whiteSpace:'nowrap' }}>${fmtDateTime(a.finished_at)}</td>
          <td className="r num">${a.attempt_number}</td><td className="r num">${fmtNum(a.score)}/${fmtNum(a.max_score)}</td>
          <td className="r"><${Pill} tone=${toneFor(a.percentage)} plain>${fmtPct(a.percentage)}<//></td>          <td className="r">${a.force_submitted || a.disqualified ? html`<span title=${a.violation}><${Pill} tone="bad" plain>${a.tab_switches || 0} · majburiy<//></span>` : a.tab_switches ? html`<${Pill} tone="warn" plain>${a.tab_switches}<//>` : html`<span className="faint">0</span>`}</td>
          <td className="r"><button className="btn sm" onClick=${() => setView(a)}>Ko'rish</button></td></tr>`; })}</tbody></table></div>${pg.pager}`
      : html`<${Empty} icon="chart" title="Bu o'quvchi hali sizning testlaringizni yechmagan"/>`}</div>
    ${view ? html`<${Modal} wide title=${`${fullName(u)} — ${(db.tests.find(t => t.id === view.test_id) || {}).title || ''}, ${view.attempt_number}-urinish`} onClose=${() => setView(null)}>
      ${view.force_submitted ? html`<div className="banner bad"><${Icon} n="alert"/><div>Majburan topshirilgan: ${view.violation}. Qoidabuzarliklar: ${view.tab_switches}.</div></div>` : null}
      <${Breakdown} attempt=${view} mode="detailed"/><//>` : null}`;
}

/* ---------- pages/profile (barcha rollar) ---------- */
function ProfilePage(){
  const { user, run, toast, db } = useApp();
  const [f, setF] = useState({ first_name:user.first_name, last_name:user.last_name, email:user.email || '', phone:user.phone || '' });
  const [pw, setPw] = useState({ old:'', n1:'', n2:'' }); const [pwErr, setPwErr] = useState({});
  const fileRef = useRef(null);
  const set = k => e => setF(Object.assign({}, f, { [k]: e.target.value }));
  const saveInfo = e => { e.preventDefault(); if(!f.first_name.trim() || !f.last_name.trim()){ toast('Ism va familiya majburiy', 'warn'); return; } run(() => api.updateProfile(f), "Profil saqlandi").catch(() => {}); };
  const onAvatar = e => { const file = e.target.files && e.target.files[0]; e.target.value = ''; if(!file) return; if(!file.type.startsWith('image/') || file.size > 2*1024*1024){ toast('2 MB gacha rasm yuklang', 'warn'); return; } const rd = new FileReader(); rd.onload = () => { run(() => api.updateProfile({ avatar:rd.result }), 'Rasm yangilandi').catch(() => {}); }; rd.readAsDataURL(file); };
  const changePw = e => {
    e.preventDefault();
    if(!pw.old) return setPwErr({ old:'Joriy parolni kiriting' });
    if(pw.n1.length < 6) return setPwErr({ n1:"Yangi parol kamida 6 ta belgi bo'lsin" });
    if(pw.n1 !== pw.n2) return setPwErr({ n2:'Yangi parollar mos kelmadi' });
    api.changePassword(pw.old, pw.n1).then(() => { setPw({ old:'', n1:'', n2:'' }); setPwErr({}); toast("Parol o'zgartirildi"); })
      .catch(ex => { const d = ex.response && ex.response.data; if(d && d.old_password) setPwErr({ old:String([].concat(d.old_password)[0]) }); else if(d && d.new_password) setPwErr({ n1:String([].concat(d.new_password)[0]) }); else setPwErr({ old:errText(ex) }); });
  };
  const stat = user.role === 'student' ? `${db.attempts.filter(a => a.student_id === user.id && a.is_completed).length} ta urinish` : user.role === 'teacher' ? `${db.tests.filter(t => t.created_by === user.id).length} ta test` : 'Tizim administratori';
  return html`<${PageHead} title="Profil" sub="Shaxsiy ma'lumotlar va xavfsizlik"/>
    <div className="card profile-head"><${Avatar} user=${user} lg/><div style=${{ flex:1, minWidth:0 }}><h2>${fullName(user)}</h2><p className="muted">@${user.username} · ${ROLE[user.role]} · ${stat}</p><p className="small faint">${fmtDate(user.created_at)} dan beri a'zo</p></div>
      <div className="actions"><button className="btn" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} n="upload" s=${16}/> Rasm yuklash</button>${user.avatar ? html`<button className="btn ghost" onClick=${() => run(() => api.updateProfile({ avatar:null }), 'Rasm olib tashlandi').catch(() => {})}>Olib tashlash</button>` : null}</div>
      <input ref=${fileRef} type="file" accept="image/*" hidden onChange=${onAvatar}/></div>
    <div className="grid g2" style=${{ alignItems:'start' }}>
      <form className="card card-body" onSubmit=${saveInfo} style=${{ display:'flex', flexDirection:'column', gap:14 }}><h3>Shaxsiy ma'lumotlar</h3>
        <div className="form-grid">
          <${Field} label="Ism"><input id="pf-fn" className="input" value=${f.first_name} onChange=${set('first_name')}/><//>
          <${Field} label="Familiya"><input id="pf-ln" className="input" value=${f.last_name} onChange=${set('last_name')}/><//>
          <${Field} label="Email"><input id="pf-em" className="input" type="email" value=${f.email} onChange=${set('email')}/><//>
          <${Field} label="Telefon"><input id="pf-ph" className="input" value=${f.phone} onChange=${set('phone')}/><//>
        </div><button className="btn primary" type="submit" style=${{ alignSelf:'flex-start' }}>Saqlash</button></form>
      <form className="card card-body" onSubmit=${changePw} style=${{ display:'flex', flexDirection:'column', gap:14 }}><h3>Parolni o'zgartirish</h3>
        <${Field} label="Joriy parol" error=${pwErr.old} hint="Demo akkauntlarda: admin123, teacher123 yoki student123"><input id="pw-old" className="input" type="password" autoComplete="current-password" value=${pw.old} onChange=${e => { setPw(Object.assign({}, pw, { old:e.target.value })); setPwErr({}); }}/><//>
        <div className="form-grid">
          <${Field} label="Yangi parol" error=${pwErr.n1}><input id="pw-n1" className="input" type="password" autoComplete="new-password" value=${pw.n1} onChange=${e => { setPw(Object.assign({}, pw, { n1:e.target.value })); setPwErr({}); }}/><//>
          <${Field} label="Takrorlang" error=${pwErr.n2}><input id="pw-n2" className="input" type="password" autoComplete="new-password" value=${pw.n2} onChange=${e => { setPw(Object.assign({}, pw, { n2:e.target.value })); setPwErr({}); }}/><//>
        </div><button className="btn" type="submit" style=${{ alignSelf:'flex-start' }}><${Icon} n="key" s=${16}/> Parolni yangilash</button></form>
    </div>`;
}

/* =========================================================
   App.jsx — router va global holat
   ========================================================= */
function match(route, pattern){
  const a = route.split('?')[0].split('/'), b = pattern.split('/');
  if(a.length !== b.length) return null;
  const params = {};
  for(let i = 0; i < b.length; i++){ if(b[i][0] === ':') params[b[i].slice(1)] = +a[i]; else if(a[i] !== b[i]) return null; }
  return params;
}
const HOME = { admin:'/admin', teacher:'/teacher', student:'/student' };
const ROUTES = [
  ['/admin', ['admin'], () => html`<${AdminDashboard}/>`],
  ['/admin/users', ['admin'], () => html`<${AdminUsers}/>`],
  ['/admin/subjects', ['admin'], () => html`<${AdminSubjects}/>`],
  ['/subjects', ['teacher','student'], () => html`<${AdminSubjects}/>`, 'Fanlar'],
  ['/admin/tests', ['admin'], () => html`<${AdminTests}/>`],
  ['/teacher', ['teacher'], () => html`<${TeacherDashboard}/>`],
  ['/teacher/tests', ['teacher'], () => html`<${TeacherTests}/>`],
  ['/teacher/tests/new', ['teacher'], (p, q) => html`<${TestEditor} key=${'new' + (q || '')} subjectId=${+q || null}/>`, 'Yangi test'],
  ['/teacher/tests/:id/edit', ['teacher'], p => html`<${TestEditor} key=${p.id} id=${p.id}/>`, 'Testni tahrirlash'],
  ['/teacher/bank', ['teacher'], () => html`<${QuestionBankPage}/>`],
  ['/results/:id', ['teacher','admin'], p => html`<${ResultsPage} id=${p.id}/>`, 'Natijalar'],
  ['/students', ['teacher','admin'], () => html`<${StudentsPage}/>`],
  ['/students/:id', ['teacher','admin'], p => html`<${StudentDetail} key=${p.id} id=${p.id}/>`, "O'quvchi natijalari"],
  ['/student', ['student'], () => html`<${StudentDashboard}/>`],
  ['/student/tests', ['student'], (p, q) => html`<${StudentTests} key=${'st' + (q || '')} initialSubj=${q || 'all'}/>`],
  ['/student/test/:id', ['student'], p => html`<${TestIntro} id=${p.id}/>`, 'Test'],
  ['/student/result/:id', ['student'], p => html`<${StudentResult} id=${p.id}/>`, 'Natija'],
  ['/student/history', ['student'], () => html`<${StudentHistory}/>`],
  ['/student/leaderboard', ['student'], (p, q) => html`<${StudentLeaderboard} initial=${+q}/>`],
  ['/profile', ['admin','teacher','student'], () => html`<${ProfilePage}/>`]
];

const EMPTY_DB = { users:[], subjects:[], banks:[], tests:[], questions:[], attempts:[] };
const currentPath = () => location.pathname + (location.search || '');

function App(){
  /* db — joriy foydalanuvchiga ruxsat etilgan ma'lumotlar (GET /api/bootstrap/). Har bir o'zgarishdan keyin refresh() qayta yuklaydi. */
  const [db, setDb] = useState(EMPTY_DB);
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(hasTokens());
  const [route, setRoute] = useState(currentPath);
  const [theme, setThemeS] = useState(() => store.get(KEYS.theme, 'light'));
  const [toasts, setToasts] = useState([]);

  const [palette, setPalette] = useState(() => store.get('bm_examer.palette.v3', 'blue'));
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); store.set(KEYS.theme, theme); }, [theme]);
  useEffect(() => { document.documentElement.setAttribute('data-palette', palette); store.set('bm_examer.palette.v3', palette); }, [palette]);

  const toast = useCallback((msg, type) => { const id = nid(); setToasts(t => t.concat({ id, msg, type: type || 'ok' })); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600); }, []);
  /* Brauzer manzili (URL) bilan ishlaydigan router: sahifani yangilasa ham joyida qoladi, "Orqaga" tugmasi ishlaydi */
  const navigate = useCallback((p, replace) => { if(p !== currentPath()) history[replace ? 'replaceState' : 'pushState'](null, '', p); setRoute(p); window.scrollTo(0, 0); }, []);
  useEffect(() => { const f = () => setRoute(currentPath()); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }, []);

  const refresh = useCallback(async () => {
    const d = await api.bootstrap();
    setMe(d.me);
    setDb({ users:d.users, subjects:d.subjects, banks:d.banks, tests:d.tests, questions:d.questions, attempts:d.attempts });
    return d;
  }, []);
  const logout = useCallback(() => { setTokens(null); setMe(null); setDb(EMPTY_DB); navigate('/login'); }, []);
  useEffect(() => { setLogoutHandler(() => { setMe(null); setDb(EMPTY_DB); navigate('/login', true); toast('Sessiya tugadi — qaytadan kiring', 'warn'); }); }, []);
  useEffect(() => { if(hasTokens()) refresh().catch(() => logout()).finally(() => setBooting(false)); }, []);

  /* Kirish: tokenlar saqlanadi va ma'lumotlar yuklanadi */
  const login = useCallback(async (tokens, msg) => {
    setTokens({ access:tokens.access, refresh:tokens.refresh });
    const d = await refresh();
    navigate(HOME[d.me.role]);
    toast(msg || `Xush kelibsiz, ${d.me.first_name}!`);
  }, []);
  /* run(): API amalini bajaradi, so'ng ma'lumotlarni yangilaydi; xatoni toast bilan ko'rsatadi */
  const run = useCallback(async (fn, okMsg) => {
    try{ const r = await fn(); await refresh(); if(okMsg) toast(okMsg); return r; }
    catch(e){ toast(errText(e), 'bad'); throw e; }
  }, []);
  const setTheme = setThemeS;
  const user = me ? (db.users.find(u => u.id === me.id) ? Object.assign({}, db.users.find(u => u.id === me.id), me) : me) : null;

  const ctx = { db, user, route, navigate, toast, theme, setTheme, palette, setPalette, login, logout, refresh, run };

  let view;
  if(booting){
    view = html`<div className="boot">BM Examer yuklanmoqda…</div>`;
  } else if(!user){
    view = route === '/register' ? html`<${RegisterPage}/>` : html`<${LoginPage}/>`;
  } else {
    const take = match(route, '/student/take/:id');
    if(take && user.role === 'student') view = html`<${TakeTest} key=${take.id} id=${take.id}/>`;
    else {
      const q = route.split('?')[1];
      let found = null;
      for(const r of ROUTES){ const p = match(route, r[0]); if(p && r[1].includes(user.role)){ found = [r, p]; break; } }
      const exists = !found && ROUTES.some(r => match(route, r[0])) || (!!take && user.role !== 'student');
      /* 403: sahifa bor, lekin bu rolga ruxsat yo'q (backendda API ham 403 qaytaradi) */
      if(!found && exists) view = html`<${Shell} crumb="403"><div className="card"><${Empty} icon="alert" title="403 — Ruxsat yo'q">Bu sahifa ${ROLE[user.role].toLowerCase()} uchun yopiq. Sizning rolingiz: ${ROLE[user.role]}.<button className="btn primary" onClick=${() => navigate(HOME[user.role])}>Bosh panelga qaytish</button><//></div><//>`;
      else if(!found){ setTimeout(() => navigate(HOME[user.role]), 0); view = html`<div className="boot">Yo'naltirilmoqda…</div>`; }
      else view = html`<${Shell} crumb=${found[0][3]}>${found[0][2](found[1], q)}<//>`;
    }
  }
  return html`<${AppCtx.Provider} value=${ctx}>${view}
    <div className="toasts" role="status" aria-live="polite">${toasts.map(t => html`<div key=${t.id} className=${'toast ' + t.type}><${Icon} n=${t.type === 'ok' ? 'check' : 'alert'}/>${t.msg}</div>`)}</div><//>`;
}

/* Xato chegarasi: ilovada kutilmagan xato bo'lsa, oq sahifa o'rniga xabar va tiklash tugmalari chiqadi */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { error:null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error){ try{ console.error('BM Examer xatosi:', error); }catch(e){} }
  render(){
    if(!this.state.error) return this.props.children;
    const home = () => { location.href = '/'; };
    const relogin = () => { setTokens(null); location.href = '/login'; };
    return html`<div className="boot"><div className="card card-pad" style=${{ maxWidth:520, display:'flex', flexDirection:'column', gap:14 }}>
      <h2>Sahifani ko'rsatishda xato yuz berdi</h2>
      <p className="muted">Bosh sahifaga qayting. Muammo takrorlansa, tizimdan chiqib qayta kiring.</p>
      <code className="small mono faint" style=${{ overflowWrap:'anywhere' }}>${String(this.state.error && this.state.error.message || this.state.error)}</code>
      <div className="actions"><button className="btn primary" onClick=${home}>Bosh sahifa</button><button className="btn" onClick=${relogin}>Qayta kirish</button></div>
    </div></div>`;
  }
}
export function mount(el){ createRoot(el).render(html`<${ErrorBoundary}><${App}/><//>`); }
