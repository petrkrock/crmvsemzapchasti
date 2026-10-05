import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Landmark, MapPin, Route, Truck, Undo2, Users, Warehouse, X } from 'lucide-react';
import { getStore, useStoreVersion, updateStore } from '@/lib/store';
import { getCurrentUser } from '@/lib/auth';
import { toast } from 'sonner';
import { Supplier } from '@/types';

/** v1.29.0: раздел «Доставка» (DBO) в CRM. */

type ViewKey = 'deliveries' | 'returns' | 'documents' | 'finance' | 'cities' | 'pickup' | 'suppliers';

const VIEWS: { key: ViewKey; label: string; icon: typeof Truck }[] = [
  { key: 'deliveries', label: 'Доставки', icon: Truck },
  { key: 'returns', label: 'Возвраты', icon: Undo2 },
  { key: 'documents', label: 'Документы', icon: FileText },
  { key: 'finance', label: 'Финансы', icon: Landmark },
  { key: 'cities', label: 'Города доставки', icon: MapPin },
  { key: 'pickup', label: 'Маршруты самовывоза', icon: Route },
  { key: 'suppliers', label: 'Поставщики', icon: Users },
];

const DAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const TABS = ['Анкета DBO', 'Финансы', 'Комментарий'];

export default function DeliveryPage() {
  useStoreVersion();
  const navigate = useNavigate();
  const store = getStore();
  const [view, setView] = useState<ViewKey>('deliveries');

  const [fSearch, setFSearch] = useState('');
  const [fCity, setFCity] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fResp, setFResp] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anketaTab, setAnketaTab] = useState(0);
  const [commentDraft, setCommentDraft] = useState('');

  const suppliers = store.suppliers.filter(s => !s.deletedAt);
  const deliveryCities = store.settings.deliveryCities || [];
  const operators = store.settings.deliveryOperators || [];
  const statuses = store.settings.deliveryContractStatuses || ['Ждёт активации', 'Активный', 'Аннулирован'];
  const respUsers = (store.settings.users || []).filter(u => u.status === 'active');

  const contractStatus = (s: Supplier) =>
    s.deliveryContract?.status ? s.deliveryContract.status :
    s.deliveryAccess?.enabled && s.deliveryAccess?.token ? 'Активный' :
    s.deliveryAccess && !s.deliveryAccess.enabled ? 'Аннулирован' : 'Ждёт активации';

  const filtered = suppliers.filter(s => {
    if (fSearch && !(s.tradeName || '').toLowerCase().includes(fSearch.toLowerCase()) && !(s.legalName || '').toLowerCase().includes(fSearch.toLowerCase())) return false;
    if (fSupplier && s.id !== fSupplier) return false;
    if (fResp && s.responsible !== fResp) return false;
    if (fCity && !(s.warehouseLocations || []).some(w => w.city === fCity)) return false;
    if (fStatus && contractStatus(s) !== fStatus) return false;
    return true;
  });

  const selected = filtered.find(s => s.id === selectedId) || null;

  function patchContract(id: string, patch: Record<string, unknown>) {
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, deliveryContract: { ...x.deliveryContract, ...patch }, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) }));
    toast.success('Сохранено');
  }

  const statusCls = (st: string) =>
    st === 'Активный' ? 'bg-green-50 text-green-700 border-green-200' :
    st === 'Аннулирован' ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Доставка</h1>
        <div className="flex gap-2 flex-wrap">
          {VIEWS.map(v => (
            <button key={v.key} type="button" onClick={() => setView(v.key)}
              className={`btn-secondary text-xs flex items-center gap-1.5 ${view === v.key ? '!border-red-600 !text-red-600' : ''}`}>
              <v.icon size={13} /> {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'suppliers' && (
        <>
          {/* ФИЛЬТР */}
          <div className="card-base p-4">
            <div className="flex flex-wrap gap-2 items-center">
              <input className="form-input py-1.5 text-xs flex-1 min-w-[200px]" placeholder="Поиск поставщика..." value={fSearch} onChange={e => setFSearch(e.target.value)} />
              <select className="form-input py-1.5 text-xs w-auto" value={fCity} onChange={e => setFCity(e.target.value)}>
                <option value="">Город: все</option>
                {deliveryCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="form-input py-1.5 text-xs w-auto" value={fSupplier} onChange={e => setFSupplier(e.target.value)}>
                <option value="">Поставщик: все</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
              </select>
              <select className="form-input py-1.5 text-xs w-auto" value={fResp} onChange={e => setFResp(e.target.value)}>
                <option value="">Ответственный: все</option>
                {respUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {(fSearch || fCity || fSupplier || fResp || fStatus) && (
                <button onClick={() => { setFSearch(''); setFCity(''); setFSupplier(''); setFResp(''); setFStatus(''); }} className="btn-secondary text-xs">Сбросить</button>
              )}
            </div>
          </div>

          {/* ПИЛЮЛИ СТАТУСОВ */}
          <div className="card-base p-4">
            <div className="flex flex-wrap gap-2">
              {['', ...statuses].map(st => (
                <button key={st || 'all'} type="button" onClick={() => setFStatus(st)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${fStatus === st ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}>
                  {st || 'Все'}
                </button>
              ))}
            </div>
          </div>

          {/* АНКЕТА DBO */}
          {selected && (
            <div className="card-base p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">{selected.tradeName}</h3>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusCls(contractStatus(selected))}`}>{contractStatus(selected)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => navigate(`/suppliers/${selected.id}`)} className="btn-secondary text-xs">Анкета поставщика</button>
                  <button type="button" onClick={() => setSelectedId(null)} className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"><X size={15} /></button>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap border-b border-gray-100 pb-3">
                {TABS.map((tb, i) => (
                  <button key={tb} type="button" onClick={() => setAnketaTab(i)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${anketaTab === i ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{tb}</button>
                ))}
              </div>

              {anketaTab === 0 && (() => {
                const dc = selected.deliveryContract || {};
                const whs = selected.warehouseLocations || [];
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Маршрут</label>
                        <select className="form-input text-xs mt-1" value={dc.route || ''} onChange={e => patchContract(selected.id, { route: e.target.value })}>
                          <option value="">— список появится позже —</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">График и время</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {DAYS.map(d => (
                            <button key={d} type="button"
                              onClick={() => patchContract(selected.id, { scheduleDays: (dc.scheduleDays || []).includes(d) ? (dc.scheduleDays || []).filter(x => x !== d) : [...(dc.scheduleDays || []), d] })}
                              className={`w-9 h-9 rounded-lg text-xs font-semibold border transition-colors ${(dc.scheduleDays || []).includes(d) ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}>{d}</button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="time" className="form-input text-xs w-auto" value={dc.scheduleFrom || ''} onChange={e => patchContract(selected.id, { scheduleFrom: e.target.value })} />
                          <span className="text-xs text-gray-400">—</span>
                          <input type="time" className="form-input text-xs w-auto" value={dc.scheduleTo || ''} onChange={e => patchContract(selected.id, { scheduleTo: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Склад</label>
                        <select className="form-input text-xs mt-1" value={dc.warehouseId || ''} onChange={e => patchContract(selected.id, { warehouseId: e.target.value })}>
                          <option value="">— выберите склад —</option>
                          {whs.map((w, i) => <option key={w.id || i} value={w.id || String(i)}>{w.city}{w.address ? `, ${w.address}` : ''}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Оператор</label>
                        <select className="form-input text-xs mt-1" value={dc.operatorId || ''} onChange={e => patchContract(selected.id, { operatorId: e.target.value })}>
                          <option value="">— список появится позже —</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Города</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {deliveryCities.map(c => (
                            <button key={c} type="button"
                              onClick={() => patchContract(selected.id, { cities: (dc.cities || []).includes(c) ? (dc.cities || []).filter(x => x !== c) : [...(dc.cities || []), c] })}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${(dc.cities || []).includes(c) ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}>{c}</button>
                          ))}
                          {!deliveryCities.length && <p className="text-xs text-gray-400">Список городов пуст (Настройки → Доставка).</p>}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Статус договора</label>
                        <select className="form-input text-xs mt-1" value={dc.status || contractStatus(selected)} onChange={e => patchContract(selected.id, { status: e.target.value })}>
                          {statuses.map(st => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Тариф сервиса</label>
                        <select className="form-input text-xs mt-1" value={dc.serviceTariff || ''} onChange={e => patchContract(selected.id, { serviceTariff: e.target.value })}>
                          <option value="">— список появится позже —</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Тариф за Город</label>
                        <select className="form-input text-xs mt-1" value={dc.cityTariff || ''} onChange={e => patchContract(selected.id, { cityTariff: e.target.value })}>
                          <option value="">— список появится позже —</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {anketaTab === 1 && (
                <p className="text-xs text-gray-400">Раздел «Финансы» появится в следующих обновлениях.</p>
              )}

              {anketaTab === 2 && (
                <div className="space-y-2">
                  <textarea className="form-input min-h-[120px] text-xs" placeholder="Комментарий по договору доставки..."
                    value={commentDraft || selected.deliveryContract?.comment || ''}
                    onChange={e => setCommentDraft(e.target.value)} />
                  <button type="button" onClick={() => { patchContract(selected.id, { comment: commentDraft }); setCommentDraft(''); }}
                    className="btn-primary text-xs">Сохранить комментарий</button>
                </div>
              )}
            </div>
          )}

          {/* СПИСОК */}
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">Поставщик</th>
                    <th className="table-header text-left">Маршрут</th>
                    <th className="table-header text-left">График и время</th>
                    <th className="table-header text-left" title="Склад и адрес">Склад</th>
                    <th className="table-header text-left">Города</th>
                    <th className="table-header text-left">Оператор</th>
                    <th className="table-header text-left">Статус договора</th>
                    <th className="table-header text-left">Тариф сервиса</th>
                    <th className="table-header text-left">Тариф за Город</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const dc = s.deliveryContract || {};
                    const wh = (s.warehouseLocations || []).find(w => (w.id || '') === dc.warehouseId) || (s.warehouseLocations || [])[0];
                    const schedule = [ (dc.scheduleDays || []).join(' '), dc.scheduleFrom && dc.scheduleTo ? `${dc.scheduleFrom}–${dc.scheduleTo}` : '' ].filter(Boolean).join(' · ');
                    return (
                      <tr key={s.id} onClick={() => { setSelectedId(s.id); setAnketaTab(0); }}
                        className="border-t border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                        <td className="table-cell font-medium text-gray-800">{s.tradeName}</td>
                        <td className="table-cell text-gray-500">{dc.route || '—'}</td>
                        <td className="table-cell text-gray-500">{schedule || '—'}</td>
                        <td className="table-cell">
                          {wh ? (
                            <span title={`${wh.city || ''}${wh.city ? ', ' : ''}${wh.address || ''}`} className="inline-flex text-gray-500"><Warehouse size={15} /></span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="table-cell text-gray-900 font-medium">{(dc.cities || []).length || new Set((s.warehouseLocations || []).map(w => w.city).filter(Boolean)).size}</td>
                        <td className="table-cell text-gray-500">{operators.find(o => o.id === dc.operatorId)?.name || '—'}</td>
                        <td className="table-cell">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusCls(contractStatus(s))}`}>{contractStatus(s)}</span>
                        </td>
                        <td className="table-cell text-gray-400">—</td>
                        <td className="table-cell text-gray-400">—</td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={9}>Поставщики не найдены.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view !== 'suppliers' && (
        <div className="card-base p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-gray-700">{VIEWS.find(v => v.key === view)?.label}</p>
          <p className="text-xs text-gray-400">Раздел появится в следующих обновлениях.</p>
        </div>
      )}
    </div>
  );
}
