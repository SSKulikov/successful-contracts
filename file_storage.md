# File Storage Migration Plan (Yandex Object Storage + VPS MySQL, без RabbitMQ)

Этот документ описывает практический переход от локальной папки `storage` и локальной БД проекта к внешней схеме:
- файлы в S3-совместимом Object Storage;
- метаданные и статусы во внешней `MySQL` на VPS;
- без RabbitMQ на текущем этапе.

---

## 1. Цель и результат этапа

### Сейчас
- Файлы и текстовые версии лежат в локальной `storage`.
- Данные по документам завязаны на инфраструктуру проекта.
- При росте нагрузки заполняется диск сервера и растут риски деградации.

### После внедрения
- Файлы хранятся в Object Storage (S3 API).
- Метаданные/статусы документов хранятся во внешней БД MySQL на VPS.
- Backend выдает presigned URL и управляет статусовкой.
- Парсинг пока остается без очередей: синхронно или через существующий внутренний вызов.
- Локальная `storage` не используется как постоянное хранилище.

---

## 2. Целевая архитектура (текущий этап)

Поток:
1. Клиент запрашивает URL для загрузки у backend.
2. Backend создает `documentId`, `objectKey`, запись во внешней MySQL и возвращает `presigned PUT URL`.
3. Клиент загружает файл напрямую в S3.
4. Клиент вызывает `POST /documents/:id/complete`.
5. Backend делает `headObject`, подтверждает upload и запускает парсинг без RabbitMQ.
6. Backend сохраняет результат и статус во внешней MySQL.

Компоненты:
- `API backend` — auth, валидация, presigned URL, запуск парсинга.
- `Object Storage` — хранение оригиналов и результатов.
- `VPS MySQL` — внешнее хранение метаданных и статусов.

---

## 3. Структура данных (VPS MySQL)

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

## 4. VPS MySQL — практические ограничения

Что подходит:
- внешняя БД уже поднята на VPS;
- backend подключается через `DATABASE_URL`;
- Prisma migrations применяются к целевой БД.

Что учесть заранее:
- следить за доступностью VPS, бэкапами и обновлениями MySQL;
- ограничить доступ к порту MySQL только нужными IP;
- контролировать лимиты соединений и тяжелые запросы;
- настроить регулярные backups/restore-runbook.

Правила для проекта:
- runtime backend подключать через `DATABASE_URL`;
- миграции запускать той же строкой подключения через Prisma;
- в БД хранить метаданные/статусы, а большие бинарные данные и тяжелые результаты — в S3;
- добавить простые ретраи на транзиентные DB-ошибки.

---

## 5. Изменения в backend API

1. `POST /documents/upload-url`
   - Вход: `fileName`, `mimeType`, `sizeBytes`
   - Выход: `documentId`, `objectKey`, `uploadUrl`, `headers`
   - Действия:
     - валидация размера/типа;
     - создание записи в `documents` со статусом `uploaded` во внешней MySQL;
     - генерация presigned URL.

2. `POST /documents/:id/complete`
   - `headObject` проверка факта загрузки;
   - сверка размера/типа;
   - перевод статуса в `processing`;
   - запуск парсинга (без RabbitMQ);
   - запись результата;
   - статус `done` или `failed`.

3. `GET /documents/:id/status`
   - Возвращает статус и ошибку обработки из внешней MySQL.

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
- статус документа обновляется во внешней MySQL до/после обработки.

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

# VPS MySQL
DATABASE_URL=mysql://USER:PASSWORD@VPS_HOST:3306/docflow
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

# VPS MySQL
DATABASE_URL=mysql://USER:PASSWORD@VPS_HOST:3306/docflow
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
4. Подготовить внешнюю MySQL на VPS и применить миграции схемы.
5. Перенести таблицы документов/статусов из локальной БД во внешнюю MySQL (батчами).
6. Переключить backend на VPS MySQL `DATABASE_URL`.
7. Перевести read-path полностью на S3.
8. Оставить fallback и rollback-план на переходный период.
9. Удалить legacy-файлы после верификации.

---

## 10. Rollout по этапам

### Этап 0 — Инфраструктура
- [x] Выбрать провайдера S3 (`Yandex Object Storage` для prod, `MinIO` для local).
- [x] Создать `contracts-raw` и `contracts-processed`.
- [x] Создать сервисный аккаунт (`sa-contracts-storage`) и выдать роли Object Storage.
- [x] Создать access key / secret key.
- [x] Выдать сервисному аккаунту права на KMS-ключи бакетов (`kms.keys.encrypterDecrypter`).
- [x] Настроить lifecycle и CORS.
- [x] Подключить backend к внешней VPS MySQL через `DATABASE_URL`.
- [x] Применить Prisma migrations к VPS MySQL.
- [x] Пройти S3 smoke-test (`list/upload/head/download/delete`).

