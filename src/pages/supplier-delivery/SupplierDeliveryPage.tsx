import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getFunctionsUrl, getAnonKeyHeaders } from '@/lib/functions-api';

/** v1.29.0: ЧИСТЫЙ ЛК сервиса доставки (DBO). Вход по ссылке /d/<token> + PIN. Функционал появится позже. */

type Meta = { companyName: string; hasPin: boolean };

export default function SupplierDeliveryPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatal, setFatal] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinPassed, setPinPassed] = useState(sessionStorage.getItem('dbo_pin_ok') === '1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${getFunctionsUrl('supplier-delivery')}?token=${encodeURIComponent(token)}`, { headers: getAnonKeyHeaders() })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) setFatal(d?.error || 'Ссылка недействительна'); else setMeta(d); })
      .catch(() => setFatal('Не удалось загрузить данные'));
  }, [token]);

  async function submitPin() {
    setBusy(true);
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
    } finally { setBusy(false); }
  }

  const centered = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 w-full max-w-md text-center space-y-4">
        <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[150px] h-auto mx-auto" />
        {children}
      </div>
    </div>
  );

  if (fatal) return centered(<p className="text-sm text-red-600">{fatal}</p>);
  if (!meta) return centered(<><Loader2 className="animate-spin mx-auto text-gray-400" size={28} /><p className="text-sm text-gray-500">Сервис доставки (DBO) загружается, пожалуйста подождите.</p></>);

  if (meta.hasPin && !pinPassed) {
    return centered(
      <>
        <p className="text-sm font-normal text-gray-900 tracking-wide">СЕРВИС ДОСТАВКИ (DBO)</p>
        <p className="text-xs text-gray-500">Введите PIN-код для входа в личный кабинет{meta.companyName ? ` «${meta.companyName}»` : ''}.</p>
        <input
          className="form-input text-center text-lg tracking-[0.5em] w-40 mx-auto"
          placeholder="PIN"
          value={pin}
          maxLength={6}
          inputMode="numeric"
          autoFocus
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter' && pin.length >= 4 && !busy) submitPin(); }}
        />
        {pinError && <p className="text-xs text-red-600">{pinError}</p>}
        <button type="button" disabled={pin.length < 4 || busy} onClick={submitPin}
          className="btn-primary w-full disabled:opacity-50">
          {busy ? 'Проверка…' : 'Войти'}
        </button>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3">
          <img src="/logo.png" alt="ВСЕМЗАПЧАСТИ" className="w-[130px] sm:w-[180px] h-auto" />
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-gray-900 tracking-wide">СЕРВИС ДОСТАВКИ (DBO)</p>
          {meta.companyName && <p className="text-xs text-gray-500">{meta.companyName}</p>}
          <p className="text-xs text-gray-400">Функционал личного кабинета появится в следующих обновлениях.</p>
        </div>
      </div>
    </div>
  );
}
