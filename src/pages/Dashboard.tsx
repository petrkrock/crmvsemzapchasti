import { Link, useNavigate } from 'react-router-dom';
import { getStore, useStoreVersion } from '@/lib/store';
import { formatDateTime, formatDate, isToday, isOverdue } from '@/lib/utils';
import { canAccess, canSeeSupplier, canSeeBuyer, canSeeTicket } from '@/lib/auth';
import StatusBadge from '@/components/features/StatusBadge';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Globe, Truck, ShoppingCart, CheckSquare, HeadphonesIcon, TrendingUp, Plus, AlertCircle, Clock, Video, AlertTriangle, FileEdit } from 'lucide-react';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#6B7280', '#14B8A6'];

function isEndingSoon(endDate: string): boolean {
  const diff = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 14;
}
function isUpcomingStart(startDate: string, status: string): boolean {
  const diff = (new Date(startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7 && status.toLowerCase().includes('ожидает');
}
function daysLeft(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const navigate = useNavigate();
  const store = getStore();
  // Дашборд менеджера показывает только разрешённые ему данные (ТЗ)
  const okSup = canAccess('suppliers');
  const okBuy = canAccess('buyers');
  const okTasks = canAccess('tasks');
  const okSupport = canAccess('support');
  const okMedia = canAccess('media');
  // Сервис поиска: условия, ожидающие обработки менеджером (всё, что не «Загружено»)
  const ssItems = (okSup ? store.suppliers.filter(s => !s.deletedAt && canSeeSupplier(s)) : []).flatMap(sup =>
    (sup.serviceSearch || [])
      .filter(c => (c.status || 'Новое') !== 'Загружено')
      .map(c => ({ supplierId: sup.id, supplierName: sup.tradeName, city: c.city, status: c.status || 'Новое' }))
  );
  const ssNew = ssItems.filter(i => i.status === 'Новое').length;
  const ssChanged = ssItems.length - ssNew;

  const activeSuppliers = okSup ? store.suppliers.filter(s => !s.deletedAt && canSeeSupplier(s)) : [];
  const activeBuyers = okBuy ? store.buyers.filter(b => !b.deletedAt && canSeeBuyer(b)) : [];
  const mediaRecords = okMedia ? (store.mediaRecords || []).filter(r => !r.deletedAt) : [];

  const endingSoonRecords = mediaRecords.filter(r => r.status !== 'Анулирован' && isEndingSoon(r.endDate));
  const upcomingStartRecords = mediaRecords.filter(r => isUpcomingStart(r.startDate, r.status));

  const supplierStatuses = activeSuppliers.reduce<Record<string, number>>((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {});
  const buyerStatuses = activeBuyers.reduce<Record<string, number>>((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});

  const supplierPieData = Object.entries(supplierStatuses).map(([name, value]) => ({ name, value }));
  const buyerPieData = Object.entries(buyerStatuses).map(([name, value]) => ({ name, value }));

  const supplierSources = activeSuppliers.reduce<Record<string, number>>((acc, s) => { if (s.source) acc[s.source] = (acc[s.source] || 0) + 1; return acc; }, {});
  const buyerSources = activeBuyers.reduce<Record<string, number>>((acc, b) => { if (b.source) acc[b.source] = (acc[b.source] || 0) + 1; return acc; }, {});

  const todayTasks = (okTasks ? store.tasks : []).filter(t => !t.completed && (isToday(t.dueDate) || isOverdue(t.dueDate)));
  // v_1.9: заявки Маркетинг-кит из форм сайта (статусы «Запрос МК» / «Отправлен МК»)
  const mkRequests = store.mediaRecords.filter(r => r.status === 'Запрос МК' || r.status === 'Отправлен МК');
  const newTickets = (okSupport ? store.tickets.filter(t => canSeeTicket(t)) : []).filter(t => (t.status === 'Новая' || t.status === 'Новый с сайта') && !t.deletedAt);

  // Формы: заявки, пришедшие с публичных форм (Настройки → Формы) и ещё не
  // обработанные менеджером — статус "Новый с сайта" служит тем же
  // индикатором "требует внимания", что и "Новая" для обращений.
  type FormSubmission = { id: string; kind: 'supplier' | 'buyer' | 'ticket'; title: string; date: string; to: string };
  // v_1.9: заявки с сайта — все формы (Поставщики+Покупатели) в статусе «Лид форма»
  const siteLeadsSup = activeSuppliers.filter(s => s.fromApi && s.status === 'Лид форма');
  const siteLeadsBuy = activeBuyers.filter(b => b.fromApi && b.status === 'Лид форма');
  const siteLeads = [...siteLeadsSup, ...siteLeadsBuy];
  const formSubmissions: FormSubmission[] = [
    ...activeSuppliers.filter(s => s.fromApi && s.status === 'Новый с сайта').map(s => ({ id: s.id, kind: 'supplier' as const, title: s.tradeName, date: s.createdAt, to: `/suppliers/${s.id}` })),
    ...activeBuyers.filter(b => b.fromApi && b.status === 'Новый с сайта').map(b => ({ id: b.id, kind: 'buyer' as const, title: b.tradeName, date: b.createdAt, to: `/buyers/${b.id}` })),
    ...store.tickets.filter(t => t.fromApi && t.status === 'Новый с сайта' && !t.deletedAt).map(t => ({ id: t.id, kind: 'ticket' as const, title: t.subject, date: t.createdAt, to: `/support/${t.id}` })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const FORM_KIND_ICON: Record<FormSubmission['kind'], typeof Truck> = { supplier: Truck, buyer: ShoppingCart, ticket: HeadphonesIcon };
  const FORM_KIND_LABEL: Record<FormSubmission['kind'], string> = { supplier: 'Поставщик', buyer: 'Покупатель', ticket: 'Обращение' };

  const stats = [
    { label: 'Поставщиков', value: activeSuppliers.length, active: activeSuppliers.filter(s => s.status === 'Активный').length, icon: Truck, to: '/suppliers', color: 'bg-blue-50 text-blue-600' },
    { label: 'Покупателей', value: activeBuyers.length, active: activeBuyers.filter(b => b.status === 'Активный').length, icon: ShoppingCart, to: '/buyers', color: 'bg-green-50 text-green-600' },
    { label: 'Заявок с сайта', value: siteLeads.length, icon: Globe, color: 'bg-purple-50 text-purple-600' }, // v_1.9: карточка не кликабельна, ссылки внутри
    { label: 'Задач сегодня', value: todayTasks.length, icon: CheckSquare, to: '/tasks', color: 'bg-yellow-50 text-yellow-600' },
    { label: 'Медиа сервис', value: mkRequests.length, icon: FileEdit, to: '/media', color: 'bg-red-50 text-red-600' }, // v_1.9: Маркетинг-кит (Запрос МК/Отправлен МК)
  ];

  const showMediaAlerts = endingSoonRecords.length > 0 || upcomingStartRecords.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Дашборд</h1>
        <span className="text-xs text-gray-400">Сегодня: {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {(() => {
        function StatCardBody({ stat }: { stat: (typeof stats)[number] }) {
          return (<>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{stat.label}</span>
              <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center`}><stat.icon size={16} /></div>
            </div>
            <p className="text-2xl font-bold text-brand-black">{stat.value}</p>
            {stat.label === 'Заявок с сайта' ? (
              <div className="flex gap-1.5 mt-1.5">
                <Link to="/suppliers?status=Лид форма" onClick={e => e.stopPropagation()}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md transition-opacity hover:opacity-80"
                  style={{ backgroundColor: 'rgb(239, 246, 255)', color: 'rgb(29, 78, 216)' }}>Поставщики: {siteLeadsSup.length}</Link>
                <Link to="/buyers?status=Лид форма" onClick={e => e.stopPropagation()}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-md transition-opacity hover:opacity-80"
                  style={{ backgroundColor: 'rgb(239, 246, 255)', color: 'rgb(29, 78, 216)' }}>Покупатели: {siteLeadsBuy.length}</Link>
              </div>
            ) : null}
            {stat.active !== undefined && (
              <p className="mt-1 rounded-lg px-2 py-1 text-sm font-bold" style={{ backgroundColor: 'rgb(220 252 231 / var(--tw-bg-opacity, 1))', color: 'rgb(21 128 61 / var(--tw-text-opacity, 1))' }}>Активных: {stat.active}</p>
            )}
          
          </>);
        }
        {stats.map(stat => (
          stat.to
            ? <button key={stat.label} onClick={() => navigate(stat.to)} className="stat-card hover:shadow-md transition-shadow text-left">
                <StatCardBody stat={stat} />
              </button>
            : <div key={stat.label} className="stat-card text-left">
                <StatCardBody stat={stat} />
              </div>
        ))}
        })()}
      </div>

      {/* Media alerts */}
      {showMediaAlerts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {endingSoonRecords.length > 0 && (
            <div className="card-base p-4 border-red-200 bg-red-50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" />Заканчивается размещение ({endingSoonRecords.length})</h2>
                <button onClick={() => navigate('/media')} className="text-xs text-red-600 hover:underline">Всё →</button>
              </div>
              <div className="space-y-2">
                {endingSoonRecords.slice(0, 3).map(r => {
                  const dl = daysLeft(r.endDate);
                  return (
                    <div key={r.id} onClick={() => navigate('/media')} className="flex items-center justify-between p-2 bg-white rounded-lg border border-red-100 cursor-pointer hover:bg-red-50 transition-colors">
                      <div><p className="text-xs font-semibold text-brand-black">{r.supplierName}</p><p className="text-xs text-gray-500">{r.adTypeName}</p></div>
                      <div className="text-right">
                        <div className="flex items-center gap-1"><Clock size={10} className="text-red-500" /><span className="text-xs font-bold text-red-600">{dl <= 0 ? 'Истёк!' : `${dl} дн.`}</span></div>
                        <p className="text-xs text-gray-400">{formatDate(r.endDate)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {upcomingStartRecords.length > 0 && (
            <div className="card-base p-4 border-yellow-200 bg-yellow-50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-yellow-700 flex items-center gap-2"><Video size={16} className="text-yellow-500" />Скоро начало (ожидает места) ({upcomingStartRecords.length})</h2>
                <button onClick={() => navigate('/media')} className="text-xs text-yellow-600 hover:underline">Всё →</button>
              </div>
              <div className="space-y-2">
                {upcomingStartRecords.slice(0, 3).map(r => {
                  const dl = daysLeft(r.startDate);
                  return (
                    <div key={r.id} onClick={() => navigate('/media')} className="flex items-center justify-between p-2 bg-white rounded-lg border border-yellow-100 cursor-pointer hover:bg-yellow-50 transition-colors">
                      <div><p className="text-xs font-semibold text-brand-black">{r.supplierName}</p><p className="text-xs text-gray-500">{r.adTypeName}</p></div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-yellow-700">{dl <= 0 ? 'Сегодня!' : `через ${dl} дн.`}</span>
                        <p className="text-xs text-gray-400">{formatDate(r.startDate)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today tasks */}
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title flex items-center gap-2"><CheckSquare size={16} className="text-brand-red" /> Задачи на сегодня</h2>
            <button onClick={() => navigate('/tasks')} className="text-xs text-brand-red hover:underline">Все →</button>
          </div>
          {todayTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Нет задач на сегодня</p>
          ) : (
            <div className="space-y-2">
              {todayTasks.slice(0, 5).map(task => (
                <div key={task.id} onClick={() => navigate('/tasks')} className="p-2 bg-brand-gray rounded-md cursor-pointer hover:bg-brand-gray-mid transition-colors">
                  <p className="text-sm font-medium text-brand-black">{task.title}</p>
                  {task.entityName && <p className="text-xs text-gray-400">{task.entityName}</p>}
                  {isOverdue(task.dueDate) && !isToday(task.dueDate) && (
                    <span className="text-xs text-red-500 flex items-center gap-1 mt-0.5"><AlertCircle size={10} /> Просрочена</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => navigate('/tasks')} className="btn-primary w-full justify-center mt-3 text-xs"><Plus size={14} /> Новая задача</button>
        </div>

        {/* New tickets */}
        <div className="card-base p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title flex items-center gap-2"><HeadphonesIcon size={16} className="text-brand-red" /> Поддержка</h2>
            <button onClick={() => navigate('/support')} className="text-xs text-brand-red hover:underline">Все →</button>
          </div>
          {newTickets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Новых обращений нет</p>
          ) : (
            <div className="space-y-2">
              {newTickets.slice(0, 5).map(t => (
                <div key={t.id} onClick={() => navigate(`/support/${t.id}`)} className="p-2 bg-brand-gray rounded-md cursor-pointer hover:bg-brand-gray-mid transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-brand-black truncate">{t.subject}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-gray-400">{t.type} · {formatDateTime(t.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Формы: заявки с сайта */}
      {formSubmissions.length > 0 && (
        <div className="card-base p-4 border-purple-200 bg-purple-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-purple-700 flex items-center gap-2"><FileEdit size={16} className="text-purple-500" /> Новые заявки с сайта ({formSubmissions.length})</h2>
          </div>
          <div className="space-y-2">
            {formSubmissions.slice(0, 5).map(f => {
              const Icon = FORM_KIND_ICON[f.kind];
              return (
                <div key={f.id} onClick={() => navigate(f.to)} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100 cursor-pointer hover:bg-purple-50 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0"><Icon size={14} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-black truncate">{f.title}</p>
                    <p className="text-xs text-gray-400">{FORM_KIND_LABEL[f.kind]} · {formatDateTime(f.date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

            <div className="card-base p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-brand-black">Сервис поиска: требует внимания</h3>
          <span className="text-xs text-gray-400">Новое: <b className="text-brand-black">{ssNew}</b> · Изменения: <b className="text-brand-black">{ssChanged}</b></span>
        </div>
        {ssItems.length === 0 ? (
          <p className="text-sm text-gray-400">Все условия загружены на платформу</p>
        ) : (
          <div className="space-y-2">
            {ssItems.slice(0, 5).map((item, i) => (
              <button key={i} onClick={() => navigate(`/suppliers/${item.supplierId}`)}
                className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-xl hover:bg-brand-gray transition-colors">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${item.status === 'Новое' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>{item.status}</span>
                <span className="text-sm text-brand-black font-medium truncate">{item.supplierName}</span>
                <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{item.city}</span>
              </button>
            ))}
            {ssItems.length > 6 && <p className="text-xs text-gray-400 text-center">и ещё {ssItems.length - 6}…</p>}
          </div>
        )}
      </div>

{/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-base p-4">
          <h2 className="section-title mb-4">Поставщики по статусам</h2>
          {supplierPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={supplierPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {supplierPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">Нет данных</p>}
        </div>

        <div className="card-base p-4">
          <h2 className="section-title mb-4">Покупатели по статусам</h2>
          {buyerPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={buyerPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {buyerPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">Нет данных</p>}
        </div>

        <div className="card-base p-4">
          <h2 className="section-title mb-4">Источники поставщиков</h2>
          {Object.keys(supplierSources).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(supplierSources).map(([src, cnt], i) => (
                <div key={src} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{src}</span><span className="font-medium">{cnt}</span></div>
                    <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(cnt / activeSuppliers.length) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>}
        </div>

        <div className="card-base p-4">
          <h2 className="section-title mb-4">Источники покупателей</h2>
          {Object.keys(buyerSources).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(buyerSources).map(([src, cnt], i) => (
                <div key={src} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{src}</span><span className="font-medium">{cnt}</span></div>
                    <div className="h-1.5 bg-brand-gray rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(cnt / activeBuyers.length) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">Нет данных</p>}
        </div>
      </div>

      {/* Plan/fact link */}
      <div className="card-base p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><TrendingUp size={18} className="text-brand-red" /><h2 className="section-title">План / Факт</h2></div>
          <button onClick={() => navigate('/planfact')} className="btn-secondary text-xs">Открыть →</button>
        </div>
      </div>
    </div>
  );
}
