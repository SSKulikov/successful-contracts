# PDF Parser UI: полная документация сервиса

Документ описывает текущее состояние сервиса по результатам проверки кода и локального запуска `1 апреля 2026 года`.

Важно: текущий сервис состоит из двух отдельных репозиториев.

| Репозиторий | Назначение | Стек | Порт | Нужны `env` |
| --- | --- | --- | --- | --- |
| `pdf-parser-ui` | UI для загрузки договора, проверки полей и ручного сохранения | `HTML + CSS + vanilla JS + Bootstrap + axios + lite-server` | `3000` | Нет |
| `pdf-parser` | Backend: загрузка файлов, OCR, запросы в GigaChat, валидация, запись в MySQL | `Node.js + Express + TypeScript + Prisma + MySQL + Tesseract.js + pdf2pic + mammoth` | `3003` | Да |

Если поднят только `pdf-parser-ui`, страница откроется, но автозаполнение и сохранение работать не будут, потому что UI обращается к backend на `http://localhost:3003`.

## Что делает сервис

Сервис нужен для сценария:

1. Пользователь загружает договор в `PDF` или `DOCX`.
2. Backend извлекает текст из документа.
3. Текст отправляется в `GigaChat`, который возвращает структурированный JSON.
4. UI подставляет найденные значения в форму.
5. Пользователь проверяет и при необходимости исправляет поля вручную.
6. После нажатия `Отправить` backend сохраняет данные в MySQL.

Идея сервиса: это не полностью автоматический парсер, а полуавтоматический инструмент "распознать -> показать -> дать человеку исправить -> сохранить".

## Быстрый ответ для продакта

- Сервис умеет ускорять ввод данных по договору, но не гарантирует 100% точность.
- Человек в процессе обязателен: пользователь должен проверить автозаполненные поля перед сохранением.
- После парсинга часть данных отправляется во внешний LLM-сервис `GigaChat`.
- В текущей реализации нет авторизации, ролей, очередей, тестов и Docker-окружения.
- Поддержанный рабочий путь: `PDF` и `DOCX`.
- Формат `.doc` визуально разрешен, но фактически ломается на backend и должен считаться неподдержанным.

## Архитектура

```mermaid
flowchart TD
    A[Пользователь] --> B[UI: pdf-parser-ui]
    B --> C[POST /api/parse-file]
    C --> D[Backend: pdf-parser]
    D --> E{Тип файла}
    E -->|PDF| F[pdf2pic -> Tesseract OCR]
    E -->|DOCX| G[mammoth]
    F --> H[storage/text/*.txt]
    G --> H
    H --> I[GigaChat]
    I --> J[ValidatorService]
    J --> K[parsedJson]
    K --> B
    B --> L[Пользователь проверяет и редактирует форму]
    L --> M[POST /api/save-data-info]
    M --> N[ValidatorService]
    N --> O[MySQL: AlternativaGames.contract]
```

## Как сервис работает по шагам

### 1. Что делает UI

Текущий UI находится в этом репозитории и состоит из трех основных файлов:

- `index.html` содержит форму договора и реквизитов.
- `script.js` содержит всю логику загрузки, автозаполнения и сохранения.
- `style.css` отвечает за layout и spinner.

Поведение UI:

1. Кнопка `Выбрать файл для автозаполнения` открывает скрытый `input type="file"`.
2. После выбора файла UI валидирует MIME-тип.
3. Разрешены MIME-типы:
   `application/pdf`,
   `application/msword`,
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
4. UI показывает spinner и отправляет файл в `POST http://localhost:3003/api/parse-file`.
5. Если backend вернул `parsedJson`, UI заполняет поля формы.
6. Пользователь может переписать любые значения вручную.
7. По кнопке `Отправить` UI собирает значения всех `input` из формы в плоский JSON.
8. Этот JSON уходит в `POST http://localhost:3003/api/save-data-info`.
9. После успеха UI очищает форму, показывает alert и делает `window.location.reload()`.

Важно:

- UI не хранит отдельное состояние формы. Источник истины на момент сохранения это текущие значения `input`.
- Значит, именно ручные правки пользователя и будут сохранены в БД.
- В UI нет собственных `env`.
- URL backend сейчас захардкожен прямо в `script.js`.

### 2. Что делает backend при парсинге файла

Backend живет в отдельном репозитории `pdf-parser`.

Маршруты backend:

- `POST /api/parse-file`
- `POST /api/save-data-info`

