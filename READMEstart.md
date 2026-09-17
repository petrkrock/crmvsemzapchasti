# READMEstart — ВсемЗапчасти CRM

Памятка для новичка: от чистого компьютера до работающей CRM.

## 1. Установить программы

Нужны:

- Node.js 20 LTS
- Git
- VS Code
- Docker — только если используете Docker

Проверка:

```bash
node -v
npm -v
git --version
docker --version
```

## 2. Скачать проект

```bash
git clone YOUR_REPOSITORY vsemzapchasti-crm
cd vsemzapchasti-crm
```

## 3. Установить зависимости

Если в проекте есть `package-lock.json`:

```bash
npm ci
```

Если lock-файла пока нет:

```bash
npm install
```

После создания lock-файла его нужно закоммитить.

## 4. Настроить Supabase

Создайте проект в Supabase.

Откройте:

```text
SQL Editor
```

Выполните:

```text
supabase/schema.sql
```

Целиком.

Затем:

```text
Project Settings → API
```

Скопируйте:

```text
Project URL
anon public key
```

## 5. Создать `.env`

Linux/macOS:

```bash
cp .env.example .env
```

Windows CMD:

```cmd
copy .env.example .env
```

Откройте:

```bash
nano .env
```

или VS Code.

Запишите:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

Не вставляйте `service_role`.

## 6. Запустить локально

```bash
npm run dev
```

Откройте адрес, который покажет Vite, обычно:

```text
http://localhost:8080
```

## 7. Первый вход

В Supabase:

```text
Authentication → Users → Add user
```

Создайте пользователя.

Для первого пользователя в `public.profiles` установите:

```text
role = admin
```

После этого войдите в CRM.

## 8. Проверка перед production

```bash
npm run lint
```

Затем:

```bash
npm run typecheck
```

Затем:

```bash
npm run build
```

Если все прошло:

```bash
npm run preview
```

Откройте preview URL.

## 9. Production build

```bash
npm run build
```

Результат:

```text
dist/
```

Именно содержимое `dist` публикуется через Nginx/Vercel.

## 10. Docker

Создать image:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY \
  -t vz-crm .
```

Запустить:

```bash
docker run -d \
  --name vz-crm \
  -p 8080:80 \
  --restart unless-stopped \
  vz-crm
```

Проверить:

```bash
docker ps
docker logs vz-crm
```

Остановить:

```bash
docker stop vz-crm
```

Удалить контейнер:

```bash
docker rm vz-crm
```

## 11. Nginx

Проверить конфигурацию:

```bash
sudo nginx -t
```

Перезапустить:

```bash
sudo systemctl reload nginx
```

Статус:

```bash
sudo systemctl status nginx
```

## 12. HTTPS

Установить Certbot:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

Получить сертификат:

```bash
sudo certbot --nginx -d crm.example.ru
```

Проверить:

```bash
sudo certbot certificates
```

## 13. Git

Посмотреть изменения:

```bash
git status
```

Добавить:

```bash
git add .
```

Создать commit:

```bash
git commit -m "production release"
```

Отправить:

```bash
git push origin main
```

Получить изменения:

```bash
git pull
```

## 14. Полезные команды npm

```bash
npm run dev
```

Запуск разработки.

```bash
npm run lint
```

Проверка ESLint.

```bash
npm run typecheck
```

Проверка TypeScript.

```bash
npm run build
```

Production build.

```bash
npm run preview
```

Локальный просмотр production build.

```bash
npm audit
```

Проверка зависимостей.

## 15. Полезные команды Linux

```bash
pwd
```

Где я нахожусь.

```bash
ls -la
```

Показать файлы.

```bash
cd /var/www/vsemzapchasti-crm
```

Перейти в проект.

```bash
cd ..
```

На уровень выше.

```bash
mkdir test
```

Создать папку.

```bash
rm -rf test
```

Удалить папку.

```bash
nano .env
```

Редактировать `.env`.

## 16. Полезные команды Docker

```bash
docker ps
docker ps -a
docker images
docker logs vz-crm
docker restart vz-crm
docker stop vz-crm
docker start vz-crm
docker rm vz-crm
```

Docker Compose:

```bash
docker compose up -d --build
```

Логи:

```bash
docker compose logs -f
```

Остановка:

```bash
docker compose down
```

## 17. Если `npm ci` ругается

Удалить старые зависимости:

```bash
rm -rf node_modules
```

Linux/macOS.

После этого:

```bash
npm ci
```

Не удаляйте `package-lock.json` в production без необходимости.

## 18. Если порт 8080 занят

Linux:

```bash
sudo lsof -i :8080
```

или:

```bash
ss -ltnp | grep 8080
```

Завершить найденный процесс только если уверены, что он лишний.

## 19. Если Supabase не подключается

Проверить:

```bash
cat .env
```

Проверить, что есть:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

После изменения `.env` перезапустить:

```bash
npm run dev
```

## 20. Главное правило

Перед production всегда:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=high
```

И только после успешных проверок:

```bash
git push origin main
```
