# Беклог Dev2 — по дням (4 недели + Day 0)

Документ согласует **дорожную карту из ТЗ** (недели 1–4, дни 1–20), **`ROADMAP-DELTA.md`** (reuse `server/pdf-parser` + `client/pdf-parser-ui`, без второго бэкенда) и **пререквизиты до формального старта недели 1**.

**Последний аудит кода:** сопоставление с `server/pdf-parser` и `client/pdf-parser-ui` — см. § «Аудит против репозитория».

---

## Аудит против репозитория

Уже реализовано (можно снять с беклога или пометить как «донастроить»):

| Область | Факт в репо |
|---------|-------------|
| **Auth** | `POST /api/auth/login`, `GET/PATCH /api/users/me`, `POST /api/users/me/change-password` в `auth.controller.ts`; защищённые роуты через **`requireAuth`** (`req.authEmployee`, `req.authContext`). **Bearer:** основной токен — **JWT** (HS256, `utils/jwt.ts`): в payload — `companyId`, `role`, `sub` = id сотрудника; поддерживаются **legacy**-строки из таблицы **`auth_sessions`** (`utils/auth-token.ts`). Переменные **`JWT_SECRET`**, **`JWT_EXPIRES_IN`**. |
| **Пароли** | **bcrypt** в `employees.password_value` (`utils/passwords.ts`); опционально дублирование хеша в **Redis** (`setPasswordHashRedis`). |
| **Компании и регистрация** | Таблица **`companies`**, **`employees.company_id`**. Регистрация компании: **`POST /api/admin/companies`** (транзакция company + первый сотрудник-**admin**), только для **платформенного администратора** (`requireAuth` → **`requirePlatformAdmin`**). Публичного **`POST /api/auth/register-company`** нет — осознанно (B2B SaaS). |
| **Инварианты** | Один администратор на компанию (`company-roles.ts`, проверки в `admin.controller` / `companies.controller`). |
| **Контекст сотрудника** | `resolveEmployeeContextByToken` в `utils/auth-context.ts` через **`getEmployeeByAuthToken`**: `companyId`, `role` admin/employee (данные из БД после проверки токена). |
| **Tenant** | В `documents.controller.ts` и `approvals.controller.ts` — фильтры и проверки `company_id` / `employee.companyId`. |
| **Сотрудники (платф. админ)** | `GET/POST /api/admin/employees` в `admin.controller.ts` (защита `requirePlatformAdmin`); роли в `roles_json`; bcrypt одноразового пароля при создании. |
| **Redis** | `src/cache/redis.ts` — кэш документов/согласований, опционально хеши паролей; при отсутствии **`REDIS_URL`** — работа без Redis без падения процесса. |
| **Профиль / DTO** | `GET/PATCH /users/me` отдаёт **`companyId`**, **`role`**, `roleLabel`, `fullName`, `email`, `position`, **`mustChangePassword`** (см. `mapEmployeeProfile`). |
| **Временный пароль** | Колонка `is_temporary_password`; логин отдаёт `isTemporaryPassword`; фронт предупреждает — **серверной блокировки mutation до смены пароля пока нет**. |

Ещё **нет** в репо (остаётся в беклоге): публичная саморегистрация компании (если понадобится), **`/api/admin/routes`** на сервере (вызов только во фронте `adminApi`), **уведомления**, **soft delete** сотрудников, **PATCH/reset-password** для employee, аватар, CI, rate limit / security headers. **`docs/DEPLOY.md`**, **`docker-compose.yml`**, **`Dockerfile`**, **`GET /health`**, **`GET /api/health`**, **CORS из `CORS_ORIGIN`** (`utils/cors-config.ts`) — есть.

---

## Краткий анализ

