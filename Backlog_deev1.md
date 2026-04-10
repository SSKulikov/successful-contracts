вот структурированный backlog именно для Dev1 (твоя зона), разбитый на этапы и подзадачи так, чтобы можно было идти итеративно.

0) Tech decisions (зафиксировано перед стартом)
0.1. Подход к БД
Идём через raw SQL в стиле текущего проекта (`employees`/`auth_sessions`) с `ensure*Table` и инкрементальными `ALTER`.
Prisma-модели для approval-домена — отдельным этапом после стабилизации ядра.
0.2. Канон статусов
В БД и API используем статусы в `snake_case`: `in_approval`, `revision`, `rejected`, `approved`.
На фронте отображаем русские лейблы через централизованный маппинг.
0.3. Форматы файлов на 1-й итерации
Для автозаполнения и загрузки в рамках первой итерации — `PDF/DOCX`.
`JPG/PNG` оставляем на отдельный инкремент после ядра согласований.
0.4. Экспорт
Сразу целевой endpoint: `GET /api/documents/export.xlsx`.
Фронт и бэк синхронизируются на этот контракт (включая колонку со ссылкой через `PUBLIC_APP_URL`).

1) База и доменная модель документов
1.1. Таблицы и статусы
Создать таблицу approval_documents:
id, company_id, type, number, date, customer_name, customer_inn, executor_name, executor_inn, amount, subject, note
status (in_approval, revision, rejected, approved)
created_by, last_edited_by, created_at, updated_at
Создать таблицу approval_document_events (история):
document_id, actor_id, event_type, comment, payload_json, created_at
Создать таблицу approval_tasks:
document_id, route_id, step_order, assignee_user_id, status, decision_comment, created_at, updated_at
Индексы:
по company_id, status, created_by, assignee_user_id, created_at
1.2. Совместимость с текущим кодом
Не ломать contract + parse-file/save-data-info
Добавить отдельный слой для новой сущности документов согласования
2) Backend API: документы
2.1. Создание и чтение
POST /api/documents
создание документа вручную из формы
валидация обязательных полей
запись события document_created
GET /api/documents/my
выборка “мои документы”: где пользователь инициатор или автор последней доработки
фильтры: status, type, date_from/date_to
поиск: number, counterparty(customer/executor), inn
GET /api/documents/:id
карточка документа + текущий этап + история
2.2. Редактирование доработки
PATCH /api/documents/:id
разрешить редактирование только в статусе revision и только инициатору/последнему редактору
записывать событие document_updated
2.3. Отправка/переотправка
POST /api/documents/:id/submit
первый запуск в маршрут
POST /api/documents/:id/resubmit
после доработки запуск с первого этапа
очистка старых активных задач/создание нового цикла
событие document_resubmitted
3) Backend API: согласования
3.1. Мои задачи
GET /api/approvals/my
только задачи, назначенные текущему сотруднику
только активные/ожидающие решения
3.2. Действия
POST /api/approvals/:taskId/approve
завершение шага, переход на следующий
если шаг последний -> approved
POST /api/approvals/:taskId/reject
статус документа rejected
POST /api/approvals/:taskId/revise
обязательный comment (400 если пусто)
статус документа revision, возврат инициатору
3.3. История и аудит
На каждое действие писать событие в approval_document_events
Отображать actor + comment + timestamp
4) Redis-кэш (read-through)
4.1. Инфраструктура кэша
Модуль cache/redis.ts (getJson/setJson/del)
Graceful fallback при недоступном Redis
4.2. Где кэшировать
GET /api/documents/:id (ключ doc:{companyId}:{id})
Опционально GET /api/documents/my (ключ с query-хэшем)
4.3. Инвалидация
Инвалидировать ключи документа при:
edit, submit, approve/reject/revise, resubmit
5) Экспорт Excel
5.1. Endpoint
GET /api/documents/export.xlsx
выборка только из “Мои документы” (или “все по компании” для admin — по роли)
формат .xlsx
5.2. Состав колонок
Тип, Номер, Дата, Контрагент, ИНН, Сумма, Статус, Ссылка
В Ссылка — прямой URL: ${PUBLIC_APP_URL}/documents/:id
6) Frontend: Мои документы
6.1. Переход с моков на API
Подключить реальные documentsApi.* по флагу
Таблица + фильтры + поиск по ТЗ
6.2. Создание документа
Кнопка Загрузить документы/Создать
Модалка с единым набором полей:
тип, номер, дата, заказчик/ИНН, исполнитель/ИНН, сумма, предмет, примечание
Кнопка Отправить на согласование
6.3. Доработка
Для revision показать Редактировать + Повторно отправить
Корректные проверки прав на UI
7) Frontend: В работе (бывш. Мои согласования)
7.1. Список задач
Подключить GET /approvals/my
Пагинация, фильтры, статусы, текущий этап
7.2. Действия
Согласовать, Отклонить, На доработку
Для “На доработку” обязательное модальное поле комментария
8) Frontend: карточка документа
8.1. Детали
Реальные данные из GET /documents/:id
Показ статуса, этапа, базовых полей
8.2. История
Лента событий с автором/комментарием/датой
Поддержка кейса “Удалённый пользователь” (по данным от Dev2)
8.3. Действия из карточки
approve/reject/revise/resubmit в зависимости от роли и статуса
9) Интеграция с AI-парсером (без ломки существующего)
9.1. UX автозаполнения
В форме создания документа: загрузка файла -> parse-file -> автоподстановка полей
Пользователь может вручную поправить перед отправкой
9.2. Поддержка форматов
Текущий минимум: PDF/DOCX
Дальше: JPG/PNG (если добавляется в рамках итерации)
10) Тесты/проверки Dev1 (минимум на каждый этап)
API smoke:
create -> submit -> approve/revise/reject -> resubmit
Проверка прав:
сотрудник видит только свои approvals
редактирование только в revision
Redis:
cache hit/miss + invalidation
Front:
no mock paths for ключевые сценарии
корректные ошибки и loading states
Рекомендуемый порядок реализации (чтобы быстро получать результат)
БД + POST/GET documents
submit + approvals/my
approve/reject/revise (с comment)
resubmit с шага 1
frontend Мои документы + В работе на реальном API
карточка + история
Excel export
Redis caching
AI-автозаполнение в форме
полировка и регресс-проход