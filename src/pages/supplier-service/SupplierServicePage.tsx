import { APP_VERSION } from '@/constants';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getFunctionsUrl, getAnonKeyHeaders, isSupabaseConfigured } from '@/lib/functions-api';
import { Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Pencil, X, MapPin, Warehouse, FileText, Truck, Info, ChevronDown, ArrowUpRight, Headset, Wallet, Undo2, LayoutDashboard, Search, Boxes, LogOut } from 'lucide-react';

interface Wh { id: string; city: string; skuCount: number; verified?: boolean; address?: string; status?: 'Новый' | 'Проверен' | 'Заморожен'; } // ТЗ v1.25.0: +адрес, +статус
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
const LK_MENU = [
  { key: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { key: 'pricing', label: 'Проценка', icon: Search },
  { key: 'delivery', label: 'Доставка', icon: Truck },
  { key: 'crossdock', label: 'Кроссдок', icon: Boxes },
] as const;

// v1.29.0: подвкладки раздела «Доставка»
const DL_MENU = [
  { key: 'mycities', label: 'Мои города', icon: MapPin },
  { key: 'deliveries', label: 'Доставки', icon: Truck },
  { key: 'returns', label: 'Возвраты', icon: Undo2 },
  { key: 'documents', label: 'Документы', icon: FileText },
  { key: 'finance', label: 'Финансы', icon: Wallet },
] as const;

export default function SupplierServicePage() {
  const { token = '' } = useParams<{ token: string }>();

  const [data, setData] = useState<{ companyName: string; inn?: string; hasPin: boolean; warehouses: Wh[]; serviceSearch: Cond[]; availableCities: string[]; multiWarehouse: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [pinPassed, setPinPassed] = useState(() => sessionStorage.getItem('dbs_pin_ok') === '1'); // ТЗ v1.23.19: переживает F5
  const [pin, setPin] = useState(() => sessionStorage.getItem('dbs_pin') || ''); // ТЗ v1.23.39: переживает F5
  const [pinError, setPinError] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whAddress, setWhAddress] = useState(''); // ТЗ v1.25.0: адрес склада
  const [whSku, setWhSku] = useState('');
  const [condForm, setCondForm] = useState<Cond>(EMPTY_COND);
  const [tkCarrier, setTkCarrier] = useState(''); // ТЗ v1.23.2: перевозчик для «Срок поставки»
  const [selectedWh, setSelectedWh] = useState(''); // ТЗ v1.23.6: склад, выбранный кнопкой в «Мои склады»
  const [editorOpen, setEditorOpen] = useState(false); // окно условий открывается после выбора города
  const [tkOn, setTkOn] = useState(false); // ТЗ v1.23.6: кнопка ТК
  const [priceHint, setPriceHint] = useState(false);
  // v1.29.0: единый кабинет — меню и данные доставки (DBO)
  const [lkTab, setLkTab] = useState<'dashboard' | 'pricing' | 'delivery' | 'crossdock'>('dashboard');
  const [deliveryInfo, setDeliveryInfo] = useState<Record<string, unknown> | null>(null);
  const [dlCities, setDlCities] = useState<string[]>([]);
  const [dlTab, setDlTab] = useState<'mycities' | 'deliveries' | 'returns' | 'documents' | 'finance'>('mycities'); // ТЗ v1.23.8: подсказка прайс-листа
  const [cityHint, setCityHint] = useState(false); // ТЗ v1.23.9: совет по городам
  const [cityFilter, setCityFilter] = useState<'all' | 'covered' | 'empty'>('all'); // пилюли-фильтр городов
  const [statusFilter, setStatusFilter] = useState<'all' | 'Новое' | 'Загружено' | 'Есть изменения'>('all'); // ТЗ v1.23.10: фильтр условий по статусу
  const [statusHint, setStatusHint] = useState(false);
  const [pendingCity, setPendingCity] = useState<string | null>(null); // ТЗ v1.23.11: город, ждущий кнопку «Создать условия»
  const [editingWhId, setEditingWhId] = useState<string | null>(null); // ТЗ v1.23.32: редактирование склада (карандаш)
  const [whHint, setWhHint] = useState(false);
  const lastDataJson = useRef(''); // ТЗ v1.23.41: не перерисовываемся, если данные не изменились
  const [missing, setMissing] = useState<string[]>([]); // ТЗ v1.23.23: незаполненные обязательные поля (подсветка)
  const fldM = (k: string) => fld + (missing.includes(k) ? ' !border-red-400 !ring-2 !ring-red-200' : '');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  // ТЗ v1.23.55: тост гаснет сам через 4с
    // v1.29.0: данные доставки при входе/старте (единый кабинет)
  useEffect(() => { if (pinPassed) loadDeliveryInfo(); }, [pinPassed]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !/^[a-f0-9]{32}$/.test(token)) { setLoading(false); setFatal('Недействительная ссылка'); return; }
    fetch(`${getFunctionsUrl('supplier-service')}?token=${token}`, { headers: getAnonKeyHeaders() })
      .then(r => r.json())
      .then(d => { if (d.error) setFatal(d.error); else { setData(prev => prev ? {
        ...prev,
        // ТЗ v1.23.52: мерджим ТОЛЬКО скаляры — GET-метаданные содержат пустые массивы,
        // которые затирали загруженные условия/склады после F5.
        companyName: d.companyName ?? prev.companyName,
        hasPin: d.hasPin ?? prev.hasPin,
        inn: d.inn ?? prev.inn,
        contactName: d.contactName ?? prev.contactName,
        contactPhone: d.contactPhone ?? prev.contactPhone,
        contactEmail: d.contactEmail ?? prev.contactEmail,
        multiWarehouse: d.multiWarehouse ?? prev.multiWarehouse,
      } : d); if (sessionStorage.getItem('dbs_pin_ok') !== '1') setPinPassed(false); } }) // ТЗ v1.23.41: МЕРДЖ — иначе GET затирал условия после F5
      .catch(() => setFatal('Не удалось загрузить данные'))
      .finally(() => setLoading(false));
  }, [token]);

  // ТЗ v1.23.54: полные данные грузим ОДИН РАЗ после прохождения PIN-гейта —
  // независимо от пути (ввод PIN или сессия после F5). Раньше эффект срабатывал
  // только при hasPin === false, поэтому после F5 данные ждали поллинга 45с
  // и условия «исчезали» до следующего цикла.
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    // ТЗ v1.23.55: при живой сессии грузим данные НЕМЕДЛЕННО, не дожидаясь GET-метаданных —
    // убирает видимую задержку «условия появляются не сразу».
    if (pinPassed) { initialLoadDone.current = true; post({}).then(err => { if (err) { initialLoadDone.current = false; setNotice(err); sessionStorage.removeItem('dbs_pin_ok'); sessionStorage.removeItem('dbs_pin'); setPinPassed(false); } }); return; }
    if (!data) return;                    // hasPin ещё неизвестен — ждём GET
    if (data.hasPin) return;              // ждём ввод PIN
    initialLoadDone.current = true;
    post({}).then(err => {
      if (err) { initialLoadDone.current = false; setNotice(err); return; }
      sessionStorage.setItem('dbs_pin_ok', '1');
      if (pin) sessionStorage.setItem('dbs_pin', pin);
      setPinPassed(true);
    });
  }, [data, pinPassed]);

  // ТЗ v1.23.35: автообновление данных из CRM каждые 20 сек — изменения менеджера видны без ручного F5
  useEffect(() => {
    if (!pinPassed) return;
    const t = setInterval(() => { post({}, true).catch(() => {}); }, 45000);
    return () => clearInterval(t);
  }, [pinPassed]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const report = () => window.parent?.postMessage({ source: 'vz-crm-form', height: el.offsetHeight }, '*');
    const ro = new ResizeObserver(report);
    ro.observe(el); report();
    return () => ro.disconnect();
  }, [data, pinPassed, loading]);

  async function loadDeliveryInfo() {
    try {
      const pinCode = sessionStorage.getItem('dbs_pin') || '';
      const r = await fetch(getFunctionsUrl('supplier-service'), {
        method: 'POST',
        headers: { ...getAnonKeyHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: pinCode }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.delivery) { setDeliveryInfo(d.delivery); setDlCities(d.deliveryCities || []); }
    } catch { /* останется null — покажем «—» */ }
  }

  async function post(payload: Record<string, unknown>, silent = false): Promise<string | null> {
    setSaving(true);
    try {
      const res = await fetch(getFunctionsUrl('supplier-service'), {
        method: 'POST',
        headers: { ...getAnonKeyHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin, ...payload }),
      });
      const d = await res.json();
      if (!res.ok || d.error) return d.error || 'Ошибка сохранения';
      // ТЗ v1.23.41: дедупликация — одинаковые данные не вызывают перерисовку (ЛК тормозил)
      const key = JSON.stringify([d.warehouses, d.serviceSearch, d.contactName, d.contactPhone, d.contactEmail, d.multiWarehouse, d.availableCities]);
      if (key !== lastDataJson.current) {
        lastDataJson.current = key;
        // ТЗ v1.23.53: null-safe merge — при F5 POST может ответить РАНЬШЕ GET-метаданных,
        // и data ещё null: data! кидал исключение, загрузка молча падала, условия пропадали.
        setData(prev => ({
          companyName: prev?.companyName ?? d.companyName ?? '',
          hasPin: prev?.hasPin ?? d.hasPin ?? false,
          warehouses: d.warehouses, serviceSearch: d.serviceSearch,
          availableCities: d.availableCities ?? prev?.availableCities ?? [],
          multiWarehouse: d.multiWarehouse ?? prev?.multiWarehouse ?? false,
          inn: d.inn ?? prev?.inn,
          contactName: d.contactName ?? prev?.contactName,
          contactPhone: d.contactPhone ?? prev?.contactPhone,
          contactEmail: d.contactEmail ?? prev?.contactEmail,
        }));
      }
      if (!silent) setNotice('✓ Сохранено');
      setTimeout(() => setNotice(''), 2500);
      return null;
    } catch { return 'Ошибка сохранения. Проверьте интернет.'; }
    finally { setSaving(false); }
  }

  async function submitPin() {
    setPinError('');
    const err = await post({}); // пустой PATCH — сервер проверит PIN (403 при неверном)
    if (err) { setPinError(err); setPin(''); }
    else {
      sessionStorage.setItem('dbs_pin_ok','1');
      sessionStorage.setItem('dbs_pin', pin);
      setPinPassed(true);
    }
  }

  async function addWarehouse() {
    if (!whCity.trim()) { setNotice('Укажите город склада'); return; }
    if (!whAddress.trim()) { setNotice('Укажите адрес склада'); return; } // ТЗ v1.25.0: адрес обязателен
    if (!whSku.trim()) { setNotice('Укажите примерное кол-во SKU'); return; } // ТЗ v1.23.19: обе ячейки обязательны
    // ТЗ v1.25.7: лимит мультисклада решает СЕРВЕР (функция читает флаг из базы = зеркало CRM)
    // ТЗ v1.23.32: карандаш — обновление существующего склада, иначе добавление
    const err = editingWhId
      ? await post({ warehouses: (data?.warehouses || []).map(w => w.id === editingWhId ? { ...w, city: whCity.trim(), skuCount: Number(whSku) || 0, address: whAddress.trim() } : w) })
      : await post({ warehouses: [...(data?.warehouses || []), { id: crypto.randomUUID(), city: whCity.trim(), skuCount: Number(whSku) || 0, address: whAddress.trim() }] }); // ТЗ v1.23.19: id обязателен
    if (!err) { setWhCity(''); setWhSku(''); setWhAddress(''); setEditingWhId(null); }
    else setNotice(err);
  }

  async function removeWarehouse(id: string) {
    const err = await post({ warehouses: (data?.warehouses || []).filter(w => w.id !== id) });
    if (err) setNotice(err);
  }

  async function saveCondition(): Promise<boolean> { // ТЗ v1.23.24: true = сохранено (кнопка закрывает форму только тогда)
    if (!condForm.city.trim()) { setNotice('Город показов обязателен'); return false; }
    // ТЗ v1.23.19: обязательные поля условия
    // ТЗ v1.23.23: форма НЕ закрывается и данные не стираются — пустые поля подсвечиваются
    const NAMES: Record<string, string> = { deliveryTime: 'Срок поставки', deliverySchedule: 'График доставки', orderUnloadSchedule: 'Условия доставки', returnConditions: 'Условия возврата товара', representative: 'Представитель', contacts: 'Контакты', email: 'Email' };
    const missingKeys: string[] = [];
    if (!condForm.deliveryTime?.trim()) missingKeys.push('deliveryTime');
    if (!condForm.deliverySchedule?.trim()) missingKeys.push('deliverySchedule');
    if (!condForm.orderUnloadSchedule?.trim()) missingKeys.push('orderUnloadSchedule');
    if (!condForm.returnConditions?.trim()) missingKeys.push('returnConditions');
    if (!condForm.representative?.trim()) missingKeys.push('representative');
    if (!condForm.contacts?.trim()) missingKeys.push('contacts');
    if (!condForm.email?.trim()) missingKeys.push('email');
    if (missingKeys.length) { setNotice('Заполните обязательные поля: ' + missingKeys.map(k => NAMES[k]).join(', ')); setMissing(missingKeys); return false; }
    // ТЗ v1.25.7: дубль-проверка по паре склад+город
    if (editingIdx === null && (data?.serviceSearch || []).some(x => (x.city || '').toLowerCase() === condForm.city.trim().toLowerCase() && (x.warehouseName || '') === condForm.warehouseName)) {
      setNotice('Условие для этого склада и города уже есть — откройте его в таблице'); return false;
    }
    // ТЗ v1.23.19: id обязателен у каждого условия — иначе в карточке CRM правка одного меняла все
    const cond = { ...condForm, id: condForm.id || crypto.randomUUID() };
    const list = [...(data?.serviceSearch || [])].map(c => c.id ? c : { ...c, id: crypto.randomUUID() });
    if (editingIdx !== null) list[editingIdx] = cond; else list.push(cond);
    const err = await post({ serviceSearch: list });
    if (err) { setNotice(err); return false; }
    setCondForm(EMPTY_COND); setEditingIdx(null); setMissing([]);
    setEditorOpen(false); // ТЗ v1.25.13: после успешного сохранения модалка закрывается сама
    return true;
  }

  async function applyToAllCities() {
    const cities = data?.availableCities || [];
    if (!cities.length) { setNotice('Список доступных городов не настроен — уточните у менеджера'); return; }
    if ((data?.warehouses || []).length === 0) { setNotice('Сначала добавьте хотя бы один склад'); return; }
    // ТЗ v1.25.7: «во все города» = города без условия ДЛЯ ТЕКУЩЕГО склада
    const existing = new Set((data?.serviceSearch || []).filter(c => (c.warehouseName || '') === condForm.warehouseName).map(c => (c.city || '').toLowerCase()));
    const template = { ...condForm, city: '' };
    const additions = cities.filter(c => !existing.has(c.toLowerCase())).map(c => ({ ...template, id: crypto.randomUUID(), city: c })); // ТЗ v1.23.19
    if (!additions.length) { setNotice('Для этого склада все доступные города уже добавлены'); return; }
    const normalized = [...(data?.serviceSearch || [])].map(c => c.id ? c : { ...c, id: crypto.randomUUID() });
    const err = await post({ serviceSearch: [...normalized, ...additions] });
    if (!err) setCondForm(EMPTY_COND); else setNotice(err);
  }

  async function removeCondition(idx: number) {
    const err = await post({ serviceSearch: (data?.serviceSearch || []).filter((_, i) => i !== idx) });
    if (err) setNotice(err);
  }

  // ТЗ v1.23.28: «удаление» = статус «Удаление» (мягкое удаление)
  async function markDeleted(idx: number) {
    const c = (data?.serviceSearch || [])[idx];
    if (!c) return;
    if (!window.confirm(`Вы точно хотите удалить проценку склада ${c.warehouseName || '—'} из города ${c.city}? Данные удаляются навсегда, без возможности восстановить.`)) return;
    const list = [...(data?.serviceSearch || [])];
    list[idx] = { ...c, status: 'Удаление' };
    const err = await post({ serviceSearch: list });
    if (err) { setNotice(err); return; }
    setData(d => d ? { ...d, serviceSearch: list } : d);
  }

  const fld = 'w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-400';

  // ТЗ v1.23.0: экран ввода PIN — по центру, как страница входа в приложение
  const pinScreen = !loading && !fatal && data && !pinPassed;

  return (
    <div className={`min-h-screen bg-[#f5f5f5] flex ${pinScreen ? 'items-center' : 'items-start'} justify-center p-3 sm:p-6 md:p-10`}>
      <div ref={wrapperRef} className={`w-full ${pinPassed ? 'max-w-[1160px]' : 'max-w-xl'} py-2`}>
        {loading && (
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div className="w-11 h-11 rounded-full border-4 border-red-100 border-t-red-600 animate-spin" aria-hidden="true" />
            <p className="text-sm text-gray-500 text-center">Сервис проценки (DBS) загружается, пожалуйста подождите.</p>
          </div>
        )}

        {!loading && fatal && (
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center text-center py-12 gap-3">
            <AlertCircle className="text-gray-300" size={34} />
            <p className="text-sm text-gray-400">{fatal}</p>
          </div>
        )}

        {pinScreen && (
          <div className="flex flex-col items-center" style={{ marginBottom: '4.5rem' }}>
            <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[333px] h-auto mb-3" />
            <p className="text-sm font-normal text-gray-900 tracking-wide text-center">НАСТРОЙКА СЕРВИСА ПРОЦЕНКИ (DBS)</p>
            <p className="text-[10px] text-gray-300 text-center mt-1">v{APP_VERSION}</p>
          </div>
        )}

        {!loading && !fatal && data && !pinPassed && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
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
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 sm:px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[130px] sm:w-[180px] h-auto" />
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
                  {LK_MENU.map(m => (
                    <button key={m.key} type="button" onClick={() => setLkTab(m.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${lkTab === m.key ? 'bg-red-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'}`}>
                      <m.icon size={15} /> {m.label}
                    </button>
                  ))}
                </nav>
                <button onClick={() => { sessionStorage.removeItem('dbs_pin_ok'); sessionStorage.removeItem('dbs_pin'); setPinPassed(false); setPin(''); }} title="Выход"
                  className="w-9 h-9 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300 shadow-sm flex items-center justify-center transition-colors shrink-0">
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            {/* МЕНЮ КАБИНЕТА */}
            {lkTab === 'dashboard' && (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-gray-700">Дашборд</p>
                <p className="text-xs text-gray-400">Главная страница кабинета появится в следующих обновлениях.</p>
              </div>
            )}

            {lkTab === 'crossdock' && (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-gray-700">Кроссдок</p>
                <p className="text-xs text-gray-400">Раздел появится в следующих обновлениях.</p>
              </div>
            )}

            {lkTab === 'delivery' && (
              <>
                {/* ПОДМЕНЮ ДОСТАВКИ (второй уровень) */}
                <div className="flex flex-col gap-2">
                  {DL_MENU.map(m => (
                    <button key={m.key} type="button" onClick={() => setDlTab(m.key)}
                      className={`w-full flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all bg-white border ${dlTab === m.key ? 'border-red-600 text-red-600 shadow-md' : 'border-gray-200 text-gray-700 hover:shadow-md'}`}>
                      <m.icon size={15} /> {m.label}
                    </button>
                  ))}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[11px] text-gray-400">Маршрут</p>
                    <h2 className="text-sm font-semibold text-gray-900">{String(deliveryInfo?.route || '') || '—'}</h2>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">График и время</p>
                    <h2 className="text-sm font-semibold text-gray-900">{String(deliveryInfo?.schedule || '') || '—'}</h2>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">Склад</p>
                    {deliveryInfo?.warehouse ? (
                      <span title={String(deliveryInfo.warehouse)} className="inline-flex text-gray-700 mt-0.5"><Warehouse size={17} /></span>
                    ) : <h2 className="text-sm font-semibold text-gray-400">—</h2>}
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">Активных городов</p>
                    <h2 className="text-sm font-semibold text-gray-900">{deliveryInfo ? Number(deliveryInfo.citiesCount || 0) : '—'}</h2>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 ml-auto text-xs flex-wrap">
                    <span className="flex items-center gap-2"><span className="text-gray-500">Договор:</span> <b className="text-gray-900">{String(deliveryInfo?.status || '') || '—'}</b></span>
                    <button type="button" title="Активировать доставку"
                      className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-semibold transition-colors shadow-md">
                      Активировать
                    </button>
                  </div>
                </div>

                {dlTab === 'mycities' && (
                  <>
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                      <div>
                        <h3 className="section-title">Мои города доставки</h3>
                        <p className="text-xs text-gray-400 mt-1">Города, в которых вы доставляете заказы.</p>
                      </div>
                      <p className="text-xs text-gray-400">Города не добавлены.</p>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className="section-title">Доступные города доставки</h3>
                          <p className="text-xs text-gray-400 mt-1">Города, в которых доступна доставка.</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs pt-1">
                          <span className="flex items-center gap-2"><span className="text-gray-500">Всего городов:</span> <b className="text-gray-900">{dlCities.length}</b></span>
                          <span className="flex items-center gap-2"><span className="text-gray-500">В доставке:</span> <b className="text-gray-900">{deliveryInfo ? Number(deliveryInfo.citiesCount || 0) : 0}</b></span>
                        </div>
                      </div>
                      {dlCities.length ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {dlCities.map(c => (
                            <div key={c} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                              <MapPin size={14} className="text-red-500 shrink-0" />
                              <span className="text-sm text-gray-800 truncate">{c}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Список городов появится после настройки (Настройки → Доставка → Города).</p>
                      )}
                    </div>
                  </>
                )}

                {dlTab !== 'mycities' && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-3">
                    <p className="text-sm font-semibold text-gray-700">{DL_MENU.find(x => x.key === dlTab)?.label}</p>
                    <p className="text-xs text-gray-400">Раздел появится в следующих обновлениях.</p>
                  </div>
                )}
              </>
            )}

            {lkTab === 'pricing' && (<>
            {/* ШАГ 1: СОЗДАТЬ СКЛАД + КАРТОЧКА КОМПАНИИ */}
            <div className="flex flex-col gap-4">
              <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 order-2">
                <div className="grid grid-cols-1 sm:grid-cols-[230px_minmax(280px,1fr)_150px_44px] gap-2">
                  <input className={fld} placeholder="Город или название склада *"
                    value={whCity} onChange={e => setWhCity(e.target.value)} />
                  <input className={fld} placeholder="Адрес склада, начиная с города *"
                    value={whAddress} onChange={e => setWhAddress(e.target.value)} />
                  <input className={fld} placeholder="Примерно SKU *" inputMode="numeric" maxLength={6}
                    value={whSku} onChange={e => setWhSku(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                  <button onClick={addWarehouse} disabled={saving} title="Добавить склад"
                    className="bg-green-600 hover:bg-green-700 text-white rounded-xl w-11 h-11 flex items-center justify-center disabled:opacity-60">
                    <Plus size={17} />
                  </button>
                </div>
              </div>

              <div className="relative bg-white border border-gray-200 rounded-2xl px-5 sm:px-6 py-2 sm:py-3 order-1">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-base font-semibold text-gray-900">{data.companyName}{data.inn ? ` (ИНН ${data.inn})` : ''}</h2>
                <div className="flex items-center gap-5 flex-wrap text-sm">
                  {(() => {
                    const loaded = (data.serviceSearch || []).filter(c => (c.status || 'Новое') === 'Загружено').length;
                    const chip = (v: number, cls: string) => <span className={`min-w-[28px] text-center text-xs font-bold rounded-md px-2 py-0.5 ${cls}`}>{v}</span>;
                    return (
                      <>
                        <span className="flex items-center gap-2"><span className="text-gray-500">Всего городов:</span>{chip((data.availableCities || []).length, 'bg-blue-50 text-blue-700')}</span>
                        <span className="flex items-center gap-2" title="Условия сервиса проценки со статусом «Загружено»"><span className="text-gray-500">Охвачено:</span>{chip(loaded, 'bg-green-50 text-green-700')}</span>
                        <span className="flex items-center gap-2"><span className="text-gray-500">Мультисклад:</span>
                          {data.multiWarehouse
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-green-50 text-green-700">доступен</span>
                            : <button type="button" onClick={() => setNotice('Для включения функции мультисклад обратитесь в поддержку.')}
                                className="text-xs font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                title="Нажмите для подсказки">выкл ⓘ</button>}
                        </span>
                        <div className="flex items-center gap-[0.6rem]">
                        <div className="relative">
                          <button type="button" onClick={() => setPriceHint(v => !v)} title="Помощь"
                            className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center transition-colors text-sm font-bold">?</button>
                          {priceHint && (
                            <div className="absolute right-0 top-full mt-2 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2" onClick={e => e.stopPropagation()}>
                              <p><b className="text-red-700">Шаг 1.</b> Сначала добавьте склад - это необходимо для создания условий в поиске и укажите примерно сколько на данном складе SKU.</p>
                              <p><b className="text-red-700">Шаг 2.</b> Выберите Ваш склад в разделе «Мои склады».</p>
                              <p><b className="text-red-700">Шаг 3.</b> Нажмите на интересующий Вас город и добавьте новое условие в проценку (DBS).</p>
                              <p>Настройте ежедневную рассылку Вашего прайс-листа на почтовый адрес: <span className="font-semibold text-gray-800">price@vsemzapchasti.ru</span>.</p>
                              <p>Включайте свой склад во всех доступных городах, даже если у вас туда нет доставки, это даст прирост узнаваемости и охват Вашей компании.</p>
                            </div>
                          )}
                        </div>
                        <a href="https://vsemzapchasti.ru/support" target="_blank" rel="noreferrer" title="Поддержка"
                          className="w-9 h-9 rounded-full bg-white border border-gray-300 hover:border-red-600 hover:text-red-600 text-gray-700 shadow-md flex items-center justify-center transition-colors">
                          <Headset size={17} />
                        </a>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              </div>
            </div>

            {/* МОИ СКЛАДЫ */}
            <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Мои склады ({(data.warehouses || []).length})</h2>
                <button type="button" onClick={() => setWhHint(v => !v)} title="О складах"
                  className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${whHint ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                  <Warehouse size={16} />
                </button>
              </div>
              {whHint && (
                <div className="absolute right-8 top-16 z-30 w-96 max-w-[calc(100%-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2" onClick={e => e.stopPropagation()}>
                  <p>Указывайте количество SKU на складе, близкое к реальному. Если данные в вашем складе сильно расходятся с загружаемым прайсом, система заблокирует этот склад.</p>
                  <p>Вы можете заморозить склад во всех городах — тогда Личный кабинет будет аннулирован, а проценка перестанет показывать прайсы. Для этого обратитесь в поддержку.</p>
                
                </div>
              )}
              {(data.warehouses || []).length === 0 && (
                <p className="text-sm text-gray-400">Шаг 1. Сначала добавьте склад – это необходимо для создания условий в поиске.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {(data.warehouses || []).map(w => {
                    const st = w.status || (w.verified ? 'Проверен' : 'Новый');
                    const borderCls = editingWhId === w.id ? 'border-red-400 ring-2 ring-red-200'
                      : st === 'Заморожен' ? 'border-gray-300 bg-gray-100 opacity-60'
                      : st === 'Проверен' ? (selectedWh === w.city ? 'border-green-500 bg-green-50 ring-2 ring-green-300' : 'border-green-400 bg-green-50 hover:border-green-600')
                      : (selectedWh === w.city ? 'border-blue-300 bg-blue-50' : 'border-blue-200 bg-white hover:border-blue-400');
                    return (
                  <button key={w.id} type="button" onClick={() => setSelectedWh(prev => prev === w.city ? '' : w.city)}
                    className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors ${borderCls}`}>
                    <span className="font-semibold text-gray-900">{w.city}</span>
                    <span className="text-gray-400 text-xs">{Number(w.skuCount).toLocaleString('ru-RU')} SKU</span>
                    <span className={`text-xs ${st === 'Проверен' ? 'text-green-600 font-medium' : st === 'Заморожен' ? 'text-gray-400' : 'text-gray-400'}`}>{st}</span>
                    <span onClick={e => e.stopPropagation()} title={w.address ? `Адрес: ${w.address}` : 'Адрес не указан'} className="text-gray-300 hover:text-gray-500 cursor-help inline-flex"><Warehouse size={12} /></span>
                    <span onClick={e => { e.stopPropagation(); setEditingWhId(w.id); setWhCity(w.city); setWhSku(String(w.skuCount || '')); setWhAddress(w.address || ''); }} className="text-gray-300 hover:text-red-600 cursor-pointer" title="Редактировать склад"><Pencil size={14} /></span>
                  </button>
                );
                })}
              </div>
            </div>

            {/* ДОСТУПНЫЕ ГОРОДА — список показываем всегда; условия требуют склад */}
            <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h2 className="text-base font-semibold text-gray-900">Доступные города</h2>
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
                <div className="absolute right-8 top-16 z-30 w-96 max-w-[calc(100%-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2" onClick={e => e.stopPropagation()}>
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
                      // ТЗ v1.25.7: уникальность ПАРОЙ склад+город — один склад покрывает все города
                      const idx = list.findIndex(x => (x.city || '').toLowerCase() === c.toLowerCase() && (x.warehouseName || '') === selectedWh);
                      const active = idx >= 0;
                      return (
                        <button key={c} type="button"
                          onClick={() => {
                            if ((data.warehouses || []).length === 0 || !selectedWh) {
                              setNotice('Выберите или создайте новый склад в разделе «Мои склады» для добавления условий в сервис проценки.');
                              return;
                            }
                            setNotice('');
                            if (active && idx >= 0) {
                              // ТЗ v1.25.7: покрытый город открывает СВОЁ условие (пара склад+город) на редактирование
                              const cid = (list[idx].c as { id?: string }).id;
                              const real = (data?.serviceSearch || []).findIndex(x => (x as { id?: string }).id === cid);
                              if (real >= 0) {
                                setEditingIdx(real);
                                setCondForm({ ...(data!.serviceSearch![real] as object) } as Cond);
                                setTkOn(String((data!.serviceSearch![real] as { orderUnloadSchedule?: string }).orderUnloadSchedule || '').includes('Условия доставки по согласованию!'));
                                setEditorOpen(true);
                              }
                              setPendingCity(null);
                              return;
                            }
                            setPendingCity(prev => prev === c ? null : c);
                          }}
                          className={`text-sm px-4 py-2 rounded-xl border transition-colors ${active ? 'bg-green-50 border-green-300 text-green-700 font-medium' : 'bg-blue-50/60 border-blue-200 text-gray-700 hover:border-red-300'} ${pendingCity === c ? 'ring-2 ring-red-300' : ''}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              {pendingCity && !!selectedWh && !(data.serviceSearch || []).some(x => (x.city || '').toLowerCase() === pendingCity.toLowerCase() && (x.warehouseName || '') === selectedWh) && ( // ТЗ v1.25.7: пара склад+город
                <button type="button"
                  onClick={() => {
                    setCondForm({ ...EMPTY_COND, city: pendingCity, warehouseName: selectedWh });
                    setEditingIdx(null); setTkOn(false); setEditorOpen(true); setPendingCity(null);
                  }}
                  className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl px-4 py-3 flex items-center justify-center gap-1.5 transition-colors">
                  <Plus size={15} /> Создать условия для выбранного склада и города
                </button>
              )}
            </div>

            {/* ТЗ v1.23.12: уведомления — всегда под блоком «Доступные города» */}
            {/* ТЗ v1.23.55: всплывающий тост справа сверху вместо полоски в потоке */}
            {/* ТЗ v1.25.19: центровка через flex — анимация больше не «отбирает» transform и тост не прыгает */}
            {notice && (
              <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
                <div className={`w-full max-w-[420px] text-sm font-medium px-4 py-3 rounded-xl shadow-lg border text-center ${notice.startsWith('✓')
                  ? 'bg-green-600 text-white border-green-600 shadow-green-200'
                  : 'bg-red-600 text-white border-red-600 shadow-red-200'}`}>
                  {notice}
                </div>
              </div>
            )}

            {/* ШАГ 3: ОКНО «УСЛОВИЯ СЕРВИСА ПОИСКА» — открывается после выбора города */}
            {editorOpen && (data.warehouses || []).length > 0 && (
              /* ТЗ v1.25.5: редактор — модальное окно: видно целиком, доскролл не нужен */
              <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-3 sm:p-6" onClick={() => { setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false); }}>
                <div className="w-full max-w-[1080px] max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl ring-1 ring-white/40 border border-white/30" onClick={e => e.stopPropagation()}>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-gray-900">{editingIdx !== null ? 'Условия сервиса проценки (редактирование)' : 'Условия сервиса проценки'}</h2>
                  <button onClick={() => { setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false); }} className="text-gray-400 hover:text-gray-700" title="Закрыть"><X size={18} /></button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* КОЛОНКА 1: условия сервиса поиска (чипы) */}
                  <div className="flex flex-col gap-2 max-w-[260px]">
                    <div className="text-sm rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800">{condForm.warehouseName || 'Склад не выбран'}</div>
                    <div className="text-sm rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-800">{condForm.city || 'Город не выбран'}</div>
                    {/* ТЗ v1.23.14: подсказка под ячейками склада/города */}
                    <div className="mt-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3.5 text-xs text-gray-600 leading-relaxed">
                      <p className="font-semibold text-gray-800">Нет своей доставки в этот город?</p>
                      <p className="mt-1">Нажмите кнопку «ТК».</p>
                      <p className="mt-2">Не забудьте указать время приёма заказов.</p>
                      <p className="mt-1">Если оставить поле пустым, по умолчанию установится 23:59.</p>
                    </div>
                  </div>

                  {/* КОЛОНКА 2: график/условия доставки, возврат */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600">График доставки <span className="text-red-600">*</span></label>
                      <div className={`flex flex-wrap gap-1.5 mt-2 ${missing.includes('deliverySchedule') ? 'rounded-lg ring-2 ring-red-200 p-1' : ''}`}>
                        {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => {
                          const days = (condForm.deliverySchedule || '').split(',').map(x => x.trim()).filter(Boolean);
                          const on = days.includes(d);
                          return (
                            <button key={d} type="button"
                              onClick={() => setCondForm(f => ({ ...f, deliverySchedule: on ? days.filter(x => x !== d).join(', ') : [...days, d].join(', ') }))}
                              className={`w-9 h-9 text-xs rounded-lg border transition-colors ${on ? 'bg-green-600 border-green-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:border-green-500'}`}>
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Срок поставки и условия доставки <span className="text-red-600">*</span></label>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <button type="button" onClick={() => {
                          const TK_TEXT = 'Условия доставки по согласованию!';
                          const cur = condForm.orderUnloadSchedule || '';
                          const has = cur.includes(TK_TEXT);
                          const next = has ? cur.replace(TK_TEXT, '').replace(/\s{2,}/g, ' ').trim() : (cur ? `${cur.trim()} ${TK_TEXT}` : TK_TEXT);
                          setCondForm(f => ({ ...f, orderUnloadSchedule: next }));
                          setTkOn(!has);
                        }}
                          className={`w-9 h-9 text-xs font-bold rounded-lg border transition-colors ${tkOn || String(condForm.orderUnloadSchedule || '').includes('Условия доставки по согласованию!') ? 'bg-yellow-300 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:border-yellow-400'}`}>
                          ТК
                        </button>
                        {['Сегодня', 'Завтра'].map(v => (
                          <button key={v} type="button" onClick={() => { setCondForm(f => ({ ...f, deliveryTime: v })); setMissing(m => m.filter(k => k !== 'deliveryTime')); }} // ТЗ v1.23.33: канонический вид «Сегодня»/«Завтра» — как в CRM
                            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${(condForm.deliveryTime || '').toLowerCase() === v.toLowerCase() ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:border-red-300'}`}>
                            {v}
                          </button>
                        ))}
                        <input className={fldM('deliveryTime') + ' flex-1 min-w-[140px] !py-2 text-xs'} placeholder="Например: 2-3 дня"
                          value={condForm.deliveryTime} onChange={e => setCondForm(f => ({ ...f, deliveryTime: e.target.value }))} />
                      </div>
                      {/* ТЗ v1.23.27: ячейка 3 строки; «хвостик» шаблонов в правом углу ячейки; при ТК текст — фиксированный хвост */}
                      <div className="relative mt-2">
                        <textarea rows={3} className={fldM('orderUnloadSchedule') + ' resize-none pr-9'} placeholder="Выберите шаблон (стрелка справа) или введите свой вариант"
                          value={tkOn ? String(condForm.orderUnloadSchedule || '').replace('Условия доставки по согласованию!', '').trim() : condForm.orderUnloadSchedule}
                          onChange={e => {
                            const v = e.target.value;
                            setCondForm(f => ({ ...f, orderUnloadSchedule: tkOn ? (v.trim() ? `${v.trim()} Условия доставки по согласованию!` : 'Условия доставки по согласованию!') : v }));
                            setMissing(m => m.filter(k => k !== 'orderUnloadSchedule'));
                          }} />
                        <select className="absolute right-1.5 top-1.5 w-7 h-7 opacity-0 cursor-pointer z-10" title="Шаблоны доставки"
                          value="" onChange={e => { const t = e.target.value; if (t) { setCondForm(f => ({ ...f, orderUnloadSchedule: tkOn ? `${t} Условия доставки по согласованию!` : t })); setMissing(m => m.filter(k => k !== 'orderUnloadSchedule')); } }}>
                          <option value="" disabled hidden>Шаблон</option>
                          <option value="При заказе до (введите время) доставка на следующий день.">При заказе до (введите время) доставка на следующий день.</option>
                          <option value="При заказе до (введите время) доставка день заказа.">При заказе до (введите время) доставка день заказа.</option>
                          <option value="При заказе до (введите время) доставка по сроку поставки.">При заказе до (введите время) доставка по сроку поставки.</option>
                        </select>
                        <ChevronDown size={15} className="absolute right-2.5 top-2.5 text-gray-400 pointer-events-none" />
                      </div>
                      {tkOn && (
                        <p className="mt-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5">
                          + Условия доставки по согласованию!
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Условия возврата товара <span className="text-red-600">*</span></label>
                      <input list="return-presets" className={fldM('returnConditions') + ' mt-2'} placeholder="Выберите из списка или введите свой вариант"
                        value={condForm.returnConditions} onChange={e => { setCondForm(f => ({ ...f, returnConditions: e.target.value })); setMissing(m => m.filter(k => k !== 'returnConditions')); }} />
                      <datalist id="return-presets">
                        <option value="Возврат без комиссии" />
                        <option value="Возврат с комиссией" />
                        <option value="Нет возврата" />
                      </datalist>
                    </div>
                  </div>

                  {/* КОЛОНКА 3: представитель/контакты/email + кнопка */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-600">Представитель <span className="text-red-600">*</span></label>
                        <button type="button" className="text-xs text-red-700 hover:underline"
                          onClick={() => {
                            const d = data as { contactName?: string; contactPhone?: string; contactEmail?: string };
                            if (!d.contactName && !d.contactPhone && !d.contactEmail) {
                              setNotice('В карточке поставщика нет данных представителя — заполните поля вручную.');
                              return;
                            }
                            setNotice('');
                            setCondForm(f => ({
                              ...f,
                              representative: d.contactName || f.representative,
                              contacts: d.contactPhone || f.contacts,
                              email: d.contactEmail || f.email,
                            }));
                          }}>
                          Добавить данные из анкеты
                        </button>
                      </div>
                      <input className={fldM('representative') + ' mt-2'} placeholder="ФИО" value={condForm.representative} onChange={e => { setCondForm(f => ({ ...f, representative: e.target.value })); setMissing(m => m.filter(k => k !== 'representative')); }} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Контакты <span className="text-red-600">*</span></label>
                      <input className={fldM('contacts') + ' mt-2'} placeholder="Телефон" value={condForm.contacts} onChange={e => { setCondForm(f => ({ ...f, contacts: e.target.value })); setMissing(m => m.filter(k => k !== 'contacts')); }} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Email <span className="text-red-600">*</span></label>
                      <input className={fldM('email') + ' mt-2'} value={condForm.email} onChange={e => { setCondForm(f => ({ ...f, email: e.target.value })); setMissing(m => m.filter(k => k !== 'email')); }} />
                    </div>
                    <button type="button"
                      onClick={async () => {
                        // ТЗ v1.23.24: пустые обязательные поля — подсветка и стоп, форма остаётся открытой
                        const NAMES: Record<string, string> = { deliverySchedule: 'График доставки', orderUnloadSchedule: 'Условия доставки', returnConditions: 'Условия возврата товара', representative: 'Представитель', contacts: 'Контакты', email: 'Email' };
                        const missingKeys = (Object.keys(NAMES) as string[]).filter(k => !(condForm as Record<string, unknown>)[k]);
                        if (missingKeys.length) { setNotice('Заполните обязательные поля: ' + missingKeys.map(k => NAMES[k]).join(', ')); setMissing(missingKeys); return; }
                        if (!window.confirm('Вы точно согласны добавить данное условие для всех доступных городов?')) return;
                        if (!window.confirm('Далее Вы сможете редактировать каждое условие отдельно. Вы даете согласие?')) return;
                        await applyToAllCities();
                        setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false);
                      }}
                      className="w-full text-xs text-red-700 hover:underline mt-6">
                      Добавить условие для всех доступных городов
                    </button>
                    <button onClick={async () => { if (!condForm.city || !condForm.warehouseName) { setNotice('Заполните Город показов и Склад'); return; } setNotice(''); const ok = await saveCondition(); if (!ok) return; setEditorOpen(false); setEditingIdx(null); setCondForm(EMPTY_COND); setTkOn(false); }} disabled={saving}
                      className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl px-6 py-3 flex items-center justify-center gap-1 disabled:opacity-60">
                      <Plus size={15} /> {editingIdx !== null ? 'Сохранить условие' : 'Добавить условие'}
                    </button>
                  </div>
                </div>
              </div>
                </div>
              </div>
            )}

            {/* УСЛОВИЯ СЕРВИСА ПОИСКА (DBS) — таблица условий */}
            {(data.serviceSearch || []).length > 0 && (
              <div className="relative bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <h2 className="text-base font-semibold text-gray-900">Условия сервиса проценки (DBS)</h2>
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
                <div className="absolute right-8 top-16 z-30 w-96 max-w-[calc(100%-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2" onClick={e => e.stopPropagation()}>
                    <p><b className="text-red-700">Новое</b> — Условие создано, но ещё не опубликовано на платформе.</p>
                    <p><b className="text-green-700">Загружено</b> — Склад и его условия поставки доступны в проценке на платформе.</p>
                    <p><b className="text-amber-700">Есть изменения</b> — Вы редактировали одно из условий, оно ждёт очереди на загрузку в платформу.</p>
                    <p><b className="text-gray-600">Удаление</b> — Вы отправили запрос на удаление Вашего склада из проценки выбранного города, в течение 48 часов проценка будет удалена навсегда.</p>
                  
                </div>
              )}
                <div className="hidden lg:grid grid-cols-[180px_210px_minmax(220px,1fr)_170px_110px_44px] gap-x-4 px-4 pb-1 text-[10px] uppercase tracking-wide text-gray-400 whitespace-nowrap">
                  <span>Склад / Город</span>
                  <span>График доставки</span>
                  <span>Условия доставки</span>
                  <span>Представитель</span>
                  <span className="text-center">Статус</span>
                  <span />
                </div>
                {(() => {
                  const list = data.serviceSearch || [];
                  const filtered = list.filter(c => (statusFilter === 'all' || (c.status || 'Новое') === statusFilter) && (!selectedWh || c.warehouseName === selectedWh) && (!pendingCity || c.city === pendingCity)); // ТЗ v1.23.23: фильтр склад+город
                  if (!filtered.length) return <p className="text-sm font-semibold text-gray-600 text-center py-8 mt-4">Выберите склад и создайте условия для проценки в данном городе.</p>;
                  const cell = (label: string, value: React.ReactNode) => (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 lg:hidden">{label}</p>
                      <div className="text-sm font-medium text-gray-800">{value || '—'}</div>
                    </div>
                  );
                  const TK = 'Условия доставки по согласованию!';
                  return filtered.map(c => {
                    const realIdx = list.indexOf(c);
                    const tkOn = String(c.orderUnloadSchedule || '').includes(TK);
                    const delivText = [c.deliveryTime, String(c.orderUnloadSchedule || '').replace(TK, '').trim()].filter(Boolean).join(' · ');
                    const days = (c.deliverySchedule || '').split(',').map(x => x.trim()).filter(Boolean);
                    return (
                      <div key={realIdx} className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[180px_210px_minmax(220px,1fr)_170px_110px_44px] items-center gap-x-4 gap-y-2 bg-gray-50 rounded-xl px-4 py-3 text-sm mb-2 transition-colors ${(c.status || 'Новое') === 'Удаление' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}`} onClick={() => { if ((c.status || 'Новое') === 'Удаление') return; setEditingIdx(realIdx); setCondForm(c); setSelectedWh(c.warehouseName || selectedWh); setTkOn(String(c.orderUnloadSchedule || '').includes('Условия доставки по согласованию!')); setEditorOpen(true); }}>
                        {cell('Склад', <div className="flex flex-col"><span>{c.warehouseName}</span><span className="text-[11px] text-gray-400 font-normal">Город: {c.city}</span></div>)}
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 lg:hidden">График доставки</p>
                          <div className="flex gap-1">
                            {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => (
                              <span key={d} className={`w-6 h-6 text-[10px] flex items-center justify-center rounded-md border ${days.includes(d) ? 'bg-green-600 border-green-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-400'}`}>{d}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 lg:hidden">Условия доставки</p>
                          <div className="flex items-center gap-1.5 max-w-[300px]">
                            {tkOn && <span className="w-7 h-7 text-[10px] font-bold flex items-center justify-center rounded-lg bg-yellow-300 border border-yellow-400 text-gray-900">ТК</span>}
                            <span className="text-xs text-gray-600 truncate" title={delivText}>{delivText || '—'}</span>
                          </div>
                        </div>
                        {cell('Представитель', c.representative)}
                        <span className={`self-center justify-self-center text-[11px] font-medium px-2 py-0.5 rounded-full ${(c.status || 'Новое') === 'Загружено' ? 'bg-green-50 text-green-700 border border-green-200' : (c.status || 'Новое') === 'Есть изменения' ? 'bg-amber-50 text-amber-700 border border-amber-200' : (c.status || 'Новое') === 'Удаление' ? 'bg-gray-200 text-gray-600 border border-gray-300' : 'bg-red-50 text-red-700 border border-red-200'}`}>{c.status || 'Новое'}</span>
                        <button
                          onClick={e => { e.stopPropagation(); markDeleted(realIdx); }}
                          disabled={(c.status || 'Новое') === 'Удаление'}
                          className={`ml-auto w-8 h-8 rounded-full flex items-center justify-center transition-colors ${(c.status || 'Новое') === 'Удаление' ? 'bg-gray-100 text-gray-200 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-red-600 hover:text-white'}`}
                          title={(c.status || 'Новое') === 'Удаление' ? 'Удаление уже запрошено' : 'Удалить проценку'}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            </>)}
          </div>
        )}
      </div>
    </div>
  );
}
