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
                    <th className="table-header text-left">Оператор</th>
                    <th className="table-header text-left">Статус договора</th>
                    <th className="table-header text-left">Тариф сервиса</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const dc = s.deliveryContract || {};
                    const wh = (s.warehouseLocations || []).find(w => (w.id || '') === dc.warehouseId) || (s.warehouseLocations || [])[0];
                    const schedule = [ (dc.scheduleDays || []).join(' '), dc.scheduleFrom && dc.scheduleTo ? `${dc.scheduleFrom}–${dc.scheduleTo}` : '' ].filter(Boolean).join(' · ');
                    return (
                      <tr key={s.id} onClick={() => navigate(`/suppliers/${s.id}`)}
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

      {view !== 'suppliers' && (
        <div className="card-base p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-gray-700">{VIEWS.find(v => v.key === view)?.label}</p>
          <p className="text-xs text-gray-400">Раздел появится в следующих обновлениях.</p>
        </div>
      )}
    </div>
  );
}
