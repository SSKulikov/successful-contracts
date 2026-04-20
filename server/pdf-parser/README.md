# PDF Parser Service

Сервис принимает договор в `PDF` или `DOCX`, извлекает из него текст, пытается распознать реквизиты и условия договора через OCR + LLM, а затем по отдельному запросу сохраняет итоговые данные в MySQL.

Документ написан по текущей реализации кода, а не по ожидаемому поведению. Ниже отдельно отмечены расхождения, ограничения и технический долг.

## Что делает сервис

Основной сценарий работы:

1. Клиент загружает файл в `POST /api/parse-file`.
2. Бэкенд сохраняет файл во `storage/`.
3. Если это `PDF`, сервис конвертирует каждую страницу в картинку и прогоняет OCR через `tesseract.js`.
4. Если это `DOCX`, сервис вытаскивает raw text через `mammoth`.
5. Текст режется на части по `5000` символов.
6. Каждая часть отправляется в `GigaChat` с промптом, который просит вернуть JSON фиксированной структуры.
7. Частичные ответы склеиваются по правилу "берем первое ненулевое значение".
8. Результат прогоняется через валидатор и возвращается клиенту.
9. Если клиенту нужно сохранить данные в базу, он вызывает второй эндпоинт `POST /api/save-data-info`.
10. Бэкенд валидирует входящий JSON и вставляет запись в таблицу `contract`.

## Для кого этот сервис

- Для фронтенда или внутреннего инструмента, который загружает договор и хочет получить структурированный JSON.
- Для ручного review после парсинга, потому что сервис не гарантирует 100% точность.
- Для сценария "загрузили договор -> показали пользователю -> пользователь поправил -> сохранили в БД".

## Что сервис не делает

- Не содержит UI.
- Не имеет авторизации и ролей.
- Не запускает фоновую очередь.
- Не сохраняет результат парсинга автоматически после `parse-file`.
- Не преобразует ответ `parse-file` в payload для `save-data-info` автоматически.
- Не покрыт автотестами.
- Не содержит Docker-конфигурации.

## Архитектура

```mermaid
flowchart TD
    A[Client] --> B[POST /api/parse-file]
    B --> C[multer]
    C --> D{File type}
    D -->|PDF| E[PdfService]
    D -->|DOCX| F[WordService]
    E --> G[storage/text/*.txt]
    F --> G
    G --> H[RegExService]
    H --> I[GigaChatService]
    I --> J[ValidatorService]
    J --> K[JSON response]

    A --> L[POST /api/save-data-info]
    L --> M[ValidatorService]
    M --> N[Prisma]
    N --> O[(MySQL contract)]
```

## Точки входа

Сервис стартует из файла `src/index.ts`.

- HTTP-сервер: `Express`
- Порт: `3003`
- Базовый префикс API: `/api`
- CORS: включен глобально

Маршруты описаны в `src/routes.ts`:

- `POST /api/parse-file`
- `POST /api/save-data-info`

## Подробная логика работы

### 1. Загрузка и парсинг файла: `POST /api/parse-file`

Эндпоинт принимает `multipart/form-data` с полем `file`.

Что происходит внутри:

1. `multer` проверяет MIME-тип и выбирает папку для сохранения.
2. `PDF` уходит в `storage/pdf`.
3. Word-файлы уходят в `storage/word`.
4. Файл сохраняется под именем `Date.now() + original extension`.
5. Контроллер определяет расширение исходного файла.
6. Если расширение `.pdf`, вызывается `PdfService.convertPdf(...)`.
7. Для всех остальных поддержанных Word MIME вызывается `WordService.convertWord(...)`.
8. После получения текста вызывается `RegExService.parseFullData(...)`.
9. Текст режется на массив чанков по `5000` символов.
10. Каждый чанк последовательно отправляется в `GigaChat`.
11. Все ответы склеиваются в один объект `parsedData`.
12. `ValidatorService` приводит типы к финальному виду.
13. Клиент получает JSON с метаданными загруженного файла и `parsedJson`.

Пример запроса:

```bash
curl -X POST http://localhost:3003/api/parse-file \
  -F "file=@/absolute/path/to/contract.pdf"
```