| Источник | Суть для Dev2 |
|----------|----------------|
| **Общая дорожная карта** | Фундамент: деплой/staging, Docker, компания и auth, tenant (`companyId`), сотрудники, RBAC, маршруты согласования, профиль/аватар, уведомления, безопасность и прод в конце. |
| **ROADMAP-DELTA** | Расширять существующий Express (`routes.ts`, контроллеры), Prisma или raw SQL в том же стиле что `employees`. Dev2: компания, админка/auth, уведомления, compose/CI/env. Стык: стабильные DTO `companyId`, ролей, маршрутов для Dev1. |
| **Дельта по репо (обновлено)** | Документы, approvals, Redis-кэш, **компании + регистрация через платформенного админа**, **JWT + bcrypt**, **companyId/role/mustChangePassword в DTO**, контекст сотрудника и **`requirePlatformAdmin`** — **уже в коде**. Остаётся: **серверная блокировка mutation по временному паролю**, **маршруты согласования в API**, уведомления, инфраструктура прода, CI. Деплой-док, compose и **health** — добавлены. |

**Правила каждого дня**

| Когда | Что |
|-------|-----|
| **Утро (~15 мин, вместе)** | Блокеры по контракту API и интеграции (Dev1 ↔ Dev2). |
| **Вечер (~10 мин)** | Что влито в `main`, что доступно на staging URL. |

**Definition of Done для задачи дня (Dev2):** задача либо в **PR с описанием**, либо **задеплоена на staging**, либо **явно перенесена** с причиной.

---

## Day 0 — до формального старта недели 1 (1–2 дня)

*Блок «Всё ли сделано для старта первой недели?» — типичные пререквизиты Dev2.*

- [x] **`docs/DEPLOY.md`**: куда кладём фронт и бэк, домен staging, список переменных `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PUBLIC_APP_URL`, `CORS_ORIGIN` (как в §6 ROADMAP-DELTA). *(Файл: `docs/DEPLOY.md`.)*
- [x] **`docker-compose`** (минимум): `api` + MySQL + Redis; опционально Adminer; описание аналога в облаке — в `docs/DEPLOY.md`. Файлы: `docker-compose.yml`, `server/pdf-parser/Dockerfile`, `docker.env.example`.
- [x] **`GET /api/health`** и **`GET /health`** — liveness (`health.controller.ts`, без проверки БД/Redis).
- [x] **CORS**: allowed origin из env (`CORS_ORIGIN`), несколько origin через запятую; без env — как раньше (любой origin). См. `utils/cors-config.ts`.
- [x] **Модуль Redis** в приложении — есть (`src/cache/redis.ts`); **`.env.example`** дополнен (`JWT_SECRET`, `JWT_EXPIRES_IN`, комментарии к CORS и т.д. — см. актуальный файл).
- [x] **Сборка** `server/pdf-parser`: при установленных зависимостях `npm run build` проходит (зависимости `ioredis`, `xlsx` в `package.json`).
- [ ] **Синхронизация с Dev1**: кто создаёт первую компанию и как заполняется `company_id` до появления API регистрации (сиды / ручной SQL / временный скрипт). *(В коде уже читается `company_id` у сотрудника, если колонка добавлена в БД.)*

**DoD Day 0:** документ деплоя + compose (или эквивалент) + health + CORS из env + зелёная сборка; договорённость с Dev1 по первому tenant.

---

## Неделя 1 — фундамент, staging, первые реальные API

### День 1 (Пн)

- [x] Завершить/уточнить **`DEPLOY.md`** (если Day 0 был черновик): артефакты фронта/бэка, staging URL, все критичные env. *(Compose и Dockerfile уже добавлены.)*
- [x] **Репозиторий под docker-compose**: `mysql`, `redis`, `api` (`server/pdf-parser/Dockerfile`).
- [x] **Единый способ миграций на deploy**: runbook в `DEPLOY.md` или скрипт (`prisma migrate deploy` + путь к `schema.prisma`). *(Prisma-миграции для `contract` уже есть; документы согласования создаются через raw SQL в `ApprovalDomainService`.)*
- [x] Таблица **`companies`** и связь **`employees.company_id`** (миграция Prisma; `company_id` может быть `NULL` у платформенного админа).

