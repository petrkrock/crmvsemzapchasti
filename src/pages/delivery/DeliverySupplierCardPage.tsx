import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getStore, useStoreVersion, updateStore } from '@/lib/store';
import { getCurrentUser } from '@/lib/auth';
import { toast } from 'sonner';

/** v1.29.0: карточка поставщика доставки (DBO) — открывается из раздела Доставка → Поставщики (как карточка в разделе Поставщики). */

export default function DeliverySupplierCardPage() {
  useStoreVersion();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const store = getStore();
  const supplier = store.suppliers.find(s => s.id === id && !s.deletedAt);
  const [dboTab, setDboTab] = useState(0);
  const [dboComment, setDboComment] = useState('');

  if (!supplier) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={() => navigate('/delivery')} className="btn-secondary text-xs flex items-center gap-1.5"><ArrowLeft size={13} /> Назад</button>
        <div className="card-base p-8 text-center"><p className="text-sm text-gray-400">Поставщик не найден.</p></div>
      </div>
    );
  }

  function patchDeliveryContract(patch: Record<string, unknown>) {
    const next = { ...supplier.deliveryContract, ...patch };
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, deliveryContract: next, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) }));
    toast.success('Сохранено');
  }

  // v1.29.0: смена статуса — при Активный требуем номер и дату договора; DBO в сервисах вкл/откл автоматом
  function changeContractStatus(status: string) {
    const dc = supplier.deliveryContract || {};
    if (status === 'Активный') {
      if (!dc.contractNumber?.trim() || !dc.contractDate?.trim()) {
        toast.error('Для активации введите номер и дату договора');
        return;
      }
    }
    patchDeliveryContract({ status });
    if (status === 'Активный' && !(supplier.services || []).includes('DBO')) {
      updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, services: [...(x.services || []), 'DBO'], updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) }));
      toast.success('Сервис DBO включён в сервисы продаж поставщика');
    }
    if (status === 'Аннулирован' && (supplier.services || []).includes('DBO')) {
      updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, services: (x.services || []).filter(v => v !== 'DBO'), updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) }));
      toast.success('Сервис DBO отключён в сервисах продаж поставщика');
    }
  }

  const settings = store.settings;
  const dc = supplier.deliveryContract || {};
  const dcStatuses = settings.deliveryContractStatuses || ['Ждёт активации', 'Активный', 'Аннулирован'];
  const serviceTariffs = settings.deliveryServiceTariffs || [];
  const cityTariffs = settings.deliveryCityTariffs || [];
  const dcCities = settings.deliveryCities || [];
  // v1.29.0: график поставщика — только информация из маршрута самовывоза (редактируется в разделе Маршруты)
  const route = (settings.deliveryRoutes || []).find(r => (r.stops || []).some(st => st.supplierId === supplier.id));
  const routeStop = route ? (route.stops || []).find(st => st.supplierId === supplier.id) : null;
  const dcStatus = dc.status || (supplier.deliveryAccess?.enabled && supplier.deliveryAccess?.token ? 'Активный' : supplier.deliveryAccess && !supplier.deliveryAccess.enabled ? 'Аннулирован' : 'Ждёт активации');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/delivery')} className="btn-secondary text-xs flex items-center gap-1.5"><ArrowLeft size={13} /> Назад</button>
        <h1 className="page-title">{supplier.tradeName}</h1>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${dcStatus === 'Активный' ? 'bg-green-50 text-green-700 border-green-200' : dcStatus === 'Аннулирован' ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{dcStatus}</span>
        <button onClick={() => navigate(`/suppliers/${supplier.id}`)} className="btn-secondary text-xs ml-auto">Анкета поставщика</button>
      </div>

      <div className="card-base p-5 space-y-4">
        <div className="flex gap-2 flex-wrap border-b border-gray-100 pb-3">
          {['Анкета DBO', 'Финансы', 'Комментарий'].map((tb, i) => (
            <button key={tb} type="button" onClick={() => setDboTab(i)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${dboTab === i ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{tb}</button>
          ))}
        </div>

        {dboTab === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">Маршрут</label>
                <select className="form-input text-xs mt-1" value={dc.route || ''} onChange={e => patchDeliveryContract({ route: e.target.value })}>
                  <option value="">— список появится позже —</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">График и время</label>
                {route ? (
                  <div className="mt-1 space-y-1 text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                    <p>Маршрут <b>№{route.number}</b> · {(route.scheduleDays || []).join(' ') || 'без графика'}</p>
                    <p>На поставщике: <b>{routeStop?.from || '—'}–{routeStop?.to || '—'}</b> · выезд с ЦС {route.departureTime || '—'}, прибытие на ЦС {route.arrivalTime || '—'}</p>
                    <p className="text-gray-400">Редактируется в разделе Доставка → Маршруты самовывоза.</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Маршрут не назначен (Доставка → Маршруты самовывоза).</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Склад</label>
                <select className="form-input text-xs mt-1" value={dc.warehouseId || ''} onChange={e => patchDeliveryContract({ warehouseId: e.target.value })}>
                  <option value="">— выберите склад —</option>
                  {(supplier.warehouseLocations || []).map((w, i) => <option key={w.id || i} value={w.id || String(i)}>{w.city}{w.address ? `, ${w.address}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Оператор</label>
                <select className="form-input text-xs mt-1" value={dc.operatorId || ''} onChange={e => patchDeliveryContract({ operatorId: e.target.value })}>
                  <option value="">— список появится позже —</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">Города</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {dcCities.map(c => (
                    <button key={c} type="button"
                      onClick={() => patchDeliveryContract({ cities: (dc.cities || []).includes(c) ? (dc.cities || []).filter(x => x !== c) : [...(dc.cities || []), c] })}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${(dc.cities || []).includes(c) ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}>{c}</button>
                  ))}
                  {!dcCities.length && <p className="text-xs text-gray-400">Список городов пуст (Настройки → Доставка).</p>}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Статус договора</label>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <select className="form-input text-xs w-auto" value={dc.status || dcStatus} onChange={e => changeContractStatus(e.target.value)}>
                    {dcStatuses.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                  <input className="form-input text-xs w-32" placeholder="№ договора" value={dc.contractNumber || ''} onChange={e => patchDeliveryContract({ contractNumber: e.target.value })} />
                  <input type="date" className="form-input text-xs w-auto" value={dc.contractDate || ''} onChange={e => patchDeliveryContract({ contractDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Тариф сервиса</label>
                <select className="form-input text-xs mt-1" value={dc.serviceTariff || ''} onChange={e => patchDeliveryContract({ serviceTariff: e.target.value })}>
                  <option value="">— выберите тариф —</option>
                  {serviceTariffs.map(t => <option key={t.id} value={t.id}>{t.name} · {t.pricePerMonth} ₽/мес</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Тариф за Город</label>
                <select className="form-input text-xs mt-1" value={dc.cityTariff || ''} onChange={e => patchDeliveryContract({ cityTariff: e.target.value })}>
                  <option value="">— выберите тариф —</option>
                  {cityTariffs.map(t => <option key={t.id} value={t.id}>{t.name} · {t.pricePerMonth} ₽/мес</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {dboTab === 1 && (
          <p className="text-xs text-gray-400">Раздел «Финансы» появится в следующих обновлениях.</p>
        )}

        {dboTab === 2 && (
          <div className="space-y-2">
            <textarea className="form-input min-h-[120px] text-xs" placeholder="Комментарий по договору доставки..."
              value={dboComment || dc.comment || ''}
              onChange={e => setDboComment(e.target.value)} />
            <button type="button" onClick={() => { patchDeliveryContract({ comment: dboComment }); setDboComment(''); }}
              className="btn-primary text-xs">Сохранить комментарий</button>
          </div>
        )}
      </div>
    </div>
  );
}
