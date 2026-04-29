# File Storage Migration Plan (S3 + Supabase PostgreSQL, без RabbitMQ)

Этот документ описывает практический переход от локальной папки `storage` и локальной БД проекта к внешней схеме:
- файлы в S3-совместимом Object Storage;
- метаданные и статусы в `PostgreSQL` на Supabase (free tier);
- без RabbitMQ на текущем этапе.

---

## 1. Цель и результат этапа

### Сейчас
- Файлы и текстовые версии лежат в локальной `storage`.
- Данные по документам завязаны на инфраструктуру проекта.
- При росте нагрузки заполняется диск сервера и растут риски деградации.

### После внедрения
- Файлы хранятся в Object Storage (S3 API).
- Метаданные/статусы документов хранятся во внешней БД Supabase Postgres.
- Backend выдает presigned URL и управляет статусовкой.
- Парсинг пока остается без очередей: синхронно или через существующий внутренний вызов.
- Локальная `storage` не используется как постоянное хранилище.

---

## 2. Целевая архитектура (текущий этап)

Поток:
1. Клиент запрашивает URL для загрузки у backend.
2. Backend создает `documentId`, `objectKey`, запись в Supabase и возвращает `presigned PUT URL`.
3. Клиент загружает файл напрямую в S3.
4. Клиент вызывает `POST /documents/:id/complete`.
5. Backend делает `headObject`, подтверждает upload и запускает парсинг без RabbitMQ.
6. Backend сохраняет результат и статус в Supabase.

Компоненты:
- `API backend` — auth, валидация, presigned URL, запуск парсинга.
- `Object Storage` — хранение оригиналов и результатов.
- `Supabase PostgreSQL` — внешнее хранение метаданных и статусов.

---

## 3. Структура данных (Supabase PostgreSQL)

### `documents`
- `id` (uuid, pk)
- `owner_id`
- `storage_provider` (`s3|minio`)
- `bucket`
- `object_key` (unique)
- `original_name`
- `mime_type`
- `size_bytes`
- `checksum_sha256` (nullable)
- `processing_status` (`uploaded|processing|done|failed`)
- `processing_error` (nullable)
- `created_at`, `updated_at`

### `document_contents`
- `document_id` (fk -> `documents.id`)
- `text_content` (если храните текст в БД)
- `processed_bucket` (nullable)
- `processed_object_key` (nullable)
- `version`
- `extracted_at`

Индексы:
- `documents(object_key)` unique
- `documents(processing_status, created_at)`
- `documents(owner_id, created_at)`

---

## 4. Supabase Free Plan — практические ограничения

Что подходит:
- хороший вариант старта для внешней БД без администрирования своего Postgres;
- быстрый запуск и удобные миграции.

Что учесть заранее:
- ограниченные ресурсы free tier;
- ограничения на соединения;
- чувствительность к тяжелым запросам/большим батчам.

Правила для проекта:
- runtime backend подключать через pooled URL (`DATABASE_URL`);
- миграции запускать через direct URL (`DIRECT_URL`);
- использовать SSL (`sslmode=require`);
- в БД хранить метаданные/статусы, а большие бинарные данные и тяжелые результаты — в S3;
- добавить простые ретраи на транзиентные DB-ошибки.

---

## 5. Изменения в backend API

1. `POST /documents/upload-url`
   - Вход: `fileName`, `mimeType`, `sizeBytes`
   - Выход: `documentId`, `objectKey`, `uploadUrl`, `headers`
   - Действия:
     - валидация размера/типа;
     - создание записи в `documents` со статусом `uploaded` в Supabase;
     - генерация presigned URL.

2. `POST /documents/:id/complete`
   - `headObject` проверка факта загрузки;
   - сверка размера/типа;
   - перевод статуса в `processing`;
   - запуск парсинга (без RabbitMQ);
   - запись результата;
   - статус `done` или `failed`.

3. `GET /documents/:id/status`
   - Возвращает статус и ошибку обработки из Supabase.

4. `GET /documents/:id/download-url`
   - Возвращает presigned URL на скачивание оригинала или результата.

---

## 6. Storage слой (обязательная абстракция)