Пример ответа:

```json
{
  "message": "Файл загружен",
  "filename": "1754066007260.pdf",
  "path": "/Users/.../storage/pdf/1754066007260.pdf",
  "parsedJson": {
    "supplier": {
      "name": "ООО Ромашка",
      "inn": 7701234567,
      "kpp": 770101001,
      "ogrn": 1027700123456,
      "bik": "044525225",
      "corr_account": "30101810400000000225",
      "payment_account": "40702810900000000001",
      "email": "finance@example.com",
      "phone": "+74951234567",
      "address": "г. Москва, ул. Пример, д. 1",
      "bank_name": "ПАО Сбербанк"
    },
    "customer": {
      "name": "ООО Заказчик",
      "inn": 7812345678,
      "kpp": 781201001,
      "ogrn": 1127800000000,
      "bik": "044030653",
      "corr_account": "30101810500000000653",
      "payment_account": "40702810000000000002",
      "email": "accounting@example.com",
      "phone": "+78121234567",
      "address": "г. Санкт-Петербург, наб. Пример, д. 2",
      "bank_name": "ПАО Банк"
    },
    "contract_type": "Договор оказания услуг",
    "contract_number": "12/24",
    "contract_subject": "Оказание услуг по ...",
    "contract_sum": 150000,
    "contract_currency": "RUB",
    "payment_1_sum": 75000,
    "payment_1_date": "2025-03-01",
    "payment_2_sum": 75000,
    "payment_2_date": "2025-03-31",
    "contract_date": "2025-02-20",
    "contract_start_date": "2025-02-20",
    "contract_end_date": "2025-12-31",
    "item": "Маркетинговые услуги"
  }
}
```

### 2. Как работает PDF-ветка

`PdfService` делает следующее:

1. Берет файл из `storage/pdf/<id>.pdf`.
2. Создает временную директорию `storage/img/<id>`.
3. Узнает число страниц через `pdf-lib`.
4. Для каждой страницы вызывает `pdf2pic`.
5. Сохраняет страницу как `png`.
6. Прогоняет картинку через `Tesseract.recognize(..., "rus+eng")`.
7. Собирает весь распознанный текст в один файл `storage/text/<id>.txt`.
8. Удаляет временную папку с картинками.

Что важно:

- OCR выполняется параллельно по страницам через `Promise.allSettled`.
- Оригинальный `PDF` не удаляется. Папка `storage/pdf` будет разрастаться.
- Файл с распознанным текстом тоже остается на диске.
- В репозитории лежат `eng.traineddata` и `rus.traineddata`, но код не передает `langPath` в `tesseract.js`, поэтому эти файлы не подключены явно текущей реализацией OCR.

### 3. Как работает DOCX-ветка

`WordService` делает следующее:

1. Берет файл из `storage/word/<id>.docx`.
2. Извлекает raw text через `mammoth.extractRawText`.
3. Сохраняет текст в `storage/text/<id>.txt`.
4. Удаляет исходный `DOCX`.

Что важно:

- Реально поддержан именно `DOCX`.
- В `multer` разрешен также MIME для старого `.doc`, но `WordService` всегда ищет файл с расширением `.docx`.
- Из-за этого `.doc` в текущей реализации считается принятым на входе, но сломается на этапе обработки.

### 4. Что делает `RegExService`

`RegExService` не извлекает финальные поля напрямую. Он подготавливает текст для LLM.

Основные методы:

- `parseFullData(textName)`:
  режет полный текст на чанки по `5000` символов.
- `parseRequisites(textName)`:
  пытается вытащить блоки с реквизитами по регуляркам.
- `parsePaymentTerms(textName)`:
  пытается вытащить блоки с оплатой по регуляркам.

Важный нюанс текущей реализации:

- `parseRequisites(...)` и `parsePaymentTerms(...)` вызываются в контроллере, но их результат дальше никак не используется.
- На итоговый JSON влияет только массив чанков из `parseFullData(...)`.

### 5. Как работает `GigaChatService`

Для каждого чанка текста сервис:

