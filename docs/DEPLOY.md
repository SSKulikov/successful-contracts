# Деплой (staging и production)

Этот документ — **опорная спецификация выкладки**: артефакты сборки фронта и бэка, согласование URL (в т.ч. staging), критичные переменные окружения и миграции БД. Инфраструктура **Docker Compose** и **Dockerfile** API уже лежат в репозитории; ниже указано, как они стыкуются с ручным деплоем и с облаком.

**Шаблоны env в репозитории (не коммитить секреты вместо них):**

| Файл | Назначение |
|------|------------|
| `docker.env.example` | Скопировать в `.env` в **корне репозитория** рядом с `docker-compose.yml` для локального стека MySQL + Redis + API |
| `server/pdf-parser/.env.example` | Подсказка по `DATABASE_URL` и legacy-парсеру для **локального** запуска API вне Docker |

---

## Краткая сводка

| Компонент | Каталог | Сборка | Артефакт выкладки |
|-----------|---------|--------|-------------------|
| **API (Node)** | `server/pdf-parser` | `npm ci` → `npm run build` | Каталог **`dist/`** (скомпилированный TS → JS). Запуск: `node dist/index.js`. Порт по умолчанию **3003** (`src/index.ts`). Перед первым запуском на чистой БД: **`npm run migrate:deploy`** (см. раздел «Миграции»). |
| **SPA (Vite)** | `client/pdf-parser-ui` | `npm ci` → `npm run build` | Каталог **`dist/`** (статика: `index.html`, `assets/*`). Отдаётся nginx/Caddy/S3/любым static host; **не** содержит секретов — URL API зашивается **на этапе сборки** через `VITE_*`. |

**Критично для работы «фронт → API»:** во **frontend build** попадает `VITE_API_URL` (должен быть доступен с браузера пользователя). На **backend** в staging/prod задаются `DATABASE_URL`, при использовании кэша — `REDIS_URL`, для браузерных запросов к API — `CORS_ORIGIN` (совпадает с origin SPA).

---

## URL и маршрутизация

HTTP API монтируется под префиксом **`/api`** (см. `server/pdf-parser/src/index.ts`: `app.use("/api", fileRoutes)`). Health доступен и без префикса: `GET /health` и `GET /api/health`.

| Сценарий | Фронт (куда заходит пользователь) | Значение `VITE_API_URL` (в билде фронта) |
|----------|-----------------------------------|------------------------------------------|
| Локально, API на 3003 | `http://localhost:5173` (Vite dev) | `http://localhost:3003/api` |
| Локально, API из Docker (порт хоста 3004) | `http://localhost:5173` | `http://localhost:3004/api` |
| Staging / production (один домен, reverse proxy) | `https://staging-app.example.com` | `https://staging-app.example.com/api` |
| Staging / production (API на отдельном поддомене) | `https://staging-app.example.com` | `https://staging-api.example.com/api` |

Подставьте свои домены; для SPA **всегда** указывайте базовый URL **вместе с суффиксом `/api`**, если бэкенд отдаёт маршруты именно так (как в этом проекте).

---

## Переменные окружения

Секреты и URL staging храните в **секретах CI**, **переменных платформы** (K8s, ECS) или в `.env` на сервере **вне git**.

### Backend — процесс Node (`server/pdf-parser`)

Загружаются из окружения процесса; локально удобен файл **`.env`** в `server/pdf-parser` (см. **`server/pdf-parser/.env.example`**).

| Переменная | Обязательность | Назначение |
|------------|----------------|------------|
| `DATABASE_URL` | **Да** | Строка Prisma/MySQL, например `mysql://USER:PASSWORD@HOST:3306/DB_NAME` |
| `REDIS_URL` | Рекомендуется | Кэш документов (`redis://...` / `rediss://...`). Без неё — деградация на прямые запросы в БД |
| `CORS_ORIGIN` | Рекомендуется на staging/prod | Origin фронта для `Access-Control-Allow-Origin` (можно несколько через **запятую**). Если **не задан** — разрешены запросы с любого origin (удобно для локальной разработки) |
| `PUBLIC_APP_URL` | Рекомендуется | Публичный базовый URL веб-приложения **без** завершающего `/`; ссылки в экспорте Excel и т.п. |
| `JWT_SECRET` | Опционально | Заготовка под JWT; текущая авторизация — сессии в `auth_sessions` |