Интерфейс `StorageService`:
- `getPresignedUploadUrl(params)`
- `getPresignedDownloadUrl(params)`
- `headObject(params)`
- `deleteObject(params)`
- `getObjectStream(params)`
- `putObject(params)` (если результат сохраняется в S3)

Реализации:
- `S3StorageService` (prod)
- `LocalStorageService` (legacy/dev fallback)

Принцип:
- бизнес-логика работает через интерфейс, а не через прямые SDK-вызовы.

---

## 7. Обработка документов без RabbitMQ

На данном этапе:
- запуск обработки происходит в `POST /documents/:id/complete`;
- backend вызывает текущий `pdf-parser` напрямую;
- статус документа обновляется в Supabase до/после обработки.

Важно:
- ограничить размер входного файла;
- поставить timeout обработки;
- сделать идемпотентность повторного `complete`.

---

## 8. Переменные окружения (`.env`)

### Backend (`server/.env.example`)

```env
# Storage
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_BUCKET_RAW=contracts-raw
S3_BUCKET_PROCESSED=contracts-processed
S3_ACCESS_KEY_ID=__SET_ME__
S3_SECRET_ACCESS_KEY=__SET_ME__
S3_FORCE_PATH_STYLE=false
S3_PRESIGNED_UPLOAD_TTL_SEC=900
S3_PRESIGNED_DOWNLOAD_TTL_SEC=900

# Parser limits
PARSER_MAX_FILE_MB=30
PARSER_JOB_TIMEOUT_MS=120000

# Supabase PostgreSQL
DATABASE_URL=postgresql://postgres.__PROJECT_REF__:__PASSWORD__@aws-0-xx.pooler.supabase.com:6543/postgres?sslmode=require
DIRECT_URL=postgresql://postgres:__PASSWORD__@db.__PROJECT_REF__.supabase.co:5432/postgres?sslmode=require
```

### `server/pdf-parser/.env.example`

```env
# Storage
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_BUCKET_RAW=contracts-raw
S3_BUCKET_PROCESSED=contracts-processed
S3_ACCESS_KEY_ID=__SET_ME__
S3_SECRET_ACCESS_KEY=__SET_ME__
S3_FORCE_PATH_STYLE=false

# Supabase (если parser пишет результат/статус в БД)
DATABASE_URL=postgresql://postgres.__PROJECT_REF__:__PASSWORD__@aws-0-xx.pooler.supabase.com:6543/postgres?sslmode=require
```

Важно:
- реальные ключи хранить только в secrets/env;
- не коммитить секреты в git.

---

## 9. Миграция `storage` и данных БД без даунтайма

1. Включить dual-read:
   - сначала поиск в S3;
   - если нет — fallback в локальную `storage`.
2. Все новые загрузки писать сразу в S3.
3. Запустить миграционный скрипт файлов:
   - пройти по локальным файлам;
   - загрузить в S3;
   - обновить `bucket/object_key` в БД;
   - сверить checksum/размер.
4. Создать Supabase проект и применить миграции схемы.
5. Перенести таблицы документов/статусов из локальной БД в Supabase (батчами).
6. Переключить backend на Supabase `DATABASE_URL`.
7. Перевести read-path полностью на S3.
8. Оставить fallback и rollback-план на переходный период.
9. Удалить legacy-файлы после верификации.

---

## 10. Rollout по этапам

### Этап 0 — Инфраструктура
- Выбрать провайдера S3 (`Yandex Object Storage` для prod, `MinIO` для local).
- Создать `contracts-raw` и `contracts-processed`.
- Создать сервисный аккаунт (`sa-contracts-storage`) и выдать `storage.editor`.
- Создать access key / secret key.
- Настроить lifecycle и CORS (при необходимости).
- Создать проект в Supabase (free) и получить `DATABASE_URL`/`DIRECT_URL`.
- Проверить подключение backend к Supabase.

### Этап 1 — Схема и backend
- Добавить миграции `documents` и `document_contents`.
- Применить миграции в Supabase.
- Добавить `StorageService` + `S3StorageService`.
- Реализовать `POST /documents/upload-url`.
- Реализовать `POST /documents/:id/complete`.
- Реализовать `GET /documents/:id/status`.
- Реализовать `GET /documents/:id/download-url`.

