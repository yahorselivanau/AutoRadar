# ARCHITECTURE: MVP

## 1. Архитектурные принципы

1. Живой федеративный поиск вместо полного копирования каталогов.
2. Scraping/collection отделён от пользовательского приложения.
3. Один контракт для всех источников.
4. Самый дешёвый способ доступа используется первым.
5. Каждый источник падает независимо.
6. AI интерпретирует запрос, но не определяет совместимость вместо каталога.
7. Минимум инфраструктуры до подтверждения гипотезы.
8. PostgreSQL остаётся переносимым источником данных.

## 2. Стек

### Web

- Next.js App Router
- TypeScript strict
- React
- Tailwind CSS
- shadcn/ui
- Vercel AI SDK
- Zod
- TanStack Query для клиентского состояния запросов
- Supabase SSR client

### Backend/data

- Supabase PostgreSQL
- Supabase Auth
- Row Level Security
- Supabase Storage только при необходимости
- обычные Next.js Route Handlers
- Supabase Edge Functions не используются для scraping

### Search execution

- Remzona adapter напрямую из server-side Next.js route через публичный XHR;
- Apify Actor остаётся опциональным для будущих источников, которым нужен
  отдельный long-running runtime;
- TypeScript;
- Crawlee;
- CheerioCrawler или прямой HTTP для простых страниц;

### Tooling

- pnpm workspace;
- Turborepo;
- Vitest;
- Playwright Test для end-to-end;
- ESLint;
- Prettier;
- GitHub Actions.

## 3. Общий поток

```text
Client
  |
  | natural-language request
  v
AI extraction + Zod validation
  |
  | SearchRequest (vehicle + part constraints)
  v
Zap.by adapter
  |
  +--> catalogue/model/engine resolution
  +--> product characteristics + applicability
  +--> deterministic matcher
  |
  +--> confirmed/possible offers
  `--> structured clarification --> saved vehicle/part context --> repeat search
```

В текущем закрытом MVP web-поток вызывает только Zap.by. Контекст уточнений
хранится в `localStorage`, валидируется Zod и привязан к автомобилю и названию
детали. Для будущего серверного search-job потока прогресс получать
polling-запросом раз в 1–2 секунды; Supabase Realtime оставить дальнейшей
оптимизацией.

## 4. Где исполняются адаптеры

Remzona вызывается напрямую из серверного Next.js route через общий адаптер из
`actors/search`. Это оставляет один внешний network hop и тот же
нормализованный контракт для локального Actor и web runtime.

Apify используется только для источника, если ему действительно необходим
отдельный long-running runtime. Это может дать:

- единый runtime;
- единые таймауты;
- единые логи;
- один деплой;
- возможность локального запуска;
- лёгкое переключение HTTP → Playwright;
- отсутствие scraping-кода в Vercel Functions.

Использование Apify не является обязательным для каждого источника.

## 5. Контракт адаптера

```ts
export interface PartsSourceAdapter {
  id: SourceId;
  capabilities: {
    searchByPartNumber: boolean;
    searchByVehicle: boolean;
    searchByVin: boolean;
    searchByText: boolean;
  };