1. Берет системный промпт из `src/consts/prompts.ts`.
2. Просит вернуть JSON строго по заданной схеме.
3. Делает до `3` попыток запроса.
4. Если приходит ошибка `429`, ждет `retry-after` или собственную задержку.
5. Из ответа вырезает содержимое между первой `{` и последней `}`.
6. Делает `JSON.parse(...)`.

Что важно:

- Чанки отправляются последовательно, не параллельно.
- Чем длиннее договор, тем выше общее время ответа.
- Если модель вернула невалидный JSON, этот чанк считается неуспешным.
- Значение `GIGA_CHAT_ACCESS_KEY` подставляется при создании клиента.

### 6. Как склеиваются ответы LLM

Сервис создает пустой объект `parsedData`, в котором все поля изначально равны `null`.

Далее для каждого успешного ответа действует правило:

- если поле еще `null`, берем значение из текущего ответа;
- если поле уже заполнено, не перезаписываем его.

Итог:

- побеждает первое ненулевое значение;
- более поздние чанки не могут исправить ранее заполненное поле.

Это касается:

- полей договора;
- суммы и дат;
- вложенных объектов `supplier` и `customer`.

### 7. Что делает `ValidatorService`

После LLM-ответа данные нормализуются.

Правила:

- строки обрезаются по краям, пустые строки становятся `null`;
- числа приводятся к `number`, если это возможно;
- email проходит простую regex-проверку;
- телефон должен быть в формате `+79991234567` или просто `79991234567`;
- даты приводятся к строке формата `YYYY-MM-DD`;
- расчетный счет и корреспондентский счет переводятся в строки.

Следствие:

- если телефон в документе записан с пробелами, скобками или дефисами, он может стать `null`;
- если дата плохо распарсилась стандартным `new Date(...)`, она тоже станет `null`.

## Сохранение в БД: `POST /api/save-data-info`

Это отдельный этап. После `parse-file` сервис сам в базу не пишет.

Эндпоинт принимает обычный JSON, а не multipart.

Критически важный нюанс:

- `parse-file` возвращает вложенную структуру `supplier` и `customer`;
- `save-data-info` ожидает плоский payload вида `supplier_name`, `customer_name`, `contract_number` и так далее.

То есть между этими двумя эндпоинтами нужен маппинг на стороне клиента или промежуточного слоя.

Пример запроса:

```bash
curl -X POST http://localhost:3003/api/save-data-info \
  -H "Content-Type: application/json" \
  -d '{
    "supplier_name": "ООО Ромашка",
    "supplier_inn": 7701234567,
    "supplier_kpp": 770101001,
    "supplier_ogrn": 1027700123456,
    "supplier_bik": "044525225",
    "supplier_corr_account": "30101810400000000225",
    "supplier_payment_account": "40702810900000000001",
    "supplier_email": "finance@example.com",
    "supplier_phone": "+74951234567",
    "supplier_address": "г. Москва, ул. Пример, д. 1",
    "supplier_bank_name": "ПАО Сбербанк",
    "customer_name": "ООО Заказчик",
    "customer_inn": 7812345678,
    "customer_kpp": 781201001,
    "customer_ogrn": 1127800000000,
    "customer_bik": "044030653",
    "customer_corr_account": "30101810500000000653",
    "customer_payment_account": "40702810000000000002",
    "customer_email": "accounting@example.com",
    "customer_phone": "+78121234567",
    "customer_address": "г. Санкт-Петербург, наб. Пример, д. 2",
    "customer_bank_name": "ПАО Банк",
    "contract_number": "12/24",
    "contract_subject": "Оказание услуг по ...",
    "item": "Маркетинговые услуги",
    "contract_sum": 150000,
    "contract_currency": "RUB",
    "contract_date": "2025-02-20",
    "contract_start_date": "2025-02-20",
    "contract_end_date": "2025-12-31"
  }'
```

Пример успешного ответа:

```json
{
  "message": "Данные успешно сохранены"
}
```

### Как именно идет запись в базу

Контроллер `src/controllers/save.controller.ts`:

1. Валидирует входящий JSON.
2. Вызывает `prisma.$executeRaw`.
3. Выполняет `INSERT INTO AlternativaGames.contract (...)`.

Что это значит на практике:

- имя базы `AlternativaGames` зашито прямо в SQL;
- переменная `DATABASE_NAME` на этот запрос не влияет;
- таблица должна существовать именно в схеме `AlternativaGames`.

### Какие поля реально сохраняются

В таблицу `contract` в текущей реализации пишутся:

- реквизиты поставщика;
- реквизиты заказчика;
- `contract_number`;
- `contract_subject`;
- `item`;
- `contract_sum`;
- `contract_currency`;
- `contract_date`;
- `contract_start_date`;
- `contract_end_date`;
- служебные `createdAt` и `updatedAt`.

Не сохраняются, хотя участвуют в парсинге:

- `contract_type`
- `payment_1_sum`
- `payment_1_date`
- `payment_2_sum`
- `payment_2_date`

Причина: в текущей Prisma-схеме этих колонок уже нет.

## Маппинг между `parse-file` и `save-data-info`

Ниже пример преобразования ответа парсинга в payload для сохранения:

```ts
function mapParsedToSavePayload(parsedJson: any) {
  return {
    supplier_name: parsedJson.supplier?.name ?? null,
    supplier_inn: parsedJson.supplier?.inn ?? null,
    supplier_kpp: parsedJson.supplier?.kpp ?? null,
    supplier_ogrn: parsedJson.supplier?.ogrn ?? null,
    supplier_bik: parsedJson.supplier?.bik ?? null,
    supplier_corr_account: parsedJson.supplier?.corr_account ?? null,
    supplier_payment_account: parsedJson.supplier?.payment_account ?? null,
    supplier_email: parsedJson.supplier?.email ?? null,
    supplier_phone: parsedJson.supplier?.phone ?? null,
    supplier_address: parsedJson.supplier?.address ?? null,
    supplier_bank_name: parsedJson.supplier?.bank_name ?? null,

    customer_name: parsedJson.customer?.name ?? null,
    customer_inn: parsedJson.customer?.inn ?? null,
    customer_kpp: parsedJson.customer?.kpp ?? null,
    customer_ogrn: parsedJson.customer?.ogrn ?? null,
    customer_bik: parsedJson.customer?.bik ?? null,
    customer_corr_account: parsedJson.customer?.corr_account ?? null,
    customer_payment_account: parsedJson.customer?.payment_account ?? null,
    customer_email: parsedJson.customer?.email ?? null,
    customer_phone: parsedJson.customer?.phone ?? null,
    customer_address: parsedJson.customer?.address ?? null,
    customer_bank_name: parsedJson.customer?.bank_name ?? null,

    contract_number: parsedJson.contract_number ?? null,
    contract_subject: parsedJson.contract_subject ?? null,
    item: parsedJson.item ?? null,
    contract_sum: parsedJson.contract_sum ?? null,
    contract_currency: parsedJson.contract_currency ?? null,
    contract_date: parsedJson.contract_date ?? null,
    contract_start_date: parsedJson.contract_start_date ?? null,
    contract_end_date: parsedJson.contract_end_date ?? null
  };
}
```

## Переменные окружения

Шаблон лежит в файле `.env.example`.

| Переменная | Обязательна | Где используется | Что указать |
| --- | --- | --- | --- |
| `DATABASE_URL` | Да, если нужен `save-data-info` и Prisma-команды | `src/prisma/schema.prisma` | MySQL connection string, например `mysql://USER:PASSWORD@HOST:3306/AlternativaGames` |
| `GIGA_CHAT_ACCESS_KEY` | Да, если нужен `parse-file` | `src/services/GigaChatService/index.ts` | Authorization Key из личного кабинета GigaChat |
| `DATABASE_NAME` | Нет | Сейчас в коде не используется | Можно оставить для справки |
| `OAUTH_TOKEN` | Нет | Только в `YaGptService`, который не подключен к маршрутам | Нужен только если вы решите использовать YandexGPT вместо GigaChat |

## Где брать значения для `.env`

### `DATABASE_URL`

Это обычная строка подключения к MySQL.

Полезные ссылки:

