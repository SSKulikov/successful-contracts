# Деплой (staging и production)

Документ описывает **куда кладутся артефакты** фронтенда и бэкенда, **какой URL считать staging** и какие **переменные окружения** нужны. Структура соответствует модулям `server/pdf-parser` и `client/pdf-parser-ui` в этом репозитории.

---

## Зачем нужен DEPLOY.md на раннем этапе

На старте у команды часто нет ни выделенного сервера, ни финального домена. Документ всё равно полезен:

1. **Один источник правды** — список переменных (`DATABASE_URL`, `REDIS_URL`, и т.д.), чтобы Dev1 и Dev2 не расходились в `.env` и не ломали интеграцию «фронт → API».
2. **Согласование контракта** — фронт ходит на бэк по базовому URL (`VITE_API_URL`); бэк должен разрешать CORS для origin фронта (`CORS_ORIGIN`). Без явной фиксации легко получить «локально работает, на staging — 401/CORS».
3. **Повторяемый деплой** — даже если первый выклад — ручной, описанные шаги и пути к билдам снижают bus factor и время онбординга.
4. **Подготовка к продакшену** — `PUBLIC_APP_URL` для ссылок в Excel и писем задаётся заранее; позже смена домена сводится к обновлению env, а не к поиску хардкода.
5. **Безопасность** — напоминание, что секреты только в env, не в репозитории (см. `.env.example` по мере наполнения).

Итог: DEPLOY.md — не «инструкция только для девопса», а **минимальная спецификация окружения** для разработки и первого staging.

---

## Где лежит код и что собираем

| Компонент | Каталог в репозитории | Сборка | Артефакт |
|-----------|------------------------|--------|----------|
| **Backend (API)** | `server/pdf-parser` | `npm install` → `npm run build` | `server/pdf-parser/dist/` |
| **Frontend (SPA)** | `client/pdf-parser-ui` | `npm install` → `npm run build` | `client/pdf-parser-ui/dist/` |

Запуск API локально после сборки: `node ./dist/index.js` из каталога `server/pdf-parser` (порт по умолчанию **3003**, см. `src/index.ts`).

Статику фронта после сборки отдаёт **nginx**, **Caddy**, **S3+CloudFront** или другой хостинг статики; API — отдельный процесс (Node) или тот же reverse proxy с проксированием `/api` на бэкенд.

---

## Staging: домены и URL (шаблон)

Подставьте реальные значения для своей инфраструктуры:

| Назначение | Пример URL (заменить на ваши) |
|------------|-------------------------------|
| Фронт (SPA) | `https://staging-app.example.com` |
| API (если отдельный хост) | `https://staging-api.example.com` или тот же хост, префикс `/api` |

Фронтенд обращается к API по базовому URL с суффиксом `/api` (см. `VITE_API_URL` ниже). На staging **в билде фронта** должно быть задано, например:

`VITE_API_URL=https://staging-api.example.com/api`

или при общем домене с reverse proxy:

`VITE_API_URL=https://staging-app.example.com/api`

---

## Переменные окружения

### Backend (`server/pdf-parser`)

Задаются в окружении процесса Node (файл `.env` в корне `server/pdf-parser` для локальной разработки — не коммитить секреты).

| Переменная | Обязательность | Назначение |
|------------|----------------|------------|
| `DATABASE_URL` | **Да** | Подключение Prisma/MySQL, например `mysql://USER:PASSWORD@HOST:3306/DB_NAME` |
| `REDIS_URL` | Рекомендуется для кэша документов | URL Redis, например `redis://localhost:6379` или `rediss://...` для TLS. Если не задан — кэш отключается, запросы идут в БД |
| `JWT_SECRET` | На будущее / опционально | Секрет для подписи JWT, **если** перейдёте с текущих сессионных токенов в `auth_sessions` на JWT. Сейчас в коде может не использоваться — оставьте в env для единообразия и будущих доработок |
| `PUBLIC_APP_URL` | Для ссылок в Excel и писем | Публичный базовый URL **веб-приложения** без завершающего слэша, например `https://staging-app.example.com`. Используется при формировании ссылок вида «открыть документ» в экспорте |
| `CORS_ORIGIN` | Рекомендуется на staging/prod | Origin фронтенда для заголовка `Access-Control-Allow-Origin`, например `https://staging-app.example.com`. Должен совпадать с тем, с какого URL пользователь открывает SPA (схема + хост + порт при необходимости) |