  search(
    input: SourceSearchInput,
    context: AdapterContext,
  ): Promise<SourceSearchResult>;
  healthCheck(context: AdapterContext): Promise<AdapterHealth>;
}
```

```ts
export interface SourceSearchInput {
  queryId: string;
  vehicle?: VehicleContext;
  part: PartRequest;
  rawPartNumber?: string;
  normalizedPartNumber?: string;
  vin?: string;
  locale: "ru-BY";
  currency: "BYN";
}
```

```ts
export interface NormalizedOffer {
  sourceId: SourceId;
  externalId: string;
  externalUrl: string;
  title: string;
  brand?: string;
  rawPartNumber?: string;
  normalizedPartNumber?: string;
  condition: "new" | "used" | "unknown";
  partKind: "original" | "analog" | "unknown";
  priceAmount?: number;
  currency: "BYN";
  availability?: string;
  deliveryText?: string;
  location?: string;
  sellerName?: string;
  imageUrl?: string;
  compatibilityText?: string;
  fetchedAt: string;
  rawPayloadHash: string;
}
```

## 6. Порядок исследования источника

Codex обязан использовать следующий порядок:

### Шаг 0. Правила доступа

- проверить публичные условия использования;
- проверить `robots.txt`;
- определить, доступна ли нужная выдача гостю;
- не использовать закрытые личные кабинеты;
- не обходить CAPTCHA, авторизацию, paywall или явно запрещённый доступ;
- прекратить интеграцию, если публичный поиск нельзя воспроизвести без обхода
  защиты.

### Шаг 1. Прямой URL/HTTP

- открыть поиск вручную;
- проверить, кодируются ли параметры в URL;
- повторить запрос через `fetch`/HTTP client;
- проверить server-rendered HTML.

Сетевая блокировка или CAPTCHA фиксируются как typed error. Они не являются
основанием маскировать автоматический трафик. TLS verification обязательна и
не отключается.

### Шаг 2. HTML

Если предложения присутствуют в HTML:

- использовать прямой HTTP;
- парсить Cheerio;
- не загружать изображения, CSS и JS;
- сохранять fixture.

### Шаг 3. Публичный JSON/XHR

Если HTML пустой или неполный:

- открыть страницу Playwright;
- записать запросы `xhr` и `fetch`;
- определить минимальный публичный endpoint;
- воспроизвести его обычным HTTP-запросом;
- использовать браузер только для исследования, если endpoint можно вызывать напрямую.

### Шаг 4. Browser automation

Playwright остаётся только если:

- запрос требует выполнения JavaScript;
- сессия создаётся браузером;
- форма не воспроизводится обычным HTTP;

Proxy не меняет позицию Playwright в лестнице: сначала проверяются HTTP, HTML и
публичный JSON/XHR.

## 7. Параллельность и таймауты

Начальные настройки:

- максимум 10 адаптеров на поиск;
- timeout адаптера: 8–12 секунд;
- максимум один повтор только для сетевых ошибок;
- общий timeout задания: 45 секунд;
- частичные результаты сохраняются сразу;
- `Promise.allSettled`, а не `Promise.all`.

Настройки должны быть переменными окружения.

## 8. Минимальное хранение данных

Не создавать собственный полный каталог.

Хранить:

### Пользовательские данные

- profiles
- vehicles
- conversations
- messages

### Поиск

- search_jobs
- search_job_sources
- search_requests
- offers

### Справочники

- source_configs
- part_synonyms
- vehicle_aliases

### Операционные данные

- adapter_runs
- adapter_failures

`offers` привязываются к конкретному поисковому заданию. Позже они могут использоваться как кеш, но в MVP кеш не является отдельной подсистемой.

## 9. Статусы задания

`search_jobs.status`:

- `created`
- `running`
- `partial`
- `completed`
- `failed`
- `cancelled`
- `expired`

`search_job_sources.status`:

- `queued`
- `running`
- `completed`
- `empty`
- `timeout`
- `blocked`
- `failed`
- `disabled`

## 10. Минимальная дедупликация

Сложный кеш не нужен, но обязательны:

- idempotency key для двойного нажатия;
- уникальность `source_id + external_id + search_job_id`;
- дедупликация одинакового URL;
- объединение предложений с одним источником, артикулом, продавцом и ценой;
- защита от повторной записи одного ответа.

Опционально: не создавать новое задание, если точно такой же запрос от того же пользователя уже выполняется.

## 11. Сортировка

Детерминированная сортировка:

1. точное совпадение OEM;
2. подтверждённый оригинал;
3. подтверждённый аналог;
4. известная цена;
5. наличие;
6. цена;
7. свежесть.

AI не сортирует выдачу самостоятельно.

## 12. VIN resolver

Интерфейс:

```ts
interface VehicleResolver {
  resolve(vin: string): Promise<VehicleResolution>;
}
```

Первый resolver может использовать официальный NHTSA vPIC как best-effort источник базовых данных, но его покрытие ориентировано на автомобили, предназначенные для рынка США. Поэтому результат всегда подтверждается пользователем.

Дополнительно Codex исследует, возвращают ли подключаемые белорусские источники структурированные данные после публичного VIN-поиска. Использование такого ответа допускается только в рамках правил источника.

## 13. AI-архитектура

```text
User message
   |
   v
AI SDK agent
   |
   +--> parse_part_request
   +--> get_active_vehicle
   +--> resolve_vin
   +--> ask clarification
   +--> start_parts_search
   |
   v
Structured chat UI
```

Правила:

- provider и model задаются через env;
- Zod-схемы находятся в `packages/domain`;
- инструменты не имеют прямого доступа к service-role ключу в клиенте;
- AI может вызывать только зарегистрированные инструменты;
- общий веб-поиск не используется для подтверждения совместимости.

## 14. Auth и RLS

Гость:

- создаёт анонимный session id;
- выполняет поиск;
- видит только свои задания по signed token/session cookie.

Авторизованный пользователь:

- управляет своим гаражом;
- видит свою историю;
- может удалить данные.

RLS обязателен для:

- profiles;
- vehicles;
- conversations;
- messages;
- search_jobs пользователя.

Actor записывает данные серверным ключом через защищённый backend/служебное соединение.

## 15. Наблюдаемость

Для каждого источника логировать:

- duration;
- HTTP status;
- способ: `http`, `json`, `html`, `playwright`;
- число результатов;
- селектор/версию адаптера;
- категорию ошибки;
- hash fixture/response schema;
- timestamp.

Полный VIN, cookies и персональные данные в логах запрещены.

## 16. Развёртывание

### Vercel

- `apps/web`;
- preview deployments;
- production domain;
- API routes;
- AI streaming.

### Supabase

- migrations в репозитории;
- локальная разработка через Supabase CLI;
- отдельные dev/prod проекты;
- typed database client.

### Apify

- один Actor;
- один production task;
- секреты через Apify secrets/env;
- endpoint запускается только сервером;
- вход подписывается общим секретом;
- Actor callback/DB write проверяет `search_job_id`.