- Prisma MySQL overview: `https://www.prisma.io/docs/orm/overview/databases/mysql`
- Prisma connection URLs: `https://www.prisma.io/docs/orm/reference/connection-urls#mysql`
- MySQL Community Server: `https://dev.mysql.com/downloads/mysql/`

Пример:

```dotenv
DATABASE_URL="mysql://root:password@localhost:3306/AlternativaGames"
```

Важно:

- для `save-data-info` база `AlternativaGames` должна реально существовать;
- SQL в контроллере обращается именно к `AlternativaGames.contract`.

### `GIGA_CHAT_ACCESS_KEY`

Где взять:

1. Зарегистрироваться или войти в личный кабинет GigaChat Studio.
2. Создать проект `GigaChat API`.
3. Открыть раздел `Настройки API`.
4. Нажать `Получить ключ`.
5. Скопировать `Authorization Key`.

Официальные ссылки:

- Быстрый старт для физлиц: `https://developers.sber.ru/docs/ru/gigachat/individuals-quickstart`
- Быстрый старт для ИП и юрлиц: `https://developers.sber.ru/docs/ru/gigachat/legal-quickstart`
- Сертификаты Минцифры для GigaChat: `https://developers.sber.ru/docs/ru/gigachat/certificates`

Пример:

```dotenv
GIGA_CHAT_ACCESS_KEY="your-gigachat-authorization-key"
```

Важный нюанс по TLS:

- в `package.json` команда `npm start` запускает Node с `NODE_TLS_REJECT_UNAUTHORIZED=0`;
- это отключает проверку TLS-сертификатов;
- такое поведение допустимо только как временная мера для локальной разработки;
- для нормальной среды лучше установить сертификаты Минцифры и запускать сервис без отключения проверки сертификатов.

### `DATABASE_NAME`

Сейчас эта переменная присутствует в локальном `.env`, но код ее не использует.

То есть:

- можно оставить ее для справки;
- изменение значения ничего не поменяет в работе сервиса;
- фактическое имя БД для сохранения сейчас определяется либо `DATABASE_URL`, либо хардкодом `AlternativaGames` внутри SQL.

### `OAUTH_TOKEN`

Это legacy-переменная для `YaGptService`.

Сейчас:

- `YaGptService` не подключен к роутам;
- сервис не использует YandexGPT в боевом сценарии;
- для стандартного запуска можно оставить пустым.

## Системные зависимости

Кроме `npm install`, проекту нужны системные пакеты.

### Обязательно

- Node.js `18+`
- npm
- MySQL
- `graphicsmagick`
- `ghostscript`

Почему это нужно:

- `pdf2pic` требует `graphicsmagick` и `ghostscript` для конвертации PDF-страниц в изображения;
- `tesseract.js` делает OCR по этим изображениям;
- Prisma пишет в MySQL.

Полезные ссылки:

- Node.js download: `https://nodejs.org/en/download`
- Homebrew: `https://brew.sh/`
- GraphicsMagick: `https://www.graphicsmagick.org/`
- Ghostscript: `https://ghostscript.com/releases/gsdnld.html`

### Быстрый старт на macOS

Если у вас еще нет Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Потом:

```bash
brew install graphicsmagick ghostscript
```

