# AutoRadar — AI-агрегатор автозапчастей для Беларуси

Статус: foundation MVP в разработке  
Дата фиксации: 28 июля 2026

## Состав

- `PRD.md` — продуктовые требования и пользовательские сценарии.
- `ARCHITECTURE.md` — техническая архитектура MVP.
- `AGENTS.md` — обязательные инструкции для Codex и других coding agents.
- `REPO_STRUCTURE.md` — структура монорепозитория, маршруты и переменные окружения.
- `SOURCE_ADAPTERS.md` — матрица источников и порядок исследования сайтов.
- `DESIGN_SYSTEM.md` — утверждённая дизайн-система AutoRadar: бренд, цвета, типографика, responsive UX и компоненты.
- `DESIGN_TOKENS.css` — готовые Tailwind v4/shadcn semantic tokens.
- `apps/web` — mobile-first Next.js приложение.
- `packages/domain` — общие Zod-схемы и доменная нормализация.
- `supabase` — migrations и локальная конфигурация.
- `docs/HANDOFF.md` — текущее состояние и следующий шаг.

## Быстрый старт

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

После запуска открыть `http://localhost:3000`. AI-разбор запроса использует
Vercel AI Gateway и модель из `AI_MODEL`. Для локальной работы связать проект
с Vercel и выполнить `vercel env pull .env.local`; в production используется
автоматический OIDC. Реальная выдача Remzona доступна без регистрации.
Zap.by подключён как второй источник для запросов с маркой и моделью.

Модель `openai/gpt-5.4-nano` проверена реальным запросом через AI Gateway и
доступна на текущем Free Credit.

Проверки:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Развёртывание

- GitHub: `yahorselivanau/AutoRadar`, production branch `main`.
- Vercel production: https://autoradar.vercel.app
- Vercel project: `autoradar`, web application: `apps/web`.
- Vercel root directory: `apps/web`, framework preset: `Next.js`.
- AI Gateway model: `openai/gpt-5.4-nano` через `AI_MODEL`.

## Remzona adapter

Первый рабочий источник новых запчастей — Remzona. Адаптер разрешает категорию
через публичный XHR, загружает server-rendered каталог обычным HTTP и парсит
цены через Cheerio. Playwright доступен только как opt-in fallback и ручной
discovery-инструмент. Точный отчёт и fixtures:
`actors/search/src/adapters/remzona/DISCOVERY.md`.

Локальная проверка:

```bash
pnpm actor:test
SOURCE_REMZONA_ENABLED=true pnpm actor:dev
pnpm remzona:discover
REMZONA_LIVE_SMOKE=true pnpm remzona:smoke -- стеклоподъемник
```

Web-приложение вызывает `POST /api/search/remzona`. Источник можно мгновенно
отключить через `SOURCE_REMZONA_ENABLED=false`. Браузерный fallback отдельно
включается через `REMZONA_PLAYWRIGHT_FALLBACK_ENABLED=true`.

## Zap.by adapter

Zap.by использует только разрешённые server-rendered страницы
`/carparts/...`: адаптер проходит по проверенным ссылкам марки, модели и
категории, затем парсит карточки обычным HTTP + Cheerio. `/search`, VIN и
picker XHR не вызываются, потому что `robots.txt` запрещает search/query
маршруты. Точные ограничения, fixtures и селекторы:
`actors/search/src/adapters/zap/DISCOVERY.md`.

```bash
pnpm actor:test
ZAP_LIVE_SMOKE=true pnpm zap:smoke -- AUDI A4 2010 "Масляный фильтр"
```

Источник отключается через `SOURCE_ZAP_ENABLED=false`.

Для Git deployment проект Vercel должен быть подключён к GitHub-репозиторию
через Vercel Git Integration. После подключения push в `main` создаёт
production deployment, а push в другие ветки и pull request — preview
deployment.

## Supabase для Codex

В доверенном репозитории Codex загружает `.codex/config.toml` и подключает
проектно-ограниченный Supabase MCP для AutoRadar
(`project_ref=vtehtsxaudcmgvclktrp`). Глобальное подключение Supabase в этом
репозитории отключено, чтобы операции не могли попасть в другой проект.

После первой настройки OAuth перезапустить задачу Codex и проверить сервер
`supabase` через `/mcp`.

## Ключевое решение

MVP не копирует полные каталоги. Он выполняет живой федеративный поиск под конкретный запрос пользователя:

1. AI или форма собирает структурированные параметры.
2. Сервер запускает общий адаптер напрямую; persisted search job добавляется
   после стабилизации второго источника.
3. Apify Actor остаётся опциональным для long-running источников.
4. Каждый адаптер использует самый дешёвый доступный способ:
   - публичный HTTP/JSON;
   - HTML + Cheerio;
   - Playwright только при необходимости.
5. Результаты нормализуются и постепенно показываются пользователю.
6. Пользователь переходит на исходный сайт продавца.

## Зафиксированные ограничения MVP

- География: только Беларусь.
- Монетизация: отсутствует.
- Целевая аудитория: автовладельцы, механики, СТО и магазины.
- Текущий источник: `remzona.by`; следующие кандидаты — `armtek.by` и
  `av-parts.by`.
- Архитектура должна поддерживать до 10 источников.
- Поиск доступен без регистрации.
- Аккаунт нужен для гаража, истории и сохранённых автомобилей.
- AI не имеет права придумывать OEM-номера или подтверждать совместимость без источника.
- Сложный кеш, Redis, BullMQ, Elasticsearch и TecDoc не входят в первую версию.