**DoD:** compose поднимается локально; в PR — описание миграций; пересечение с Dev1 по контракту `company_id` задокументировано.

### День 2 (Вт)

- [x] **Модель Company + User/Admin**: при создании компании первый пользователь — **админ компании** (`roles_json` содержит `admin`), транзакция в **`createCompany`** (`companies.controller.ts`).
- [x] **Регистрация компании в API**: реализовано как **`POST /api/admin/companies`** (не `/api/auth/register-company`): валидация, **bcrypt** пароля админа, транзакция company + employee, дублирование хеша в Redis при наличии. Доступ только с **`requirePlatformAdmin`** (B2B SaaS). Публичная саморегистрация — отдельное решение продукта, в беклоге не закрыта.
- [x] **`POST /api/auth/login`**: **JWT** access-токен + **legacy**-сессии `auth_sessions` для старых клиентов; **хэш паролей bcrypt**; `Authorization: Bearer` без изменений.
- [x] Общий **`requireAuth`** (`middleware/requireAuth.ts`): Bearer → `req.authEmployee` + `req.authContext`; контроллеры документов, согласований и профиля без дублирования проверок. **`/api/admin/*`**: цепочка **`requireAuth` → `requirePlatformAdmin`** (без второго запроса к БД при валидном токене).
- [x] **Tenant в контексте**: `companyId` и `role` в **`resolveEmployeeContextByToken`**; **`GET /users/me`** отдаёт **`companyId`** и **`role`** в DTO (`mapEmployeeProfile`). Расширение **`mustChangePassword`** — см. день 3.

**DoD:** по коду — регистрация компании (платформенный админ) и логин с JWT/bcrypt закрыты; на **staging** — smoke вручную; в ответе логина поле **`token`** — JWT (контракт для фронта: тот же ключ, другое содержимое).

### День 3 (Ср)

- [x] **Tenant isolation** для документов и согласований — реализована проверка `company_id` в **`documents.controller`** / **`approvals.controller`**. Осталось: автотест или чеклист «нельзя читать чужой companyId»; пройти по остальным роутам при росте API.
- [x] **`GET /api/users/me`**: в DTO уже есть **`companyId`**, **`role`**, `roleLabel`, `fullName`, `email`, `position`.
- [x] **`GET /api/users/me`**: флаг **`mustChangePassword`** (по `is_temporary_password` в БД); на **login** по-прежнему **`isTemporaryPassword`** в корне ответа; в **`user`** те же данные, что и в профиле.
- [x] **`resolveEmployeeContextByToken`** в `auth-context.ts` — готово; дальше — подключать везде единообразно + опционально **`requireCompany`** (отказ, если нет `company_id` там, где это обязательно).

**DoD:** `GET /users/me` отдаёт согласованные поля с фронтом и с контекстом в документах; тест на изоляцию — по возможности.

### День 4 (Чт)

- [x] **Список и создание сотрудников**: **`GET/POST /api/admin/employees`** — есть. Осталось: **PATCH**, **сброс пароля**, **удаление/soft delete** (см. неделю 2); при желании алиас `/api/employees` для единообразия с ТЗ.
- [x] **Роли** — хранятся в **`roles_json`** (массив строк, в т.ч. `admin`). Зафиксировать в README при необходимости.
- [ ] **Soft delete**: `deletedAt` / `isDeleted` — **ещё нет** в `employees`; нужна миграция + договорённость с Dev1 для истории.

**DoD:** список/создание сотрудников доступны для админа; контракт не ломает текущий админ-UI без флагов.

### День 5 (Пт) — внутренняя веха недели 1

- [ ] **Первый деплой staging**: API по **HTTPS**, миграции проходят, smoke: **login** + **создание компании** платформенным админом (`POST /api/admin/companies`). *(В репо нет зафиксированного процесса деплоя.)*
- [ ] **Секреты только через env**; **CORS** под домен фронта staging.
- [ ] **`.env.example`** — расширить до полного списка из `DEPLOY.md` (сейчас файл минимальный).
- [ ] **Runbook миграций** в `DEPLOY.md` финализировать.