### Быстрый старт на Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install -y graphicsmagick ghostscript
```

## Как запустить проект локально

### 1. Установить зависимости

```bash
npm install
```

### 2. Подготовить `.env`

Создайте файл `.env` по шаблону `.env.example` и заполните значения.

Минимально:

```dotenv
DATABASE_URL="mysql://root:password@localhost:3306/AlternativaGames"
DATABASE_NAME="AlternativaGames"
OAUTH_TOKEN=""
GIGA_CHAT_ACCESS_KEY="your-gigachat-authorization-key"
```

### 3. Подготовить базу

Создайте базу `AlternativaGames` в MySQL и примените миграции.

Команды проекта:

```bash
npm run prisma-generate
npm run prisma-migrate-deploy
```

Если вы разрабатываете локально и хотите создать новую миграцию:

```bash
npm run prisma-migrate
```

### 4. Запустить сервис

```bash
npm start
```

Что делает `npm start`:

1. запускает `tsc`;
2. собирает `dist/`;
3. запускает `node ./dist/index.js`;
4. выставляет `NODE_TLS_REJECT_UNAUTHORIZED=0`.

После старта сервис слушает:

```text
http://localhost:3003
```

### 5. Проверить, что сервис жив

Быстрый smoke test:

```bash
curl -X POST http://localhost:3003/api/parse-file
```

Ожидаемо вернется ошибка о том, что файл не загружен. Это нормальный ответ для пустого запроса и знак, что сервер поднялся.

## Структура проекта

```text
src/
  consts/
    prompts.ts              # системный промпт для GigaChat
  controllers/
    file.controller.ts      # загрузка и парсинг файлов
    save.controller.ts      # сохранение в БД
    dataSaver.controller.ts # legacy-контроллер, сейчас не используется
  dto/
    index.ts                # тип parsedData
  prisma/
    schema.prisma           # Prisma schema
    migrations/             # миграции БД
  services/
    PdfService/             # PDF -> image -> OCR -> text
    WordService/            # DOCX -> text
    RegExService/           # подготовка и chunking текста
    GigaChatService/        # запросы в GigaChat
    YaGptService/           # legacy, не подключен
    ValidatorService/       # нормализация ответа
  utils/
    logger.ts               # tracer logger
  index.ts                  # запуск express
  routes.ts                 # маршруты API

storage/
  pdf/                      # загруженные PDF
  word/                     # временные Word-файлы
  img/                      # временные изображения страниц PDF
  text/                     # распознанный текст
```

## Ограничения и важные нюансы текущей реализации

Это критично понимать, если сервис будет использовать продакт, QA или джун-разработчик.

1. `parse-file` и `save-data-info` не образуют полный автоматический pipeline.
2. Между ними нужен явный маппинг nested JSON -> flat JSON.
3. `save-data-info` не сохраняет `contract_type` и поля платежей.
4. Имя базы `AlternativaGames` зашито в SQL.
5. `DATABASE_NAME` сейчас не влияет на runtime.
6. `YaGptService` присутствует в коде, но не используется.
7. `dataSaver.controller.ts` присутствует, но не подключен к роутам.
8. `.doc` фактически не поддержан, несмотря на разрешенный MIME-тип.
9. Папки `storage/pdf` и `storage/text` со временем будут расти.
10. `npm start` отключает TLS-валидацию.
11. Регулярки для реквизитов и оплат сейчас вычисляются, но их результат не используется.
12. Локальные `eng.traineddata` и `rus.traineddata` лежат в репозитории, но не подключены явно через `langPath`.
13. Автотестов нет.

## Типичные проблемы и диагностика

### Ошибка при работе с GigaChat

Проверьте:

- заполнен ли `GIGA_CHAT_ACCESS_KEY`;
- есть ли доступ к GigaChat API;
- не упираетесь ли вы в rate limit;
- установлены ли сертификаты Минцифры, если вы хотите запускать сервис без TLS bypass.

### Ошибка соединения с MySQL

Проверьте:

- правильный ли `DATABASE_URL`;
- существует ли база `AlternativaGames`;
- применились ли Prisma-миграции;
- есть ли у пользователя MySQL права на `INSERT`.

### Ошибка на Word-файле

Проверьте:

- что файл реально в формате `.docx`;
- что MIME и расширение совпадают;
- что вы не пытаетесь отправить старый `.doc`.

### Ошибка на PDF

Проверьте:

- установлены ли `graphicsmagick` и `ghostscript`;
- доступны ли они из `PATH`;
- читается ли исходный PDF;
- не слишком ли тяжелый документ для OCR по времени и памяти.

## Что можно улучшить дальше

Если сервис планируется развивать, самые полезные улучшения такие:

1. Сделать единый end-to-end endpoint "parse and save".
2. Убрать хардкод `AlternativaGames.contract`.
3. Удалить или подключить legacy-код `YaGptService` и `dataSaver.controller.ts`.
4. Исправить поддержку `.doc` или явно запретить ее.
5. Использовать результаты `parseRequisites` и `parsePaymentTerms`.
6. Добавить очистку `storage/`.
7. Добавить OpenAPI/Swagger.
8. Добавить интеграционные тесты.
9. Убрать `NODE_TLS_REJECT_UNAUTHORIZED=0` из штатного запуска.

## E2E тесты согласования (approval)

В проекте есть интеграционные e2e-сценарии для домена согласования и связанных политик безопасности:

- `npm run test:e2e:approval-flow` — проверка happy-path:
  `submit -> approve (несколько шагов) -> документ "Согласован"`.
- `npm run test:e2e:approval-branches` — проверка веток решений:
  `revise` и `reject`, включая отмену оставшихся `pending/blocked` задач.
- `npm run test:e2e:password-gate` — проверка password-gate:
  блокировка ключевых мутаций при временном пароле и успешная разблокировка после `POST /users/me/change-password`.
- `npm run test:e2e:soft-delete` — проверка soft delete сотрудников:
  запрет логина удалённого сотрудника, запрет назначения удалённого в маршрут, отображение `Удаленный пользователь` в истории документа.
- `npm run test:e2e:notifications` — проверка notifications API и доменных вставок:
  `/notifications`, `/notifications/unread-count`, `/notifications/:id/read`,
  а также события `document_submitted`, `approval_step_assigned`, `document_rejected`.

### Переменные окружения для запуска

Оба теста используют одни и те же переменные:

- `STAGING_API_URL` (например `http://localhost:3003/api`)
- `STAGING_EMAIL` / `STAGING_PASSWORD` (инициатор)
- `STAGING_EMAIL_B` / `STAGING_PASSWORD_B` (согласующий шага 1)
- `STAGING_EMAIL_C` / `STAGING_PASSWORD_C` (согласующий шага 2)
- `STAGING_COMPANY_ID` (опционально, если инициатор — платформенный админ)

