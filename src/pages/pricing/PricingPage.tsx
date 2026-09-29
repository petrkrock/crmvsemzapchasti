import { Fragment, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStore, useStoreVersion } from '@/lib/store';
import { Search, Pencil } from 'lucide-react';

const STATUS_FILTERS = ['Все', 'Новое', 'Загружено', 'Есть изменения', 'Удаление'] as const;
const DAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

type Cond = {
  id?: string; city?: string; warehouseName?: string;
  deliveryTime?: string; deliverySchedule?: string; orderUnloadSchedule?: string;
  returnConditions?: string; representative?: string; contacts?: string; email?: string;
  status?: string;
};

/**
 * Проценка (ТЗ v1.24.0): единое управление условиями сервиса проценки (DBS)
 * всех поставщиков. Источник данных — supplier.serviceSearch (как в карточке и ЛК):
 * правки здесь = правки везде.
 */
export default function PricingPage() {
  useStoreVersion();
  const store = getStore();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fCity, setFCity] = useState('');
  const [fType, setFType] = useState('');
  const [fResp, setFResp] = useState('');
  const [fStatus, setFStatus] = useState<string>('Все');
  const [expanded, setExpanded] = useState<string | null>(null); // `${supplierId}:${index}`

  const suppliers = store.suppliers.filter(s => (tab === 'archived' ? !!s.deletedAt : !s.deletedAt));
  const rows: Array<{ s: (typeof store.suppliers)[number]; c: Cond; key: string }> = [];
  suppliers.forEach(s => (s.serviceSearch || []).forEach((c, i) => rows.push({ s, c: c as Cond, key: `${s.id}:${i}` })));

  const cities = Array.from(new Set(rows.map(r => r.c.city).filter(Boolean) as string[]));
  const respUsers = (store.settings.users || []).filter(u => u.status === 'active');

  const list = rows.filter(({ s, c }) => {
    if (fSupplier && s.id !== fSupplier) return false;
    if (fCity && c.city !== fCity) return false;
    if (fType && s.type !== fType) return false;
    if (fResp && s.responsibleId !== fResp) return false;
    if (fStatus !== 'Все' && (c.status || 'Новое') !== fStatus) return false;
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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Проценка</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab('active')}
            className={`btn-secondary text-xs py-1.5 px-3 ${tab === 'active' ? 'bg-gray-200' : ''}`}>Условия проценки</button>
          <button onClick={() => setTab('archived')}
            className={`btn-secondary text-xs py-1.5 px-3 ${tab === 'archived' ? 'bg-gray-200' : ''}`}>Архив</button>
        </div>
      </div>

      {/* Поиск и фильтры */}
      <div className="card-base p-3 space-y-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="form-input text-xs pl-8 w-full" placeholder="Поиск: поставщик, город, склад, условия…"
            value={q} onChange={e => setQ(e.target.value)} />
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
        {/* Фильтр-пилюли по статусам */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {STATUS_FILTERS.map(st => (
            <button key={st} onClick={() => setFStatus(st)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${fStatus === st ? 'bg-brand-black text-white border-brand-black font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Таблица условий */}
      <div className="card-base overflow-hidden">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gray-mid">
                <th className="table-header">Поставщик</th>
                <th className="table-header">Город</th>
                <th className="table-header">Склад поставщика</th>
                <th className="table-header">График доставки</th>
                <th className="table-header">Срок поставки</th>
                <th className="table-header">Условия доставки</th>
                <th className="table-header">Статус</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={7}>
                  Условия проценки не найдены{tab === 'archived' ? ' в архиве' : ''}.
                </td></tr>
              )}
              {list.map(({ s, c, key }) => {
                const open = expanded === key;
                const dlist = days(c.deliverySchedule);
                return (
                  <Fragment key={key}>
                    <>
                      <tr onClick={() => setExpanded(open ? null : key)}
                        className={`border-b border-brand-gray-mid transition-colors ${open ? 'bg-gray-50' : 'hover:bg-gray-50 cursor-pointer'}`}>
                        <td className="table-cell">
                          <Link to={`/suppliers/${s.id}`} onClick={e => e.stopPropagation()}
                            className="text-red-700 hover:underline font-medium">{s.tradeName}</Link>
                        </td>
                        <td className="table-cell">{c.city || '—'}</td>
                        <td className="table-cell">{c.warehouseName || '—'}</td>
                        <td className="table-cell">
                          <div className="flex gap-1">
                            {DAYS.map(d => (
                              <span key={d} className={`w-6 h-6 text-[10px] flex items-center justify-center rounded-md border ${dlist.includes(d) ? 'bg-green-600 border-green-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-400'}`}>{d}</span>
                            ))}
                          </div>
                        </td>
                        <td className="table-cell text-xs">{c.deliveryTime || '—'}</td>
                        <td className="table-cell text-xs max-w-[260px] truncate" title={c.orderUnloadSchedule}>{c.orderUnloadSchedule || '—'}</td>
                        <td className="table-cell">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${chipCls(c.status)}`}>{c.status || 'Новое'}</span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-brand-gray-mid bg-gray-50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <div className="space-y-1">
                                <p className="text-gray-400 uppercase text-[10px] tracking-wide">Склад / город</p>
                                <p className="font-medium text-gray-800">{c.warehouseName || '—'} · {c.city || '—'}</p>
                                <p className="text-gray-400 uppercase text-[10px] tracking-wide pt-2">Срок поставки</p>
                                <p>{c.deliveryTime || '—'}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-gray-400 uppercase text-[10px] tracking-wide">Условия доставки</p>
                                <p>{c.orderUnloadSchedule || '—'}</p>
                                <p className="text-gray-400 uppercase text-[10px] tracking-wide pt-2">Возврат</p>
                                <p>{c.returnConditions || '—'}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-gray-400 uppercase text-[10px] tracking-wide">Представитель</p>
                                <p>{c.representative || '—'}</p>
                                <p className="text-gray-400 uppercase text-[10px] tracking-wide pt-2">Контакты / Email</p>
                                <p>{c.contacts || '—'}{c.email ? ` · ${c.email}` : ''}</p>
                              </div>
                            </div>
                            <div className="mt-3">
                              <button onClick={() => navigate(`/suppliers/${s.id}`)}
                                className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1">
                                <Pencil size={13} /> Редактировать
                              </button>
                              <span className="text-[11px] text-gray-400 ml-2">Правка ведётся в карточке поставщика (вкладка «Сервис проценки (DBS)») и действует везде.</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
