# ВсемЗапчасти CRM

Production CRM для управления поставщиками, покупателями, лидами, задачами, поддержкой, медиа, план/фактом и базой знаний.

## Стек

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Supabase Auth
- Supabase PostgreSQL
- Row Level Security
- Supabase Edge Functions
- Realtime
- PWA / Workbox
- Docker / Nginx

## Архитектура

```text
Browser
  │
  ├── React SPA / PWA
  │
  ├── Supabase Auth
  │
  ├── PostgREST
  │      └── PostgreSQL + RLS
  │
  ├── Realtime
  │
  └── Edge Functions
         ├── public-form
         ├── supplier-service
         ├── create-manager
         └── update-manager
```

`service_role` используется только на серверной стороне Edge Functions/monitor server и никогда не должен попадать в Vite environment variables.

## Важное ограничение self-hosted

Текущий репозиторий умеет самостоятельно собирать и запускать **frontend/CRM**.

Обычный PostgreSQL сам по себе не является заменой Supabase: приложение использует Supabase Auth, PostgREST и RLS. Для полностью автономного backend необходимо отдельно развернуть Supabase self-hosted либо переработать backend.

---

# Вариант A — облако: Vercel + Supabase

## 1. Создать Supabase project

Откройте Supabase Dashboard и создайте новый проект.

После создания откройте SQL Editor.

Выполните целиком:

```text
supabase/schema.sql
```

Не пропускайте конец файла: там находятся security policies и `app_logs`.

## 2. Создать первого администратора

В Supabase:

```text
Authentication → Users → Add user
```

Создайте email/password.

После создания проверьте таблицу:

```text
public.profiles
```

Для первого пользователя роль должна быть:

```text
admin
```

## 3. Получить API settings

Откройте:

```text
Project Settings → API
```

Нужны:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

Никогда не используйте `service_role` key в `VITE_*`.

## 4. Подготовить Git repository

Перед production:

```bash
npm install
```

После этого обязательно создайте и закоммитьте:

```text
package-lock.json
```

В дальнейшем используйте:

```bash
npm ci
```

## 5. Создать Vercel project

В Vercel:

```text
Add New → Project → Import Git Repository
```

Для Vite:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

## 6. Добавить Environment Variables

В Vercel:

```text
Project → Settings → Environment Variables
```

Добавьте:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

Для Production, Preview и Development задайте нужные значения отдельно.

Не добавляйте:

```env
SUPABASE_SERVICE_ROLE_KEY
```

во frontend Vercel environment.

## 7. Deploy

Нажмите:

```text
Deploy
```

После deploy проверьте:

- `/login`
- вход администратора;
- suppliers;
- buyers;
- tasks;
- support;
- settings;
- forms;
- realtime;
- upload knowledge file.

---

# Вариант B — свой сервер

Есть два разных сценария.

## B1. Self-hosted frontend + облачный Supabase

Это самый простой вариант.

### Шаг 1. Ubuntu

Рекомендуется Ubuntu 22.04/24.04.

Установка Node.js:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs nginx git
```

Проверка:

```bash
node -v
npm -v
git --version
```

## Шаг 2. Получить проект

```bash
cd /var/www
sudo git clone YOUR_REPOSITORY vsemzapchasti-crm
sudo chown -R $USER:$USER /var/www/vsemzapchasti-crm
cd /var/www/vsemzapchasti-crm
```

## Шаг 3. Установить зависимости

После появления `package-lock.json`:

```bash
npm ci
```

## Шаг 4. Создать `.env`

```bash
cp .env.example .env
nano .env
```

Заполнить:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

## Шаг 5. Проверки

```bash
npm run lint
npm run typecheck
npm run build
```

## Шаг 6. Разместить dist

Например:

```bash
sudo mkdir -p /var/www/vz-crm
sudo cp -r dist/* /var/www/vz-crm/
```

## Шаг 7. Nginx

Создайте:

```bash
sudo nano /etc/nginx/sites-available/vz-crm
```

Минимальная конфигурация:

```nginx
server {
    listen 80;
    server_name crm.example.ru;

    root /var/www/vz-crm;
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
}
```

Активировать:

```bash
sudo ln -s /etc/nginx/sites-available/vz-crm /etc/nginx/sites-enabled/vz-crm
sudo nginx -t
sudo systemctl reload nginx
```

## Шаг 8. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.example.ru
```

После этого проверить:

```text
https://crm.example.ru
```

---

# Вариант B2 — полностью self-hosted Supabase

Обычный PostgreSQL недостаточен.

Нужно отдельно развернуть официальный self-hosted Supabase stack с:

- PostgreSQL
- Auth
- PostgREST
- Realtime
- Storage
- API gateway

После этого заменить:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

на URL self-hosted Supabase.

Сам CRM repository не содержит полный self-hosted Supabase stack, поэтому нельзя обещать запуск только командами `docker compose up` из этого репозитория.

---

# Production checklist

Перед первым релизом:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=high
```

Проверить:

- [ ] `package-lock.json` закоммичен
- [ ] нет `.env` в Git
- [ ] нет `service_role` во frontend
- [ ] Supabase schema выполнена целиком
- [ ] RLS включён
- [ ] первый admin создан
- [ ] Edge Functions deployed
- [ ] rate limit настроен
- [ ] backups включены
- [ ] HTTPS включён
- [ ] HSTS включён после проверки HTTPS
- [ ] smoke tests пройдены
- [ ] RLS tests пройдены
- [ ] mobile QA пройден
- [ ] logs проверены

## Команды

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run preview
npm audit
```

Docker:

```bash
docker build -t vz-crm .
docker run -d -p 8080:80 --name vz-crm vz-crm
```

Проверка:

```bash
docker ps
docker logs vz-crm
```