Для `test:e2e:password-gate` используются отдельные переменные:

- `STAGING_API_URL`
- `STAGING_PLATFORM_ADMIN_EMAIL` / `STAGING_PLATFORM_ADMIN_PASSWORD` (платформенный админ для reset пароля)
- `STAGING_GATE_EMAIL` (сотрудник, над которым проверяется gate)

Для `test:e2e:soft-delete` используются переменные:

- `STAGING_API_URL`
- `STAGING_PLATFORM_ADMIN_EMAIL` / `STAGING_PLATFORM_ADMIN_PASSWORD`
- `STAGING_SOFT_DELETE_COMPANY_ID` (опционально; если не задан, используется первая компания из `/admin/companies`)

Для `test:e2e:notifications` используются переменные:

- `STAGING_API_URL`
- `STAGING_EMAIL` / `STAGING_PASSWORD` (инициатор A)
- `STAGING_EMAIL_B` / `STAGING_PASSWORD_B` (согласующий B)
- `STAGING_EMAIL_C` / `STAGING_PASSWORD_C` (согласующий C)
- `STAGING_COMPANY_ID` (опционально, если инициатор — платформенный админ)

### Пример запуска

```bash
STAGING_API_URL="http://localhost:3003/api" \
STAGING_EMAIL="a@company.ru" \
STAGING_PASSWORD="passwordA" \
STAGING_EMAIL_B="b@company.ru" \
STAGING_PASSWORD_B="passwordB" \
STAGING_EMAIL_C="c@company.ru" \
STAGING_PASSWORD_C="passwordC" \
npm run test:e2e:approval-flow
```

```bash
STAGING_API_URL="http://localhost:3003/api" \
STAGING_EMAIL="a@company.ru" \
STAGING_PASSWORD="passwordA" \
STAGING_EMAIL_B="b@company.ru" \
STAGING_PASSWORD_B="passwordB" \
STAGING_EMAIL_C="c@company.ru" \
STAGING_PASSWORD_C="passwordC" \
npm run test:e2e:approval-branches
```

```bash
STAGING_API_URL="http://localhost:3003/api" \
STAGING_PLATFORM_ADMIN_EMAIL="platform-admin@docflow.local" \
STAGING_PLATFORM_ADMIN_PASSWORD="111" \
STAGING_GATE_EMAIL="employee@company.ru" \
npm run test:e2e:password-gate
```