Логика `POST /api/parse-file`:

1. `multer` принимает `multipart/form-data` с полем `file`.
2. Файл сохраняется в `storage/`:
   `PDF` в `storage/pdf`,
   Word в `storage/word`.
3. Имя файла генерируется как `Date.now() + исходное расширение`.
4. Если файл `PDF`, backend:
   конвертирует страницы в картинки через `pdf2pic`,
   распознает текст через `Tesseract.js`,
   сохраняет распознанный текст в `storage/text/<id>.txt`.
5. Если файл `DOCX`, backend:
   извлекает raw text через `mammoth`,
   сохраняет текст в `storage/text/<id>.txt`.
6. Затем `RegExService` режет текст на чанки по `5000` символов.
7. Каждый чанк последовательно отправляется в `GigaChat`.
8. Ответы склеиваются по правилу "берем первое ненулевое значение".
9. `ValidatorService` приводит данные к финальному виду.
10. UI получает JSON с `parsedJson`.

Важно:

- Чанки в `GigaChat` идут последовательно, а не параллельно.
- Для длинных договоров это увеличивает время ответа.
- Если более ранний чанк уже заполнил поле, более поздний чанк это поле не исправит.
- Это сознательная логика текущей реализации, а не баг на уровне транспорта.

### 3. Что делает backend при сохранении в БД

Логика `POST /api/save-data-info`:

1. Backend принимает обычный `application/json`.
2. `ValidatorService` нормализует входные значения.
3. Затем выполняется `INSERT INTO AlternativaGames.contract`.
4. После успеха backend возвращает `201` и сообщение `Данные успешно сохранены`.

Важно:

- Сохранение и парсинг это два разных шага.
- `parse-file` сам по себе ничего в БД не пишет.
- `save-data-info` можно вызвать даже без парсинга, если заполнить форму руками.

## Какие поля реально проходят через систему

### Поля, которые видит пользователь в UI

Активные поля формы:

- `contract_number`
- `contract_subject`
- `item`
- `contract_sum`
- `contract_currency`
- `contract_date`
- `contract_start_date`
- `contract_end_date`
- все поля `supplier_*`
- все поля `customer_*`

### Поля, которые backend умеет парсить, но UI сейчас не показывает

Backend может вернуть:

- `contract_type`
- `payment_1_sum`
- `payment_1_date`
- `payment_2_sum`
- `payment_2_date`

Но в UI эти поля сейчас отключены:

- в `index.html` соответствующие `input` закомментированы;
- в `script.js` заполнение этих полей тоже закомментировано;
- в БД эти поля тоже сейчас не сохраняются.

### Матрица "парсится / показывается / сохраняется"

| Группа данных | Возвращается из `parse-file` | Видна в UI | Сохраняется в MySQL |
| --- | --- | --- | --- |
| Реквизиты поставщика | Да | Да | Да |
| Реквизиты заказчика | Да | Да | Да |
| `contract_number` | Да | Да | Да |
| `contract_subject` | Да | Да | Да |
| `item` | Да | Да | Да |
| `contract_sum` | Да | Да | Да |
| `contract_currency` | Да | Да | Да |
| `contract_date` | Да | Да | Да |
| `contract_start_date` | Да | Да | Да |
| `contract_end_date` | Да | Да | Да |
| `contract_type` | Да | Нет | Нет |
| `payment_1_*` | Да | Нет | Нет |
| `payment_2_*` | Да | Нет | Нет |

## Куда уходят данные и что сохраняется

Это важный раздел для продуктовой и безопасностной оценки.

### Локальное хранение на диске

Backend пишет файлы в `pdf-parser/storage/`:

- `storage/pdf`:
  исходные `PDF` остаются на диске.
- `storage/word`:
  исходные `DOCX` временно сохраняются, затем удаляются после извлечения текста.
- `storage/img`:
  временные картинки страниц `PDF`, потом удаляются.
- `storage/text`:
  распознанный текст договора сохраняется и остается на диске.

Следствие:

- папки `storage/pdf` и `storage/text` со временем будут расти;
- автоочистки в текущей реализации нет.

### Внешний LLM

Текст договора отправляется в `GigaChat`.

Это означает:

- данные договора выходят за пределы локального UI;
- при работе с чувствительными документами это надо учитывать отдельно.

### База данных

Сохраняется таблица `AlternativaGames.contract` в MySQL.

