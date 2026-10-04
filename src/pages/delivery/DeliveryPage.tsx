import { useState } from 'react';
import { FileText, Landmark, Truck, Undo2, Users } from 'lucide-react';
import { getStore, useStoreVersion } from '@/lib/store';
import { Supplier } from '@/types';

/** v1.29.0: раздел «Доставка» (DBO) в CRM. Шаг 9 — вкладки, сводка и фильтры по поставщикам. */

type ViewKey = 'deliveries' | 'returns' | 'documents' | 'finance' | 'suppliers';

const VIEWS: { key: ViewKey; label: string; icon: typeof Truck }[] = [
  { key: 'deliveries', label: 'Доставки', icon: Truck },
  { key: 'returns', label: 'Возвраты', icon: Undo2 },
  { key: 'documents', label: 'Документы', icon: FileText },
  { key: 'finance', label: 'Финансы', icon: Landmark },
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

  const suppliers = store.suppliers.filter(s => !s.deletedAt);
  const deliveryCities = store.settings.deliveryCities || [];
  const respUsers = (store.settings.users || []).filter(u => u.status === 'active');

  // Сводка: договора и города доставки (v1 — по данным ЛК доставки поставщиков)
  const contractActive = suppliers.filter(s => s.deliveryAccess?.enabled && s.deliveryAccess?.token).length;
  const contractWaiting = suppliers.filter(s => (s.services || []).includes('DBO') && !(s.deliveryAccess?.enabled && s.deliveryAccess?.token)).length;
  const contractCancelled = suppliers.filter(s => s.deliveryAccess && !s.deliveryAccess.enabled).length;

  const filtered = suppliers.filter(s => {
    if (fSearch && !(s.tradeName || '').toLowerCase().includes(fSearch.toLowerCase()) && !(s.legalName || '').toLowerCase().includes(fSearch.toLowerCase())) return false;
    if (fSupplier && s.id !== fSupplier) return false;
    if (fResp && s.responsible !== fResp) return false;
    if (fCity && !(s.warehouseLocations || []).some(w => w.city === fCity)) return false;
    return true;
  });

  const contractStatus = (s: Supplier) =>
    s.deliveryAccess?.enabled && s.deliveryAccess?.token ? 'Активен' :
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
          {/* СВОДКА ПО ПОСТАВЩИКАМ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card-base p-5 space-y-4">
              <h3 className="section-title">Договора</h3>
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{contractActive}</p>
                  <p className="text-xs text-gray-500">Активных договоров</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{contractWaiting}</p>
                  <p className="text-xs text-gray-500">Ждут активации</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{contractCancelled}</p>
                  <p className="text-xs text-gray-500">Аннулировано</p>
                </div>
              </div>
            </div>
            <div className="card-base p-5 space-y-4">
              <h3 className="section-title">Города доставки</h3>
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{deliveryCities.length}</p>
                  <p className="text-xs text-gray-500">Активных</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">0</p>
                  <p className="text-xs text-gray-500">Ждут активации</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">0</p>
                  <p className="text-xs text-gray-500">Аннулировано</p>
                </div>
              </div>
            </div>
          </div>

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

          {/* СПИСОК */}
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">Поставщик</th>
                    <th className="table-header text-left">Договор</th>
                    <th className="table-header text-left">Ответственный</th>
                    <th className="table-header text-left">Города</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-800">{s.tradeName}</td>
                      <td className="table-cell">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${contractStatus(s) === 'Активен' ? 'bg-green-50 text-green-700 border-green-200' : contractStatus(s) === 'Аннулирован' ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{contractStatus(s)}</span>
                      </td>
                      <td className="table-cell text-gray-500">{respUsers.find(u => u.id === s.responsible)?.name || '—'}</td>
                      <td className="table-cell text-gray-500">{(s.warehouseLocations || []).map(w => w.city).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '—'}</td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={4}>Поставщики не найдены.</td></tr>}
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
