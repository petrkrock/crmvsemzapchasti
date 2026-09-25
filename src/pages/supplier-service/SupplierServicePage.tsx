import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getFunctionsUrl, getAnonKeyHeaders, isSupabaseConfigured } from '@/lib/functions-api';
import { Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Pencil, X, MapPin, Warehouse } from 'lucide-react';

interface Wh { id: string; city: string; skuCount: number; verified?: boolean; } // verified выставляет менеджер в CRM
interface Cond { city: string; warehouseName: string; representative: string; contacts: string;
  email: string; deliverySchedule: string; orderUnloadSchedule: string; returnConditions: string; officialWarehouse: string;
  status?: string; } // статус условия (Новое/Загружено/Есть изменения) — из CRM

const COND_FIELDS: Array<{ key: keyof Cond; label: string }> = [
  { key: 'representative', label: 'Представитель' },
  { key: 'contacts', label: 'Контакты' },
  { key: 'email', label: 'Email' },
  { key: 'deliverySchedule', label: 'График доставки' },
  { key: 'orderUnloadSchedule', label: 'График выгрузки заказов' },
  { key: 'returnConditions', label: 'Условия возврата товара' },
  { key: 'officialWarehouse', label: 'Официальный склад' },
  { key: 'deliveryTime', label: 'Срок поставки до выбранного города' }, // v_1.9
];

const EMPTY_COND: Cond = { city: '', warehouseName: '', representative: '', contacts: '',
  email: '', deliverySchedule: '', orderUnloadSchedule: '', returnConditions: '', officialWarehouse: '', deliveryTime: '' }; // v_1.9

/**
 * Самообслуживание поставщика по ссылке /s/<token> (вне CRM-оболочки).
 * Сценарий: сначала склады → потом условия сервиса поиска (склад — из
 * выпадающего списка добавленных складов). Защита: токен + опциональный PIN.
 */