```bash
STAGING_API_URL="http://localhost:3003/api" \
STAGING_PLATFORM_ADMIN_EMAIL="platform-admin@docflow.local" \
STAGING_PLATFORM_ADMIN_PASSWORD="111" \
npm run test:e2e:soft-delete
```

```bash
STAGING_API_URL="http://localhost:3003/api" \
STAGING_EMAIL="a@company.ru" \
STAGING_PASSWORD="passwordA" \
STAGING_EMAIL_B="b@company.ru" \
STAGING_PASSWORD_B="passwordB" \
STAGING_EMAIL_C="c@company.ru" \
STAGING_PASSWORD_C="passwordC" \
npm run test:e2e:notifications
```

Требования к аккаунтам: активные, не удалённые, одной компании, с валидными (не временными) паролями.

## API маршрутов согласования (контракт для Dev1)

Маршрут согласования — шаблон цепочки шагов, по которому документ проходит утверждение. Админ создаёт маршрут; при submit документа Dev1 привязывает `route_id` и создаёт задачи по шагам.

### Эндпоинты

| Метод | Путь | Доступ | Назначение |
|-------|------|--------|------------|
| `GET` | `/api/admin/routes?companyId=` | `requireAuth` + `requirePlatformAdmin` | Список маршрутов (по компании или все) |
| `POST` | `/api/admin/routes` | `requireAuth` + `requirePlatformAdmin` | Создание маршрута |
| `GET` | `/api/company/approval-routes` | `requireAuth` (любой сотрудник с `companyId`) | Маршруты своей компании (для UI submit) |

### `POST /api/admin/routes` — тело запроса

```json
{
  "companyId": 1,
  "name": "Основной маршрут",
  "isDefault": true,
  "steps": [
    {
      "stepOrder": 1,
      "assigneeKind": "employee",
      "assigneeEmployeeId": 10
    },
    {
      "stepOrder": 2,
      "assigneeKind": "role_default",
      "roleKey": "admin",
      "defaultEmployeeId": 5
    }
  ]
}
```

### Поля шага (`steps[]`)

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `stepOrder` | `number` | да | Порядковый номер (1..N без пропусков) |
| `assigneeKind` | `"employee"` \| `"role_default"` | да | Способ назначения |
| `assigneeEmployeeId` | `number` | при `kind=employee` | ID конкретного сотрудника |
| `roleKey` | `string` | при `kind=role_default` | Роль из `roles_json` (например `"admin"`) |
| `defaultEmployeeId` | `number` | при `kind=role_default` | Fallback-исполнитель |

### Ответ `GET` (список)

```json
{
  "items": [
    {
      "id": 1,
      "companyId": 1,
      "name": "Основной маршрут",
      "isDefault": true,
      "steps": [
        {
          "id": 1,
          "stepOrder": 1,
          "assigneeKind": "employee",
          "assigneeEmployeeId": 10,
          "roleKey": null,
          "defaultEmployeeId": null
        }
      ]
    }
  ]
}
```

### Валидация

- `stepOrder` от 1 до N последовательно, без дубликатов и пропусков.
- Сотрудник (`assigneeEmployeeId` / `defaultEmployeeId`) должен принадлежать той же компании.
- При `isDefault: true` предыдущий default-маршрут компании сбрасывается.

### Связь с документами (для Dev1)

- `approval_documents.route_id` — заполняется при **submit**; `NULL` до отправки.
- `approval_tasks.route_id` — FK на тот же маршрут; Dev1 читает шаги маршрута, чтобы создать цепочку задач и продвигать по ним при **approve**.

### Коды ошибок

| Код | Когда |
|-----|-------|
| 400 | Не заполнены обязательные поля или невалидные шаги |
| 403 | Нет прав (платформенный админ / компания) |
| 404 | Компания не найдена |

---

## Короткий итог

Сервис уже умеет решать основную задачу: получать из договора структурированные поля и сохранять часть из них в MySQL. Помимо парсера, в том же Express-приложении живёт полный домен согласования документов (документы, задачи, маршруты, уведомления) и административный API (компании, сотрудники, роли). Но его важно воспринимать как текущий рабочий pipeline с несколькими ручными шагами и заметными техническими ограничениями, а не как полностью законченный продуктовый backend.
