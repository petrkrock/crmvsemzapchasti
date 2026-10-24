import { APP_VERSION } from '@/constants';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '@/lib/auth';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { toast.error('Заполните все поля'); return; }
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user) {
        toast.success(`Добро пожаловать, ${user.name}!`);
        navigate('/dashboard');
      } else {
        toast.error('Неверный логин или пароль');
      }
    } catch {
      toast.error('Не удалось войти. Проверьте подключение к серверу');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-gray flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* v1.31.16: новый логотип ERP + новая подпись; подсказки и подписи полей убраны */}
        <div className="text-center mb-8">
          <img src="/logo-erp.png" alt="ВСЕМЗАПЧАСТИ ERP" className="w-[230px] h-auto mx-auto mb-3" />
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Система управления платформой</p>
            <p className="text-[10px] text-gray-300 mt-1">v{APP_VERSION}</p>
        </div>

        <div className="card-base p-8 shadow-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input pl-9"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input pl-9 pr-9"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center text-base py-3"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
