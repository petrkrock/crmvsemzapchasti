import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getFunctionsUrl, getAnonKeyHeaders, isSupabaseConfigured } from '@/lib/functions-api';
import { Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Pencil, X, MapPin, Warehouse, FileText, Truck, Info } from 'lucide-react';

interface Wh { id: string; city: string; skuCount: number; verified?: boolean; } // verified выставляет менеджер в CRM
interface Cond { city: string; warehouseName: string; representative: string; contacts: string;
  email: string; deliverySchedule: string; orderUnloadSchedule: string; returnConditions: string; officialWarehouse: string;
  status?: string; } // статус условия (Новое/Загружено/Есть изменения) — из CRM

const COND_FIELDS: Array<{ key: keyof Cond; label: string }> = [
  { key: 'representative', label: 'Представитель' },
  { key: 'contacts', label: 'Контакты' },
  { key: 'email', label: 'Email' },
  { key: 'deliverySchedule', label: 'График доставки' },
  { key: 'orderUnloadSchedule', label: 'Условия доставки' }, // ТЗ v1.23.6: переименовано
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
  const [selectedWh, setSelectedWh] = useState(''); // ТЗ v1.23.6: склад, выбранный кнопкой в «Мои склады»
  const [editorOpen, setEditorOpen] = useState(false); // окно условий открывается после выбора города
  const [tkOn, setTkOn] = useState(false); // ТЗ v1.23.6: кнопка ТК
  const [priceHint, setPriceHint] = useState(false); // ТЗ v1.23.8: подсказка прайс-листа
  const [cityHint, setCityHint] = useState(false); // ТЗ v1.23.9: совет по городам
  const [cityFilter, setCityFilter] = useState<'all' | 'covered' | 'empty'>('all'); // пилюли-фильтр городов
  const [statusFilter, setStatusFilter] = useState<'all' | 'Новое' | 'Загружено' | 'Есть изменения'>('all'); // ТЗ v1.23.10: фильтр условий по статусу
  const [statusHint, setStatusHint] = useState(false);
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
      <div ref={wrapperRef} className={`w-full ${pinPassed ? 'max-w-[1160px]' : 'max-w-xl'} py-2`}>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6 lg:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-gray-900">Добавить склад</h2>
                  <button type="button" onClick={() => setPriceHint(v => !v)} title="Прайс-лист"
                    className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${priceHint ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                    <FileText size={16} />
                  </button>
                </div>
                {priceHint && (
                  <div className="absolute right-4 top-16 z-10 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3.5 text-xs text-gray-600 leading-relaxed">
                    Настройте ежедневную рассылку Вашего прайс-листа на почтовый адрес: <span className="font-semibold text-gray-800">price@vsemzapchasti.ru</span>. Первую настройку сделает поддержка.
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1 mb-4">Шаг 1. Сначала добавьте склад - он понадобится в условиях поиска</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input className={fld + ' flex-1 min-w-0'} placeholder="Город, название Вашего склада *"
                    value={whCity} onChange={e => setWhCity(e.target.value)} />
                  <input className={fld + ' w-40'} placeholder="Примерное кол-во SKU" inputMode="numeric" maxLength={6}
                    value={whSku} onChange={e => setWhSku(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                  <button onClick={addWarehouse} disabled={saving} title="Добавить склад"
                    className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-3.5 py-2.5 flex items-center justify-center disabled:opacity-60">
                    <Plus size={17} />
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
                  <button key={w.id} type="button" onClick={() => setSelectedWh(prev => prev === w.city ? '' : w.city)}
                    className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors ${selectedWh === w.city ? 'border-green-500 bg-green-50 ring-1 ring-green-200' : w.verified ? 'border-green-300 bg-green-50 hover:border-green-500' : 'border-green-200 bg-white hover:border-green-500'}`}>
                    <span className="font-semibold text-gray-900">{w.city}</span>
                    <span className="text-gray-400 text-xs">{Number(w.skuCount).toLocaleString('ru-RU')} SKU</span>
                    <span className={`text-xs ${w.verified ? 'text-green-600 font-medium' : 'text-gray-400'}`}>{w.verified ? 'Проверен' : 'Не проверен'}</span>
                    <span onClick={e => { e.stopPropagation(); removeWarehouse(w.id); }} className="text-gray-300 hover:text-red-600 cursor-pointer" title="Удалить"><Trash2 size={14} /></span>
                  </button>
                ))}
              </div>
            </div>

            {/* ДОСТУПНЫЕ ГОРОДА — список показываем всегда; условия требуют склад */}
            <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">Доступные города</h2>
                <div className="flex items-center gap-2">
                  {(['covered', 'empty'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setCityFilter(prev => prev === f ? 'all' : f)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${cityFilter === f ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>
                      {f === 'covered' ? 'Есть условия' : 'Нет условий'}
                    </button>
                  ))}
                  <button type="button" onClick={() => setCityHint(v => !v)} title="Совет по городам"
                    className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${cityHint ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                    <Truck size={16} />
                  </button>
                </div>
              </div>
              {cityHint && (
                <div className="absolute right-4 top-16 z-10 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-3.5 text-xs text-gray-600 leading-relaxed">
                  Настраивайте склад во всех городах, даже если у вас туда пока нет доставки. При заполнении условий поиска (проценки) обязательно выбирайте пункт «Условия доставки ТК». Клиенты увидят, что постоянной доставки нет, но привыкнут к вашему складу и запомнят Вашу компанию.
                </div>
              )}
              {(() => {
                const list = data.serviceSearch || [];
                const cities = data.availableCities || [];
                if (!cities.length) return <p className="text-xs text-gray-400 mt-3">Список доступных городов не настроен — уточните у вашего менеджера.</p>;
                const isCov = (c: string) => list.some(x => (x.city || '').toLowerCase() === c.toLowerCase());
                const filtered = cities.filter(c => cityFilter === 'all' ? true : cityFilter === 'covered' ? isCov(c) : !isCov(c));
                if (!filtered.length) return <p className="text-xs text-gray-400 mt-3">Городов по выбранному фильтру нет.</p>;
                return (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {filtered.map(c => {
                      const idx = list.findIndex(x => (x.city || '').toLowerCase() === c.toLowerCase());
                      const active = idx >= 0;
                      return (
                        <button key={c} type="button"
                          onClick={() => {
                            if ((data.warehouses || []).length === 0 || !selectedWh) {
                              setNotice('Сначала создайте склад в системе (шаг 1) — без склада условия недоступны.');
                              return;
                            }
                            setNotice('');
                            if (editorOpen && ((active && editingIdx === idx) || (!active && editingIdx === null && condForm.city === c))) {
                              setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false);
                              return;
                            }
                            setTkOn(false);
                            if (active) { setEditingIdx(idx); setCondForm(list[idx]); setSelectedWh(list[idx].warehouseName || selectedWh); }
                            else { setEditingIdx(null); setCondForm({ ...EMPTY_COND, city: c, warehouseName: selectedWh }); }
                            setEditorOpen(true);
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

            {/* ШАГ 3: ОКНО «УСЛОВИЯ СЕРВИСА ПОИСКА» — открывается после выбора города */}
            {editorOpen && (data.warehouses || []).length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-gray-900">{editingIdx !== null ? 'Условия сервиса поиска (редактирование)' : 'Условия сервиса поиска'}</h2>
                  <button onClick={() => { setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false); }} className="text-gray-400 hover:text-gray-700" title="Закрыть"><X size={18} /></button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* КОЛОНКА 1: условия сервиса поиска (чипы) */}
                  <div className="flex flex-col gap-2 max-w-[260px]">
                    <div className="text-sm rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800">{condForm.warehouseName || 'Склад не выбран'}</div>
                    <div className="text-sm rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800">{condForm.city || 'Город не выбран'}</div>
                  </div>

                  {/* КОЛОНКА 2: график/условия доставки, возврат */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600">График доставки</label>
                      <div className="flex flex-wrap gap-1.5 mt-2">
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
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Условия доставки</label>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <button type="button" onClick={() => {
                          const TK_TEXT = 'Доставка по согласованию с поставщиком!';
                          const cur = condForm.orderUnloadSchedule || '';
                          const has = cur.includes(TK_TEXT);
                          const next = has ? cur.replace(TK_TEXT, '').replace(/\s{2,}/g, ' ').trim() : (cur ? `${cur.trim()} ${TK_TEXT}` : TK_TEXT);
                          setCondForm(f => ({ ...f, orderUnloadSchedule: next }));
                          setTkOn(!has);
                        }}
                          className={`w-9 h-9 text-xs font-bold rounded-lg border transition-colors ${tkOn || String(condForm.orderUnloadSchedule || '').includes('Доставка по согласованию с поставщиком!') ? 'bg-yellow-300 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:border-yellow-400'}`}>
                          ТК
                        </button>
                        {['Сегодня', 'Завтра'].map(v => (
                          <button key={v} type="button" onClick={() => setCondForm(f => ({ ...f, deliveryTime: v.toLowerCase() }))}
                            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${condForm.deliveryTime === v.toLowerCase() ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'}`}>
                            {v}
                          </button>
                        ))}
                        <input className={fld + ' flex-1 min-w-[140px] !py-2 text-xs'} placeholder="Например: 2-3 дня"
                          value={condForm.deliveryTime} onChange={e => setCondForm(f => ({ ...f, deliveryTime: e.target.value }))} />
                      </div>
                      <textarea className={fld + ' mt-2 h-24 resize-none text-xs'} placeholder="Например: при заказе до 16:00 на следующий день"
                        value={condForm.orderUnloadSchedule} onChange={e => setCondForm(f => ({ ...f, orderUnloadSchedule: e.target.value }))} />
                    </div>
                    <div>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-gray-600">Условия возврата товара</label>
                          <input className={fld + ' mt-2'} value={condForm.returnConditions} onChange={e => setCondForm(f => ({ ...f, returnConditions: e.target.value }))} />
                        </div>
                        <button onClick={() => { if (!condForm.city || !condForm.warehouseName) { setNotice('Заполните Город показов и Склад'); return; } setNotice(''); saveCondition(); setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false); }} disabled={saving}
                          className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl px-6 py-2.5 flex items-center gap-1 disabled:opacity-60 whitespace-nowrap">
                          <Plus size={15} /> {editingIdx !== null ? 'Сохранить условие' : 'Добавить условие'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* КОЛОНКА 3: представитель/контакты/email + кнопка */}
                  <div className="space-y-4">
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
                      <input className={fld + ' mt-2'} placeholder="ФИО" value={condForm.representative} onChange={e => setCondForm(f => ({ ...f, representative: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Контакты</label>
                      <input className={fld + ' mt-2'} placeholder="Телефон" value={condForm.contacts} onChange={e => setCondForm(f => ({ ...f, contacts: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Email</label>
                      <input className={fld + ' mt-2'} value={condForm.email} onChange={e => setCondForm(f => ({ ...f, email: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* УСЛОВИЯ СЕРВИСА ПОИСКА (DBS) — таблица условий */}
            {(data.serviceSearch || []).length > 0 && (
              <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <h2 className="text-lg font-bold text-gray-900">Условия сервиса поиска (DBS)</h2>
                  <div className="flex items-center gap-2">
                    {(['Новое', 'Загружено', 'Есть изменения'] as const).map(st => (
                      <button key={st} type="button" onClick={() => setStatusFilter(p => p === st ? 'all' : st)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === st ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>
                        {st}
                      </button>
                    ))}
                    <button type="button" onClick={() => setStatusHint(v => !v)} title="Статусы условий"
                      className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${statusHint ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                      <Info size={16} />
                    </button>
                  </div>
                </div>
                {statusHint && (
                  <div className="absolute right-4 top-16 z-10 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-3.5 text-xs text-gray-600 leading-relaxed space-y-1.5">
                    <p><b className="text-red-700">Новое</b> — Условие создано, но ещё не опубликовано на платформе.</p>
                    <p><b className="text-green-700">Загружено</b> — Склад и его условия поставки доступны в проценке на платформе.</p>
                    <p><b className="text-amber-700">Есть изменения</b> — Вы редактировали одно из условий, оно ждёт очереди на загрузку в платформу.</p>
                  </div>
                )}
                {(() => {
                  const list = data.serviceSearch || [];
                  const filtered = list.filter(c => statusFilter === 'all' ? true : (c.status || 'Новое') === statusFilter);
                  if (!filtered.length) return <p className="text-xs text-gray-400">Условий с выбранным статусом нет.</p>;
                  const cell = (label: string, value: React.ReactNode) => (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
                      <div className="text-sm font-medium text-gray-800">{value || '—'}</div>
                    </div>
                  );
                  const TK = 'Доставка по согласованию с поставщиком!';
                  return filtered.map(c => {
                    const realIdx = list.indexOf(c);
                    const tkOn = String(c.orderUnloadSchedule || '').includes(TK);
                    const delivText = [c.deliveryTime, String(c.orderUnloadSchedule || '').replace(TK, '').trim()].filter(Boolean).join(' · ');
                    const days = (c.deliverySchedule || '').split(',').map(x => x.trim()).filter(Boolean);
                    return (
                      <div key={realIdx} className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-gray-50 rounded-xl px-4 py-3 text-sm mb-2">
                        {cell('Склад', c.warehouseName)}
                        {cell('Город', c.city)}
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">График доставки</p>
                          <div className="flex gap-1">
                            {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => (
                              <span key={d} className={`w-6 h-6 text-[10px] flex items-center justify-center rounded-md border ${days.includes(d) ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-400'}`}>{d}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">Условия доставки</p>
                          <div className="flex items-center gap-1.5 max-w-[300px]">
                            {tkOn && <span className="w-7 h-7 text-[10px] font-bold flex items-center justify-center rounded-lg bg-yellow-300 border border-yellow-400 text-gray-900">ТК</span>}
                            <span className="text-xs text-gray-600 truncate" title={delivText}>{delivText || '—'}</span>
                          </div>
                        </div>
                        {cell('Представитель', c.representative)}
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${(c.status || 'Новое') === 'Загружено' ? 'bg-green-50 text-green-700 border border-green-200' : (c.status || 'Новое') === 'Есть изменения' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{c.status || 'Новое'}</span>
                        <button onClick={() => { setEditingIdx(realIdx); setCondForm(c); setSelectedWh(c.warehouseName || selectedWh); setTkOn(tkOn); setEditorOpen(true); }}
                          className="ml-auto text-gray-300 hover:text-red-600" title="Редактировать"><Pencil size={15} /></button>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {notice && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{notice}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