Дополнительно в **`server/pdf-parser/.env.example`**: `OAUTH_TOKEN`, `GIGA_CHAT_ACCESS_KEY` и др. — **legacy / парсер**, смотрите комментарии в файле.

### Frontend — только на этапе сборки (`client/pdf-parser-ui`)

Переменные с префиксом **`VITE_`** встраиваются в бандл; отдельного `.env` в репозитории для фронта нет — задайте их в CI или в командной строке перед `npm run build`.

| Переменная | Назначение |
|------------|------------|
| `VITE_API_URL` | Базовый URL API **с** суффиксом `/api`, например `https://staging-app.example.com/api` |
| `VITE_USE_MOCK_API` | На реальном API: **`false`** |
| `VITE_USE_MOCK_ADMIN_API` | Когда админка ходит в бэкенд: **`false`** |
| `VITE_USE_MOCK_PROFILE_API` | Когда профиль из API: **`false`** |

Пример сборки фронта для staging:

```bash
cd client/pdf-parser-ui
VITE_API_URL=https://staging-app.example.com/api \
VITE_USE_MOCK_API=false \
VITE_USE_MOCK_ADMIN_API=false \
VITE_USE_MOCK_PROFILE_API=false \
npm run build
```

Артефакт: **`client/pdf-parser-ui/dist/`** — целиком выкладывается на хостинг статики.

### Docker Compose — переменные для `docker compose` (корень репозитория)

Копирование: **`cp docker.env.example .env`**. Подставляются в `docker-compose.yml` при `docker compose up`.

| Переменная | Назначение |
|------------|------------|
| `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE` | Учётные данные MySQL в контейнере |
| `MYSQL_PORT` | Порт MySQL на **хосте** (по умолчанию 3307, чтобы не конфликтовать с локальным :3306) |
| `REDIS_PORT` | Порт Redis на хосте |
| `API_PORT` | Порт API на **хосте** (внутри контейнера API слушает 3003; с хоста часто **3004**) |
| `PUBLIC_APP_URL`, `CORS_ORIGIN` | Проброс в контейнер `api` (ссылки и CORS; для dev часто `http://localhost:5173`) |
| `JWT_SECRET` | Заготовка под подписи |
| `ADMINER_PORT` | Порт Adminer при профиле `tools` |

Строка **`DATABASE_URL`** для сервиса `api` в compose задаётся **в `docker-compose.yml`** (подключение к `mysql`), а не в `docker.env.example` — при переносе в облако задайте аналогичный `DATABASE_URL` на процесс Node.

---

## Docker Compose: API + MySQL + Redis

В корне репозитория лежит **`docker-compose.yml`**: поднимает **бэкенд** (образ из **`server/pdf-parser/Dockerfile`**) и сервисы **MySQL** и **Redis**. Сборка API в образе: `npm ci`, `prisma generate`, `npm run build`; при старте контейнера: **`npm run migrate:deploy`** затем **`node dist/index.js`** (порт процесса внутри контейнера **3003**, на хост мапится через **`API_PORT`**, по умолчанию **3004**).

Фронт (`client/pdf-parser-ui`) в compose **не включён** — его удобно собирать отдельно и отдавать статикой или гонять **`npm run dev`** (порт **5173**). Если API из Docker с пробросом **3004** на хост: `VITE_API_URL=http://localhost:3004/api`; если бэкенд локально на **3003**: `http://localhost:3003/api`.

```bash
cp docker.env.example .env   # по желанию поправьте пароли и порты
# Вариант A — Docker Compose V2 (плагин, обычно с Docker Desktop / новым docker.io):
docker compose up -d --build
# Вариант B — классический бинарь с дефисом (Linux без плагина compose):
docker-compose up -d --build
# API с хоста (по умолчанию порт 3004 в compose — см. API_PORT): http://localhost:3004  → маршруты под префиксом /api
```

