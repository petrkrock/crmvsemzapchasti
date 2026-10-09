import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Landmark, MapPin, Route, Truck, Undo2, Users, Warehouse, Pencil, Trash2, Printer, History } from 'lucide-react';
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

  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [historyRouteId, setHistoryRouteId] = useState<string | null>(null);

  function startEditRoute(r: (typeof store.settings.deliveryRoutes)[number]) {
    setEditingRouteId(r.id);
    setRNumber(r.number); setRDepart(r.departureTime || ''); setRDays(r.scheduleDays || []);
    setRStops((r.stops || []).map(st => ({ supplierId: st.supplierId, from: st.from, to: st.to, order: st.order })));
    setRArrive(r.arrivalTime || '');
    setRouteFormOpen(true);
  }
  function setStopOrder(routeId: string, idx: number, order: number) {
    const routes = (store.settings.deliveryRoutes || []).map(r => {
      if (r.id !== routeId) return r;
      const stops = (r.stops || []).map((st, i) => i === idx ? { ...st, order } : st)
        .sort((a, b) => (a.order || 99) - (b.order || 99));
      return { ...r, stops, history: [...(r.history || []), { at: new Date().toISOString(), by: getCurrentUser()?.name || '', action: `Порядок погрузки: поставщик №${idx + 1} → ${order}` }] };
    });
    updateStore(s => ({ ...s, settings: { ...s.settings, deliveryRoutes: routes } }));
    toast.success('Порядок погрузки обновлён');
  }
  function printRoute(r: (typeof store.settings.deliveryRoutes)[number]) {
    const w = window.open('', '_blank', 'width=700,height=600');
    if (!w) return;
    const stops = [...(r.stops || [])].sort((a, b) => (a.order || 99) - (b.order || 99));
    const rows = stops.map((st, i) => `<tr><td>${i + 1}</td><td>${suppliers.find(s => s.id === st.supplierId)?.tradeName || '—'}</td><td>${st.from || '—'} – ${st.to || '—'}</td></tr>`).join('');
    w.document.write(`<html><head><title>Маршрут №${r.number}</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}</style></head><body>
      <h1>Маршрут самовывоза №${r.number}</h1>
      <p>Выезд с ЦС: ${r.departureTime || '—'} · Прибытие на ЦС: ${r.arrivalTime || '—'} · График: ${(r.scheduleDays || []).join(' ') || '—'}</p>
      <table><thead><tr><th>№</th><th>Поставщик</th><th>Время (от–до)</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.print();</script></body></html>`);
    w.document.close();
  }
  function confirmDeleteRoute() {
    if (deleteConfirmText.trim() !== 'УДАЛИТЬ') { toast.error('Введите слово УДАЛИТЬ'); return; }
    updateStore(s => ({ ...s, settings: { ...s.settings, deliveryRoutes: (s.settings.deliveryRoutes || []).filter(r => r.id !== deleteRouteId) } }));
    toast.success('Маршрут удалён');
    setDeleteRouteId(null); setDeleteConfirmText('');
  }

  function addRoute() {
    if (!rNumber.trim()) { toast.error('Укажите номер маршрута'); return; }
    const stops = rStops.filter(s => s.supplierId).map((st, i) => ({ ...st, order: st.order ?? i + 1 }));
    const userName = getCurrentUser()?.name || '';
    if (editingRouteId) {
      updateStore(s => ({ ...s, settings: { ...s.settings, deliveryRoutes: (s.settings.deliveryRoutes || []).map(r => r.id === editingRouteId ? { ...r, number: rNumber.trim(), departureTime: rDepart, scheduleDays: rDays, stops, arrivalTime: rArrive, history: [...(r.history || []), { at: new Date().toISOString(), by: userName, action: 'Маршрут отредактирован' }] } : r) } }));
      toast.success(`Маршрут №${rNumber.trim()} сохранён`);
    } else {
      const route = { id: `dr-${Date.now()}`, number: rNumber.trim(), departureTime: rDepart, scheduleDays: rDays, stops, arrivalTime: rArrive, createdAt: new Date().toISOString(), history: [{ at: new Date().toISOString(), by: userName, action: 'Маршрут создан' }] };
      updateStore(s => ({ ...s, settings: { ...s.settings, deliveryRoutes: [...(s.settings.deliveryRoutes || []), route] } }));
      toast.success(`Маршрут №${route.number} создан`);
    }
    setEditingRouteId(null);
    setRNumber(''); setRDepart(''); setRDays([]); setRStops([{ supplierId: '', from: '', to: '' }]); setRArrive('');
    setRouteFormOpen(false);
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
                    <span className="flex items-center gap-0.5" title="Порядок погрузки">
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n} type="button"
                          onClick={() => setRStops(rs => rs.map((x, xi) => xi === i ? { ...x, order: n } : x))}
                          className={`w-5 h-5 text-[9px] font-bold rounded border transition-colors ${(st.order ?? i + 1) === n ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-red-300'}`}>
                          {n}
                        </button>
                      ))}
                    </span>
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
                    <th className="table-header text-left">Поставщики (время от–до · порядок погрузки)</th>
                    <th className="table-header text-left">Прибытие на ЦС</th>
                    <th className="table-header text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {(store.settings.deliveryRoutes || []).map(r => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-800">№{r.number}</td>
                      <td className="table-cell text-gray-500">{r.departureTime || '—'}</td>
                      <td className="table-cell text-gray-500">{(r.scheduleDays || []).join(' ') || '—'}</td>
                      <td className="table-cell text-gray-500">
                        {[...(r.stops || [])].sort((a, b) => (a.order || 99) - (b.order || 99)).map((st, si) => (
                          <div key={si} className="flex items-center gap-1.5 py-0.5 flex-wrap">
                            <span>{suppliers.find(s => s.id === st.supplierId)?.tradeName || '?'} ({st.from || '—'}–{st.to || '—'})</span>
                            <span className="flex items-center gap-0.5" title="Порядок погрузки: чем выше цифра, тем ниже в списке">
                              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                <button key={n} type="button" onClick={() => setStopOrder(r.id, si, n)}
                                  className={`w-4 h-4 text-[8px] font-bold rounded border transition-colors ${st.order === n ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-red-300'}`}>
                                  {n}
                                </button>
                              ))}
                            </span>
                          </div>
                        ))}
                        {!(r.stops || []).length && '—'}
                      </td>
                      <td className="table-cell text-gray-500">{r.arrivalTime || '—'}</td>
                      <td className="table-cell text-right whitespace-nowrap">
                        <button type="button" onClick={() => printRoute(r)} title="Печать маршрута" className="p-1.5 text-gray-400 hover:text-gray-700 rounded"><Printer size={14} /></button>
                        <button type="button" onClick={() => startEditRoute(r)} title="Редактировать" className="p-1.5 text-gray-400 hover:text-gray-700 rounded"><Pencil size={14} /></button>
                        <button type="button" onClick={() => setHistoryRouteId(r.id)} title="История изменений" className="p-1.5 text-gray-400 hover:text-gray-700 rounded"><History size={14} /></button>
                        <button type="button" onClick={() => { setDeleteRouteId(r.id); setDeleteConfirmText(''); }} title="Удалить" className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {!(store.settings.deliveryRoutes || []).length && <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={4}>Маршруты не созданы.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* МОДАЛКА УДАЛЕНИЯ МАРШРУТА */}
          {deleteRouteId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDeleteRouteId(null)}>
              <div className="absolute inset-0 bg-black/50" />
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-bold text-gray-900">Удалить маршрут?</h3>
                <p className="text-xs text-gray-500">Действие необратимо. Для подтверждения введите слово <b className="text-red-600">УДАЛИТЬ</b>.</p>
                <input className="form-input text-sm" placeholder="УДАЛИТЬ" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} />
                <div className="flex gap-2">
                  <button type="button" onClick={confirmDeleteRoute} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">Удалить маршрут</button>
                  <button type="button" onClick={() => setDeleteRouteId(null)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Отмена</button>
                </div>
              </div>
            </div>
          )}

          {/* МОДАЛКА ИСТОРИИ МАРШРУТА */}
          {historyRouteId && (() => {
            const hr = (store.settings.deliveryRoutes || []).find(r => r.id === historyRouteId);
            if (!hr) return null;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setHistoryRouteId(null)}>
                <div className="absolute inset-0 bg-black/50" />
                <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-900">История маршрута №{hr.number}</h3>
                    <button type="button" onClick={() => setHistoryRouteId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="space-y-2">
                    {[...(hr.history || [])].reverse().map((hEntry, i) => (
                      <div key={i} className="border border-gray-100 rounded-xl px-3 py-2 text-xs">
                        <p className="text-gray-800">{hEntry.action}</p>
                        <p className="text-gray-400 mt-0.5">{new Date(hEntry.at).toLocaleString('ru-RU')} · {hEntry.by || '—'}</p>
                      </div>
                    ))}
                    {!(hr.history || []).length && <p className="text-xs text-gray-400">История пуста.</p>}
                  </div>
                </div>
              </div>
            );
          })()}
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
