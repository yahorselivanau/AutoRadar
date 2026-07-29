# REPO_STRUCTURE

## 1. Монорепозиторий

```text
/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── (app)/
│       │   │   ├── chat/
│       │   │   ├── garage/
│       │   │   └── search/[id]/
│       │   ├── api/
│       │   │   ├── ai/
│       │   │   ├── search/
│       │   │   ├── search/[id]/
│       │   │   ├── vehicles/
│       │   │   └── vin/resolve/
│       │   ├── auth/
│       │   └── layout.tsx
│       ├── components/
│       │   ├── ai/
│       │   ├── chat/
│       │   ├── garage/
│       │   ├── search/
│       │   └── ui/
│       ├── lib/
│       │   ├── ai/
│       │   ├── auth/
│       │   ├── search/
│       │   ├── supabase/
│       │   └── validation/
│       └── tests/
├── actors/
│   └── search/
│       ├── .actor/
│       ├── src/
│       │   ├── adapters/
│       │   │   ├── armtek/
│       │   │   ├── av-parts/
│       │   │   ├── remzona/
│       │   │   └── mock/
│       │   ├── orchestration/
│       │   ├── normalization/
│       │   ├── persistence/
│       │   └── main.ts
│       ├── Dockerfile
│       └── tests/
├── packages/
│   ├── domain/
│   │   ├── src/ai/
│   │   ├── src/offers/
│   │   ├── src/search/
│   │   ├── src/vehicles/
│   │   └── src/sources/
│   ├── db/
│   ├── ui/
│   ├── config/
│   └── test-utils/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
├── docs/
│   └── research/
├── .github/
│   └── workflows/
├── AGENTS.md
├── ARCHITECTURE.md
├── DESIGN_SYSTEM.md
├── PRD.md
├── SOURCE_ADAPTERS.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## 2. Web routes

### Pages

- `/` → redirect/open chat.
- `/chat` → основной интерфейс.
- `/garage` → список автомобилей.
- `/search/[id]` → самостоятельная страница результата для deep-link и восстановления.
- `/auth/sign-in` → вход и регистрация по email/паролю.
- `/privacy` → приватность.
- `/terms` → условия и disclaimer.

### API

`POST /api/search`

- валидирует `SearchRequest`;
- создаёт `search_job`;
- запускает Actor;
- возвращает `jobId`.

`GET /api/search/:id`

- возвращает статус;
- статусы источников;
- частичные результаты;
- агрегаты.

`POST /api/ai`

- AI SDK stream;
- tool calling;
- не выполняет scraping напрямую.

`POST /api/vin/resolve`

- нормализует VIN;
- вызывает resolver;
- возвращает результат для подтверждения.

## 3. Основные компоненты

### Chat

- `ChatShell`
- `ConversationList`
- `MessageBubble`
- `Composer`
- `SuggestedPrompts`
- `ClarificationCard`
- `VehicleContextBar`
- `SearchProgressCard`
- `SearchSummaryCard`

### Search

- `SearchResultsOverlay`
- `ResultsTabs`
- `OfferCard`
- `OfferList`
- `SourceProgressRow`
- `CompatibilityWarning`
- `ExternalLinkButton`

### Garage

- `GarageList`
- `VehicleCard`
- `VehicleEditor`
- `VinInput`
- `ActiveVehiclePicker`

## 4. База данных

Минимальные таблицы:

```text
profiles
vehicles
conversations
messages
search_requests
search_jobs
search_job_sources
offers
source_configs
adapter_runs
part_synonyms
vehicle_aliases
```

### Важные индексы

- `vehicles(user_id)`
- `search_jobs(user_id, created_at desc)`
- `search_jobs(session_id, created_at desc)`
- `search_job_sources(search_job_id, source_id)`
- `offers(search_job_id, source_id)`
- `offers(normalized_part_number)`
- `adapter_runs(source_id, started_at desc)`

## 5. Shared schemas

`packages/domain` экспортирует:

- `VehicleContextSchema`
- `PartRequestSchema`
- `SearchRequestSchema`
- `SourceSearchInputSchema`
- `NormalizedOfferSchema`
- `SearchJobStatusSchema`
- `AiExtractedRequestSchema`
- `VinResolutionSchema`

Одинаковые схемы используются web, Actor и tests.

## 6. Environment variables

```bash
# Public
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Server
SUPABASE_SECRET_KEY=
SUPABASE_DB_URL=
APIFY_TOKEN=
APIFY_SEARCH_ACTOR_ID=
APIFY_WEBHOOK_SECRET=

# AI
AI_PROVIDER=google
AI_MODEL=gemini-3.5-flash-lite
GOOGLE_GENERATIVE_AI_API_KEY=
DEEPSEEK_API_KEY=

# Search
SEARCH_MAX_SOURCES=10
SEARCH_ADAPTER_CONCURRENCY=4
SEARCH_ADAPTER_TIMEOUT_MS=10000
SEARCH_TOTAL_TIMEOUT_MS=25000

# Source flags
SOURCE_ARMTEK_ENABLED=true
SOURCE_AV_PARTS_ENABLED=true
SOURCE_REMZONA_ENABLED=true

# Remzona public XHR transport
REMZONA_BASE_URL=https://remzona.by/
REMZONA_USER_AGENT=AutoRadar/0.1 (+https://autoradar.vercel.app; parts search)
REMZONA_HTTP_TIMEOUT_MS=10000
REMZONA_REQUEST_INTERVAL_MS=5000
REMZONA_PLAYWRIGHT_FALLBACK_ENABLED=false
REMZONA_LIVE_SMOKE=false

# Security
SEARCH_JOB_SIGNING_SECRET=
ANON_SESSION_SECRET=
```

Добавлять source-specific переменные только после подтверждённого исследования.
Не отключать TLS verification и не коммитить секреты.

## 7. Команды

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm supabase:start
pnpm supabase:reset
pnpm actor:dev
pnpm actor:test
```

## 8. CI

Pull request:

- install;
- lint;
- typecheck;
- unit tests;
- fixture adapter tests;
- build web.

Main:

- всё выше;
- deploy preview/production;
- deploy Actor только после успешных тестов;
- migrations применяются контролируемо.

Live smoke tests источников не должны блокировать каждый PR, потому что внешние сайты нестабильны. Запускать отдельно вручную или по расписанию.

## 9. Feature flags

Каждый источник имеет:

- enabled;
- max timeout;
- priority;
- supported search modes;
- display name;
- legal/research status.

Feature flags хранятся в `source_configs` и имеют env fallback.

## 10. Design system

`packages/ui` содержит переиспользуемые primitives и продуктовые UI-композиции согласно `DESIGN_SYSTEM.md`.

- `DESIGN_SYSTEM.md` — источник истины для бренда, responsive UX и компонентов.
- `DESIGN_TOKENS.css` — исходные Tailwind v4/shadcn tokens; перенести в `packages/ui/styles/design-tokens.css`.
- Не создавать цвета, радиусы, типографические уровни или альтернативные UI-паттерны вне утверждённых токенов.