**DoD:** стабильный staging URL; команда может повторить деплой по документу; вечерний статус «что на staging» закрыт.

---

## Неделя 2 — workflow согласования + демо заказчику №1

### День 6 (Пн)

- [ ] **Модель `ApprovalRoute` + `RouteStep`** с дискриминатором: *employee* vs *role + defaultEmployee*. *(Сейчас `approval_tasks.route_id` есть, таблиц маршрутов в коде нет — submit создаёт задания без persisted route.)*
- [ ] **`POST /api/admin/routes`**, **`GET /api/admin/routes?...`** — реализовать на сервере и в **`routes.ts`** (клиент в `shared/api` уже вызывает эти пути — сейчас **нет бэкенд-обработчиков**).
- [ ] Связать маршрут с **`submit`** документа (совместно с Dev1).

**DoD:** создание и чтение маршрутов с привязкой к `companyId`.

### День 7 (Вт)

- [ ] **Валидация маршрута**: у `defaultEmployee` выбранная роль; нельзя назначить удалённого сотрудника.
- [ ] **Админ UI/API**: список маршрутов + создание (минимально); снятие мока на `AdminPanelPage` при `VITE_USE_MOCK_ADMIN_API=false` (как в ROADMAP-DELTA).

**DoD:** ошибки валидации понятны; админ видит реальные маршруты на staging.

### День 8 (Ср)

- [ ] **Resolver имён в истории** (подготовка к Dev1): если у автора **`deletedAt`** → плейсхолдер «Удалённый пользователь». *(Пока soft delete сотрудников не внедрён.)*
- [ ] **`PATCH /api/admin/employees/:id`**, **`POST /api/admin/employees/:id/reset-password`** (или согласованные пути) — в `admin.controller`; на фронте кнопки админки частично заглушки.

**DoD:** сотрудник редактируется и сброс пароля работает; soft-delete учтён в назначениях/валидации.

### День 9 (Чт) — подготовка к демо

- [ ] **`mustChangePassword` / `is_temporary_password`**: серверная **блокировка mutation-операций** (документы, согласования и т.д.), пока пароль не сменён через **`/api/users/me/change-password`**. *(Сейчас блокировки нет — только предупреждение после логина на фронте.)*
- [ ] **Фронт**: отдельный экран или редирект **«Смена пароля»** при флаге (сейчас — `message.warning` и ручной переход в профиль).

**DoD:** сценарий «временный пароль → смена → доступ» воспроизводим на staging.

### День 10 (Пт) — Демо A заказчику

- [ ] **Утро:** мониторинг логов на staging во время демо; ветка **hotfix** наготове.
- [ ] После демо: занести замечания заказчика в backlog с **P0/P1** (совместно с Dev1).

**DoD:** демо не блокируется отсутствием логов/ветки для фикса.

---

## Неделя 3 — админ-видимость, Excel, профиль, Redis-стабильность — Демо B

### День 11 (Пн)

- [x] **Платформенные админ-роуты**: **`requirePlatformAdmin`** для **`/api/admin/companies`** и **`/api/admin/employees`**. *(Отдельного универсального `requireAdmin` для сценариев «админ компании» в документах — по-прежнему точечные проверки в контроллерах.)*
- [x] **Профиль**: **`PATCH /api/users/me`** (имя, email) — уже в **`auth.controller.ts`**.
- [ ] Заготовка под **аватар** (поле в БД или флаг «позже» в PR — без противоречия с Day 12).

**DoD:** админские эндпоинты защищены единообразно; профиль уже работает — усилить при необходимости проверками.

### День 12 (Вт)

- [ ] **Аватар**: **`POST /api/users/me/avatar`** (multer) или хранение URL; лимиты размера, проверка MIME.
- [ ] Связка с **`ProfilePage.tsx`**.

**DoD:** загрузка аватара не валит процесс; лимиты задокументированы.

### День 13 (Ср)