export default function SupplierServicePage() {
  const { token = '' } = useParams<{ token: string }>();

  const [data, setData] = useState<{ companyName: string; inn?: string; hasPin: boolean; warehouses: Wh[]; serviceSearch: Cond[]; availableCities: string[]; multiWarehouse: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [pinPassed, setPinPassed] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whSku, setWhSku] = useState('');
  const [condForm, setCondForm] = useState<Cond>(EMPTY_COND);
  const [tkCarrier, setTkCarrier] = useState(''); // ТЗ v1.23.2: перевозчик для «Срок поставки»
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !/^[a-f0-9]{32}$/.test(token)) { setLoading(false); setFatal('Недействительная ссылка'); return; }
    fetch(`${getFunctionsUrl('supplier-service')}?token=${token}`, { headers: getAnonKeyHeaders() })
      .then(r => r.json())
      .then(d => { if (d.error) setFatal(d.error); else { setData(d); setPinPassed(false); } })
      .catch(() => setFatal('Не удалось загрузить данные'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!data || data.hasPin || pinPassed) return;
    // No PIN configured: perform the same authenticated-by-token POST so the
    // server returns protected warehouse/service data. GET intentionally only
    // returns public metadata.
    post({}).then(err => {
      if (err) setFatal(err);
      else setPinPassed(true);
    });
  }, [data, pinPassed]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const report = () => window.parent?.postMessage({ source: 'vz-crm-form', height: el.offsetHeight }, '*');
    const ro = new ResizeObserver(report);
    ro.observe(el); report();
    return () => ro.disconnect();
  }, [data, pinPassed, loading]);

  async function post(payload: Record<string, unknown>): Promise<string | null> {
    setSaving(true);
    try {
      const res = await fetch(getFunctionsUrl('supplier-service'), {
        method: 'POST',
        headers: { ...getAnonKeyHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin, ...payload }),
      });
      const d = await res.json();
      if (!res.ok || d.error) return d.error || 'Ошибка сохранения';
      setData({ companyName: data!.companyName, hasPin: data!.hasPin, warehouses: d.warehouses, serviceSearch: d.serviceSearch, availableCities: data!.availableCities, multiWarehouse: data!.multiWarehouse });
      setNotice('✓ Сохранено');
      setTimeout(() => setNotice(''), 2500);
      return null;
    } catch { return 'Ошибка сохранения. Проверьте интернет.'; }
    finally { setSaving(false); }
  }

  async function submitPin() {
    setPinError('');
    const err = await post({}); // пустой PATCH — сервер проверит PIN (403 при неверном)
    if (err) { setPinError(err); setPin(''); }
    else setPinPassed(true);
  }

  async function addWarehouse() {
    if (!whCity.trim()) { setNotice('Укажите город склада'); return; }
    if ((data?.warehouses || []).length >= 1 && !data?.multiWarehouse) {
      setNotice('Для включения функции мультисклад обратитесь в поддержку');
      return;
    }
    const err = await post({ warehouses: [...(data?.warehouses || []), { id: '', city: whCity.trim(), skuCount: Number(whSku) || 0 }] });
    if (!err) { setWhCity(''); setWhSku(''); }
    else setNotice(err);
  }

  async function removeWarehouse(id: string) {
    const err = await post({ warehouses: (data?.warehouses || []).filter(w => w.id !== id) });
    if (err) setNotice(err);
  }

  async function saveCondition() {
    if (!condForm.city.trim()) { setNotice('Город показов обязателен'); return; }
    const list = [...(data?.serviceSearch || [])];
    if (editingIdx !== null) list[editingIdx] = condForm; else list.push(condForm);
    const err = await post({ serviceSearch: list });
    if (!err) { setCondForm(EMPTY_COND); setEditingIdx(null); }
    else setNotice(err);
  }

  async function applyToAllCities() {
    const cities = data?.availableCities || [];
    if (!cities.length) { setNotice('Список доступных городов не настроен — уточните у менеджера'); return; }
    if ((data?.warehouses || []).length === 0) { setNotice('Сначала добавьте хотя бы один склад'); return; }
    const existing = new Set((data?.serviceSearch || []).map(c => (c.city || '').toLowerCase()));
    const template = { ...condForm, city: '' };
    const additions = cities.filter(c => !existing.has(c.toLowerCase())).map(c => ({ ...template, city: c }));
    if (!additions.length) { setNotice('Все доступные города уже добавлены'); return; }
    const err = await post({ serviceSearch: [...(data?.serviceSearch || []), ...additions] });
    if (!err) setCondForm(EMPTY_COND); else setNotice(err);
  }

  async function removeCondition(idx: number) {
    const err = await post({ serviceSearch: (data?.serviceSearch || []).filter((_, i) => i !== idx) });
    if (err) setNotice(err);
  }

  const fld = 'w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-400';

  // ТЗ v1.23.0: экран ввода PIN — по центру, как страница входа в приложение
  const pinScreen = !loading && !fatal && data && !pinPassed;

  return (
    <div className={`min-h-screen bg-[#f5f5f5] flex ${pinScreen ? 'items-center' : 'items-start'} justify-center p-3 sm:p-6 md:p-10`}>
      <div ref={wrapperRef} className="w-full max-w-xl py-2">
        {loading && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div className="w-11 h-11 rounded-full border-4 border-red-100 border-t-red-600 animate-spin" aria-hidden="true" />
            <p className="text-sm text-gray-500 text-center">Подождите пожалуйста, форма загружается…</p>
          </div>
        )}

        {!loading && fatal && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col items-center text-center py-12 gap-3">
            <AlertCircle className="text-gray-300" size={34} />
            <p className="text-sm text-gray-400">{fatal}</p>
          </div>
        )}

        {pinScreen && (
          <div className="flex flex-col items-center" style={{ marginBottom: '4.5rem' }}>
            <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[333px] h-auto mb-3" />
            <p className="text-sm font-normal text-gray-900 tracking-wide text-center">НАСТРОЙКА СЕРВИСА ПОИСКА (DBS)</p>
          </div>
        )}

        {!loading && !fatal && data && !pinPassed && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
            <p className="text-sm text-gray-500 mt-1.5">{data.companyName}{data.inn ? ` (ИНН ${data.inn})` : ''}</p>
            <hr className="border-gray-100 my-5" />
            <div className="text-center">
              <p className="text-sm text-gray-700 mb-4">Введите PIN-код из сообщения от менеджера</p>
              <input inputMode="numeric" maxLength={6} value={pin} autoFocus
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && submitPin()}
                className="w-40 text-center text-xl tracking-[0.4em] border border-gray-200 rounded-xl py-2.5 outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-400" />
              {pinError && <p className="text-xs text-red-600 mt-3">{pinError}</p>}
              <button onClick={submitPin} disabled={saving}
                className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl py-3 transition-colors disabled:opacity-60">
                Продолжить
              </button>
              <p className="text-xs text-gray-400 mt-4">Ссылка индивидуальная. PIN потерян — обратитесь к менеджеру.</p>
            </div>
          </div>
        )}

        {!loading && !fatal && data && pinPassed && (
          <div className="space-y-4 w-full max-w-[1160px]" style={{ maxWidth: 1160 }}>

            {/* ШАПКА ЛК: логотип + Продвижение/Выход */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-5 py-3 flex items-center justify-between">
              <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[180px] h-auto" />
              <div className="flex gap-2">
                <a href="/forms/marketing-kit" target="_blank" rel="noreferrer"
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wide rounded-lg px-4 py-2 transition-colors">
                  Продвижение
                </a>
                <button onClick={() => { setPinPassed(false); setPin(''); }}
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 text-xs font-bold uppercase tracking-wide rounded-lg px-4 py-2 transition-colors">
                  Выход
                </button>
              </div>
            </div>

            {/* ШАГ 1: СОЗДАТЬ СКЛАД + КАРТОЧКА КОМПАНИИ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                <h2 className="text-lg font-bold text-gray-900">Создать склад в системе</h2>
                <p className="text-xs text-gray-400 mt-1 mb-4">Шаг 1. Сначала добавьте склад - он понадобится в условиях поиска</p>
                <div className="flex flex-wrap gap-2">
                  <input className={fld + ' flex-1 min-w-[200px]'} placeholder="Город, название Вашего склада *"
                    value={whCity} onChange={e => setWhCity(e.target.value)} />
                  <input className={fld + ' w-40'} placeholder="Примерное кол-во SKU" inputMode="numeric"
                    value={whSku} onChange={e => setWhSku(e.target.value.replace(/\D/g, ''))} />
                  <button onClick={addWarehouse} disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl px-5 py-2.5 flex items-center gap-1 disabled:opacity-60">
                    <Plus size={15} /> Добавить
                  </button>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                <h2 className="text-lg font-bold text-gray-900">{data.companyName}{data.inn ? ` (ИНН ${data.inn})` : ''}</h2>
                <div className="mt-3 space-y-2 text-sm">
                  {(() => {
                    const covered = new Set((data.serviceSearch || []).map(c => (c.city || '').toLowerCase()));
                    const stats = [
                      { label: 'Доступно городов:', value: (data.availableCities || []).length, cls: 'bg-blue-50 text-blue-700' },
                      { label: 'Условий работает:', value: (data.serviceSearch || []).filter(c => (c.status || 'Новое') !== 'Загружено').length, cls: 'bg-green-50 text-green-700' },
                      { label: 'Охвачено:', value: covered.size, cls: 'bg-green-50 text-green-700' },
                    ];
                    return stats.map(s => (
                      <div key={s.label} className="flex items-center justify-between max-w-[240px]">
                        <span className="text-gray-500">{s.label}</span>
                        <span className={`min-w-[28px] text-center text-xs font-bold rounded-md px-2 py-0.5 ${s.cls}`}>{s.value}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* МОИ СКЛАДЫ */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Мои склады ({(data.warehouses || []).length})</h2>
              {(data.warehouses || []).length === 0 && (
                <p className="text-sm text-gray-400">Склады не добавлены — начните с шага 1.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {(data.warehouses || []).map(w => (
                  <div key={w.id} className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${w.verified ? 'border-green-300 bg-green-50' : 'border-green-200 bg-white'}`}>
                    <span className="font-semibold text-gray-900">{w.city}</span>
                    <span className="text-gray-400 text-xs">{Number(w.skuCount).toLocaleString('ru-RU')} SKU</span>
                    <span className={`text-xs ${w.verified ? 'text-green-600 font-medium' : 'text-gray-400'}`}>{w.verified ? 'Проверен' : 'Не проверен'}</span>
                    <button onClick={() => removeWarehouse(w.id)} className="text-gray-300 hover:text-red-600" title="Удалить"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* ШАГ 2: ВЫБОР ГОРОДА ПОКАЗОВ */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Выберите Город показов *</h2>
              {(() => {
                const list = data.serviceSearch || [];
                const covered = new Set(list.map(c => (c.city || '').toLowerCase()));
                const cities = data.availableCities || [];
                if (!cities.length) return <p className="text-xs text-gray-400">Список доступных городов не настроен — уточните у вашего менеджера.</p>;
                return (
                  <div className="flex flex-wrap gap-2">
                    {cities.map(c => {
                      const idx = list.findIndex(x => (x.city || '').toLowerCase() === c.toLowerCase());
                      const active = idx >= 0;
                      return (
                        <button key={c} type="button"
                          onClick={() => {
                            if (active) { setEditingIdx(idx); setCondForm(list[idx]); setTkCarrier(''); }
                            else { setEditingIdx(null); setCondForm(f => ({ ...EMPTY_COND, city: c })); setTkCarrier(''); }
                          }}
                          className={`text-sm px-4 py-2 rounded-xl border transition-colors ${active ? 'bg-green-50 border-green-300 text-green-700 font-medium' : 'bg-blue-50/60 border-blue-200 text-gray-700 hover:border-red-300'}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* ШАГ 3: УСЛОВИЯ СЕРВИСА ПОИСКА */}
            {(data.warehouses || []).length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-gray-900">{editingIdx !== null ? 'Редактирование условия' : 'Условия сервиса поиска'}</h2>
                  {editingIdx !== null && (
                    <button onClick={() => { setEditingIdx(null); setCondForm(EMPTY_COND); setTkCarrier(''); }} className="text-gray-400 hover:text-gray-700" title="Закрыть"><X size={18} /></button>
                  )}
                </div>

                {/* Добавленные условия — чипы */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {(data.serviceSearch || []).map((c, idx) => (
                    <span key={idx} className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm">
                      <span className="font-medium text-gray-800">{c.city}{c.warehouseName ? ` (${c.warehouseName})` : ''}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${(c.status || 'Новое') === 'Загружено' ? 'bg-green-50 text-green-700 border border-green-200' : (c.status || 'Новое') === 'Есть изменения' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{c.status || 'Новое'}</span>
                      <button onClick={() => { setEditingIdx(idx); setCondForm(c); setTkCarrier(''); }} className="text-gray-300 hover:text-blue-600" title="Редактировать"><Pencil size={13} /></button>
                      <button onClick={() => removeCondition(idx)} className="text-gray-300 hover:text-red-600" title="Удалить"><Trash2 size={13} /></button>
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Колонка 1: город/склад/срок поставки */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Условия сервиса поиска</label>
                      <select className={fld + ' mt-1.5'} value={condForm.city} onChange={e => setCondForm(f => ({ ...f, city: e.target.value }))}>
                        <option value="">Город показов *</option>
                        {(data?.availableCities || []).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select className={fld + ' mt-2'} value={condForm.warehouseName} onChange={e => setCondForm(f => ({ ...f, warehouseName: e.target.value }))}>
                        <option value="">Склад отгрузки *</option>
                        {data.warehouses.map(w => <option key={w.id} value={w.city}>{w.city}{w.verified ? ' ✓' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Срок поставки до города</label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {['Сегодня', 'Завтра', '2-3 дня'].map(v => (
                          <button key={v} type="button"
                            onClick={() => setCondForm(f => ({ ...f, deliveryTime: f.deliveryTime === v ? '' : v }))}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${condForm.deliveryTime === v ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'}`}>
                            {v}
                          </button>
                        ))}
                        <input className={fld + ' !w-28 !py-1.5 text-xs'} placeholder="ТК" value={tkCarrier} onChange={e => setTkCarrier(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Условия возврата товара</label>
                      <input className={fld + ' mt-1.5'} value={condForm.returnConditions} onChange={e => setCondForm(f => ({ ...f, returnConditions: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">График выгрузки заказов</label>
                      <input className={fld + ' mt-1.5'} placeholder="Например при заказе до 16:00 на следующий день"
                        value={condForm.orderUnloadSchedule} onChange={e => setCondForm(f => ({ ...f, orderUnloadSchedule: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">График доставки</label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => {
                          const days = (condForm.deliverySchedule || '').split(',').map(x => x.trim()).filter(Boolean);
                          const on = days.includes(d);
                          return (
                            <button key={d} type="button"
                              onClick={() => setCondForm(f => ({ ...f, deliverySchedule: on ? days.filter(x => x !== d).join(', ') : [...days, d].join(', ') }))}
                              className={`w-9 h-9 text-xs rounded-lg border transition-colors ${on ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'}`}>
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Колонка 2-3: представитель/контакты + кнопка */}
                  <div className="lg:col-span-2 space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-600">Представитель</label>
                        {(data as { contactName?: string }).contactName && (
                          <button type="button" className="text-xs text-red-700 hover:underline"
                            onClick={() => setCondForm(f => ({
                              ...f,
                              representative: (data as { contactName?: string }).contactName || f.representative,
                              contacts: (data as { contactPhone?: string }).contactPhone || f.contacts,
                              email: (data as { contactEmail?: string }).contactEmail || f.email,
                            }))}>
                            Заполнить из карточки
                          </button>
                        )}
                      </div>
                      <input className={fld + ' mt-1.5'} placeholder="ФИО" value={condForm.representative} onChange={e => setCondForm(f => ({ ...f, representative: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Контакты</label>
                      <input className={fld + ' mt-1.5'} placeholder="Телефон" value={condForm.contacts} onChange={e => setCondForm(f => ({ ...f, contacts: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Email</label>
                      <input className={fld + ' mt-1.5'} value={condForm.email} onChange={e => setCondForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                    <button onClick={() => {
                      const merged = { ...condForm, deliveryTime: [condForm.deliveryTime, tkCarrier.trim() ? `ТК: ${tkCarrier.trim()}` : ''].filter(Boolean).join('; ') };
                      setCondForm(merged);
                      saveCondition();
                    }} disabled={saving}
                      className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl px-6 py-2.5 flex items-center justify-center gap-1 disabled:opacity-60">
                      <Plus size={15} /> {editingIdx !== null ? 'Сохранить условие' : 'Добавить условие'}
                    </button>
                    {(data.serviceSearch || []).length > 0 && (
                      <button onClick={applyToAllCities} disabled={saving}
                        className="w-full sm:w-auto sm:ml-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs font-semibold rounded-xl px-4 py-2.5 disabled:opacity-60"
                        title="Создать по условию на каждый доступный город, которого ещё нет">
                        Во все доступные города
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {notice && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{notice}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