### Этап 1 — Схема и backend
- Добавить миграции `documents` и `document_contents`.
- Применить миграции во внешней MySQL.
- Добавить `StorageService` + `S3StorageService`.
- Реализовать `POST /documents/upload-url`.
- Реализовать `POST /documents/:id/complete`.
- Реализовать `GET /documents/:id/status`.
- Реализовать `GET /documents/:id/download-url`.

### Этап 2 — Стабилизация обработки
- Ограничить размер файла и timeout.
- Обработать повторные вызовы `complete` (идемпотентность).
- Логировать и сохранять причины `failed`.
- Проверить работу при ограничениях VPS MySQL и Object Storage.

### Этап 3 — Миграция и cleanup
- Включить dual-read.
- Мигрировать старые файлы.
- Мигрировать данные документов во внешнюю MySQL.
- Отключить постоянное хранение в локальной `storage`.
- Отключить локальную БД как источник правды по документам.

---

## 11. TODO лист (без RabbitMQ, с VPS MySQL)

### Этап 0 — Подготовка S3
- [x] Выбрать провайдера S3 (`Yandex Object Storage` для prod, `MinIO` для local).
- [x] Создать bucket `contracts-raw`.
- [x] Создать bucket `contracts-processed`.
- [x] Создать сервисный аккаунт `sa-contracts-storage`.
- [x] Выдать роли Object Storage (`storage.editor`, `storage.admin`, `storage.uploader` на этапе настройки).
- [x] Создать статические ключи доступа.
- [x] Настроить KMS-доступ для `sa-contracts-storage` на оба KMS-ключа бакетов.
- [x] Настроить lifecycle policy.
- [x] Настроить CORS для локального фронта (`http://localhost:5173`, `http://localhost:3000`).
- [x] Пройти smoke-test (list/upload/head/download/delete).

### Этап 1 — Подготовка VPS MySQL
- [x] Поднять/подключить внешнюю MySQL на VPS.
- [x] Получить и прописать `DATABASE_URL`.
- [x] Проверить подключение Prisma к VPS MySQL.
- [x] Применить Prisma migrations к VPS MySQL.
- [x] Добавить секреты VPS MySQL и S3 в локальный env.
- [ ] Добавить production secrets VPS MySQL и S3 в env/CI перед деплоем.
- [x] Проверить runtime-запуск backend и запросы к VPS MySQL.

### Этап 2 — Модель данных
- [x] Добавить migration таблицы `documents`.
- [x] Добавить migration таблицы `document_contents`.
- [x] Добавить индексы (`object_key`, `status`, `owner_id`).
- [x] Добавить статусы `uploaded|processing|done|failed`.
- [x] Применить миграции во внешней MySQL.

### Этап 3 — Backend и storage
- [x] Создать интерфейс `StorageService`.
- [x] Реализовать `S3StorageService`.
- [x] Оставить `LocalStorageService` для fallback/dev.
- [x] Переключить работу с БД документов на VPS MySQL.
- [x] Реализовать `POST /documents/upload-url`.
- [x] Реализовать `POST /documents/:id/complete`.
- [x] Реализовать `GET /documents/:id/status`.
- [x] Реализовать `GET /documents/:id/download-url`.

### Этап 4 — Обработка документов
- [x] Подключить вызов `pdf-parser` без RabbitMQ.
- [x] Перед обработкой ставить `processing`.
- [x] На успехе ставить `done`.
- [x] На ошибке ставить `failed` + `processing_error`.
- [x] Добавить timeout обработки.
- [x] Добавить лимит максимального размера файла.
- [x] Добавить идемпотентность повторного `complete`.

### Этап 5 — Миграция legacy storage и локальной БД
- [x] Включить dual-read (`S3 -> local fallback`).
- [x] Переключить новые загрузки на S3.
- [x] Мигрировать старые файлы из локальной `storage`.
- [x] Сверить checksum/размер после переноса.
- [ ] Мигрировать метаданные документов во внешнюю MySQL.
- [ ] Проверить целостность данных (count/status/checksum).
- [ ] Переключить чтение полностью на S3.
- [ ] Удалить legacy-файлы после периода наблюдения.

### Этап 6 — Тестирование и запуск
- [ ] Добавить production secrets VPS MySQL и S3 в env/CI перед деплоем.
- [ ] E2E: upload -> complete -> processing -> done.
- [ ] E2E: upload -> complete -> failed (контролируемая ошибка).
- [ ] Нагрузочный тест на конкурентные загрузки.
- [ ] Проверить ограничения VPS MySQL и Object Storage в пиковых сценариях.
- [ ] Проверить рост локального диска (не должен расти от документов).
- [ ] Выкатить поэтапно в прод.

---

## 12. Definition of Done (текущий этап)

- Файлы хранятся в S3, а не в локальной `storage`.
- Метаданные и статусы документов хранятся во внешней VPS MySQL.
- Upload идет через presigned URL.
- Статусы обработки отражаются через API (`processing/done/failed`).
- Legacy-данные мигрированы и проверены.
- Локальный диск не растет как постоянное файловое хранилище.
- Локальная БД проекта не является источником правды по документам.
- RabbitMQ на этом этапе не используется.