- [ ] **Таблица `notifications`**, запись при событиях (пока можно без вебсокетов).
- [ ] **`GET /api/notifications`**, **`GET /api/notifications/unread-count`**.

**DoD:** API готово к подписке Dev1 на domain events (День 14).

### День 14 (Чт)

- [ ] **Подписчик/инсёртер**: по событию от Dev1 (**eventType**, `documentId`, `companyId`, payload, `createdAt`) создавать **notification** для адресата (assignee / initiator).
- [ ] Совместно с Dev1: прогон **«новое назначение → count вырос»**.

**DoD:** цепочка событие → уведомление проверена на staging.

### День 15 (Пт) — Демо B

- [ ] **Бейдж** уведомлений в layout (**`AppLayout` / Workspace**), лента с реальными данными.
- [ ] **Prod-like env** на staging (документировано в `DEPLOY.md`).
- [ ] Напоминание по **Redis** (совместно с Dev1): после переходов нет «stale» в карточке (чеклист из шпаргалки дорожной карты).

**DoD:** демо 15–20 мин по сценарию (админ / Excel / уведомление / смена пароля если готово).

---

## Неделя 4 — прод-деплой, безопасность, приёмка

### День 16 (Пн)

- [ ] **Production** (или финальный staging как prod): DNS, TLS, **регламент бэкапа БД**.
- [ ] **Rate limit** на login, базовые **security headers** (через reverse proxy или Express).

**DoD:** прод-конфиг описан; логин не беззащитен от брутфорса на уровне заготовки.

### День 17 (Вт)

- [ ] **CI**: lint / test / build для **`server/pdf-parser`** и **`client/pdf-parser-ui`**; деплой по тегу **`v0.1.0`**; **rollback plan** в `DEPLOY.md`.
- [ ] Учесть **fallback Redis** на стороне приложения (совместно с Dev1): при недоступности Redis прод не падает — Dev2 помогает с конфигом/health.

**DoD:** зелёный pipeline; откат описан.

### День 18 (Ср)

- [ ] **Исправления P0** по чеклисту приёмки: **auth**, **уведомления**, **RBAC** (совместно с Dev1 по списку).

**DoD:** P0 закрыты или явно отложены с риском.

### День 19 (Чт)

- [ ] **P1: админка сотрудников** — довести редактирование / сброс / удаление, если остались хвосты с недели 2.
- [ ] Полировка сообщений об ошибках на своих эндпоинтах при необходимости.

**DoD:** нет известных P1 по зоне ответственности Dev2 без тикета.

### День 20 (Пт) — сдача

- [ ] **Совместно:** финальная публичная ссылка, короткая инструкция для заказчика.
- [ ] **Передача:** шаблон env, как поднять локально, как восстановить БД.
- [ ] **Мини-шпаргалка Redis** для команды (из дорожной карты): дни 7–8 — кэш только `GET /documents/:id`, инвалидация на write; день 15 — нет stale; день 17 — fallback при down Redis.

**DoD:** заказчик может зайти по инструкции; Dev2 зона закрыта.

---

## Шпаргалка Redis (кросс-функционально с Dev1)

| Период | Минимум |
|--------|---------|
| Неделя 2 (дни 7–8) | Кэш только `GET /documents/:id`, инвалидация на любой write. *(В репо уже есть read-through и `del` при изменениях в `documents`/`approvals` — прогнать регресс и закрыть в DoD.)* |
| Неделя 3 (день 15) | Проверка отсутствия stale после всех действий. |
| Неделя 4 (день 17) | Fallback при недоступности Redis. *(Без `REDIS_URL` клиент не создаётся — запросы идут в БД; при **ошибке** соединения с Redis убедиться, что поведение такое же.)* |

---

*Обновляйте этот файл при смещении чекпоинтов или при изменении §1 в `ROADMAP-DELTA.md`.*

---

*Аудит беклога против репозитория: апрель 2026; обновление по JWT, bcrypt, компаниям и `requirePlatformAdmin` — актуально к текущему `main`.*
