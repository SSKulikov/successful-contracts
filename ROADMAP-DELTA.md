# Дорожная карта «дельта» на месяц (только reuse)

План рассчитан на **доработку уже существующего кода**: `server/pdf-parser` (Express + Prisma/MySQL + сырой SQL для `employees`/`auth_sessions`) и `client/pdf-parser-ui` (Vite + React + Ant Design + React Query). **Новые репозитории и параллельные бэкенды не предполагаются** — расширяем текущий API-префикс `/api`, текущие страницы и `shared/api`.

**Ориентир:** 4 недели, 2 разработчика; в конце — сквозной сценарий MVP, **Redis-кэш чтения документов**, **деплой по публичной ссылке**, демо во **2–3** недели.

---

## 1. Инвентаризация: что уже есть (база для reuse)

### Бэкенд (`server/pdf-parser`)

| Область | Файлы / маршруты | Состояние |
|--------|-------------------|-----------|
| HTTP | `src/index.ts`, `src/routes.ts` | Express, CORS, JSON, `/api` |
| Парсинг файлов | `POST /api/parse-file` | PDF/DOCX → OCR/LLM, не JPG/PNG |
| Сохранение контрактов | `POST /api/save-data-info` | Запись в Prisma `contract` / raw SQL |
| Сотрудники | `GET/POST /api/admin/employees` | `src/controllers/admin.controller.ts`, таблица `employees` (raw SQL + доработка колонок) |
| Auth сотрудника | `POST /api/auth/login`, `GET/PATCH /users/me`, `POST /users/me/change-password` | `src/controllers/auth.controller.ts`, `auth_sessions`, Bearer-токен |
| Prisma-модель | `src/prisma/schema.prisma` | Только `contract`; `employees`/сессии **вне** schema — через `$executeRaw` |

### Фронтенд (`client/pdf-parser-ui`)

| Область | Файлы | Состояние |
|--------|--------|-----------|
| Роутинг | `src/app/router.tsx` | Лендинг, auth, workspace, my-documents, documents/:id, approvals, profile, admin, **contracts** |
| API-клиент | `src/shared/api/index.ts` | `documentsApi` / `approvalsApi` — по умолчанию **моки** (`VITE_USE_MOCK_API`); admin/profile могут ходить в API |
| Мои документы | `MyDocumentsPage.tsx` | Таблица, фильтры, экспорт CSV, переход в карточку |
| Согласования | `MyApprovalsPage.tsx` | Действия без обязательного комментария к «доработке» |
| Карточка | `DocumentDetailsPage.tsx` | История + действия (на моках) |
| Админка | `AdminPanelPage.tsx` | Сотрудники ↔ API; **маршруты** — мок; кнопки edit/reset/delete — заглушки |
| Профиль | `ProfilePage.tsx` | Формы; сотрудник → API; админ из `localStorage` |
| Auth | `AuthPage.tsx` | Демо admin `admin/111`; сотрудник → `authApi.login` |
| Договоры | `ContractsPage.tsx` | Загрузка PDF/DOCX, автозаполнение, `save-data-info` |
| Шапка | `AppLayout.tsx` | Навигация без RBAC |

### Явные пробелы (всё это — **дельта** внутри текущих модулей)

- Нет домена **документ согласования** в БД и REST (сейчас мок на фронте + отдельная таблица `contract` под парсер).
- Нет **компании / tenant** и связи пользователей с компанией (кроме неявного «все в одной базе»).
- Нет **персистентных маршрутов** согласования (UI есть, API нет в `routes.ts`).
- Нет **Redis**.
- Нет **деплоя** в репозитории как инструкции/IaC.

---

## 2. Принципы «только reuse»

1. **Расширать** `server/pdf-parser/src/routes.ts` и добавлять контроллеры в `src/controllers/`, не плодить второй сервер.
2. **Либо** дописывать модели в `schema.prisma` + миграции, **либо** осознанно продолжать raw SQL в том же стиле, что `employees` — но в одном приложении.
3. **Переиспользовать** типы в `client/.../shared/api/index.ts`: включить реальные вызовы при `VITE_USE_MOCK_API=false`, не дублировать второй axios-слой.
4. Страницы **не удалять**: «Создать документ» логично перенести/дублировать из `ContractsPage` в поток «Мои документы» через общие компоненты/модалку в тех же `pages/`.
5. **Контракт-парсер** (`parse-file` / `save-data-info`) оставить как опцию автозаполнения, не выкидывать.