В SQL сейчас захардкожено именно это имя базы.

## Какие `env` нужны

### В этом репозитории `pdf-parser-ui`

Никакие `env` не нужны.

Фронтенд сейчас не читает `process.env`, `.env`, `import.meta.env` или любой другой runtime/build-time config.

Практическое следствие:

- backend URL нельзя поменять через переменную окружения;
- если нужен другой host или port, надо менять `script.js`.

### В backend-репозитории `pdf-parser`

Шаблон лежит в `pdf-parser/.env.example`.

| Переменная | Обязательна | Для чего нужна | Где получить |
| --- | --- | --- | --- |
| `DATABASE_URL` | Да, если нужен `save-data-info` и Prisma-команды | Подключение к MySQL | Либо создать свою локальную БД, либо запросить строку у владельца сервиса / DBA / в секрет-хранилище команды |
| `GIGA_CHAT_ACCESS_KEY` | Да, если нужен `parse-file` | Доступ к GigaChat API | В личном кабинете GigaChat Studio по официальному quickstart |
| `DATABASE_NAME` | Нет | В текущем runtime не используется | Можно оставить для справки |
| `OAUTH_TOKEN` | Нет | Нужен только legacy-сервису `YaGptService`, который сейчас не используется роутами | Обычно не нужен |

### Пример backend `.env`

```dotenv
DATABASE_URL="mysql://root:password@localhost:3306/AlternativaGames"
DATABASE_NAME="AlternativaGames"
OAUTH_TOKEN=""
GIGA_CHAT_ACCESS_KEY="your-gigachat-authorization-key"
```

## Где брать значения для `env`

### `DATABASE_URL`

Это обычная строка подключения к MySQL.

Есть два сценария:

1. Локальная разработка.
   Вы сами поднимаете MySQL, создаете БД `AlternativaGames` и используете локальную строку подключения.
2. Работа с общей dev/stage/prod базой.
   Конкретную строку подключения должен выдать владелец сервиса, DBA, DevOps или секрет-хранилище команды.

Полезные ссылки:

