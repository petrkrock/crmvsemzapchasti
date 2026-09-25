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
          <div className="flex flex-col items-center mb-6">
            <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[180px] h-auto mb-3" />
            <p className="text-base font-bold text-gray-900 tracking-wide text-center">НАСТРОЙКА СЕРВИСА ПОИСКА (DBS)</p>
          </div>
        )}

        {!loading && !fatal && data && !pinPassed && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
            <p className="text-sm text-gray-500 mt-1.5">{data.companyName}{data.inn ? ` (${data.inn})` : ''}</p>
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
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-7">
              <h2 className="text-xl font-bold text-gray-900">Сервис поиска</h2>
              <p className="text-sm text-gray-500 mt-1.5">{data.companyName}</p>
            </div>

            {/* ШАГ 1: СКЛАДЫ */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-7">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-1">
                <Warehouse size={17} className="text-red-600" /> Мои склады
              </h2>
              <p className="text-xs text-gray-400 mb-4">Шаг 1. Сначала добавьте склады — они понадобятся в условиях поиска.</p>
              {(data.warehouses || []).map(w => (
                <div key={w.id} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3.5 py-2.5 mb-2 text-sm">
                  <MapPin size={15} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-800 font-medium">{w.city}</span>
                  <span className="text-gray-400 text-xs">SKU: {w.skuCount}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${w.verified ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                    {w.verified ? 'Проверен ✓' : 'Не проверен'}
                  </span>
                  <button onClick={() => removeWarehouse(w.id)} className="ml-auto text-gray-300 hover:text-red-600" title="Удалить"><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="grid grid-cols-1 min-[480px]:grid-cols-[1fr_110px_auto] gap-2 mt-3">
                <input className={fld} placeholder="Город склада *" value={whCity} onChange={e => setWhCity(e.target.value)} />
                <input className={fld} placeholder="SKU" inputMode="numeric" value={whSku} onChange={e => setWhSku(e.target.value.replace(/\D/g, ''))} />
                <button onClick={addWarehouse} disabled={saving}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl px-4 flex items-center gap-1 disabled:opacity-60"><Plus size={15} />Добавить</button>
              </div>
            </div>

            {/* ШАГ 2: УСЛОВИЯ */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-7">
              <h2 className="text-base font-bold text-gray-900 mb-1">Условия сервиса поиска</h2>
              <p className="text-xs text-gray-400 mb-3">Шаг 2. Условия для каждого города/склада. Склад выбирается из добавленных выше.</p>
              {(() => {
                const covered = new Set((data?.serviceSearch || []).map(c => (c.city || '').toLowerCase()));
                const cities = data?.availableCities || [];
                return (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 mb-4">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-2 text-sm">
                      <span className="text-gray-500">Доступно городов: <b className="text-gray-900">{cities.length}</b></span>
                      <span className="text-gray-500">Условий: <b className="text-gray-900">{(data?.serviceSearch || []).length}</b></span>
                      <span className="text-gray-500">Охвачено: <b className="text-gray-900">{covered.size}</b></span>
                      <button onClick={applyToAllCities} disabled={saving}
                        className="ml-auto text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors disabled:opacity-60"
                        title="Создать по условию на каждый доступный город, которого ещё нет">
                        Во все доступные города
                      </button>
                    </div>
                    {cities.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {cities.map(c => (
                          <span key={c} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${covered.has(c.toLowerCase()) ? 'bg-green-50 border-green-300 text-green-700 font-medium' : 'bg-white border-gray-200 text-gray-500'}`}>
                            {c}{covered.has(c.toLowerCase()) && '✓'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Список доступных городов не настроен — уточните у вашего менеджера.</p>
                    )}
                  </div>
                );
              })()}

              {(data.serviceSearch || []).map((c, idx) => (
                <div key={idx} className="border border-gray-100 rounded-xl p-3.5 mb-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-800">{c.city}{c.warehouseName ? ` · ${c.warehouseName}` : ''}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${(c.status || 'Новое') === 'Загружено' ? 'bg-green-50 text-green-700 border border-green-200' : (c.status || 'Новое') === 'Есть изменения' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{c.status || 'Новое'}</span>
                    <span className="flex gap-2">
                      <button onClick={() => { setEditingIdx(idx); setCondForm(c); }} className="text-gray-300 hover:text-blue-600" title="Редактировать"><Pencil size={14} /></button>
                      <button onClick={() => removeCondition(idx)} className="text-gray-300 hover:text-red-600" title="Удалить"><Trash2 size={14} /></button>
                    </span>
                  </div>
                  {(() => { const wh = (data?.warehouses || []).find(w => w.city.toLowerCase() === (c.warehouseName || '').toLowerCase()); return (
                    <p className={`text-xs mt-1 ${wh?.verified ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                      Склад проверен: {wh?.verified ? 'Да ✓' : 'Нет'}
                    </p>
                  ); })()}
                  {c.deliverySchedule && <p className="text-xs text-gray-400">Доставка: {c.deliverySchedule}</p>}
                  {c.returnConditions && <p className="text-xs text-gray-400">Возвраты: {c.returnConditions}</p>}
                </div>
              ))}

              {(data.warehouses || []).length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3">Сначала добавьте хотя бы один склад в блоке выше.</p>
              ) : (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mt-2">
                  <p className="text-xs font-semibold text-gray-600 mb-3">{editingIdx !== null ? 'Редактирование условия' : 'Новое условие'}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-[11px] font-semibold uppercase text-gray-400">Город показов *</label>
                      <select className={fld} value={condForm.city} onChange={e => setCondForm(f => ({ ...f, city: e.target.value }))}>
                        <option value="">Выберите город...</option>
                        {(data?.availableCities || []).map(c => <option key={c} value={c}>{c}</option>)}
                      </select></div>
                    <div><label className="text-[11px] font-semibold uppercase text-gray-400">Склад</label>
                      <select className={fld} value={condForm.warehouseName} onChange={e => setCondForm(f => ({ ...f, warehouseName: e.target.value }))}>
                        <option value="">Выберите склад...</option>
                        {data.warehouses.map(w => <option key={w.id} value={w.city}>{w.city}{w.verified ? ' ✓' : ''}</option>)}
                      </select></div>
                    {COND_FIELDS.map(f => (
                      <div key={f.key} className={f.key === 'returnConditions' ? 'sm:col-span-2' : ''}>
                        <label className="text-[11px] font-semibold uppercase text-gray-400">{f.label}</label>
                        {f.key === 'officialWarehouse' ? (
                          <select className={fld} value={condForm.officialWarehouse} onChange={e => setCondForm(prev => ({ ...prev, officialWarehouse: e.target.value }))}>
                            <option value="">Выберите склад...</option>
                            {(data?.warehouses || []).map(w => <option key={w.id} value={w.city}>{w.city}{w.verified ? ' ✓' : ''}</option>)}
                          </select>
                        ) : f.key === 'returnConditions' ? (
                          <>
                            <input className={fld} list="vz-return-opts" placeholder="Выберите или введите свой вариант" value={condForm.returnConditions} onChange={e => setCondForm(prev => ({ ...prev, returnConditions: e.target.value }))} />
                            <datalist id="vz-return-opts"><option value="Возврат без комиссии" /><option value="Возврат с комиссией" /><option value="Нет возврата" /></datalist>
                          </>
                        ) : f.key === 'deliveryTime' ? (
                          // v_1.9: быстрые кнопки Сегодня/Завтра (можно только одно) или свой ввод
                          <div>
                            <div className="flex gap-1.5 mb-1.5">
                              {['Сегодня', 'Завтра'].map(q => (
                                <button key={q} type="button"
                                  onClick={() => setCondForm(prev => ({ ...prev, deliveryTime: prev.deliveryTime === q ? '' : q }))}
                                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${condForm.deliveryTime === q ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:bg-brand-gray'}`}>{q}</button>
                              ))}
                            </div>
                            <input className={fld} value={condForm.deliveryTime} onChange={e => setCondForm(prev => ({ ...prev, deliveryTime: e.target.value }))} placeholder="например: 2 дня" />
                          </div>
                        ) : f.key === 'deliverySchedule' ? (
                          <div className="flex flex-wrap gap-1 pt-1">{['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(d => {
                            const days = (condForm.deliverySchedule || '').split(',').filter(Boolean);
                            const on = days.includes(d);
                            return <button key={d} type="button"
                              onClick={() => setCondForm(prev => ({ ...prev, deliverySchedule: on ? days.filter(x => x !== d).join(',') : [...days, d].join(',') }))}
                              className={`w-8 h-7 text-[10px] rounded-md border ${on ? 'bg-red-50 border-red-300 text-red-700 font-semibold' : 'bg-white border-gray-200 text-gray-400'}`}>{d}</button>;
                          })}</div>
                        ) : (
                          <input className={fld} value={condForm[f.key]} onChange={e => setCondForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={saveCondition} disabled={saving}
                      className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl px-5 py-2.5 disabled:opacity-60">
                      {editingIdx !== null ? 'Сохранить изменения' : 'Добавить условие'}</button>
                    {editingIdx !== null && (
                      <button onClick={() => { setEditingIdx(null); setCondForm(EMPTY_COND); }}
                        className="text-sm text-gray-500 flex items-center gap-1"><X size={14} />Отмена</button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {notice && <p className="text-center text-sm text-gray-600 bg-white border border-gray-200 rounded-2xl py-3 px-4">{notice}</p>}
            <p className="text-center text-xs text-gray-400 pb-2">Изменения сразу попадают в CRM</p>
          </div>
        )}
      </div>
    </div>
  );
}
