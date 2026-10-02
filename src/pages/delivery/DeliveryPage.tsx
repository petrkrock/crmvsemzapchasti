import { useStoreVersion } from '@/lib/store';

/** v1.29.0: раздел «Доставка» (DBO). Шаг 1 — каркас раздела; функционал появится в следующих шагах. */
export default function DeliveryPage() {
  useStoreVersion();
  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="page-title">Доставка</h1>
      <div className="card-base p-8 text-center">
        <p className="text-sm font-semibold text-gray-700">Сервис доставки (DBO)</p>
        <p className="text-xs text-gray-400 mt-2">Функционал раздела появится в следующих обновлениях.</p>
      </div>
    </div>
  );
}
