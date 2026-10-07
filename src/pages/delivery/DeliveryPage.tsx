import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Landmark, MapPin, Route, Truck, Undo2, Users, Warehouse } from 'lucide-react';
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
  // v1.29.0: форма маршрута самовывоза
  const [routeFormOpen, setRouteFormOpen] = useState(false);
  const [rNumber, setRNumber] = useState('');
  const [rDepart, setRDepart] = useState('');
  const [rDays, setRDays] = useState<string[]>([]);
  const [rStops, setRStops] = useState([{ supplierId: '', from: '', to: '' }]);
  const [rArrive, setRArrive] = useState('');

  function addRoute() {
    if (!rNumber.trim()) { toast.error('Укажите номер маршрута'); return; }
    const stops = rStops.filter(s => s.supplierId);
    const route = { id: `dr-${Date.now()}`, number: rNumber.trim(), departureTime: rDepart, scheduleDays: rDays, stops, arrivalTime: rArrive, createdAt: new Date().toISOString() };
    updateStore(s => ({ ...s, settings: { ...s.settings, deliveryRoutes: [...(s.settings.deliveryRoutes || []), route] } }));
    setRNumber(''); setRDepart(''); setRDays([]); setRStops([{ supplierId: '', from: '', to: '' }]); setRArrive('');
    setRouteFormOpen(false);
    toast.success(`Маршрут №${route.number} создан`);
  }
  function removeRoute(id: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, deliveryRoutes: (s.settings.deliveryRoutes || []).filter(r => r.id !== id) } }));
    toast.success('Маршрут удалён');
  }
  // маршрут поставщика (для анкеты и таблицы)
  const findRoute = (supplierId: string) => (store.settings.deliveryRoutes || []).find(r => (r.stops || []).some(st => st.supplierId === supplierId));

  // v1.29.0: в раздел попадают поставщики с выданной ссылкой на ЛК доставки
  const suppliers = store.suppliers.filter(s => !s.deletedAt && s.deliveryAccess?.token);
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
    if (fResp && s.responsibleId !== fResp) return false;
    if (fCity && !(s.warehouseLocations || []).some(w => w.city === fCity)) return false;
    if (fStatus && contractStatus(s) !== fStatus) return false;
    return true;
  });


  const statusCls = (st: string) =>
    st === 'Активный' ? 'bg-green-50 text-green-700 border-green-200' :
    st === 'Аннулирован' ? 'bg-gray-100 text-gray-500 border-gray-200' :
    st === 'ЛИД' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200';

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
            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
              {['', ...statuses].map(st => (
                <button key={st || 'all'} type="button" onClick={() => setFStatus(st)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${fStatus === st ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}>
                  {st || 'Все'}
                </button>
              ))}
            </div>
          </div>

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
                    <th className="table-header text-left">Ответственный</th>
                    <th className="table-header text-left">Статус договора</th>
                    <th className="table-header text-left">Тариф сервиса</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const dc = s.deliveryContract || {};
                    const wh = (s.warehouseLocations || []).find(w => (w.id || '') === dc.warehouseId) || (s.warehouseLocations || [])[0];
                    const rt = findRoute(s.id);
                    const rtStop = rt ? (rt.stops || []).find(st => st.supplierId === s.id) : null;
                    const schedule = rt ? `№${rt.number} · ${(rt.scheduleDays || []).join(' ')} · ${rtStop?.from || '—'}–${rtStop?.to || '—'}` : '';
                    return (
                      <tr key={s.id} onClick={() => navigate(`/delivery/suppliers/${s.id}`)}
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
                        <td className="table-cell text-gray-500">{respUsers.find(u => u.id === s.responsibleId)?.name || '—'}</td>
                        <td className="table-cell">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusCls(contractStatus(s))}`}>{contractStatus(s)}</span>
                        </td>
                        <td className="table-cell text-gray-500">{(store.settings.deliveryServiceTariffs || []).find(t => t.id === dc.serviceTariff)?.name || '—'}</td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={8}>Поставщики не найдены.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === 'pickup' && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-gray-400">Маршруты самовывоза по поставщикам раздела Доставка.</p>
            <button type="button" onClick={() => setRouteFormOpen(v => !v)} className="btn-primary text-xs">Создать маршрут</button>
          </div>

          {routeFormOpen && (
            <div className="card-base p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Номер маршрута</label>
                  <input className="form-input text-xs mt-1" placeholder="№ маршрута" value={rNumber} onChange={e => setRNumber(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Время выезда с ЦС</label>
                  <input type="time" className="form-input text-xs mt-1" value={rDepart} onChange={e => setRDepart(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Время прибытия на ЦС</label>
                  <input type="time" className="form-input text-xs mt-1" value={rArrive} onChange={e => setRArrive(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">График и время маршрута</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => (
                    <button key={d} type="button"
                      onClick={() => setRDays(rd => rd.includes(d) ? rd.filter(x => x !== d) : [...rd, d])}
                      className={`w-8 h-7 text-[10px] rounded-md border transition-colors ${rDays.includes(d) ? 'bg-red-50 border-red-300 text-red-700 font-semibold' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600">Поставщики маршрута</label>
                {rStops.map((st, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <select className="form-input text-xs flex-1 min-w-[200px]" value={st.supplierId} onChange={e => setRStops(rs => rs.map((x, xi) => xi === i ? { ...x, supplierId: e.target.value } : x))}>
                      <option value="">— выберите поставщика —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
                    </select>
                    <input type="time" className="form-input text-xs w-auto" value={st.from} onChange={e => setRStops(rs => rs.map((x, xi) => xi === i ? { ...x, from: e.target.value } : x))} />
                    <span className="text-xs text-gray-400">—</span>
                    <input type="time" className="form-input text-xs w-auto" value={st.to} onChange={e => setRStops(rs => rs.map((x, xi) => xi === i ? { ...x, to: e.target.value } : x))} />
                    {rStops.length > 1 && (
                      <button type="button" onClick={() => setRStops(rs => rs.filter((_, xi) => xi !== i))} className="text-xs text-red-600 hover:underline">Убрать</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setRStops(rs => [...rs, { supplierId: '', from: '', to: '' }])} className="btn-secondary text-xs">+ Добавить ещё поставщика</button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addRoute} className="btn-primary text-xs">Сохранить маршрут</button>
                <button type="button" onClick={() => setRouteFormOpen(false)} className="btn-secondary text-xs">Отмена</button>
              </div>
            </div>
          )}

          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">Номер маршрута</th>
                    <th className="table-header text-left">Выезд с ЦС</th>
                    <th className="table-header text-left">График</th>
                    <th className="table-header text-left">Поставщики (время от–до)</th>
                    <th className="table-header text-left">Прибытие на ЦС</th>
                    <th className="table-header text-left">Исполнитель</th>
                    <th className="table-header text-left">Статус</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody>
                  {(store.settings.deliveryRoutes || []).map(r => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-800">№{r.number}</td>
                      <td className="table-cell text-gray-500">{r.departureTime || '—'}</td>
                      <td className="table-cell text-gray-500">{(r.scheduleDays || []).join(' ') || '—'}</td>
                      <td className="table-cell text-gray-500">
                        {(r.stops || []).map(st => `${suppliers.find(s => s.id === st.supplierId)?.tradeName || '?'} (${st.from || '—'}–${st.to || '—'})`).join('; ') || '—'}
                      </td>
                      <td className="table-cell text-gray-500">{r.arrivalTime || '—'}</td>
                      <td className="table-cell text-gray-400">—</td>
                      <td className="table-cell text-gray-400">—</td>
                      <td className="table-cell text-right"><button type="button" onClick={() => removeRoute(r.id)} className="text-xs text-red-600 hover:underline">Удалить</button></td>
                    </tr>
                  ))}
                  {!(store.settings.deliveryRoutes || []).length && <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={8}>Маршруты не созданы.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view !== 'suppliers' && view !== 'pickup' && (
        <div className="card-base p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-gray-700">{VIEWS.find(v => v.key === view)?.label}</p>
          <p className="text-xs text-gray-400">Раздел появится в следующих обновлениях.</p>
        </div>
      )}
    </div>
  );
}