---

## 3. Роли в команде (дельта-кванты)

**Разработчик 1 — документы и согласования в текущем стеке**

- Новые эндпоинты в том же роутере: документы, задания, история, submit/resubmit, export.
- Redis поверх **новых** `GET` документа (и инвалидация при изменениях).
- Фронт: `MyDocumentsPage`, `MyApprovalsPage`, `DocumentDetailsPage`, при необходимости вынести модалку из `ContractsPage`.

**Разработчик 2 — компания, админка, auth, уведомления, деплой**

- Расширить auth: регистрация компании, привязка `companyId`, админ vs сотрудник в БД (постепенно убрать только-демо `admin/111` или оставить как dev-only).
- Допилить `admin.controller` / новые контроллеры: маршруты CRUD, сотрудники edit/reset/soft delete.
- Таблицы уведомлений + API ленты/бейджа (рядом с существующим `auth`).
- Docker Compose / CI / env для деплоя существующего `pdf-parser` + статик Vite.

**Стык:** Dev2 отдаёт стабильные DTO для `companyId`, ролей и маршрутов; Dev1 везде фильтрует документы по `companyId` из токена.

---

## 4. Недели и чекпоинты

| Неделя | Фокус reuse | Чекпоинт |
|--------|-------------|----------|
| 1 | БД-документы + привязка к токену + модалка на «Мои документы»; staging compose | Внутренний: create/list документ в том же API |
| 2 | Workflow approve/reject/revise+comment, resubmit с шага 1; Redis invalidate | **Демо заказчику A** (staging URL) |
| 3 | Админ видит все документы компании; Excel со ссылкой; маршруты в БД + админ UI к API | **Демо B** |
| 4 | Уведомления, polish, prod-деплой, чеклист | Публичная ссылка |

---

## 5. Примеры задач по дням (дельта, ~20 дней)

Указано **что именно допиливается**, без «создать новый проект».

### Неделя 1

**День 1**  
- *Dev2:* В `server/pdf-parser` добавить документ `docs/DEPLOY.md` + `docker-compose`: `mysql`, `redis`, `api` (образ из текущего Dockerfile или `node` + `npm run build`).  
- *Dev1:* В `schema.prisma` или raw SQL — таблица `approval_documents` (минимальные поля + `company_id`, `created_by`), миграция в существующей папке `prisma/migrations`.

**День 2**  
- *Dev2:* Таблица `companies`, `users` или расширение `employees` полем `company_id` + роль `admin`; эндпоинт регистрации компании в новом `controllers/company-auth.controller.ts` + подключение в `routes.ts`.  
- *Dev1:* `POST /api/documents` + `GET /api/documents/my` в новом контроллере; переиспользовать `prisma` из `src/prisma/index.ts`.

**День 3**  
- *Dev1:* Подключить `ioredis` в `pdf-parser`, модуль `src/cache/redis.ts`, обёртка `getJson/setJson/del`.  
- *Dev2:* Протянуть `companyId` в JWT/session payload и middleware `requireCompany`.

**День 4**  
- *Dev1:* `GET /api/documents/:id` + read-through кэш Redis; ключ `doc:{companyId}:{id}`.  
- *Dev2:* Обновить `auth.controller.ts` login: выдавать `companyId` и `role` в ответе/токене для фронта.

**День 5**  
- *Dev1:* В `MyDocumentsPage.tsx` — вызов реального list при флаге env; модалка создания (перенос полей из `ContractsPage` или общий компонент в `src/pages` / `src/shared`).  
- *Dev2:* Первый деплой **текущего** бэка на staging; проверка `health` и login.

### Неделя 2

**День 6**  
- *Dev2:* Таблица `approval_routes` / `approval_route_steps` (raw или Prisma), `POST/GET /api/admin/routes` + подключение в `routes.ts`; обновить `adminApi` во фронте (уже есть заготовка методов).  
- *Dev1:* Таблица заданий `approval_tasks`, привязка к шагу маршрута и документу.

**День 7**  
- *Dev1:* `POST /api/documents/:id/submit` — перевод в «на согласовании», создание первого task; инвалидация Redis для документа.  
- *Dev2:* В `AdminPanelPage.tsx` убрать мок для маршрутов при `VITE_USE_MOCK_ADMIN_API=false` (уже частично описано в api).