Дополнительно могут использоваться переменные из `server/pdf-parser/.env.example` (legacy-сервисы парсинга и т.д.) — см. комментарии в файле.

### Frontend (`client/pdf-parser-ui`)

Задаются **на этапе сборки** (Vite), префикс `VITE_`:

| Переменная | Назначение |
|------------|------------|
| `VITE_API_URL` | Базовый URL API, по умолчанию в коде `http://localhost:3003/api`. На staging: полный URL до префикса `/api`, например `https://staging-app.example.com/api` |
| `VITE_USE_MOCK_API` | `false` на реальном API |
| `VITE_USE_MOCK_ADMIN_API` | `false`, когда админские эндпоинты готовы |
| `VITE_USE_MOCK_PROFILE_API` | `false`, когда профиль идёт в API |

Пример команды сборки фронта для staging:

```bash
cd client/pdf-parser-ui
VITE_API_URL=https://staging-app.example.com/api \
VITE_USE_MOCK_API=false \
VITE_USE_MOCK_ADMIN_API=false \
VITE_USE_MOCK_PROFILE_API=false \
npm run build
```

---

## Docker Compose: API + MySQL + Redis

В корне репозитория лежит `docker-compose.yml`: поднимает **бэкенд** (`server/pdf-parser`, образ собирается из `Dockerfile`) и инфраструктуру **MySQL** и **Redis**. Фронт (`client/pdf-parser-ui`) в compose **не включён** — его удобно гонять локально (`npm run dev`, порт **5173**). Если API из Docker с пробросом **3004** на хост: `VITE_API_URL=http://localhost:3004/api`; если бэкенд локально на **3003**: `http://localhost:3003/api`.

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
| **mysql** | `mysql:8.0` | Хранилище Prisma и raw SQL (`employees`, `auth_sessions`, документы согласования и т.д.). Без него API не сможет сохранять данные. Том `mysql_data` сохраняет данные между перезапусками. |
| **redis** | `redis:7-alpine` | Кэш чтения документов и инвалидация (`REDIS_URL`). При отсутствии Redis приложение деградирует к БД, но в compose кэш включён для проверки сценариев как на staging. Том `redis_data` — опциональная персистентность AOF. |
| **api** | `build: ./server/pdf-parser` | HTTP API (Express). При старте выполняет `prisma migrate deploy`, затем `node dist/index.js`. В образе установлены **GraphicsMagick / Ghostscript** для зависимостей парсинга PDF (pdf2pic и др.). |
| **adminer** (профиль `tools`) | `adminer:4` | Только для разработки: просмотр таблиц без CLI. В продакшене обычно не поднимают. |

Подробные переменные см. в `docker.env.example` и в таблице выше (раздел «Переменные окружения»). Бэкенд читает **`CORS_ORIGIN`** в `utils/cors-config.ts`: если задан — разрешены только перечисленные origin (несколько через запятую); если **не** задан — допускаются запросы с любого origin (удобно для локальной разработки без `.env`).

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

## Миграции базы данных (Prisma)

Схема: `server/pdf-parser/src/prisma/schema.prisma`.

Деплой миграций (после выкладки кода):

```bash
cd server/pdf-parser
npx prisma migrate deploy --schema=src/prisma/schema.prisma
```

Часть таблиц (например, документы согласования) может создаваться через raw SQL при старте приложения — уточняйте у команды актуальный список.

---

## Чеклист перед первым выкладом на staging

- [ ] В `.env` / секретах сервера заданы `DATABASE_URL`, при необходимости `REDIS_URL`, `PUBLIC_APP_URL`, `CORS_ORIGIN`
- [ ] Фронт собран с `VITE_API_URL`, указывающим на доступный с браузера URL API
- [ ] Выполнены миграции Prisma
- [ ] `GET /health` или `GET /api/health` возвращает `200` и JSON со `status: "ok"`
- [ ] Smoke: открытие SPA, логин, один запрос к защищённому API

---

## Связанные документы

- `ROADMAP-DELTA.md` — §6 переменные окружения (дополнение к существующему `.env`)
- `server/pdf-parser/README.md` — детали бэкенда и локального запуска
