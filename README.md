# AutoRadar — AI-агрегатор автозапчастей для Беларуси

Статус: рабочий private MVP на Zap.by и Motorland.by
Дата фиксации: 29 июля 2026

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
автоматический OIDC. В текущем приватном MVP интерфейс ищет новые детали на
Zap.by и б/у детали на Motorland.by. Код Remzona сохранён, но источник
временно выключен.

Модель `openai/gpt-5.4-nano` проверена реальным запросом через AI Gateway и
доступна на текущем Free Credit.

Главная страница не содержит демонстрационных автомобилей или запросов.
Пользователь вводит произвольный текст, проверяет и при необходимости
редактирует распознанные параметры, затем запускает реальный поиск Zap.by и
Motorland.by.
Следующая реплика в чате изменяет текущий структурированный запрос.

Гостевой гараж сохраняется локально в браузере и поддерживает несколько
автомобилей, активную машину, VIN, поколение/версию и технические параметры.
VIN валидируется отдельно и не отправляется AI-модели. Облачная синхронизация
гаража потребует входа и будет подключена через существующую Supabase-схему на
следующем этапе.

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

## Remzona adapter (временно выключен)

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

Маршрут `POST /api/search/remzona` и адаптер сохранены, но web-интерфейс их
сейчас не вызывает. В `.env.example` источник выключен через
`SOURCE_REMZONA_ENABLED=false`.

## Zap.by adapter

AI переводит произвольный запрос в валидируемый JSON: автомобиль, деталь,
сторона, положение и воспроизводимые ограничения (`doorCount`, тип привода,
наличие мотора и другие параметры). Zap.by проходит по реальным ссылкам марки,
поколения и категории, при наличии двигателя уточняет ветку каталога, затем
обогащает кандидатов характеристиками и применяемостью из карточек товара.
Детерминированный matcher отбрасывает конфликты и помечает оставшиеся
предложения как `confirmed` или `possible`.

Если подходящие карточки отличаются критичным неизвестным параметром, API
возвращает структурированный вопрос с вариантами вместо смешанной выдачи.
Ответ сохраняется локально вместе с активным автомобилем и автоматически
применяется к следующим запросам этой детали для той же машины.

Для закрытого MVP владелец проекта временно разрешил прямой
`/carparts/search/{query}`. Он управляется
`ZAP_EXPERIMENTAL_SEARCH_ENABLED=true`, хотя `robots.txt` запрещает этот
маршрут для роботов. Перед публичным production режим обязательно выключить
и заменить официальным фидом Zap.by. VIN не используется. Предел обогащения
карточек задаётся `ZAP_ENRICH_LIMIT` (по умолчанию 12). Точные ограничения,
fixtures и селекторы:
`actors/search/src/adapters/zap/DISCOVERY.md`.

```bash
pnpm actor:test
ZAP_LIVE_SMOKE=true pnpm zap:smoke -- AUDI A4 2010 "Масляный фильтр"
ZAP_LIVE_SMOKE=true pnpm zap:smoke -- PEUGEOT 308 2008 "Стеклоподъемник" left front 5
```

Источник отключается через `SOURCE_ZAP_ENABLED=false`, экспериментальный поиск
— через `ZAP_EXPERIMENTAL_SEARCH_ENABLED=false`.

## Motorland.by adapter

Motorland подключён как источник б/у запчастей. Адаптер выполняет один
robots-разрешённый GET-запрос с `Filter.TextSearch`, парсит готовые
server-rendered карточки через Cheerio и не использует cookies, JSON/XHR,
Playwright или proxy. Связанные категории из текстовой выдачи отбрасываются
детерминированно; совместимость остаётся `possible`.

```bash
pnpm actor:test
MOTORLAND_LIVE_SMOKE=true pnpm motorland:smoke -- BMW 3 2016 "Капот" F30
```

Источник отключается через `SOURCE_MOTORLAND_ENABLED=false`. Точные URL,
селекторы, fixtures, robots/terms-проверка и ограничения находятся в
`actors/search/src/adapters/motorland/DISCOVERY.md`.

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
- Текущие источники приватного MVP: `zap.by` и `motorland.by`; Remzona
  временно не вызывается.
- Архитектура должна поддерживать до 10 источников.
- Поиск доступен без регистрации.
- Аккаунт нужен для гаража, истории и сохранённых автомобилей.
- AI не имеет права придумывать OEM-номера или подтверждать совместимость без источника.
- Сложный кеш, Redis, BullMQ, Elasticsearch и TecDoc не входят в первую версию.