**День 8**  
- *Dev1:* `GET /api/approvals/my`, `POST .../approve|reject|revise` (revise с телом `{ comment }`, 400 если пусто).  
- *Dev2:* Допилить `AdminPanelPage` кнопки сотрудников: `PATCH`, reset password, soft delete — новые методы в `adminApi` + хендлеры в `admin.controller.ts`.

**День 9**  
- *Dev1:* `MyApprovalsPage.tsx` — модалка комментария для «На доработку»; все запросы на реальный API.  
- *Dev1:* `DocumentDetailsPage.tsx` — загрузка с API + история из таблицы событий.

**День 10 — Демо A**  
- *Dev1:* `POST /api/documents/:id/resubmit` — сброс на шаг 1, новый цикл.  
- *Совместно:* Стабильный staging URL, сценарий 10 минут, список известных ограничений.

### Неделя 3

**День 11**  
- *Dev1:* `GET /api/documents/company` для роли admin (проверка в middleware или в контроллере); `MyDocumentsPage` — ветка списка.  
- *Dev2:* Унификация «админ»: запись в БД вместо чистого localStorage (опционально оставить fallback dev).

**День 12**  
- *Dev1:* `GET /api/documents/export.xlsx` (библиотека в том же `package.json` бэка), колонка с `PUBLIC_APP_URL` + путь как у `router.tsx` (`/documents/:id`).  
- *Dev1:* Кнопка «Выгрузить в Excel» вместо/рядом с CSV в `MyDocumentsPage`.

**День 13**  
- *Dev1:* Фильтры по дате и полям контрагента/ИНН в query list (расширить существующий эндпоинт).  
- *Dev2:* Таблица `notifications`, запись из хуков после смены статуса документа (вызов из Dev1 сервиса через общую функцию или очередь событий в БД).

**День 14**  
- *Dev2:* `GET /api/notifications`, `GET /api/notifications/unread-count`; обновить `WorkspacePage.tsx` / `AppLayout.tsx` — бейдж с реальным count.  
- *Dev1:* Во всех write-операциях документа — триггер создания уведомлений (reuse одного места в сервисном слое).

**День 15 — Демо B**  
- *Dev1:* Проверка Redis после всех переходов; fallback при недоступности Redis.  
- *Dev2:* Профиль: аватар через существующий `ProfilePage` + новый маршрут при необходимости; обязательная смена пароля — guard на фронте + блок на бэке для write (расширение текущего флага в `employees`).

### Неделя 4

**День 16**  
- *Dev2:* Production compose / облачный деплой; секреты; CORS для фронтенд-домена.  
- *Dev1:* JPG/PNG в `file.controller` / `ContractsPage` / модалке: расширить `multer` и опционально пропуск в OCR/подсказка «только ручной ввод».

**День 17**  
- *Dev2:* CI: `npm run build` для `server/pdf-parser` и `client/pdf-parser-ui`, артефакты.  
- *Dev1:* История: отображение «Удалённый пользователь» для soft-deleted authorId (join на `employees`).

**День 18**  
- *Совместно:* Чеклист приёмки по ТЗ на среде staging.  
- *Dev1+2:* Закрытие P0.

**День 19**  
- *Dev1+2:* P1, документация в `server/pdf-parser/README.md` — раздел «Деплой и переменные окружения» (дополнить существующий README).

**День 20**  
- Финальный деплой, публичная ссылка, тестовые учётки для заказчика.

---

## 6. Переменные окружения (дополнение к существующему `.env`)

Рекомендуется задокументировать рядом с текущим `DATABASE_URL`:

- `REDIS_URL`
- `JWT_SECRET` (или секрет сессии, если оставите текущую схему токенов в `auth_sessions`)
- `PUBLIC_APP_URL` — база для ссылок в Excel и писем
- `CORS_ORIGIN` — origin фронта после деплоя

---

## 7. Критерий «мы не вышли за рамки reuse»

- Не появился второй backend-репозиторий с дублированием auth.  
- Фронт остался одним Vite-приложением; новые фичи — новые компоненты в已有 `src/pages` или `src/shared`.  
- `parse-file` / `save-data-info` продолжают работать для текущего сценария договоров.  
- Инкремент — через **новые таблицы** и **новые маршруты** в существующем Express-приложении.

---

*Документ сгенерирован как дельта-план относительно состояния репозитория successful-contracts (модули `server/pdf-parser`, `client/pdf-parser-ui`). При изменении структуры каталогов обновите §1 и ссылки на файлы.*