- [Prisma: MySQL overview](https://www.prisma.io/docs/orm/overview/databases/mysql)
- [Prisma: MySQL connection URLs](https://www.prisma.io/docs/orm/reference/connection-urls#mysql)
- [MySQL Community Server](https://dev.mysql.com/downloads/mysql/)

### `GIGA_CHAT_ACCESS_KEY`

Ключ берется в официальном кабинете `GigaChat`.

Полезные ссылки:

- [GigaChat: быстрый старт для физлиц](https://developers.sber.ru/docs/ru/gigachat/individuals-quickstart)
- [GigaChat: быстрый старт для ИП и юрлиц](https://developers.sber.ru/docs/ru/gigachat/legal-quickstart)
- [GigaChat: сертификаты и TLS](https://developers.sber.ru/docs/ru/gigachat/certificates)

Практически это выглядит так:

1. Зайти в кабинет `GigaChat`.
2. Создать или открыть проект для API.
3. Получить `Authorization Key`.
4. Подставить его в `GIGA_CHAT_ACCESS_KEY`.

### `DATABASE_NAME`

Сейчас эта переменная есть только "для памяти".

Важный нюанс:

- runtime не читает `DATABASE_NAME`;
- имя базы фактически определяется `DATABASE_URL`;
- в `save.controller.ts` дополнительно зашит `INSERT INTO AlternativaGames.contract`.

То есть изменение `DATABASE_NAME` само по себе поведение не меняет.

### `OAUTH_TOKEN`

Это legacy-переменная для `YaGptService`.

Сейчас она не нужна, потому что:

- сервис работает через `GigaChat`;
- `YaGptService` не подключен к маршрутам;
- стандартный сценарий сервиса на него не опирается.

## Системные зависимости

Полный локальный запуск требует не только `npm install`.

Нужны:

- `Node.js`
- `npm`
- `MySQL`
- `GraphicsMagick`
- `Ghostscript`

Локально проверено:

- `Node.js 18.16.0`
- `npm 9.5.1`
- `GraphicsMagick 1.3.45`
- `Ghostscript 10.05.1`
- `MySQL 9.3.0`

Полезные ссылки:

- [Node.js download](https://nodejs.org/en/download)
- [Homebrew](https://brew.sh/)
- [Homebrew formula: graphicsmagick](https://formulae.brew.sh/formula/graphicsmagick)
- [Homebrew formula: ghostscript](https://formulae.brew.sh/formula/ghostscript)
- [MySQL download](https://dev.mysql.com/downloads/mysql/)

Почему это нужно:

- `pdf2pic` использует системные инструменты для конвертации `PDF` в картинки;
- `Tesseract.js` распознает текст уже с этих картинок;
- Prisma пишет в MySQL;
- `GigaChat` требует сетевого доступа.

Отдельный нюанс по OCR:

- в backend лежат файлы `eng.traineddata` и `rus.traineddata`;
- по текущему коду `Tesseract.js` вызывается без явного `langPath`;
- значит, локальные `traineddata` не подключены напрямую;
- на чистой машине возможна первая загрузка языковых данных из сети.

Последний пункт это вывод по текущему коду, а не отдельная runtime-настройка.

## Как запустить сервис локально

### Вариант 1. Нужно просто открыть UI

Подойдет, если вы хотите только посмотреть верстку.

```bash
cd /path/to/pdf-parser-ui
npm install
npm start
```

После запуска UI доступен на:

```text
http://localhost:3000
```

Но:

- кнопка автозаполнения не сработает без backend;
- сохранение в БД тоже не сработает без backend.

### Вариант 2. Нужен полный рабочий сценарий

Это основной вариант.

#### Шаг 1. Подготовить backend

```bash
cd /path/to/pdf-parser
npm install
cp .env.example .env
```

После этого заполните `.env`.

#### Шаг 2. Подготовить системные пакеты

На macOS:

```bash
brew install graphicsmagick ghostscript
```

На Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y graphicsmagick ghostscript
```

#### Шаг 3. Подготовить базу

Создайте базу `AlternativaGames`, если ее еще нет.

Пример для локального MySQL:

```sql
CREATE DATABASE AlternativaGames;
```

Затем выполните в backend-репозитории:

```bash
npm run prisma-generate
npm run prisma-migrate-deploy
```

По проверке текущего репозитория:

- Prisma-схема находится в `src/prisma/schema.prisma`;
- миграции существуют;
- на проверенной локальной базе команда `npx prisma migrate status --schema=src/prisma/schema.prisma` показала статус `Database schema is up to date`.

#### Шаг 4. Запустить backend

```bash
cd /path/to/pdf-parser
npm start
```

Что делает `npm start` в backend:

1. запускает TypeScript-сборку;
2. собирает `dist/`;
3. запускает `node ./dist/index.js`;
4. выставляет `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Ожидаемый адрес backend:

```text
http://localhost:3003
```

Ожидаемый smoke test:

```bash
curl -X POST http://localhost:3003/api/parse-file
```

Ожидаемый ответ:

```json
{"error":"Файл не загружен"}
```

Это нормальный признак того, что сервер жив и маршрут отвечает.

#### Шаг 5. Запустить frontend

```bash
cd /path/to/pdf-parser-ui
npm install
npm start
```

Ожидаемый адрес frontend:

```text
http://localhost:3000
```

#### Шаг 6. Проверить end-to-end

1. Открыть `http://localhost:3000`.
2. Нажать `Выбрать файл для автозаполнения`.
3. Загрузить `PDF` или `DOCX`.
4. Дождаться заполнения формы.
5. Проверить поля вручную.
6. Нажать `Отправить`.
7. Убедиться, что UI показал `Данные успешно сохранены!`.

## Какие форматы реально поддержаны

| Формат | UI пропускает | Backend принимает | Реально работает |
| --- | --- | --- | --- |
| `PDF` | Да | Да | Да |
| `DOCX` | Да | Да | Да |
| `DOC` | Да | Да по MIME | Нет, в текущем коде фактически ломается |

Почему `.doc` не работает:

- `multer` разрешает MIME старого Word;
- но `WordService` всегда ищет файл с расширением `.docx`;
- поэтому старый `.doc` нужно считать неподдержанным форматом.

## Какие ограничения важно знать заранее

Это текущие ограничения сервиса, подтвержденные кодом.

1. `parse-file` и `save-data-info` не образуют автоматический pipeline.
2. UI не использует `env` и не умеет переключать backend по конфигу.
3. Для смены host/port нужно менять `script.js`.
4. `contract_type` и поля платежей парсятся, но не показываются и не сохраняются.
5. `.doc` фактически не поддержан.
6. Backend использует raw SQL с хардкодом `AlternativaGames.contract`.
7. `DATABASE_NAME` есть в `.env`, но runtime его не использует.
8. Регулярки `parseRequisites` и `parsePaymentTerms` вычисляются, но их результат не влияет на финальный JSON.
9. Ошибки в UI в основном попадают в консоль браузера, а не в отдельные пользовательские сообщения.
10. PDF и распознанный текст копятся на диске без автоочистки.
11. В сервисе нет авторизации и разграничения доступа.
12. В сервисе нет автотестов.
13. В сервисе нет Docker-конфигурации.
14. `npm start` в backend отключает TLS-проверку через `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Что важно знать джуну перед изменениями

Если нужно доработать сервис, самые важные точки входа такие:

- `pdf-parser-ui/index.html`
  состав и порядок полей формы.
- `pdf-parser-ui/script.js`
  загрузка файла, hardcoded backend URL, маппинг UI -> `save-data-info`, поведение после сохранения.
- `pdf-parser-ui/style.css`
  визуальная часть.
- `pdf-parser/src/controllers/file.controller.ts`
  основной pipeline парсинга файла.
- `pdf-parser/src/services/PdfService/index.ts`
  `PDF -> image -> OCR -> text`.
- `pdf-parser/src/services/WordService/index.ts`
  `DOCX -> text`.
- `pdf-parser/src/services/GigaChatService/index.ts`
  запросы в `GigaChat`.
- `pdf-parser/src/services/ValidatorService/index.ts`
  нормализация и приведение типов.
- `pdf-parser/src/controllers/save.controller.ts`
  запись в MySQL.
- `pdf-parser/src/prisma/schema.prisma`
  реальная модель таблицы `contract`.

## Частые вопросы

### Можно ли пользоваться сервисом без MySQL?

Да, если нужен только парсинг и просмотр автозаполнения.

Тогда:

- нужен backend;
- нужен `GIGA_CHAT_ACCESS_KEY`;
- `save-data-info` просто не используется.

### Можно ли пользоваться сервисом без GigaChat?

Да, если форма заполняется вручную и нужен только шаг сохранения в MySQL.

Тогда:

- backend все равно нужен;
- нужен `DATABASE_URL`;
- `parse-file` можно не вызывать.

### Почему форма открывается, но автозаполнение не работает?

Обычно причина одна из этих:

- backend не запущен;
- backend слушает не `3003`;
- в `script.js` все еще зашит `http://localhost:3003`;
- не заполнен `GIGA_CHAT_ACCESS_KEY`;
- не установлены `graphicsmagick` / `ghostscript` для `PDF`.

### Почему данные сохранились не полностью?

Потому что текущая таблица и `save.controller.ts` сохраняют не все, что умеет вернуть парсер.

Не сохраняются:

- `contract_type`
- `payment_1_sum`
- `payment_1_date`
- `payment_2_sum`
- `payment_2_date`

### Куда смотреть, если нужно поменять адрес backend?

В `pdf-parser-ui/script.js`.

Сейчас там две прямые отправки на:

- `http://localhost:3003/api/parse-file`
- `http://localhost:3003/api/save-data-info`

## Что логично улучшить дальше

Если сервис планируется развивать, наиболее полезные следующие шаги:

1. Вынести backend base URL из `script.js` в конфиг или `env`.
2. Сделать единый end-to-end endpoint "parse and save".
3. Исправить или запретить `.doc`.
4. Убрать хардкод `AlternativaGames.contract`.
5. Добавить автоочистку `storage/`.
6. Показать пользователю понятные ошибки в UI, а не только писать в консоль.
7. Добавить авторизацию и аудит.
8. Добавить автотесты.
9. Убрать `NODE_TLS_REJECT_UNAUTHORIZED=0` из обычного запуска.
10. Вернуть в UI только те поля, которые действительно сохраняются, или наоборот расширить схему БД и сохранение.

## Короткий итог

Текущий сервис уже решает основную задачу: берет договор, пытается достать из него структурированные данные, позволяет человеку их проверить и сохраняет результат в MySQL.

Но важно понимать его как рабочий внутренний инструмент, а не как полностью завершенный продукт:

- часть логики держится на ручной проверке;
- часть конфигурации захардкожена;
- между UI и backend есть явные технические ограничения;
- чувствительные данные отправляются во внешний LLM.

Для продукта это хороший MVP-уровень. Для джуна это понятная база, с которой можно безопасно работать, если сначала держать в голове ограничения, перечисленные в этом документе.
