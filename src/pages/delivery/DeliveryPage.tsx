import { useState } from 'react';
import { FileText, Landmark, MapPin, Route, Truck, Undo2, Users } from 'lucide-react';
import { getStore, useStoreVersion } from '@/lib/store';
import { Supplier } from '@/types';

/** v1.29.0: раздел «Доставка» (DBO) в CRM. Шаг 9 — вкладки, сводка и фильтры по поставщикам. */

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
  const store = getStore();
  const [view, setView] = useState<ViewKey>('deliveries');

  // фильтры поставщиков (как в Проценке)
  const [fSearch, setFSearch] = useState('');
  const [fCity, setFCity] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fResp, setFResp] = useState('');
  const [fStatus, setFStatus] = useState('');

  const suppliers = store.suppliers.filter(s => !s.deletedAt);
  const deliveryCities = store.settings.deliveryCities || [];
  const respUsers = (store.settings.users || []).filter(u => u.status === 'active');


  const filtered = suppliers.filter(s => {
    if (fSearch && !(s.tradeName || '').toLowerCase().includes(fSearch.toLowerCase()) && !(s.legalName || '').toLowerCase().includes(fSearch.toLowerCase())) return false;
    if (fSupplier && s.id !== fSupplier) return false;
    if (fResp && s.responsible !== fResp) return false;
    if (fCity && !(s.warehouseLocations || []).some(w => w.city === fCity)) return false;
    if (fStatus && contractStatus(s) !== fStatus) return false;
    return true;
  });

  const contractStatus = (s: Supplier) =>
    s.deliveryAccess?.enabled && s.deliveryAccess?.token ? 'Активный' :
    s.deliveryAccess && !s.deliveryAccess.enabled ? 'Аннулирован' : 'Ждёт активации';

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
          {/* ФИЛЬТР (как в Проценке) */}
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
              {(fSearch || fCity || fSupplier || fResp) && (
                <button onClick={() => { setFSearch(''); setFCity(''); setFSupplier(''); setFResp(''); }} className="btn-secondary text-xs">Сбросить</button>
              )}
            </div>
          </div>

          {/* ПИЛЮЛИ СТАТУСОВ */}
          <div className="flex flex-wrap gap-2">
            {['', ...(store.settings.deliveryContractStatuses || [])].map(st => (
              <button key={st || 'all'} type="button" onClick={() => setFStatus(st)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${fStatus === st ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}>
                {st || 'Все'}
              </button>
            ))}
          </div>

          {/* СПИСОК */}
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">Поставщик</th>
                    <th className="table-header text-left">Маршрут самовывоза</th>
                    <th className="table-header text-left">График и время</th>
                    <th className="table-header text-left">Склад и адрес</th>
                    <th className="table-header text-left">Городов подключено</th>
                    <th className="table-header text-left">Оператор</th>
                    <th className="table-header text-left">Статус договора</th>
                    <th className="table-header text-left">Тариф сервиса</th>
                    <th className="table-header text-left">Тариф за Город</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-800">{s.tradeName}</td>
                      <td className="table-cell text-gray-400">—</td>
                      <td className="table-cell text-gray-400">—</td>
                      <td className="table-cell text-gray-500">{(s.warehouseLocations || [])[0] ? `${(s.warehouseLocations || [])[0].city || ''}${(s.warehouseLocations || [])[0].city ? ', ' : ''}${(s.warehouseLocations || [])[0].address || '—'}` : '—'}</td>
                      <td className="table-cell text-gray-900 font-medium">{new Set((s.warehouseLocations || []).map(w => w.city).filter(Boolean)).size}</td>
                      <td className="table-cell text-gray-400">—</td>
                      <td className="table-cell">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${contractStatus(s) === 'Активный' ? 'bg-green-50 text-green-700 border-green-200' : contractStatus(s) === 'Аннулирован' ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{contractStatus(s)}</span>
                      </td>
                      <td className="table-cell text-gray-400">—</td>
                      <td className="table-cell text-gray-400">—</td>
                    </tr>
                  ))}
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
