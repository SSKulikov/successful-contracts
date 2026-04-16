# План разработки: 11 дней (Dev1 и Dev2 по очереди, без параллельных пересечений)

Правило: **в каждый календарный день задачи ведёт только один разработчик** — второй в этот день не меняет код. Порядок дней выстроен по зависимостям между этапами.

---

## День 1 — **Dev2**

**Тема:** схема данных маршрутов и связь с документом.

| Задача | Файлы / место |
|--------|----------------|
| Таблицы `approval_routes`, `approval_route_steps` (поля шага: `assignee_kind`, ссылки на сотрудника/роль) | `server/pdf-parser/src/services/ApprovalDomainService/index.ts` — расширить `ensureApprovalDomainTables()` и при необходимости отдельные `ALTER` | ГОТОВО
| Колонка `approval_documents.route_id` (NULL до submit), индексы, FK | Там же или Prisma-миграция — один выбранный стиль на весь этап |ГОТОВО
| Зафиксировать контракт имён колонок в комментарии к сервису | `ApprovalDomainService/index.ts` |ГОТОВО

**Обоснование:** без персистентных маршрутов нельзя подключать submit/approve на стороне Dev1.

**DoD:** миграция/ensure применяется на чистой БД без ошибок; таблицы видны в MySQL.

---

## День 2 — **Dev2**

**Тема:** HTTP API маршрутов для платформенного админа и для сценария submit.

| Задача | Файлы / место |
|--------|----------------|
| `GET /api/admin/routes`, `POST /api/admin/routes` (фильтр по `company_id`, валидация шагов) | Новый `server/pdf-parser/src/controllers/approval-routes.controller.ts`, `server/pdf-parser/src/routes.ts` |ГОТОВО
| Эндпоинт списка маршрутов для **админа компании** (не платформенного), например `GET /api/company/approval-routes` | Тот же или отдельный контроллер; цепочка `requireAuth` + проверка роли `admin` и `companyId` |ГОТОВО
| Обновить `README` / короткий контракт JSON для Dev1 | `server/pdf-parser/README.md` |
ГОТОВО
**Обоснование:** фронт и Dev1 должны получать список маршрутов без прав платформенного админа; `/admin/routes` остаётся для кросс-компанийного админа.

**DoD:** Postman/curl: list/create для платформенного админа; list для company admin только своей компании.

---

## День 3 — **Dev2**

**Тема:** админка и типы клиента под маршруты.

| Задача | Файлы / место |
|--------|----------------|
| Снять мок/привести в соответствие `adminApi.listRoutes`, `createRoute` | `client/pdf-parser-ui/src/shared/api/index.ts` |
| `AdminPanelPage`: реальные данные при `VITE_USE_MOCK_ADMIN_API=false` | `client/pdf-parser-ui/src/pages/AdminPanelPage.tsx` |
| Добавить метод клиента для `GET /api/company/approval-routes` (название — как на бэке дня 2) | `shared/api/index.ts` |

**Обоснование:** Dev1 на днях 4–6 не трогает админку маршрутов; но UI платформенного админа должен работать до интеграции submit.

**DoD:** создание маршрута и отображение списка без ошибок на реальном API.

---

## День 4 — **Dev1**

**Тема:** submit с привязкой к маршруту и генерация задач.

| Задача | Файлы / место |
|--------|----------------|
| `POST /api/documents/:id/submit`: тело `{ routeId }`, валидация принадлежности маршрута компании | `server/pdf-parser/src/controllers/documents.controller.ts` |
| Запись `approval_documents.route_id` | Там же |
| `createTasksFromRoute(documentId, routeId)` — чтение шагов, назначение исполнителей, стратегия «одна активная задача» (`pending` / `blocked`) | `server/pdf-parser/src/services/ApprovalDomainService/index.ts` |
| Убрать временный workaround «первая задача отправителю» или оставить только при отсутствии `routeId` с явной 400 | `documents.controller.ts` |

**Обоснование:** использует только то, что сделал Dev2 в дни 1–2.

**DoD:** после submit в БД несколько задач с корректными `step_order` и одной активной.

---

## День 5 — **Dev1**

**Тема:** многошаговое согласование и согласованность задач при reject/revise.

| Задача | Файлы / место |
|--------|----------------|
| В `approve`: если не последний шаг — не переводить документ в `approved`, активировать следующую задачу | `server/pdf-parser/src/controllers/approvals.controller.ts` |
| На последнем шаге — `approved` для документа | Там же |
| `reject` / `revise`: отмена остальных `pending`/`blocked` задач документа | `ApprovalDomainService` (`cancelPendingTasks` расширить при необходимости) |
| Инвалидация Redis как сейчас | `approvals.controller.ts` |

**Обоснование:** логика одна в домене согласований; Dev2 в этот день не вмешивается.

**DoD:** сценарий 2–3 шага только approve; reject с середины оставляет документ в согласовании или переводит в финальный статус — по принятому правилу (зафиксировать в коммите).

---

## День 6 — **Dev1**

**Тема:** правила редактирования документа и отображение «удалённого» автора (подготовка к soft delete).

| Задача | Файлы / место |
|--------|----------------|
| `PATCH /api/documents/:id`: явно разрешить только `uploaded` и `revision` (права инициатора/редактора) | `server/pdf-parser/src/controllers/documents.controller.ts` |
| В ответах истории/карточки: join к `employees`, поля для UI «Удалённый пользователь» при `deleted_at` (пока колонки может не быть — заложить ветку по `NULL`) | `documents.controller.ts`, при необходимости DTO в `server/pdf-parser/src/dto/index.ts` |
| Обновить формулировку в `Backlog_deev1.md` при необходимости | корень репозитория |

