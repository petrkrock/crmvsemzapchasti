import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStore, useStoreVersion, updateStore } from '@/lib/store';
import { Search, Pencil, FileDown, Trash2, Save } from 'lucide-react';

const STATUS_FILTERS = ['Все', 'Новое', 'Загружено', 'Есть изменения', 'Удаление'] as const;
const DAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const TK_TEXT = 'Условия доставки по согласованию!';
const RETURN_PRESETS = ['Возврат без комиссии', 'Возврат с комиссией', 'Нет возврата'];

type Cond = {
  id?: string; city?: string; warehouseName?: string;
  deliveryTime?: string; deliverySchedule?: string; orderUnloadSchedule?: string;
  returnConditions?: string; representative?: string; contacts?: string; email?: string;
  status?: string;
};

/**
 * Проценка (ТЗ v1.24.0–1.24.3): единое управление условиями сервиса проценки (DBS)
 * всех поставщиков. Источник — supplier.serviceSearch: правки здесь = правки везде.
 */
export default function PricingPage() {
  useStoreVersion();
  const store = getStore();

  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fCity, setFCity] = useState('');
  const [fType, setFType] = useState('');
  const [fResp, setFResp] = useState('');
  const [fStatus, setFStatus] = useState<string>('Все');
  const [fTk, setFTk] = useState<'off' | 'with' | 'without'>('off'); // ТЗ v1.24.3: трёхступенчатый фильтр ТК
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Cond | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const suppliers = store.suppliers.filter(s => (tab === 'archived' ? !!s.deletedAt : !s.deletedAt));
  const rows: Array<{ s: (typeof store.suppliers)[number]; c: Cond; idx: number; key: string }> = [];
  suppliers.forEach(s => (s.serviceSearch || []).forEach((c, i) => rows.push({ s, c: c as Cond, idx: i, key: `${s.id}:${i}` })));

  const cities = Array.from(new Set(rows.map(r => r.c.city).filter(Boolean) as string[]));
  const respUsers = (store.settings.users || []).filter(u => u.status === 'active');

  const list = rows.filter(({ s, c }) => {
    if (fSupplier && s.id !== fSupplier) return false;
    if (fCity && c.city !== fCity) return false;
    if (fType && s.type !== fType) return false;
    if (fResp && s.responsibleId !== fResp) return false;
    if (fStatus !== 'Все' && (c.status || 'Новое') !== fStatus) return false;
    const hasTk = String(c.orderUnloadSchedule || '').includes(TK_TEXT);
    if (fTk === 'with' && !hasTk) return false;
    if (fTk === 'without' && hasTk) return false;
    if (q) {
      const hay = `${s.tradeName} ${c.city} ${c.warehouseName} ${c.deliveryTime} ${c.orderUnloadSchedule} ${c.representative}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const days = (sched?: string) => (sched || '').split(',').map(x => x.trim()).filter(Boolean);
  const chipCls = (st?: string) => (st || 'Новое') === 'Загружено'
    ? 'bg-green-50 text-green-700 border-green-200'
    : (st || 'Новое') === 'Есть изменения'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : (st || 'Новое') === 'Удаление'
        ? 'bg-gray-200 text-gray-600 border-gray-300'
        : 'bg-red-50 text-red-700 border-red-200';
  const selectCls = 'form-input text-xs py-1.5 w-auto';
  const inCls = 'form-input text-xs';

  const openRow = (key: string, c: Cond) => { setExpanded(key); setDraft({ ...(c as object) } as Cond); };
  const closeRow = () => { setExpanded(null); setDraft(null); };

  const saveCond = (supplierId: string, idx: number) => {
    if (!draft) return;
    updateStore(st => ({
      ...st,
      suppliers: st.suppliers.map(s => s.id === supplierId
        ? { ...s, serviceSearch: (s.serviceSearch || []).map((cc, i) => (i === idx ? { ...(cc as object), ...(draft as object) } : cc)) }
        : s),
    }));
    closeRow();
  };
  const deleteCond = (supplierId: string, idx: number) => {
    if (!window.confirm('Удалить условие проценки?')) return;
    updateStore(st => ({
      ...st,
      suppliers: st.suppliers.map(s => s.id === supplierId
        ? { ...s, serviceSearch: (s.serviceSearch || []).filter((_, i) => i !== idx) }
        : s),
    }));
    closeRow();
  };

  const toggleSelect = (key: string) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allSel = list.length > 0 && list.every(r => selected.has(r.key));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(list.map(r => r.key)));

  const exportWord = () => {
    const exp = list.filter(r => selected.has(r.key));
    if (!exp.length) return;
    const esc = (v?: string) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;font-size:12px}</style></head><body>
      <h2>Условия сервиса проценки (DBS)</h2>
      <table><tr><th>Поставщик</th><th>Склад</th><th>Город</th><th>График доставки</th><th>Срок поставки</th><th>Условия доставки</th><th>Статус</th></tr>
      ${exp.map(({ s, c }) => `<tr><td>${esc(s.tradeName)}</td><td>${esc(c.warehouseName)}</td><td>${esc(c.city)}</td><td>${esc(c.deliverySchedule)}</td><td>${esc(c.deliveryTime)}</td><td>${esc(c.orderUnloadSchedule)}</td><td>${esc(c.status || 'Новое')}</td></tr>`).join('')}
      </table></body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
    a.download = 'usloviya-procenki.doc';
    a.click();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Проценка</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab('active')} className={`btn-secondary text-xs py-1.5 px-3 ${tab === 'active' ? 'bg-gray-200' : ''}`}>Условия проценки</button>
          <button onClick={() => setTab('archived')} className={`btn-secondary text-xs py-1.5 px-3 ${tab === 'archived' ? 'bg-gray-200' : ''}`}>Архив</button>
        </div>
      </div>

      {/* Поиск, затем фильтры */}
      <div className="card-base p-3 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input text-xs pl-8 w-full" placeholder="Поиск: поставщик, город, склад, условия…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={selectCls} value={fSupplier} onChange={e => setFSupplier(e.target.value)}>
            <option value="">Все поставщики</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
          </select>
          <select className={selectCls} value={fCity} onChange={e => setFCity(e.target.value)}>
            <option value="">Все города</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectCls} value={fType} onChange={e => setFType(e.target.value)}>
            <option value="">Все типы</option>
            {(store.settings.supplierTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={selectCls} value={fResp} onChange={e => setFResp(e.target.value)}>
            <option value="">Все ответственные</option>
            {respUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {STATUS_FILTERS.map(st => (
            <button key={st} onClick={() => setFStatus(st)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${fStatus === st ? 'bg-brand-black text-white border-brand-black font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>{st}</button>
          ))}
          {/* ТЗ v1.24.3: фильтр ТК — 3 состояния: выкл → только с ТК → только без ТК → выкл */}
          <button onClick={() => setFTk(v => v === 'off' ? 'with' : v === 'with' ? 'without' : 'off')}
            className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-colors ${fTk !== 'off' ? 'bg-yellow-300 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:border-yellow-400'}`}
            title="Фильтр по кнопке ТК: нажали — только с ТК, ещё раз — только без ТК, ещё раз — выкл">
            ТК{fTk === 'with' ? ': с' : fTk === 'without' ? ': без' : ''}
          </button>
        </div>
      </div>

      {/* Скрытое меню при выбранных строках */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <span className="text-gray-500">Выбрано: {selected.size}</span>
          <button onClick={exportWord} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1 ml-auto">
            <FileDown size={13} /> Выгрузить в Word
          </button>
        </div>
      )}

      {/* Таблица */}
      <div className="card-base overflow-hidden">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gray-mid">
                <th className="table-header w-8"><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>
                <th className="table-header">Поставщик</th>
                <th className="table-header">Склад поставщика</th>
                <th className="table-header">Город</th>
                <th className="table-header">График доставки</th>
                <th className="table-header">Срок поставки</th>
                <th className="table-header">Условия доставки</th>
                <th className="table-header">Статус</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={8}>Условия проценки не найдены{tab === 'archived' ? ' в архиве' : ''}.</td></tr>
              )}
              {list.map(({ s, c, idx, key }) => {
                const open = expanded === key;
                const dlist = days(c.deliverySchedule);
                return (
                  <Fragment key={key}>
                    <tr onClick={() => (open ? closeRow() : openRow(key, c))}
                      className={`border-b border-brand-gray-mid transition-colors ${open ? 'bg-gray-50' : 'hover:bg-gray-50 cursor-pointer'}`}>
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} />
                      </td>
                      <td className="table-cell">
                        <Link to={`/suppliers/${s.id}`} onClick={e => e.stopPropagation()} className="text-red-700 hover:underline font-medium">{s.tradeName}</Link>
                      </td>
                      <td className="table-cell">{c.warehouseName || '—'}</td>
                      <td className="table-cell">{c.city || '—'}</td>
                      <td className="table-cell">
                        <div className="flex gap-1">
                          {DAYS.map(d => (
                            <span key={d} className={`w-6 h-6 text-[10px] flex items-center justify-center rounded-md border ${dlist.includes(d) ? 'bg-green-600 border-green-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-400'}`}>{d}</span>
                          ))}
                        </div>
                      </td>
                      <td className="table-cell text-xs">{c.deliveryTime || '—'}</td>
                      <td className="table-cell text-xs max-w-[240px] truncate" title={c.orderUnloadSchedule}>{c.orderUnloadSchedule || '—'}</td>
                      <td className="table-cell"><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${chipCls(c.status)}`}>{c.status || 'Новое'}</span></td>
                    </tr>
                    {open && draft && (
                      <tr className="border-b border-brand-gray-mid bg-gray-50">
                        <td colSpan={8} className="px-4 py-4">
                          {/* Зеркальный редактор условия (как в карточке поставщика) */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Город показов</label>
                                <input className={inCls + ' w-full mt-1'} value={draft.city || ''} onChange={e => setDraft(d => d && { ...d, city: e.target.value })} />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Склад отгрузки</label>
                                <input className={inCls + ' w-full mt-1'} value={draft.warehouseName || ''} onChange={e => setDraft(d => d && { ...d, warehouseName: e.target.value })} />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Статус</label>
                                <select className={inCls + ' w-full mt-1'} value={draft.status || 'Новое'} onChange={e => setDraft(d => d && { ...d, status: e.target.value })}>
                                  {STATUS_FILTERS.filter(x => x !== 'Все').map(sx => <option key={sx} value={sx}>{sx}</option>)}
                                </select>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Срок поставки</label>
                                <div className="flex gap-1.5 mt-1">
                                  <button type="button" onClick={() => setDraft(d => d && { ...d, orderUnloadSchedule: String(d.orderUnloadSchedule || '').includes(TK_TEXT) ? String(d.orderUnloadSchedule || '').replace(TK_TEXT, '').trim() : [String(d.orderUnloadSchedule || '').trim(), TK_TEXT].filter(Boolean).join(' ') })}
                                    className={`px-2 py-1.5 rounded-lg border font-bold ${String(draft.orderUnloadSchedule || '').includes(TK_TEXT) ? 'bg-yellow-300 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-500'}`}>ТК</button>
                                  {['Сегодня', 'Завтра'].map(v => (
                                    <button key={v} type="button" onClick={() => setDraft(d => d && { ...d, deliveryTime: v })}
                                      className={`px-2 py-1.5 rounded-lg border ${(draft.deliveryTime || '').toLowerCase() === v.toLowerCase() ? 'bg-brand-black text-white' : 'bg-white border-gray-200 text-gray-500'}`}>{v}</button>
                                  ))}
                                  <input className={inCls + ' flex-1'} value={draft.deliveryTime || ''} onChange={e => setDraft(d => d && { ...d, deliveryTime: e.target.value })} placeholder="2-3 дня" />
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">График доставки</label>
                                <div className="flex gap-1 mt-1">
                                  {DAYS.map(d => {
                                    const cur = days(draft.deliverySchedule);
                                    const on = cur.includes(d);
                                    return (
                                      <button key={d} type="button"
                                        onClick={() => setDraft(dd => dd && { ...dd, deliverySchedule: on ? cur.filter(x => x !== d).join(', ') : [...cur, d].join(', ') })}
                                        className={`w-8 h-8 rounded-lg border text-[11px] ${on ? 'bg-green-600 border-green-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}>{d}</button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Условия доставки</label>
                                <input className={inCls + ' w-full mt-1'} value={draft.orderUnloadSchedule || ''} onChange={e => setDraft(d => d && { ...d, orderUnloadSchedule: e.target.value })} />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Возврат</label>
                                <input className={inCls + ' w-full mt-1'} list="return-presets" value={draft.returnConditions || ''} onChange={e => setDraft(d => d && { ...d, returnConditions: e.target.value })} />
                                <datalist id="return-presets">{RETURN_PRESETS.map(r => <option key={r} value={r} />)}</datalist>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Представитель</label>
                                <input className={inCls + ' w-full mt-1'} value={draft.representative || ''} onChange={e => setDraft(d => d && { ...d, representative: e.target.value })} />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Контакты</label>
                                <input className={inCls + ' w-full mt-1'} value={draft.contacts || ''} onChange={e => setDraft(d => d && { ...d, contacts: e.target.value })} />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-gray-400">Email</label>
                                <input className={inCls + ' w-full mt-1'} value={draft.email || ''} onChange={e => setDraft(d => d && { ...d, email: e.target.value })} />
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button onClick={() => saveCond(s.id, idx)} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"><Save size={13} /> Сохранить</button>
                            <button onClick={() => deleteCond(s.id, idx)} className="bg-white border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl px-3 py-1.5 inline-flex items-center gap-1 transition-colors"><Trash2 size={13} /> Удалить</button>
                            <Link to={`/suppliers/${s.id}`} className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1 ml-auto"><Pencil size={13} /> В карточке</Link>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400">Показано условий: {list.length} из {rows.length}</p>
    </div>
  );
}