### Этап 2 — Стабилизация обработки
- Ограничить размер файла и timeout.
- Обработать повторные вызовы `complete` (идемпотентность).
- Логировать и сохранять причины `failed`.
- Проверить работу при ограничениях Supabase free tier.

### Этап 3 — Миграция и cleanup
- Включить dual-read.
- Мигрировать старые файлы.
- Мигрировать данные документов в Supabase.
- Отключить постоянное хранение в локальной `storage`.
- Отключить локальную БД как источник правды по документам.

---

## 11. TODO лист (без RabbitMQ, с Supabase)

### Этап 0 — Подготовка S3
- [ ] Выбрать провайдера S3 (`Yandex` для prod, `MinIO` для local).
- [ ] Создать bucket `contracts-raw`.
- [ ] Создать bucket `contracts-processed`.
- [ ] Создать сервисный аккаунт `sa-contracts-storage`.
- [ ] Выдать роль `storage.editor`.
- [ ] Создать статические ключи доступа.
- [ ] Настроить lifecycle policy.
- [ ] Настроить CORS (если загрузка из браузера).
- [ ] Пройти smoke-test (upload/head/download/delete).

### Этап 1 — Подготовка Supabase
- [ ] Создать проект Supabase (free).
- [ ] Получить `DATABASE_URL` (pooler) и `DIRECT_URL` (direct).
- [ ] Проверить подключение с `sslmode=require`.
- [ ] Добавить секреты Supabase в env/CI.
- [ ] Проверить лимиты free tier под ожидаемую нагрузку.

### Этап 2 — Модель данных
- [ ] Добавить migration таблицы `documents`.
- [ ] Добавить migration таблицы `document_contents`.
- [ ] Добавить индексы (`object_key`, `status`, `owner_id`).
- [ ] Добавить статусы `uploaded|processing|done|failed`.
- [ ] Применить миграции в Supabase.

### Этап 3 — Backend и storage
- [ ] Создать интерфейс `StorageService`.
- [ ] Реализовать `S3StorageService`.
- [ ] Оставить `LocalStorageService` для fallback/dev.
- [ ] Переключить работу с БД документов на Supabase.
- [ ] Реализовать `POST /documents/upload-url`.
- [ ] Реализовать `POST /documents/:id/complete`.
- [ ] Реализовать `GET /documents/:id/status`.
- [ ] Реализовать `GET /documents/:id/download-url`.

### Этап 4 — Обработка документов
- [ ] Подключить вызов `pdf-parser` без RabbitMQ.
- [ ] Перед обработкой ставить `processing`.
- [ ] На успехе ставить `done`.
- [ ] На ошибке ставить `failed` + `processing_error`.
- [ ] Добавить timeout обработки.
- [ ] Добавить лимит максимального размера файла.
- [ ] Добавить идемпотентность повторного `complete`.

### Этап 5 — Миграция legacy storage и локальной БД
- [ ] Включить dual-read (`S3 -> local fallback`).
- [ ] Переключить новые загрузки на S3.
- [ ] Мигрировать старые файлы из локальной `storage`.
- [ ] Сверить checksum/размер после переноса.
- [ ] Мигрировать метаданные документов в Supabase.
- [ ] Проверить целостность данных (count/status/checksum).
- [ ] Переключить чтение полностью на S3.
- [ ] Удалить legacy-файлы после периода наблюдения.

### Этап 6 — Тестирование и запуск
- [ ] E2E: upload -> complete -> processing -> done.
- [ ] E2E: upload -> complete -> failed (контролируемая ошибка).
- [ ] Нагрузочный тест на конкурентные загрузки.
- [ ] Проверить ограничения Supabase free tier в пиковых сценариях.
- [ ] Проверить рост локального диска (не должен расти от документов).
- [ ] Выкатить поэтапно в прод.

---

## 12. Definition of Done (текущий этап)

- Файлы хранятся в S3, а не в локальной `storage`.
- Метаданные и статусы документов хранятся в Supabase PostgreSQL.
- Upload идет через presigned URL.
- Статусы обработки отражаются через API (`processing/done/failed`).
- Legacy-данные мигрированы и проверены.
- Локальный диск не растет как постоянное файловое хранилище.
- Локальная БД проекта не является источником правды по документам.
- RabbitMQ на этом этапе не используется.