**Обоснование:** независимо от маршрутов; soft delete подставится на дне 7.

**DoD:** PATCH отклоняется для `in_approval`/`approved`/`rejected`; история не падает при отсутствии сотрудника (после дня 7 — с реальным `deleted_at`).

---

## День 7 — **Dev2**

**Тема:** soft delete сотрудников и блокировка входа.

| Задача | Файлы / место |
|--------|----------------|
| `employees.deleted_at` в Prisma + миграция | `server/pdf-parser/src/prisma/schema.prisma`, `prisma/migrations/` |
| Логин и разбор токена: отказ при удалённом сотруднике | `auth.controller.ts`, `utils/auth-token.ts`, `utils/auth-context.ts` |
| `listEmployees`: скрывать удалённых по умолчанию; опционально флаг для аудита | `server/pdf-parser/src/controllers/admin.controller.ts` |
| Валидация маршрутов (день 2): нельзя назначить удалённого сотрудника на шаг | `approval-routes.controller.ts` |
| Политика email при soft delete (суффикс / запрет повтора) — зафиксировать в коде или комментарии | `admin.controller.ts` |

**Обоснование:** Dev1 на дне 6 подготовил отображение; день 7 наполняет данными.

**DoD:** удалённый пользователь не логинится; в маршрутах нельзя выбрать удалённого.

---

## День 8 — **Dev2**

**Тема:** блокировка мутаций при временном пароле.

| Задача | Файлы / место |
|--------|----------------|
| Middleware `requirePasswordNotTemporary` | `server/pdf-parser/src/middleware/requirePasswordNotTemporary.ts` |
| Прокинуть флаг `is_temporary_password` в контекст после `requireAuth` при необходимости | `middleware/requireAuth.ts`, `types/express.d.ts` |
| Подключить ко всем мутациям кроме `POST /users/me/change-password` (и разрешить `GET /users/me`) | `server/pdf-parser/src/routes.ts` |
| Ответ **403** с `{ code: "PASSWORD_CHANGE_REQUIRED" }` | middleware |
| Клиент: response interceptor → редирект/модалка смены пароля | `client/pdf-parser-ui/src/shared/api/index.ts` |

**Обоснование:** централизованная политика без правок каждого контроллера Dev1 вручную.

**DoD:** с временным паролем не проходят POST к `/documents`, `/approvals`; проходит `change-password`.

---

## День 9 — **Dev2**

**Тема:** уведомления — хранилище и API чтения.

| Задача | Файлы / место |
|--------|----------------|
| Таблица `notifications` + `insertNotification` (без падения процесса при ошибке) | `server/pdf-parser/src/services/NotificationService.ts` (новый) или расширение `ApprovalDomainService` |
| `GET /api/notifications`, `GET /api/notifications/unread-count` | `server/pdf-parser/src/controllers/notifications.controller.ts`, `routes.ts` |
| Экспорт функции вставки для вызова из контроллеров Dev1 | `NotificationService.ts` |

**Обоснование:** Dev1 на дне 10 только вызывает готовый insert и при желании бейдж на фронте.

**DoD:** пустая лента и count=0 без ошибок; ручная вставка в БД отображается через GET.

---

## День 10 — **Dev1**

**Тема:** события → уведомления + UI выбора маршрута при submit.

| Задача | Файлы / место |
|--------|----------------|
| Вызовы `insertNotification` после ключевых операций в `documents.controller.ts` и `approvals.controller.ts` | согласовать типы событий с днём 9 |
| Фронт: при отправке на согласование передавать `routeId` в теле submit | страницы/модалки «Мои документы», `shared/api/index.ts` — метод submit с body |
| Загрузка списка маршрутов через API дня 2 (`company/approval-routes`) для выбора в UI | соответствующий компонент в `client/pdf-parser-ui/src/pages/` |

**Обоснование:** события принадлежат доменной логике Dev1; хранилище уже есть.

**DoD:** после submit у получателя растёт unread count; в ленте есть запись (если тип настроен).

---

## День 11 — **Dev2**

**Тема:** админка сотрудников — редактирование и сброс пароля.

| Задача | Файлы / место |
|--------|----------------|
| `PATCH /api/admin/employees/:id`, `POST /api/admin/employees/:id/reset-password` | `server/pdf-parser/src/controllers/admin.controller.ts`, `routes.ts` |
| bcrypt, `is_temporary_password = 1` на reset | `utils/passwords.ts` (как уже принято) |
| Клиент: `adminApi` + кнопки на `AdminPanelPage` | `shared/api/index.ts`, `AdminPanelPage.tsx` |

**Обоснование:** не блокирует маршруты и согласования; логично завершить зону админки после уведомлений и парольной политики.

**DoD:** сброс пароля выставляет временный флаг; пользователь упирается в middleware дня 8 до смены пароля.

---

## Сводка: кто в какой день

| День | Разработчик |
|------|-------------|
| 1 | Dev2 |
| 2 | Dev2 |
| 3 | Dev2 |
| 4 | Dev1 |
| 5 | Dev1 |
| 6 | Dev1 |
| 7 | Dev2 |
| 8 | Dev2 |
| 9 | Dev2 |
| 10 | Dev1 |
| 11 | Dev2 |

**Итого:** Dev2 — **7 дней**, Dev1 — **4 дня**. Пересечений по одновременной работе над одной кодовой базой нет: каждый день владеет кодом один человек.

---

## Что сознательно вынесено за пределы 11 дней

- JPG/PNG в парсере, CI, отдельный полный регресс, деплой — по отдельным задачам.
- Rate limit / security headers — по беклогу Dev2 после MVP маршрутов и auth.

---

*Файл сгенерирован для согласования спринта; при смене состава дней обновите таблицу и DoD.*
