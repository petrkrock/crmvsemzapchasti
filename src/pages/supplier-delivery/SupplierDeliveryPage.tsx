import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, FileText, LogOut, Truck, Undo2, Wallet } from 'lucide-react';
import { getFunctionsUrl, getAnonKeyHeaders } from '@/lib/functions-api';
import { APP_VERSION } from '@/constants';

/** v1.29.0: ЛК сервиса доставки (DBO). Шапка с меню справа, блоки контента во всю ширину. */

type Meta = { companyName: string; hasPin: boolean };
type MenuKey = 'deliveries' | 'returns' | 'documents' | 'finance';

const MENU: { key: MenuKey; label: string; icon: typeof Truck }[] = [
  { key: 'deliveries', label: 'Доставки', icon: Truck },
  { key: 'returns', label: 'Возвраты', icon: Undo2 },
  { key: 'documents', label: 'Документы', icon: FileText },
  { key: 'finance', label: 'Финансы', icon: Wallet },
];

export default function SupplierDeliveryPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinPassed, setPinPassed] = useState(sessionStorage.getItem('dbo_pin_ok') === '1');
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<MenuKey>('deliveries');

  useEffect(() => {
    fetch(`${getFunctionsUrl('supplier-delivery')}?token=${encodeURIComponent(token)}`, { headers: getAnonKeyHeaders() })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) setFatal(d?.error || 'Ссылка недействительна'); else setMeta(d); })
      .catch(() => setFatal('Не удалось загрузить данные'))
      .finally(() => setLoading(false));
  }, [token]);

  async function submitPin() {
    setSaving(true);
    setPinError('');
    try {
      const r = await fetch(getFunctionsUrl('supplier-delivery'), {
        method: 'POST',
        headers: { ...getAnonKeyHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setPinError(d?.error || 'Неверный PIN-код'); setPin(''); }
      else {
        sessionStorage.setItem('dbo_pin_ok', '1');
        sessionStorage.setItem('dbo_pin', pin);
        setPinPassed(true);
      }
    } finally { setSaving(false); }
  }

  function logout() {
    sessionStorage.removeItem('dbo_pin_ok');
    sessionStorage.removeItem('dbo_pin');
    setPinPassed(false);
    setPin('');
    setMenu('deliveries');
  }

  const activeItem = MENU.find(m => m.key === menu)!;

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center p-3 sm:p-6 md:p-10">
      <div className={`w-full ${pinPassed ? 'max-w-[1160px]' : 'max-w-xl'} py-2`}>

        {loading && (
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div className="w-11 h-11 rounded-full border-4 border-red-100 border-t-red-600 animate-spin" aria-hidden="true" />
            <p className="text-sm text-gray-500 text-center">Сервис доставки (DBO) загружается, пожалуйста подождите.</p>
          </div>
        )}

        {!loading && fatal && (
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col items-center text-center py-12 gap-3">
            <AlertCircle className="text-gray-300" size={34} />
            <p className="text-sm text-gray-400">{fatal}</p>
          </div>
        )}

        {!loading && !fatal && !pinPassed && (
          <>
            <div className="flex flex-col items-center" style={{ marginBottom: '4.5rem' }}>
              <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[333px] h-auto mb-3" />
              <p className="text-sm font-normal text-gray-900 tracking-wide text-center">СЕРВИС ДОСТАВКИ (DBO)</p>
              <p className="text-[10px] text-gray-300 text-center mt-1">v{APP_VERSION}</p>
            </div>
            {meta && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
                <p className="text-sm text-gray-500 mt-1.5">{meta.companyName}</p>
                <hr className="border-gray-100 my-5" />
                <div className="text-center">
                  <p className="text-sm text-gray-700 mb-4">Введите PIN-код из сообщения от менеджера</p>
                  <input inputMode="numeric" maxLength={6} value={pin} autoFocus
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && submitPin()}
                    className="w-40 text-center text-xl tracking-[0.4em] border border-gray-200 rounded-xl py-2.5 outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-400" />
                  {pinError && <p className="text-xs text-red-600 mt-3">{pinError}</p>}
                  <button onClick={submitPin} disabled={saving || pin.length < 4}
                    className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl py-3 transition-colors disabled:opacity-60">
                    Продолжить
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !fatal && pinPassed && (
          <div className="space-y-4">
            {/* ШАПКА: логотип слева, меню справа */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 sm:px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[130px] sm:w-[180px] h-auto" />
              <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
                {MENU.map(m => (
                  <button key={m.key} type="button" onClick={() => setMenu(m.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${menu === m.key ? 'bg-red-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'}`}>
                    <m.icon size={15} /> {m.label}
                  </button>
                ))}
                <button type="button" onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap">
                  <LogOut size={15} /> Выход
                </button>
              </nav>
            </div>

            {/* КОНТЕНТ — во всю ширину */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3">
              <p className="text-xs text-gray-400">СЕРВИС ДОСТАВКИ (DBO) · {meta?.companyName}</p>
              <h2 className="text-sm font-semibold text-gray-900 mt-1">{activeItem.label}</h2>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-3">
              <activeItem.icon size={28} className="mx-auto text-gray-300" />
              <p className="text-sm font-semibold text-gray-700">{activeItem.label}</p>
              <p className="text-xs text-gray-400">Раздел появится в следующих обновлениях.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