**Если видите `unknown flag: --build`** при `docker compose ...`: у вас, скорее всего, **нет подкоманды `compose`** (старый/урезанный CLI), и оболочка передаёт флаги не туда. Используйте **`docker-compose up -d --build`** (с дефисом) или установите [Compose V2](https://docs.docker.com/compose/install/linux/) (`docker compose version` должен работать). Команда **`docker compose version`** при этом может писать `unknown command` — это нормально, если установлен только `docker-compose`.

**Если MySQL не стартует: `address already in use` на порту 3306:** на машине уже занят **3306** (локальный MySQL, другой контейнер). В `.env` задайте **`MYSQL_PORT=3307`** (или любой свободный порт) и выполните `docker-compose down`, затем снова `docker-compose up -d --build`. Подключаться с хоста к БД нужно на **этот** порт (например `localhost:3307`), не на 3306. Сервис **api** внутри сети по-прежнему использует хостнейм `mysql` и порт **3306** контейнера — менять `DATABASE_URL` не нужно.

**Если API не стартует: `address already in use` на порту 3003:** на **хосте** уже слушает процесс на **3003** (часто параллельный запуск `npm start` в `server/pdf-parser`). Варианты: остановить локальный бэкенд **или** в `.env` задать **`API_PORT=3004`** (так по умолчанию в актуальном `docker-compose.yml` / `docker.env.example`). С хоста тогда обращайтесь к API по **`http://localhost:3004/api`**, для Vite: `VITE_API_URL=http://localhost:3004/api`. Внутри Docker-сети порт приложения остаётся **3003** — менять код не нужно.

**Если `docker-compose` падает с `KeyError: 'ContainerConfig'`** при `up` / пересоздании контейнера: это **несовместимость старого Docker Compose V1** (пакет `docker-compose` из pip/apt, часто **1.29.x**) с **новым Docker Engine** (формат ответа API изменился). Нужен **Compose V2** и команда **`docker compose`** (с пробелом).

**Вариант A — пакет из apt** (работает, если Docker установлен из [официального репозитория Docker](https://docs.docker.com/engine/install/ubuntu/)):

```bash
sudo apt-get update && sudo apt-get install -y docker-compose-plugin
docker compose version
```

Если пишет **`Unable to locate package docker-compose-plugin`**, значит Docker поставлен только из `docker.io` / Universe **без** репозитория `download.docker.com` — используйте вариант B или подключите официальный репозиторий по инструкции Docker (раздел *Install using the apt repository*).

**Вариант B — плагин вручную из GitHub** (подходит для WSL / Ubuntu без пакета):

```bash
mkdir -p ~/.docker/cli-plugins
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) COMPOSE_ARCH=x86_64 ;;
  aarch64|arm64) COMPOSE_ARCH=aarch64 ;;
  *) echo "Неподдерживаемая архитектура: $ARCH"; exit 1 ;;
esac
# Актуальную версию см. https://github.com/docker/compose/releases
curl -fsSL "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-${COMPOSE_ARCH}" \
  -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose
docker compose version
```

После появления `Docker Compose version v2...` в каталоге проекта:

```bash
docker compose down
docker compose up -d --build
```

Старый **`docker-compose`** с дефисом можно не вызывать. Если V2 поставить нельзя — ошибка `ContainerConfig` при V1 может повторяться; временный обход (удалить контейнер и снова `up`) ненадёжен.

**Про сообщение `unknown shorthand flag: 'd'`:** оно появляется, если **`docker compose` не установлен** — тогда оболочка выполняет не то (например, флаги попадают не в compose). Сначала добейтесь успешного `docker compose version`.

**Adminer** (веб-интерфейс к MySQL): `docker compose --profile tools up -d` или `docker-compose --profile tools up -d` → http://localhost:8080 , сервер **mysql**, пользователь **root**, пароль как в `MYSQL_ROOT_PASSWORD`.

**Аналог в облаке:** управляемые **RDS / Cloud SQL** (MySQL), **ElastiCache / Memorystore** (Redis), контейнер API в **ECS / Cloud Run / Kubernetes** с теми же переменными окружения (`DATABASE_URL`, `REDIS_URL`, …). Смысл тот же: отдельные сервисы данных + один процесс Node с API.

### Что за что отвечает

| Сервис | Образ / сборка | Зачем нужен |
|--------|------------------|-------------|
| **mysql** | `mysql:8.0` | Хранилище Prisma (в т.ч. `contract`, `companies`, `employees`, `auth_sessions` после `migrate:deploy`) и raw SQL домена согласований. Без него API не сможет сохранять данные. Том `mysql_data` сохраняет данные между перезапусками. |
| **redis** | `redis:7-alpine` | Кэш чтения документов и инвалидация (`REDIS_URL`). При отсутствии Redis приложение деградирует к БД, но в compose кэш включён для проверки сценариев как на staging. Том `redis_data` — опциональная персистентность AOF. |
| **api** | `build: ./server/pdf-parser` | HTTP API (Express). При старте контейнера выполняется **`npm run migrate:deploy`** (эквивалент `prisma migrate deploy` с `--schema=src/prisma/schema.prisma`), затем `node dist/index.js`. В образе установлены **GraphicsMagick / Ghostscript** для зависимостей парсинга PDF (pdf2pic и др.). |
| **adminer** (профиль `tools`) | `adminer:4` | Только для разработки: просмотр таблиц без CLI. В продакшене обычно не поднимают. |

Подробности по переменным для compose — в разделе **«Docker Compose — переменные»** и в файле **`docker.env.example`**. Бэкенд читает **`CORS_ORIGIN`** в `server/pdf-parser/src/utils/cors-config.ts`: если задан — разрешены только перечисленные origin (несколько через запятую); если **не** задан — допускаются запросы с любого origin (удобно для локальной разработки без `.env`).

### Статика фронта и reverse proxy (staging / production)

Каталог **`client/pdf-parser-ui/dist/`** выкладывается как корень сайта (SPA). Запросы к API должны попадать на тот же хост с префиксом **`/api`** (как в `VITE_API_URL`), либо на отдельный поддомен — тогда в билде фронта указывают полный URL API. Пример для **nginx** (один домен, фронт + прокси API на тот же бэкенд):

```nginx
# Упрощённый пример: статика SPA + проксирование /api на Node
location / {
  root /var/www/app/dist;
  try_files $uri $uri/ /index.html;
}
location /api/ {
  proxy_pass http://127.0.0.1:3003/api/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Порт бэкенда и пути подстроьте под ваш процесс (systemd, Docker, K8s).

---

## Health (liveness)

Для балансировщиков и мониторинга без авторизации:

| Метод и путь | Ответ |
|----------------|--------|
| `GET /health` | JSON: `status`, `service`, `uptimeSeconds` |
| `GET /api/health` | То же тело (дублирует корневой путь под префиксом API) |

Проверка БД/Redis в health **не входит** — эндпоинт отвечает `200`, если процесс Node жив (иначе при падении приложения проверка тоже не сработает).

Пример после локального запуска API на порту 3003:

```bash
curl -sS http://localhost:3003/health
curl -sS http://localhost:3003/api/health
```

---

## Миграции базы данных (единый runbook на deploy)

### Что считается «официальным» способом

Один и тот же шаг для **staging / production / ручного деплоя** и для **Docker** (см. `CMD` в `server/pdf-parser/Dockerfile`):

1. Рабочий каталог: **`server/pdf-parser`**.
2. Установлена переменная **`DATABASE_URL`** (тот же MySQL, куда подключается API).
3. Выполняется **применение Prisma-миграций** к этой БД.

**Рекомендуемая команда (npm-скрипт в репозитории):**

```bash
cd server/pdf-parser
npm ci   # или npm install — на CI обычно npm ci
npm run migrate:deploy
```

**Эквивалент напрямую через Prisma CLI** (тот же эффект; путь к схеме обязателен, т.к. `schema.prisma` лежит не в корне пакета):

```bash
cd server/pdf-parser
npx prisma migrate deploy --schema=src/prisma/schema.prisma
```

Алиас в `package.json`: `prisma-migrate-deploy` дублирует `migrate:deploy`.

Перед деплоем при необходимости сгенерируйте клиент (обычно уже в шаге сборки образа/CI):

```bash
npx prisma generate --schema=src/prisma/schema.prisma
```

### Что покрывают Prisma-миграции

- В **`src/prisma/schema.prisma`** описаны модели **`contract`**, **`Company`**, **`Employee`**, **`AuthSession`**; история SQL — в **`src/prisma/migrations/`**.
- Миграция **`20260413120000_add_companies_employees_auth_sessions`** создаёт (идемпотентно, с учётом старых БД) таблицы **`companies`**, **`employees`** (включая опциональный **`company_id`** и FK на `companies`), **`auth_sessions`** (FK на `employees`). Колонка **`employees.company_id`** может быть `NULL` (платформенный админ, legacy).
- `prisma migrate deploy` применяет эти SQL-файлы и ведёт учёт в **`_prisma_migrations`**.

### Что по-прежнему создаётся raw SQL при работе API (не Prisma)

| Область | Где в коде | Пример таблиц |
|---------|------------|----------------|
| Согласование документов | `server/pdf-parser/src/services/ApprovalDomainService/` | `approval_documents`, `approval_tasks`, … |

После `migrate:deploy` приложение при первом входе/вызове админки может **добавить только данные** (например, учётную платформенного демо-админа в `employees`), без DDL таблиц `employees` / `companies` / `auth_sessions` — схема должна уже существовать за счёт миграций выше.

Итог на deploy:

- **Обязательно:** `npm run migrate:deploy` — схема **`contract`**, **`companies`**, **`employees`**, **`auth_sessions`** и связи между ними.
- Документы согласования и связанные таблицы — по-прежнему через **`ApprovalDomainService`** при первом обращении к домену согласований.

### Docker

В `server/pdf-parser/Dockerfile` точка входа уже содержит:

`npm run migrate:deploy && node dist/index.js`

(это тот же `prisma migrate deploy` с `--schema=src/prisma/schema.prisma`, см. `package.json`.)

При поднятии стека через `docker compose` миграции Prisma выполняются **при каждом старте контейнера `api`** (после готовности MySQL за счёт `depends_on` + healthcheck). Ручной `migrate:deploy` на хосте нужен, если API деплоится **без** этого Dockerfile.

### CI/CD (шаблон шага)

Условно:

```yaml
# пример: job перед выкладкой артефакта или перед restart сервиса
- run: cd server/pdf-parser && npm ci && npm run migrate:deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

`DATABASE_URL` должен указывать на целевую БД с правами на DDL (CREATE/ALTER) или хотя бы на применение уже существующих миграций.

---

## Чеклист перед первым выкладом на staging

- [ ] Для **Docker Compose**: скопирован `docker.env.example` → `.env` в корне репозитория, при необходимости поправлены порты и пароли
- [ ] Для **API без Docker**: в окружении процесса заданы **`DATABASE_URL`**, при необходимости **`REDIS_URL`**, **`PUBLIC_APP_URL`**, **`CORS_ORIGIN`** (см. `server/pdf-parser/.env.example`)
- [ ] Фронт собран с **`VITE_API_URL`**, указывающим на URL API **доступный из браузера пользователя** (часто тот же хост, что и SPA, путь `/api`)
- [ ] К целевой БД применены миграции: **`npm run migrate:deploy`** в `server/pdf-parser` (или тот же шаг в Docker CMD / CI)
- [ ] `GET /health` или `GET /api/health` возвращает `200` и JSON со `status: "ok"`
- [ ] Smoke: открытие SPA, логин, один запрос к защищённому API

---

## Связанные документы

- `docker-compose.yml`, `docker.env.example` — локальный стек MySQL + Redis + API
- `server/pdf-parser/Dockerfile` — образ API для compose и для облачного деплоя контейнером
- `ROADMAP-DELTA.md` — §6 переменные окружения (дополнение к существующему `.env`)
- `server/pdf-parser/README.md` — детали бэкенда и локального запуска
