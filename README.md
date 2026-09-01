# Семейное древо

Публичный сайт на Vite + React с интерактивным генеалогическим деревом, Supabase Auth для редакторов и i18next для RU/KZ.

## Что сделать руками

1. Создайте проект в Supabase.
2. Откройте Supabase SQL Editor и выполните файл `supabase/schema.sql`.
   Если база была создана до появления прямых связей между братьями и сёстрами, вместо повторного запуска всей схемы выполните `supabase/add-sibling-relationship.sql`.
   Для уже существующей базы также выполните `supabase/rename-maiden-name-to-patronymic.sql`, чтобы заменить девичью фамилию на отчество.
   Затем выполните `supabase/add-clan.sql`, чтобы добавить поле «Ру».
3. В том же SQL Editor выполните `supabase/storage.sql`. Он создаст публичный bucket `person-photos` с лимитом 5 МБ на исходный файл и политиками: чтение для всех, запись и удаление только для `authenticated`.
4. В Supabase откройте Authentication -> Users и создайте пользователя-редактора с email и паролем.
5. В Supabase откройте Project Settings -> API и скопируйте Project URL и anon public key.
6. Создайте рядом с `.env.example` файл `.env` и вставьте:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
```

Для Vercel добавьте эти же переменные в Project Settings -> Environment Variables.

## Деплой на Vercel

Перед деплоем убедитесь, что в Supabase выполнены оба SQL-файла: `supabase/schema.sql` и `supabase/storage.sql`, а пользователь-редактор создан в Authentication -> Users.

1. Загрузите проект в приватный или публичный репозиторий GitHub. Файл `.env` загружать нельзя: он исключён через `.gitignore`.
2. В Vercel выберите New Project -> Import Git Repository и импортируйте созданный репозиторий.
3. В Configure Project проверьте параметры:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. Откройте Settings -> Environment Variables и добавьте переменные `SUPABASE_URL` и `SUPABASE_ANON_KEY`. Для первого деплоя выберите окружения Production, Preview и Development.
5. Если переменные добавлены после первого деплоя, откройте Deployments, выберите последний деплой, нажмите меню с тремя точками -> Redeploy. Уже собранный деплой новые значения автоматически не получает.
6. После успешной сборки Vercel покажет домен вида `https://project-name.vercel.app`. Публичный просмотр дерева доступен без входа; редактирование включается после входа пользователем из Supabase Auth.

Конфигурация продублирована в `vercel.json`, поэтому Vercel сможет определить параметры сборки автоматически.

## Команды

```bash
npm install
npm run test
npm run dev
npm run build
```

После `npm run dev` открывайте именно `http://localhost:5173/`. Если нужно открыть сайт с телефона в той же Wi-Fi сети, запустите `npm run dev:lan`, затем откройте `http://IP-адрес-компьютера:5173/`.

## Заметки

- До настройки Supabase сайт показывает демо-дерево.
- SELECT открыт для всех посетителей через anon role.
- INSERT/UPDATE/DELETE разрешены только authenticated role.
- Фото обрезаются до квадрата 400×400, сжимаются в WebP примерно до 300 КБ и сохраняются в публичном bucket `person-photos`.
